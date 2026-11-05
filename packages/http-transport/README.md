# @walos/http-transport

HTTP/1.1 and TLS over a configured walos socket backend. Build the package with
`bash scripts/setup-network-tools.sh` followed by `npm run build:http-transport`.
The build pins Go and ships its matching `wasm_exec.js`; Go modules are locked by
`go.mod` and `go.sum`. Linux x86-64 is the supported setup-script host.

Bundle `dist/index.js` as a separate module entry, including its `@walos/os`
dependency. Serve `http.wasm` and `wasm_exec.js` beside it, or specify absolute
URLs in `config.wasm` and `config.runtime`:

```ts
const os = await Walos.create({
  storage,
  sockets: { module: socketBackendUrl, config: socketConfig },
  http: {
    transport: 'sockets',
    module: httpTransportUrl,
    config: {
      additionalCa: optionalPem,
      connectTimeoutMs: 15000,
      firstByteTimeoutMs: 30000,
    },
  },
});
```

Internal localhost routes run first. External requests use only the selected
socket backend for DNS and TCP; there is no direct Fetch/OS fallback. TLS verifies
hostnames and chains against the Go fallback root bundle plus optional extra CAs.
Redirects are returned as responses. Compression is not decoded automatically.
Uploads and downloads have bounded queues; nonempty request and response trailers
are supported. Request trailer names should be declared in the `Trailer` header.
HTTP/2, HTTP/3, CONNECT and Upgrade are not implemented.

The runtime is loaded once per process realm; use the same Wasm/runtime pair for
all instances in a realm. CSP must allow the module URLs, Wasm compilation and
artifact fetches. The socket backend's underlying connection policy still applies.

Run `npm run test:http-sockets` for real Go/Wasm HTTP/TLS integration tests and
`go test` in `go/` for additional native TLS verification tests. The integration
suite uses Node TCP/HTTPS servers as a deterministic transport, without Tailscale
credentials or external network access.

For compiler evaluation, run `bash scripts/setup-network-tools.sh --tinygo` and
`npm run evaluate:tinygo`. Results are saved under `work/network-evaluation`.
TinyGo is experimental and is not selected by the package build.
