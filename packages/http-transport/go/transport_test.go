package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestExpiredCertificateIsRejected(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "localhost"}, DNSNames: []string{"localhost"}, NotBefore: time.Now().Add(-48 * time.Hour), NotAfter: time.Now().Add(-24 * time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("must not reach handler")) }))
	server.TLS = &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}}
	server.StartTLS()
	defer server.Close()
	var calls int
	transport, err := newTransport(func(ctx context.Context, network, address string) (net.Conn, error) {
		calls++
		return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
	}, string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})), time.Second, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer transport.CloseIdleConnections()
	req, _ := http.NewRequest("GET", "https://localhost/", nil)
	_, err = transport.RoundTrip(req)
	if err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expected expiry error, got %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected configured socket dialer, got %d calls", calls)
	}
}
func TestInvalidAdditionalCAFailsInitialization(t *testing.T) {
	if _, err := newTransport(nil, "not a certificate", time.Second, time.Second); err == nil {
		t.Fatal("invalid CA accepted")
	}
}
