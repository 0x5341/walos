//go:build js && wasm

package main

import (
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"syscall/js"
	"time"
)

type jsListener struct {
	options js.Value
	once    sync.Once
}

func (l *jsListener) Accept() (net.Conn, error) {
	value, err := await(l.options.Call("accept"))
	if err != nil {
		return nil, err
	}
	if value.IsNull() {
		return nil, net.ErrClosed
	}
	return &bridgeConn{source: value, reader: jsReader{source: value}}, nil
}
func (l *jsListener) Addr() net.Addr { return bridgeAddr(l.options.Get("address").String()) }
func (l *jsListener) Close() error   { l.once.Do(func() { l.options.Call("closeListener") }); return nil }
func serve(options js.Value) js.Value {
	return promise(func() (any, error) {
		listener := net.Listener(&jsListener{options: options})
		tlsOptions := options.Get("tls")
		if !tlsOptions.IsNull() && !tlsOptions.IsUndefined() {
			certificate, err := tls.X509KeyPair([]byte(tlsOptions.Get("certificate").String()), []byte(tlsOptions.Get("key").String()))
			if err != nil {
				return nil, err
			}
			listener = tls.NewListener(listener, &tls.Config{Certificates: []tls.Certificate{certificate}, MinVersion: tls.VersionTLS12, NextProtos: []string{"http/1.1"}})
		}
		listener = framingListener{Listener: listener, maximum: options.Get("maxHeaderBytes").Int()}
		server := &http.Server{ReadTimeout: time.Duration(options.Get("idleTimeoutMs").Int()) * time.Millisecond, ReadHeaderTimeout: time.Duration(options.Get("headerTimeoutMs").Int()) * time.Millisecond, IdleTimeout: time.Duration(options.Get("idleTimeoutMs").Int()) * time.Millisecond, MaxHeaderBytes: options.Get("maxHeaderBytes").Int()}
		server.SetKeepAlivesEnabled(false)
		server.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.NewResponseController(w).EnableFullDuplex()
			// HTTP/1.1 only. Upgrades and CONNECT cannot escape to another protocol.
			if r.Method == "CONNECT" || r.Header.Get("Upgrade") != "" {
				http.Error(w, "Unsupported protocol", http.StatusNotImplemented)
				return
			}
			var readBody, trailers, cancelBody, onCancel js.Func
			var cancelJS js.Value
			stop := make(chan struct{})
			defer close(stop)
			onCancel = js.FuncOf(func(_ js.Value, args []js.Value) any { cancelJS = args[0]; return nil })
			readBody = js.FuncOf(func(_ js.Value, args []js.Value) any {
				return promise(func() (any, error) {
					maximum := args[0].Int()
					if maximum < 1 || maximum > 65536 {
						return nil, errors.New("invalid read credit")
					}
					data := make([]byte, maximum)
					n, err := r.Body.Read(data)
					if n > 0 {
						return bytesToJS(data[:n]), nil
					}
					if err == io.EOF {
						return nil, nil
					}
					return nil, err
				})
			})
			trailers = js.FuncOf(func(_ js.Value, _ []js.Value) any { return headerToJS(r.Trailer) })
			cancelBody = js.FuncOf(func(_ js.Value, _ []js.Value) any { go r.Body.Close(); return nil })
			defer readBody.Release()
			defer trailers.Release()
			defer cancelBody.Release()
			defer onCancel.Release()
			go func() {
				select {
				case <-r.Context().Done():
					if cancelJS.Type() == js.TypeFunction {
						cancelJS.Invoke()
					}
				case <-stop:
				}
			}()
			response, err := await(options.Call("handle", map[string]any{"method": r.Method, "scheme": func() string {
				if !tlsOptions.IsNull() && !tlsOptions.IsUndefined() {
					return "https"
				}
				return "http"
			}(), "authority": r.Host, "path": r.URL.RequestURI(), "headers": headerToJS(r.Header), "body": map[string]any{"read": readBody, "trailers": trailers, "cancel": cancelBody}, "onCancel": onCancel}))
			if err != nil {
				code := http.StatusBadGateway
				if stringsContainsBusy(err.Error()) {
					code = http.StatusServiceUnavailable
				}
				http.Error(w, http.StatusText(code), code)
				return
			}
			defer response.Call("cancel")
			for key, values := range headerFromJS(response.Get("headers")) {
				for _, value := range values {
					w.Header().Add(key, value)
				}
			}
			// Trailers are discovered at body EOF. Go's TrailerPrefix supports late names.
			w.WriteHeader(response.Get("status").Int())
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
			for {
				data, err := await(response.Call("read", 65536))
				if err != nil {
					panic(http.ErrAbortHandler)
				}
				if data.IsNull() {
					break
				}
				bytes := make([]byte, data.Length())
				js.CopyBytesToGo(bytes, data)
				if _, err = w.Write(bytes); err != nil {
					return
				}
				if flusher, ok := w.(http.Flusher); ok {
					flusher.Flush()
				}
			}
			values, err := await(response.Call("trailers"))
			if err != nil {
				panic(http.ErrAbortHandler)
			}
			for key, values := range headerFromJS(values) {
				for _, value := range values {
					w.Header().Add(http.TrailerPrefix+key, value)
				}
			}
		})
		go func() {
			if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
				options.Call("onError", err.Error())
			}
		}()
		var close js.Func
		close = js.FuncOf(func(_ js.Value, _ []js.Value) any {
			return promise(func() (any, error) { defer close.Release(); return nil, server.Close() })
		})
		return map[string]any{"close": close}, nil
	})
}
func stringsContainsBusy(value string) bool {
	return value == "busy" || value == "Error: busy" || value == fmt.Sprint("ServiceError: busy")
}
