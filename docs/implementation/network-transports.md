# HTTP and Tailscale transports

## Implementation

- External HTTP transport is an immutable OS configuration inherited by children.
  Default Fetch, a custom `createFetch` proxy factory, and socket HTTP/TLS are
  supported. Localhost service routes take priority; errors never retry through
  another transport. Each process owns its transport and pending operations.
- `@walos/http-transport` uses standard Go/Wasm HTTP/1.1 and TLS over wrapped
  socket DNS/TCP. Queues are bounded, request/response trailers are preserved,
  framing ambiguities are rejected, and cancellation releases socket work.
  TLS hostname, chain and expiry verification are mandatory; extra CAs are optional.
  Socket request options support connect, first-byte and between-byte deadlines.
- `host.http.expose` bridges an explicit TCP listener to a service, with optional
  HTTPS, connection/header/time bounds, 503 for busy, 502 before response failure,
  and connection abort after partial responses. Service exit, explicit disposal
  and OS shutdown close listeners and active connections.
- `@walos/tailscale-socket` uses Tailscale v1.104.1 and an in-memory ephemeral node
  in one SharedWorker. Interactive login and auth keys are supported. Credentials
  stay in the session owner; process configuration contains a session capability.
  Dedicated Worker connections transfer through Core/Host once; data bypasses Core.
  Ports own their socket handles; cancellation, leases and session disposal reclaim
  pending work. SharedWorker failure rejects outstanding requests.
- TCP connect and asynchronous listeners, UDP datagrams (including empty/IPv6),
  peer-name lookup and external DNS are implemented. Synchronous WASI operations
  stay synchronous: UDP uses bindings prepared during initialization; generic TCP
  bind/listen and unsupported options return `not-supported`.
- External DNS uses `1.1.1.1:53` through the selected exit. External traffic requires
  an online selected exit with an installed route, with no Fetch/direct fallback.
  Tailnet addresses work without an exit. Inbound listeners expose the tailnet node.
- The Demo lazily loads Tailscale when logging in, shows the auth link/status and
  advertised exits, and applies an exit by restarting the Shell with socket HTTP.
  Disconnect explicitly restores default Fetch. OPFS files survive both operations.
- `apps/curl.c` builds a native WASI 0.3.2 command: GET, `-i`, `-X METHOD`, `-d TEXT`,
  streaming responses and concurrent upload/download. It uses the process HTTP
  transport and works with Shell redirection. Redirects remain responses.

## Compiler decision

Standard Go 1.27.3 is selected and ships its matching `wasm_exec.js`. Setup archives
are checksum pinned; Go modules use `go.mod`/`go.sum`, builds use `-mod=readonly`,
`-trimpath`, and stripped debug information. Package NOTICE files carry Go and
linked dependency licenses. Linux x86-64 is the setup-script host.

The adoption gate for TinyGo is full functional compatibility, smaller gzip
artifacts, and at most 10% degradation in measured major performance indicators.
TinyGo 0.44.0 fails the functional gate for both actual entry points:

| Entry point | Result |
| --- | --- |
| HTTP/TLS + ingress | Build fails: missing `tls.X509KeyPair` and `http.Transport.DialTLSContext`. An earlier client-only build also failed runtime tests because TinyGo used browser Fetch without a socket roundTrip fallback. |
| Tailscale | Build fails in `internal/runtime/maps`: missing `abi.MapType` and related runtime definitions. |

Since neither candidate builds, runtime size/performance comparisons cannot
qualify TinyGo for adoption. No TinyGo standard-library fork is introduced.
Reproduce with `bash scripts/setup-network-tools.sh --tinygo`,
`npm run build:network`, and `npm run evaluate:tinygo` (exit 1 means rejected).
Logs, raw/gzip artifact sizes and JSON results are in `work/network-evaluation`.
Standard Go artifacts are approximately 12.2 MB / 3.2 MB gzip (HTTP) and
34.7 MB / 8.1 MB gzip (Tailscale); sizes vary with source changes.

## Verification

`npm run test:network` covers HTTP resource behavior, real Go/Wasm HTTP/TLS,
upload/response trailers, framing conflicts, deadlines, ingress HTTP/HTTPS,
busy/error responses, cancellation and shared-session ownership/lease cleanup.
Native Go tests additionally cover TLS expiry and malformed CA input.

`npm run test:tailscale-e2e` starts local Tailscale control, DERP/STUN and a native
tsnet exit node, then runs Chromium with a real Wasm node. It verifies:

- Auth-key and interactive login, real auth URLs and logout.
- DNS, IPv4/IPv6 UDP, Host HTTP and native P3 HTTP/curl through an exit. The exit
  handles a documentation address as a deterministic external destination and
  counts actual forwarding; clearing the exit blocks new external requests.
- Tailnet HTTP ingress into a P3 service, and connection refusal after service stop.
- Demo login link/approval, exit selection, Shell curl and files surviving apply
  and disconnect.

The harness uses no real tailnet credentials or Internet egress. Its self-signed
DERP requires a test-only Chromium certificate flag; shipped code keeps TLS
verification enabled. Public Tailscale account login has not been exercised here.
E2E Go tests use `-count=1` because Go's cache does not track imported browser code.

Final checks include TypeScript/public API/runtime boundaries, full browser
regression, production CSP, Pages subpath assets without COOP/COEP, lazy loading,
package contents, WIT generation, docs and the existing benchmark integrity run.
CI builds the network packages and runs deterministic network/E2E suites. See
[HTTP usage](../wasi-p3-http.md), [socket contract](../sockets-backend.md), and the
two package READMEs for deployment/CSP and supported operations.

Verified on 2026-11-05 with Node 26.13.0 / npm 12.2.1 / Playwright Chromium:

| Check | Result |
| --- | --- |
| Build, public API, runtime boundaries and network type checks | Passed |
| Full development browser regression | 291 passed, 15 conditional skips |
| Network Node suites | 37 passed (14 HTTP, 8 socket HTTP/TLS, 9 ingress, 6 session broker) |
| Native HTTP Go tests | Passed |
| Real Tailscale/Demo E2E | 4 passed, cache disabled |
| Production CSP bundle | 11 passed |
| Pages subpath, lazy Wasm, curl, OPFS and API docs | Passed without COOP/COEP |
| WIT generation and generated-type comparison | Passed |
| Package dry runs | OS contains no network Wasm; both network packages contain Wasm/runtime/types/NOTICE |
| Existing benchmark statistics and integrity run | 3 tests passed, one trial of all scenarios completed |

## References

The approach follows [WebVM's Tailscale networking article](https://zenn.dev/leaning_tech_jp/articles/469247a54cb0a7):
compile the Go client to Wasm, use browser-compatible DERP transport, load it on
login, and join as an ephemeral node. This implementation uses Tailscale's Go
netstack directly to expose WASI sockets rather than a separate IP-packet bridge.
