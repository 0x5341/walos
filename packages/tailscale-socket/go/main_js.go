//go:build js && wasm

// Browser-only Tailscale node. No terminal or SSH implementation is linked.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/netip"
	"strings"
	"sync"
	"syscall/js"
	"time"

	_ "golang.org/x/crypto/x509roots/fallback"
	"tailscale.com/control/controlclient"
	"tailscale.com/ipn"
	"tailscale.com/ipn/ipnauth"
	"tailscale.com/ipn/ipnlocal"
	"tailscale.com/ipn/store/mem"
	"tailscale.com/net/netns"
	"tailscale.com/net/tsdial"
	"tailscale.com/tailcfg"
	"tailscale.com/tsd"
	"tailscale.com/types/logid"
	"tailscale.com/wgengine"
	"tailscale.com/wgengine/netstack"
)

type session struct {
	backend   *ipnlocal.LocalBackend
	stack     *netstack.Impl
	notify    js.Value
	mu        sync.Mutex
	next      int
	conns     map[int]net.Conn
	packets   map[int]net.PacketConn
	listeners map[int]net.Listener
	cancels   map[int]context.CancelFunc
	exit      tailcfg.StableNodeID
	closed    bool
}

func promise(fn func() (any, error)) js.Value {
	executor := js.FuncOf(func(_ js.Value, args []js.Value) any {
		resolve, reject := args[0], args[1]
		go func() {
			defer func() {
				if p := recover(); p != nil {
					reject.Invoke(js.Global().Get("Error").New(fmt.Sprint(p)))
				}
			}()
			value, err := fn()
			if err != nil {
				reject.Invoke(js.Global().Get("Error").New(err.Error()))
			} else {
				resolve.Invoke(value)
			}
		}()
		return nil
	})
	value := js.Global().Get("Promise").New(executor)
	executor.Release()
	return value
}
func jsBytes(data []byte) js.Value {
	value := js.Global().Get("Uint8Array").New(len(data))
	js.CopyBytesToJS(value, data)
	return value
}
func text(value js.Value, key string) string {
	v := value.Get(key)
	if v.Type() == js.TypeString {
		return v.String()
	}
	return ""
}
func (s *session) emit(value any) {
	data, err := json.Marshal(value)
	if err == nil {
		s.notify.Invoke(string(data))
	}
}
func exitPeer(peer tailcfg.NodeView) bool {
	for _, prefix := range peer.AllowedIPs().All() {
		if prefix.Bits() == 0 {
			return true
		}
	}
	return false
}
func (s *session) status() map[string]any {
	s.mu.Lock()
	exit := s.exit
	s.mu.Unlock()
	result := map[string]any{"state": s.backend.State().String(), "addresses": []any{}, "exitNodes": []any{}, "exitNode": string(exit), "exitReady": false}
	nm := s.backend.NetMapWithPeers()
	if nm == nil {
		return result
	}
	addresses := []any{}
	for _, prefix := range nm.GetAddresses().All() {
		addresses = append(addresses, prefix.Addr().String())
	}
	result["addresses"] = addresses
	exits := []any{}
	for _, peer := range nm.Peers {
		if !exitPeer(peer) {
			continue
		}
		online := peer.Online().Get()
		exits = append(exits, map[string]any{"id": string(peer.StableID()), "name": peer.Name(), "online": online})
		if peer.StableID() == exit && online && s.backend.State() == ipn.Running {
			for _, ip := range []netip.Addr{netip.MustParseAddr("203.0.113.1"), netip.MustParseAddr("2001:db8::1")} {
				if route, ok := s.backend.PeerForIP(ip); ok && route.Node.StableID() == exit {
					result["exitReady"] = true
				}
			}
		}
	}
	result["exitNodes"] = exits
	return result
}
func (s *session) allowed(ip netip.Addr) error {
	if s.backend.State() != ipn.Running {
		return errors.New("network-down")
	}
	if netip.MustParsePrefix("100.64.0.0/10").Contains(ip) || netip.MustParsePrefix("fd7a:115c:a1e0::/48").Contains(ip) {
		return nil
	}
	if s.status()["exitReady"] != true {
		return errors.New("exit-node-unavailable")
	}
	s.mu.Lock()
	selected := s.exit
	s.mu.Unlock()
	if route, ok := s.backend.PeerForIP(ip); !ok || route.Node.StableID() != selected {
		return errors.New("exit-node-unavailable")
	}
	return nil
}
func newSession(config js.Value, notify js.Value) (*session, error) {
	netns.SetEnabled(false)
	logf := func(string, ...any) {}
	sys := tsd.NewSystem()
	sys.Set(new(mem.Store))
	dialer := &tsdial.Dialer{Logf: logf}
	dialer.SetBus(sys.Bus.Get())
	engine, err := wgengine.NewUserspaceEngine(logf, wgengine.Config{Dialer: dialer, SetSubsystem: sys.Set, ControlKnobs: sys.ControlKnobs(), HealthTracker: sys.HealthTracker.Get(), ExtraRootCAs: sys.ExtraRootCAs, Metrics: sys.UserMetricsRegistry(), EventBus: sys.Bus.Get()})
	if err != nil {
		return nil, err
	}
	sys.Set(engine)
	stack, err := netstack.Create(logf, sys.Tun.Get(), engine, sys.MagicSock.Get(), dialer, sys.DNSManager.Get(), sys.ProxyMapper())
	if err != nil {
		engine.Close()
		return nil, err
	}
	sys.Set(stack)
	stack.ProcessLocalIPs = true
	stack.ProcessSubnets = true
	dialer.UseNetstackForIP = func(netip.Addr) bool { return true }
	dialer.NetstackDialTCP = func(ctx context.Context, addr netip.AddrPort) (net.Conn, error) {
		conn, err := stack.DialContextTCP(ctx, addr)
		if err != nil {
			return nil, err
		}
		return conn, nil
	}
	dialer.NetstackDialUDP = func(ctx context.Context, addr netip.AddrPort) (net.Conn, error) {
		conn, err := stack.DialContextUDP(ctx, addr)
		if err != nil {
			return nil, err
		}
		return conn, nil
	}
	sys.NetstackRouter.Set(true)
	sys.Tun.Get().Start()
	backend, err := ipnlocal.NewLocalBackend(logf, logid.PublicID{}, sys, controlclient.LoginEphemeral)
	if err != nil {
		engine.Close()
		return nil, err
	}
	if err = stack.Start(backend); err != nil {
		backend.Shutdown()
		return nil, err
	}
	s := &session{backend: backend, stack: stack, notify: notify, conns: map[int]net.Conn{}, packets: map[int]net.PacketConn{}, listeners: map[int]net.Listener{}, cancels: map[int]context.CancelFunc{}}
	backend.SetNotifyCallback(func(n ipn.Notify) {
		if n.ErrMessage != nil {
			s.emit(map[string]any{"type": "error", "message": *n.ErrMessage})
		}
		if n.BrowseToURL != nil {
			s.emit(map[string]any{"type": "auth-url", "url": *n.BrowseToURL})
		}
		if n.State != nil || n.SelfChange != nil {
			s.emit(map[string]any{"type": "status", "status": s.status()})
		}
	})
	hostname := text(config, "hostname")
	if hostname == "" {
		hostname = "walos"
	}
	controlURL := text(config, "controlURL")
	if controlURL == "" {
		controlURL = ipn.DefaultControlURL
	}
	if err = backend.Start(ipn.Options{UpdatePrefs: &ipn.Prefs{ControlURL: controlURL, WantRunning: true, RouteAll: true, CorpDNS: true, Hostname: hostname}, AuthKey: text(config, "authKey")}); err != nil {
		backend.Shutdown()
		return nil, err
	}
	if text(config, "authKey") != "" {
		if err = backend.StartLoginInteractive(context.Background()); err != nil {
			backend.Shutdown()
			return nil, err
		}
	}
	return s, nil
}
func (s *session) handle(conn net.Conn) (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		conn.Close()
		return nil, errors.New("network-down")
	}
	s.next++
	id := s.next
	s.conns[id] = conn
	return map[string]any{"handle": id, "local": conn.LocalAddr().String(), "remote": conn.RemoteAddr().String()}, nil
}
func (s *session) connection(id int) (net.Conn, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.conns[id]
	if c == nil {
		return nil, errors.New("invalid-state")
	}
	return c, nil
}
func (s *session) closeHandle(id int) error {
	s.mu.Lock()
	c, p, l := s.conns[id], s.packets[id], s.listeners[id]
	delete(s.conns, id)
	delete(s.packets, id)
	delete(s.listeners, id)
	s.mu.Unlock()
	if c != nil {
		return c.Close()
	}
	if p != nil {
		return p.Close()
	}
	if l != nil {
		return l.Close()
	}
	return nil
}

// WASI leaves interface selection for wildcard binds to the implementation.
// Select the assigned address of this virtual interface, also avoiding the
// upstream ListenPacket IPv6 wildcard binding limitation.
func (s *session) bindAddress(addr netip.AddrPort) netip.AddrPort {
	if addr.Addr().IsUnspecified() {
		if nm := s.backend.NetMapWithPeers(); nm != nil {
			for _, prefix := range nm.GetAddresses().All() {
				if prefix.Addr().Is4() == addr.Addr().Is4() {
					return netip.AddrPortFrom(prefix.Addr(), addr.Port())
				}
			}
		}
	}
	return addr
}
func (s *session) call(ctx context.Context, op string, args js.Value) (any, error) {
	switch op {
	case "status":
		return s.status(), nil
	case "login":
		return nil, s.backend.StartLoginInteractive(ctx)
	case "logout":
		return nil, s.backend.Logout(ctx, ipnauth.Self)
	case "select-exit":
		id := tailcfg.StableNodeID(text(args, "id"))
		found := id == ""
		if nm := s.backend.NetMapWithPeers(); nm != nil {
			for _, peer := range nm.Peers {
				if peer.StableID() == id && exitPeer(peer) {
					found = true
				}
			}
		}
		if !found {
			return nil, errors.New("unknown-exit-node")
		}
		_, err := s.backend.EditPrefs(&ipn.MaskedPrefs{Prefs: ipn.Prefs{ExitNodeID: id, RouteAll: true, CorpDNS: true}, ExitNodeIDSet: true, RouteAllSet: true, CorpDNSSet: true})
		if err == nil {
			s.mu.Lock()
			s.exit = id
			s.mu.Unlock()
		}
		return s.status(), err
	case "tcp-connect":
		addr, err := netip.ParseAddrPort(text(args, "address"))
		if err != nil {
			return nil, err
		}
		if err = s.allowed(addr.Addr()); err != nil {
			return nil, err
		}
		conn, err := s.stack.DialContextTCP(ctx, addr)
		if err != nil {
			return nil, err
		}
		return s.handle(conn)
	case "tcp-read":
		conn, err := s.connection(args.Get("handle").Int())
		if err != nil {
			return nil, err
		}
		maximum := args.Get("maximum").Int()
		if maximum < 1 || maximum > 65536 {
			return nil, errors.New("invalid-argument")
		}
		data := make([]byte, maximum)
		n, err := conn.Read(data)
		if n > 0 {
			return jsBytes(data[:n]), nil
		}
		if err == io.EOF {
			return nil, nil
		}
		return nil, err
	case "tcp-write":
		conn, err := s.connection(args.Get("handle").Int())
		if err != nil {
			return nil, err
		}
		value := args.Get("bytes")
		if value.Length() > 65536 {
			return nil, errors.New("invalid-argument")
		}
		data := make([]byte, value.Length())
		js.CopyBytesToGo(data, value)
		for len(data) > 0 {
			n, err := conn.Write(data)
			if err != nil {
				return nil, err
			}
			data = data[n:]
		}
		return nil, nil
	case "tcp-half-close":
		conn, err := s.connection(args.Get("handle").Int())
		if err != nil {
			return nil, err
		}
		if closer, ok := conn.(interface{ CloseWrite() error }); ok {
			return nil, closer.CloseWrite()
		}
		return nil, errors.New("not-supported")
	case "tcp-listen":
		addr, err := netip.ParseAddrPort(text(args, "address"))
		if err != nil {
			return nil, err
		}
		family := "tcp4"
		if addr.Addr().Is6() {
			family = "tcp6"
		}
		addr = s.bindAddress(addr)
		listener, err := s.stack.ListenTCP(family, addr.String())
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		if s.closed {
			s.mu.Unlock()
			listener.Close()
			return nil, errors.New("network-down")
		}
		s.next++
		id := s.next
		s.listeners[id] = listener
		s.mu.Unlock()
		return map[string]any{"handle": id, "local": listener.Addr().String()}, nil
	case "tcp-accept":
		s.mu.Lock()
		listener := s.listeners[args.Get("handle").Int()]
		s.mu.Unlock()
		if listener == nil {
			return nil, errors.New("invalid-state")
		}
		conn, err := listener.Accept()
		if err != nil {
			return nil, err
		}
		return s.handle(conn)
	case "udp-bind":
		addr, err := netip.ParseAddrPort(text(args, "address"))
		if err != nil {
			return nil, err
		}
		family := "udp4"
		if addr.Addr().Is6() {
			family = "udp6"
		}
		addr = s.bindAddress(addr)
		packet, err := s.stack.ListenPacket(family, addr.String())
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		if s.closed {
			s.mu.Unlock()
			packet.Close()
			return nil, errors.New("network-down")
		}
		s.next++
		id := s.next
		s.packets[id] = packet
		s.mu.Unlock()
		return map[string]any{"handle": id, "local": packet.LocalAddr().String()}, nil
	case "udp-send":
		addr, err := netip.ParseAddrPort(text(args, "address"))
		if err != nil {
			return nil, err
		}
		if err = s.allowed(addr.Addr()); err != nil {
			return nil, err
		}
		s.mu.Lock()
		packet := s.packets[args.Get("handle").Int()]
		s.mu.Unlock()
		if packet == nil {
			return nil, errors.New("invalid-state")
		}
		value := args.Get("bytes")
		if value.Length() > 65507 {
			return nil, errors.New("datagram-too-large")
		}
		data := make([]byte, value.Length())
		js.CopyBytesToGo(data, value)
		_, err = packet.WriteTo(data, net.UDPAddrFromAddrPort(addr))
		return nil, err
	case "udp-receive":
		s.mu.Lock()
		packet := s.packets[args.Get("handle").Int()]
		s.mu.Unlock()
		if packet == nil {
			return nil, errors.New("invalid-state")
		}
		data := make([]byte, 65536)
		n, addr, err := packet.ReadFrom(data)
		if err != nil {
			return nil, err
		}
		return map[string]any{"bytes": jsBytes(data[:n]), "address": addr.String()}, nil
	case "lookup":
		name := strings.TrimSuffix(text(args, "name"), ".")
		if ip, err := netip.ParseAddr(name); err == nil {
			return []any{ip.String()}, nil
		}
		if nm := s.backend.NetMapWithPeers(); nm != nil {
			for _, peer := range nm.Peers {
				full := strings.TrimSuffix(peer.Name(), ".")
				if strings.EqualFold(name, full) || strings.EqualFold(name, strings.Split(full, ".")[0]) {
					ips := []any{}
					for _, prefix := range peer.Addresses().All() {
						ips = append(ips, prefix.Addr().String())
					}
					return ips, nil
				}
			}
		}
		// Explicit DNS over the exit route; never the browser/OS resolver.
		if err := s.allowed(netip.MustParseAddr("1.1.1.1")); err != nil {
			return nil, err
		}
		resolver := &net.Resolver{PreferGo: true, Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			return s.stack.DialContextUDP(ctx, netip.MustParseAddrPort("1.1.1.1:53"))
		}}
		ips, err := resolver.LookupNetIP(ctx, "ip", name)
		if err != nil {
			return nil, err
		}
		values := []any{}
		for _, ip := range ips {
			values = append(values, ip.Unmap().String())
		}
		return values, nil
	case "close":
		return nil, s.closeHandle(args.Get("handle").Int())
	case "dispose":
		s.mu.Lock()
		s.closed = true
		ids := []int{}
		for id := range s.conns {
			ids = append(ids, id)
		}
		for id := range s.packets {
			ids = append(ids, id)
		}
		for id := range s.listeners {
			ids = append(ids, id)
		}
		for _, cancel := range s.cancels {
			cancel()
		}
		s.mu.Unlock()
		for _, id := range ids {
			s.closeHandle(id)
		}
		s.backend.Shutdown()
		return nil, nil
	}
	return nil, errors.New("not-supported")
}
func main() {
	var device *session
	initializing := false
	call := js.FuncOf(func(_ js.Value, args []js.Value) any {
		op, payload := args[0].String(), args[1]
		if op == "init" {
			if initializing {
				return promise(func() (any, error) { return nil, errors.New("already-initialized") })
			}
			initializing = true
			notify := args[2]
			return promise(func() (any, error) {
				var err error
				device, err = newSession(payload, notify)
				if err != nil {
					return nil, err
				}
				return device.status(), nil
			})
		}
		return promise(func() (any, error) {
			if device == nil {
				return nil, errors.New("not-initialized")
			}
			id := payload.Get("operation").Int()
			if op == "cancel" {
				device.mu.Lock()
				cancel := device.cancels[id]
				device.mu.Unlock()
				if cancel != nil {
					cancel()
				}
				return nil, nil
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			device.mu.Lock()
			device.cancels[id] = cancel
			device.mu.Unlock()
			defer func() { device.mu.Lock(); delete(device.cancels, id); device.mu.Unlock() }()
			return device.call(ctx, op, payload)
		})
	})
	js.Global().Get("__walosTailscaleReady").Invoke(map[string]any{"call": call})
	select {}
}
