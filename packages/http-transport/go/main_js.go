//go:build js && wasm

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall/js"
	"time"

	_ "golang.org/x/crypto/x509roots/fallback"
)

type bridgeError struct{ value js.Value }

func (e *bridgeError) Error() string {
	if e.value.Type() == js.TypeObject && !e.value.IsNull() {
		if tag := e.value.Get("tag"); tag.Type() == js.TypeString {
			return tag.String()
		}
		if msg := e.value.Get("message"); msg.Type() == js.TypeString {
			return msg.String()
		}
	}
	return e.value.String()
}
func promise(fn func() (any, error)) js.Value {
	var executor js.Func
	executor = js.FuncOf(func(_ js.Value, args []js.Value) any {
		resolve, reject := args[0], args[1]
		go func() {
			defer func() {
				if p := recover(); p != nil {
					reject.Invoke(js.Global().Get("Error").New(fmt.Sprint(p)))
				}
			}()
			value, err := fn()
			if err != nil {
				value := js.Global().Get("Error").New(err.Error())
				var networkError *bridgeError
				if errors.As(err, &networkError) && networkError.value.Type() == js.TypeObject && !networkError.value.IsNull() {
					value.Set("networkTag", networkError.value.Get("tag"))
				}
				reject.Invoke(value)
			} else {
				resolve.Invoke(value)
			}
		}()
		return nil
	})
	result := js.Global().Get("Promise").New(executor)
	executor.Release()
	return result
}
func await(value js.Value) (js.Value, error) {
	type reply struct {
		value js.Value
		err   error
	}
	ch := make(chan reply, 1)
	good := js.FuncOf(func(_ js.Value, args []js.Value) any { ch <- reply{value: args[0]}; return nil })
	bad := js.FuncOf(func(_ js.Value, args []js.Value) any { ch <- reply{err: &bridgeError{value: args[0]}}; return nil })
	js.Global().Get("Promise").Call("resolve", value).Call("then", good, bad)
	r := <-ch
	good.Release()
	bad.Release()
	return r.value, r.err
}
func bytesToJS(data []byte) js.Value {
	value := js.Global().Get("Uint8Array").New(len(data))
	js.CopyBytesToJS(value, data)
	return value
}
func headerFromJS(value js.Value) http.Header {
	headers := make(http.Header)
	for i := 0; i < value.Length(); i++ {
		entry := value.Index(i)
		headers.Add(entry.Index(0).String(), entry.Index(1).String())
	}
	return headers
}
func headerToJS(header http.Header) []any {
	entries := []any{}
	for name, values := range header {
		for _, value := range values {
			entries = append(entries, []any{name, value})
		}
	}
	return entries
}

type jsReader struct {
	source js.Value
	finish func() error
	eof    bool
}

func (r *jsReader) Read(data []byte) (int, error) {
	if r.eof {
		return 0, io.EOF
	}
	value, err := await(r.source.Call("read", min(len(data), 65536)))
	if err != nil {
		return 0, err
	}
	if value.IsNull() || value.IsUndefined() {
		r.eof = true
		if r.finish != nil {
			if err := r.finish(); err != nil {
				return 0, err
			}
		}
		return 0, io.EOF
	}
	if value.Length() > len(data) {
		return 0, errors.New("source exceeded read credit")
	}
	return js.CopyBytesToGo(data, value), nil
}
func (r *jsReader) Close() error { _, err := await(r.source.Call("cancel")); return err }

type bridgeAddr string

func (a bridgeAddr) Network() string { return "tcp" }
func (a bridgeAddr) String() string  { return string(a) }

type bridgeRead struct {
	bytes []byte
	err   error
}
type bridgeConn struct {
	source     js.Value
	reader     jsReader
	once       sync.Once
	mu         sync.Mutex
	readMu     sync.Mutex
	readAt     time.Time
	changed    chan struct{}
	closed     chan struct{}
	pending    chan bridgeRead
	buffered   []byte
	readErr    error
	writeTimer *time.Timer
}

func (c *bridgeConn) ensure() {
	if c.closed == nil {
		c.closed = make(chan struct{})
		c.changed = make(chan struct{})
	}
}
func (c *bridgeConn) Read(data []byte) (int, error) {
	c.readMu.Lock()
	defer c.readMu.Unlock()
	for {
		if len(c.buffered) > 0 {
			n := copy(data, c.buffered)
			c.buffered = c.buffered[n:]
			return n, nil
		}
		if c.readErr != nil {
			return 0, c.readErr
		}
		c.mu.Lock()
		c.ensure()
		deadline, changed, closed := c.readAt, c.changed, c.closed
		c.mu.Unlock()
		if !deadline.IsZero() && time.Until(deadline) <= 0 {
			return 0, os.ErrDeadlineExceeded
		}
		if c.pending == nil {
			c.pending = make(chan bridgeRead, 1)
			pending := c.pending
			go func() {
				bytes := make([]byte, 65536)
				n, err := c.reader.Read(bytes)
				pending <- bridgeRead{bytes: bytes[:n], err: err}
			}()
		}
		var timer *time.Timer
		var timeout <-chan time.Time
		if !deadline.IsZero() {
			timer = time.NewTimer(time.Until(deadline))
			timeout = timer.C
		}
		select {
		case value := <-c.pending:
			c.pending = nil
			c.buffered = value.bytes
			c.readErr = value.err
		case <-changed:
		case <-closed:
			if timer != nil {
				timer.Stop()
			}
			return 0, net.ErrClosed
		case <-timeout:
			if timer != nil {
				timer.Stop()
			}
			return 0, os.ErrDeadlineExceeded
		}
		if timer != nil {
			timer.Stop()
		}
	}
}
func (c *bridgeConn) Write(data []byte) (int, error) {
	total := 0
	for len(data) > 0 {
		n := min(len(data), 65536)
		if _, err := await(c.source.Call("write", bytesToJS(data[:n]))); err != nil {
			return total, err
		}
		total += n
		data = data[n:]
	}
	return total, nil
}
func (c *bridgeConn) Close() error {
	c.once.Do(func() {
		c.mu.Lock()
		c.ensure()
		close(c.closed)
		if c.writeTimer != nil {
			c.writeTimer.Stop()
		}
		c.mu.Unlock()
		await(c.source.Call("close"))
	})
	return nil
}
func (c *bridgeConn) LocalAddr() net.Addr  { return bridgeAddr("backend") }
func (c *bridgeConn) RemoteAddr() net.Addr { return bridgeAddr("remote") }
func (c *bridgeConn) SetReadDeadline(t time.Time) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.ensure()
	c.readAt = t
	close(c.changed)
	c.changed = make(chan struct{})
	return nil
}
func (c *bridgeConn) SetWriteDeadline(t time.Time) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.writeTimer != nil {
		c.writeTimer.Stop()
	}
	if !t.IsZero() {
		c.writeTimer = time.AfterFunc(time.Until(t), func() {
			if c.source.Get("abort").Type() == js.TypeFunction {
				c.source.Call("abort")
			}
			c.Close()
		})
	}
	return nil
}
func (c *bridgeConn) SetDeadline(t time.Time) error {
	c.SetReadDeadline(t)
	return c.SetWriteDeadline(t)
}

func main() {
	request := js.FuncOf(func(_ js.Value, args []js.Value) any {
		options := args[0]
		ctx, cancel := context.WithCancel(context.Background())
		cancelFunc := js.FuncOf(func(_ js.Value, _ []js.Value) any { cancel(); return nil })
		options.Call("onCancel", cancelFunc)
		return promise(func() (any, error) {
			keep := false
			defer func() {
				if !keep {
					cancel()
					options.Call("onCancel", js.Null())
					cancelFunc.Release()
				}
			}()
			dial := func(dialCtx context.Context, network, address string) (net.Conn, error) {
				// JS cancellation closes an in-flight dial as well as connected streams.
				timeoutMs := 0
				if deadline, ok := dialCtx.Deadline(); ok {
					timeoutMs = max(1, int(time.Until(deadline).Milliseconds()))
				}
				v, err := await(options.Call("dial", address, timeoutMs))
				if err != nil {
					return nil, err
				}
				c := &bridgeConn{source: v, reader: jsReader{source: v}}
				go func() { <-ctx.Done(); c.Close() }()
				return c, nil
			}
			transport, err := newTransport(dial, options.Get("ca").String(), time.Duration(options.Get("connectTimeoutMs").Float()*float64(time.Millisecond)), time.Duration(options.Get("firstByteTimeoutMs").Float()*float64(time.Millisecond)))
			if err != nil {
				return nil, err
			}
			var body io.ReadCloser
			source := options.Get("body")
			if !source.IsNull() && !source.IsUndefined() {
				body = &jsReader{source: source}
			}
			req, err := http.NewRequestWithContext(ctx, options.Get("method").String(), options.Get("url").String(), body)
			if err != nil {
				return nil, err
			}
			req = req.WithContext(httptrace.WithClientTrace(ctx, &httptrace.ClientTrace{WroteRequest: func(info httptrace.WroteRequestInfo) {
				if info.Err != nil {
					options.Call("onSent", info.Err.Error())
				} else {
					options.Call("onSent", js.Null())
				}
			}}))
			req.Header = headerFromJS(options.Get("headers"))
			if host := req.Header.Get("Host"); host != "" {
				req.Host = host
				req.Header.Del("Host")
			}
			if body != nil {
				req.ContentLength = -1
				if length := req.Header.Get("Content-Length"); length != "" {
					n, e := strconv.ParseInt(length, 10, 64)
					if e != nil || n < 0 {
						return nil, errors.New("invalid Content-Length")
					}
					req.ContentLength = n
					req.Header.Del("Content-Length")
				}
				req.Trailer = make(http.Header)
				for _, key := range strings.Split(req.Header.Get("Trailer"), ",") {
					if key = strings.TrimSpace(key); key != "" {
						req.Trailer[http.CanonicalHeaderKey(key)] = nil
					}
				}
				req.Header.Del("Trailer")
				body.(*jsReader).finish = func() error {
					v, e := await(source.Call("trailers"))
					if e != nil {
						return e
					}
					for k, values := range headerFromJS(v) {
						req.Trailer[k] = values
					}
					return nil
				}
			}
			resp, err := transport.RoundTrip(req)
			if err != nil {
				return nil, err
			}
			var read, trailers, close js.Func
			var once sync.Once
			dispose := func() {
				once.Do(func() {
					cancel()
					resp.Body.Close()
					transport.CloseIdleConnections()
					options.Call("onCancel", js.Null())
					cancelFunc.Release()
					read.Release()
					trailers.Release()
					close.Release()
				})
			}
			read = js.FuncOf(func(_ js.Value, args []js.Value) any {
				maxBytes := args[0].Int()
				return promise(func() (any, error) {
					if maxBytes <= 0 || maxBytes > 65536 {
						return nil, errors.New("invalid read credit")
					}
					data := make([]byte, maxBytes)
					n, e := resp.Body.Read(data)
					if n > 0 {
						return bytesToJS(data[:n]), nil
					}
					if e == io.EOF {
						return nil, nil
					}
					return nil, e
				})
			})
			trailers = js.FuncOf(func(_ js.Value, _ []js.Value) any { return headerToJS(resp.Trailer) })
			close = js.FuncOf(func(_ js.Value, _ []js.Value) any { return promise(func() (any, error) { dispose(); return nil, nil }) })
			keep = true
			return map[string]any{"status": resp.StatusCode, "headers": headerToJS(resp.Header), "read": read, "trailers": trailers, "close": close}, nil
		})
	})
	js.Global().Get("__walosHttpReady").Invoke(map[string]any{"request": request, "serve": js.FuncOf(func(_ js.Value, args []js.Value) any { return serve(args[0]) })})
	select {}
}
