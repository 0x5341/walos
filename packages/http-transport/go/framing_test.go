package main

import (
	"io"
	"net"
	"strings"
	"testing"
)

func TestAmbiguousFraming(t *testing.T) {
	for _, header := range []string{
		"HTTP/1.1 200 OK\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n",
		"POST / HTTP/1.1\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\n",
		"POST / HTTP/1.1\r\nContent-Length: 1,1\r\n\r\n",
		"POST / HTTP/1.1\r\nX-Header: a\r\n Content-Length: 1\r\n\r\n",
	} {
		if _, err := checkFraming([]byte(header)); err == nil {
			t.Fatalf("ambiguous framing accepted: %q", header)
		}
	}
}
func TestFramingPreservesSplitInterimHeadersAndBody(t *testing.T) {
	a, b := net.Pipe()
	defer a.Close()
	defer b.Close()
	wire := "HTTP/1.1 103 Early Hints\r\nLink: </a>\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nbody"
	go func() {
		defer b.Close()
		for _, octet := range []byte(wire) {
			b.Write([]byte{octet})
		}
	}()
	conn := &framingConn{Conn: a, maximum: 1024}
	got, err := io.ReadAll(conn)
	if err != nil || string(got) != wire {
		t.Fatalf("wire changed: %q %v", got, err)
	}
}
func TestFramingHeaderLimit(t *testing.T) {
	a, b := net.Pipe()
	defer a.Close()
	defer b.Close()
	go func() {
		defer b.Close()
		io.WriteString(b, "GET / HTTP/1.1\r\nX: "+strings.Repeat("x", 512)+"\r\n\r\n")
	}()
	_, err := io.ReadAll(&framingConn{Conn: a, maximum: 64})
	if err == nil {
		t.Fatal("unbounded header accepted")
	}
}
