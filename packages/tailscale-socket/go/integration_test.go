//go:build !js

package main

import (
	"bufio"
	"context"
	"fmt"
	"golang.org/x/net/dns/dnsmessage"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"tailscale.com/types/nettype"
	"tailscale.com/wgengine/netstack"
	"testing"
	"time"

	"tailscale.com/ipn"
	"tailscale.com/ipn/store/mem"
	"tailscale.com/net/netns"
	"tailscale.com/net/tsaddr"
	"tailscale.com/tsnet"
	"tailscale.com/tstest/integration"
	"tailscale.com/tstest/integration/testcontrol"
	"tailscale.com/types/logger"
)

// All control, DERP and destination traffic stays on this machine. The browser
// still uses the real Tailscale control protocol, WireGuard and exit-node route.
func TestBrowserExitNode(t *testing.T) {
	if os.Getenv("WALOS_TAILSCALE_E2E") != "1" {
		t.Skip("set WALOS_TAILSCALE_E2E=1 for the real browser/exit-node integration")
	}
	t.Setenv("TS_NO_LOGS_NO_SUPPORT", "1")
	netns.SetEnabled(false)
	defer netns.SetEnabled(true)
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Second)
	defer cancel()
	derp := integration.RunDERPAndSTUN(t, logger.Discard, "127.0.0.1")
	control := &testcontrol.Server{DERPMap: derp, MagicDNSDomain: "walos.test", AllOnline: true, AllNodesSameUser: true, RequireAuthKey: "test-key", Logf: logger.Discard}
	exit := &tsnet.Server{Dir: t.TempDir(), Store: new(mem.Store), Hostname: "walos-exit", Ephemeral: true, AuthKey: "test-key", Logf: logger.Discard, UserLogf: logger.Discard}
	var forwarded atomic.Int32
	external := netip.MustParseAddrPort("203.0.113.42:80")
	exit.RegisterFallbackTCPHandler(func(src, dst netip.AddrPort) (func(net.Conn), bool) {
		if dst != external {
			return nil, true
		}
		return func(conn net.Conn) {
			defer conn.Close()
			request, err := http.ReadRequest(bufio.NewReader(conn))
			if err != nil {
				return
			}
			defer request.Body.Close()
			io.Copy(io.Discard, request.Body)
			forwarded.Add(1)
			fmt.Fprint(conn, "HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\np3-http")
		}, true
	})
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		if r.URL.Path == "/test/forward-count" {
			fmt.Fprint(w, forwarded.Load())
			return
		}
		if r.URL.Path == "/test/probe" {
			target, err := netip.ParseAddrPort(r.URL.Query().Get("address"))
			if err != nil || !netip.MustParsePrefix("100.64.0.0/10").Contains(target.Addr()) {
				http.Error(w, "invalid target", 400)
				return
			}
			conn, err := exit.Dial(r.Context(), "tcp", target.String())
			if err != nil {
				http.Error(w, err.Error(), 502)
				return
			}
			defer conn.Close()
			fmt.Fprint(conn, "POST /from-tailnet HTTP/1.1\r\nHost: browser\r\nContent-Length: 12\r\nConnection: close\r\n\r\nfrom-tailnet")
			response, err := http.ReadResponse(bufio.NewReader(conn), nil)
			if err != nil {
				http.Error(w, err.Error(), 502)
				return
			}
			defer response.Body.Close()
			w.WriteHeader(response.StatusCode)
			io.Copy(w, response.Body)
			return
		}
		control.ServeHTTP(w, r)
	})
	control.HTTPTestServer = httptest.NewServer(handler)
	defer control.HTTPTestServer.Close()
	exit.ControlURL = control.HTTPTestServer.URL
	status, err := exit.Up(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer exit.Close()
	client, err := exit.LocalClient()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = client.EditPrefs(ctx, &ipn.MaskedPrefs{Prefs: ipn.Prefs{AdvertiseRoutes: tsaddr.ExitRoutes()}, AdvertiseRoutesSet: true}); err != nil {
		t.Fatal(err)
	}
	var udpPackets, dnsPackets atomic.Int32
	exit.Sys().Netstack.Get().(*netstack.Impl).GetUDPHandlerForFlow = func(src, dst netip.AddrPort) (func(nettype.ConnPacketConn), bool) {
		if dst != netip.MustParseAddrPort("1.1.1.1:53") && dst != netip.MustParseAddrPort("203.0.113.42:9001") && dst != netip.MustParseAddrPort("[2001:db8::42]:9001") {
			return nil, true
		}
		return func(conn nettype.ConnPacketConn) {
			defer conn.Close()
			conn.SetDeadline(time.Now().Add(10 * time.Second))
			for {
				data := make([]byte, 65536)
				n, err := conn.Read(data)
				if err != nil {
					return
				}
				if dst.Port() == 9001 {
					udpPackets.Add(1)
					conn.Write(data[:n])
					continue
				}
				dnsPackets.Add(1)
				var query dnsmessage.Message
				if query.Unpack(data[:n]) != nil {
					return
				}
				response := dnsmessage.Message{Header: dnsmessage.Header{ID: query.Header.ID, Response: true, RecursionDesired: true, RecursionAvailable: true}, Questions: query.Questions}
				for _, question := range query.Questions {
					if question.Type == dnsmessage.TypeA {
						response.Answers = append(response.Answers, dnsmessage.Resource{Header: dnsmessage.ResourceHeader{Name: question.Name, Type: dnsmessage.TypeA, Class: dnsmessage.ClassINET, TTL: 60}, Body: &dnsmessage.AResource{A: [4]byte{203, 0, 113, 42}}})
					}
				}
				encoded, err := response.Pack()
				if err != nil {
					return
				}
				conn.Write(encoded)
			}
		}, true
	}
	control.SetSubnetRoutes(status.Self.PublicKey, tsaddr.ExitRoutes())
	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	interactive := &testcontrol.Server{DERPMap: derp, RequireAuth: true, AllOnline: true, Logf: logger.Discard}
	interactive.HTTPTestServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		if strings.HasPrefix(r.URL.Path, "/auth/") {
			if !interactive.CompleteAuth(r.URL.Path) {
				http.Error(w, "invalid auth", 400)
				return
			}
			w.WriteHeader(204)
			return
		}
		interactive.ServeHTTP(w, r)
	}))
	defer interactive.HTTPTestServer.Close()
	command := exec.CommandContext(ctx, "node", "node_modules/@playwright/test/cli.js", "test", "tests/tailscale-e2e.spec.ts")
	command.Dir = root
	command.Env = append(os.Environ(), "WALOS_TEST_CONTROL="+control.HTTPTestServer.URL, "WALOS_TEST_INTERACTIVE="+interactive.HTTPTestServer.URL)
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err = command.Run(); err != nil {
		t.Fatal(err)
	}
	if udpPackets.Load() < 1 || dnsPackets.Load() < 1 {
		t.Fatalf("UDP/DNS did not traverse exit node: UDP=%d DNS=%d", udpPackets.Load(), dnsPackets.Load())
	}
	if forwarded.Load() < 1 {
		t.Fatal("browser request did not traverse the exit node")
	}
}
