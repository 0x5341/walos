package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"net"
	"net/http"
	"time"
)

// The dialer must use the configured socket backend. No OS networking fallback.
func newTransport(dial func(context.Context, string, string) (net.Conn, error), ca string, connectTimeout, firstByteTimeout time.Duration) (*http.Transport, error) {
	roots, err := x509.SystemCertPool()
	if err != nil {
		roots = x509.NewCertPool()
	}
	if ca != "" && !roots.AppendCertsFromPEM([]byte(ca)) {
		return nil, errors.New("invalid additional CA PEM")
	}
	dialRaw := func(ctx context.Context, network, address string) (net.Conn, error) {
		if connectTimeout > 0 {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, connectTimeout)
			defer cancel()
		}
		return dial(ctx, network, address)
	}
	tlsConfig := &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12, NextProtos: []string{"http/1.1"}}
	return &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			conn, err := dialRaw(ctx, network, address)
			if err != nil {
				return nil, err
			}
			return &framingConn{Conn: conn, maximum: 1 << 20}, nil
		},
		DialTLSContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			conn, err := dialRaw(ctx, network, address)
			if err != nil {
				return nil, err
			}
			config := tlsConfig.Clone()
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				conn.Close()
				return nil, err
			}
			config.ServerName = host
			encrypted := tls.Client(conn, config)
			handshake, cancel := context.WithTimeout(ctx, 15*time.Second)
			defer cancel()
			if err = encrypted.HandshakeContext(handshake); err != nil {
				conn.Close()
				return nil, err
			}
			return &framingConn{Conn: encrypted, maximum: 1 << 20}, nil
		},
		TLSClientConfig:        tlsConfig,
		TLSHandshakeTimeout:    15 * time.Second,
		ResponseHeaderTimeout:  firstByteTimeout,
		MaxResponseHeaderBytes: 1 << 20,
		DisableKeepAlives:      true,
		DisableCompression:     true,
	}, nil
}
