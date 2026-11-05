package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
)

// Validate framing before net/http normalizes headers. Only one exchange per
// connection is used; interim HTTP responses are checked before the final one.
type framingConn struct {
	net.Conn
	maximum        int
	pending, ready []byte
	final          bool
	readErr        error
}

func (c *framingConn) Read(dst []byte) (int, error) {
	if len(dst) == 0 {
		return 0, nil
	}
	for len(c.ready) == 0 {
		if c.final {
			if c.readErr != nil {
				return 0, c.readErr
			}
			return c.Conn.Read(dst)
		}
		if end := bytes.Index(c.pending, []byte("\r\n\r\n")); end >= 0 {
			end += 4
			if end > c.maximum {
				return 0, errors.New("HTTP framing: header limit exceeded")
			}
			final, err := checkFraming(c.pending[:end])
			if err != nil {
				return 0, err
			}
			c.ready = append(c.ready, c.pending[:end]...)
			c.pending = c.pending[end:]
			c.final = final
			if final {
				c.ready = append(c.ready, c.pending...)
				c.pending = nil
			}
			break
		}
		if len(c.pending) > c.maximum {
			return 0, errors.New("HTTP framing: header limit exceeded")
		}
		if c.readErr != nil {
			return 0, io.ErrUnexpectedEOF
		}
		data := make([]byte, 65536)
		n, err := c.Conn.Read(data)
		c.pending = append(c.pending, data[:n]...)
		c.readErr = err
	}
	n := copy(dst, c.ready)
	c.ready = c.ready[n:]
	return n, nil
}
func checkFraming(header []byte) (bool, error) {
	lines := strings.Split(string(header), "\r\n")
	lengths, transfer := 0, false
	for _, line := range lines[1:] {
		if line == "" {
			break
		}
		if line[0] == ' ' || line[0] == '\t' {
			return false, errors.New("HTTP framing: folded header rejected")
		}
		name, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		switch strings.ToLower(name) {
		case "content-length":
			lengths++
			value = strings.TrimSpace(value)
			if value == "" || strings.Trim(value, "0123456789") != "" {
				return false, errors.New("HTTP framing: invalid content length")
			}
			if _, err := strconv.ParseUint(value, 10, 63); err != nil {
				return false, errors.New("HTTP framing: invalid content length")
			}
		case "transfer-encoding":
			transfer = true
		}
	}
	if lengths > 1 || lengths > 0 && transfer {
		return false, errors.New("HTTP framing: ambiguous body length")
	}
	if strings.HasPrefix(lines[0], "HTTP/") {
		fields := strings.Fields(lines[0])
		if len(fields) < 2 {
			return false, fmt.Errorf("HTTP framing: malformed status")
		}
		status, err := strconv.Atoi(fields[1])
		if err != nil {
			return false, err
		}
		return status < 100 || status >= 200 || status == 101, nil
	}
	return true, nil
}

type framingListener struct {
	net.Listener
	maximum int
}

func (l framingListener) Accept() (net.Conn, error) {
	conn, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	return &framingConn{Conn: conn, maximum: l.maximum}, nil
}
