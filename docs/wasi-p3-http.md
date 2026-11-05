# WASI 0.3.2 HTTP

The common Context implements `wasi:http/types`, `client.send` and linked
`handler.handle` for Host callers and native async P3 components. Dedicated HTTP
processes export `wasi:http/handler@0.3.2`; CLI spawn rejects these components.
No P2 HTTP adapter is provided.

## HTTP processes and browser ingress

```ts
await using host = new HostProcessContext(os.getHostProcess());
// executable and middleware are readable Host descriptors installed by the caller.
await using service = await host.http.start(executable);
await using entry = await host.http.start(middleware, {
  next: service,
  listen: { port: 3000, path: '/api' },
});
const http = host.context.wasi.http;
const [request, sent] = http.types.request.new(
  http.types.fields.new(), undefined,
  new Future({ tag: 'ok', val: undefined }), undefined,
);
request.setScheme({ tag: 'HTTP' });
request.setAuthority('localhost:3000');
request.setPathWithQuery('/api/users?q=1');
const reply = await http.client.send(request);
if (reply.tag === 'ok') {
  const [body, trailers] = http.types.response.consumeBody(
    reply.val, new Future({ tag: 'ok', val: undefined }),
  );
  while (await body.read(65536)) { /* consume response */ }
  const ending = await trailers;
  if (ending.tag === 'ok') await ending.val?.[Symbol.asyncDispose]();
}
await sent;
await entry.requestStop();
await entry.wait();
await service.requestStop();
await service.wait();
```

The raw API is `context.walos.http.start(executable, argv, env, listen, next,
stdout, stderr)`. The Host wrapper accepts `argv`, `env`, `stdout`, `stderr`,
`listen` and `next` in an options object. Descriptors and next-service handles are
borrowed; explicit stdout/stderr endpoints move. Stdin is EOF. Omitted outputs
use Null, as for CLI processes. Omitting `listen` creates a private service for
direct `service.handle(request, { signal })` or middleware links. `listen.port`
must be 1..65535; `listen.path` defaults to `/`. Paths must be canonical absolute
URL paths without query/fragment; trailing slashes normalize away except at `/`.

Host and all native P3 processes share one registry per Walos session. Explicit
`http://localhost:<port>` requests choose the longest matching path prefix at a
path-element boundary: `/api` matches `/api` and `/api/users`, not `/apix`.
Queries do not participate in routing; the original path/query reaches the guest.
Different prefixes may share a port. Duplicate registrations, including pending
starts, fail; registration becomes visible only after READY and disappears on
exit. A replacement never receives requests already bound to an older process.

Only `http` and the URL hostname `localhost` use this registry. Missing scheme
still defaults to HTTPS, and missing HTTP port is 80. With no matching live
registration, `client.send` uses the configured external transport (Fetch by default), including unmatched localhost
ports/paths. After selecting an internal service, errors, busy, traps and stops
never fall back to the external transport or retry. `https`, IP literals and other
hostnames use the external transport. This routing is not a network or capability isolation boundary.

Each service has its own Worker and serves one exchange at a time, without a
queue. Busy lasts through request and response EOF, trailers and handling-result
futures, even after `handle` returns. Direct Host calls reject with
`ServiceError('busy')`; WASI `client.send`/handler calls return `internal-error`
with a diagnostic. Middleware's imported handler is fixed to `next` at startup;
an imported handler without `next` is an initialization error. Its `client.send`
uses ordinary URL routing. Unlinked Context handler calls return
`configuration-error`. Runtime validation rejects unknown/mixed WASI versions.

Incoming browser requests are supplied explicitly by Host JavaScript. These
ports are virtual within Walos: they do not open browser/OS TCP listeners, and
ordinary browser `fetch()` does not enter the registry. Service Worker integration
is left to the consumer. Explicit socket listeners are available through
`host.http.expose`, described below.

## Internal streaming and lifetime

Processes connect through direct MessagePorts; Core carries only routing and
lifetime control. A read grants up to 64 KiB of body credit. Request uploads and
response downloads can progress together; `send` returns a response before upload
EOF. Headers retain raw bytes, duplicates and order, and nonempty trailers work
in both directions. Fetch-only method/header/CORS/upload restrictions do not apply
internally. Request options travel with the message, but network timeout options
are not applied to internal calls.

HTTP errors remain tagged WASI errors; HTTP error statuses remain responses.
Errors in guest-produced trailer futures keep their WASI error. Traps terminate
the service and fail active exchanges. Cancelling send, dropping an active response
body, cancelling a producer completion, or aborting a Host handle call interrupts
the exchange and stops its target process to reclaim guest work. The Host signal
remains connected after response headers, through exchange completion. Dropping
an incoming request body can instead produce a short-circuit response.

Peer exit, forced Worker termination and OS disposal settle pending reads and
futures and reclaim ports. Cancelling a middleware exchange also cancels its
active downstream work. Restart and retry are explicit. `wait()` is one-shot;
dropping a service handle only releases the handle, while `requestStop()` stops
the process and unregisters its route. Disposing the Host convenience wrapper
does not stop services; disposing Walos does.

Fields retain original casing, order, duplicate values and raw bytes locally.
Comparison is case insensitive and clones are mutable deep copies. Message
constructors take ownership of headers, options, content streams and trailer
futures. Message header views and request option views are immutable. Options
views must be dropped before dropping or sending their parent request;
`consume-body` preserves previously obtained views. Consuming or sending a
message invalidates its old handle.

## Browser transport

By default HTTP and HTTPS use Fetch in the calling process, with CORS mode, same-origin
credentials and redirects rejected. Missing scheme defaults to HTTPS; authority
is required, and missing path defaults to `/`. Userinfo is rejected. Browser
CSP, mixed content, network policy and CORS remain in effect. This is not a
capability isolation boundary.

Uploads use ReadableStream and `duplex: half`, without whole-body buffering or a
buffered fallback. Browser support and an HTTP/2 or HTTP/3 connection are required
for streaming uploads in Chromium. Responses become available after the upload
finishes. GET/HEAD bodies and browser-forbidden methods/headers are rejected,
not silently discarded. Fetch may normalize and combine transmitted headers;
received headers include only what the browser exposes. Browser decompression
means the returned body is not necessarily the encoded wire bytes.

Local message bodies support trailer fields. Network uploads support no trailers
or empty trailers only; nonempty trailers fail with `configuration-error` and
abort the transfer. Fetch does not expose received trailers: the trailer future
returns `ok(none)` after EOF, which does not prove the server sent no trailers.

Connect and first-byte timeout setters accept `none`, but return
`not-supported` for concrete durations. Between-bytes timeout bounds each pending
network read and returns `connection-read-timeout`. Time spent not requesting
another body chunk is not counted. Durations are nanoseconds; browser timer
resolution applies. Immutable options return `immutable` for setters.

HTTP error statuses (including 4xx/5xx) are successful responses. Locally detected
URI, method and header failures use the corresponding WASI errors. Body read
failures use `HTTP-response-incomplete`. Fetch hides CORS, DNS and TLS error
causes; those failures use `internal-error` rather than guessing a cause.
Cancellation also uses `internal-error`, since HTTP defines no cancellation
variant. Debug strings are diagnostic, not stable error identifiers.

Dropping a body or cancelling send aborts the transport, cancels input streams
and settles pending body futures. Process/OS disposal performs the same cleanup.
EOF and the trailer result describe body reception; the separate handling result
future communicates the consumer's outcome to the producer.

## Configurable external transport

`Walos.create({ storage, http: { transport: 'fetch', module, config } })` loads a
module exporting `createFetch(init)`. The factory receives cloned `config`,
`pid`, `ppid`, and a process `AbortSignal`, and returns `{ fetch, [Symbol.asyncDispose] }`.
The fetch function accepts a URL and RequestInit and returns a Response. It may
rewrite the URL or implement a caller-defined proxy protocol. Browser Fetch
restrictions still apply; walos does not define a proxy wire protocol.

Omitting `http` keeps standard browser Fetch. The module URL and cloneable
configuration are snapshotted before initialization awaits, inherited by all
children, and instantiated independently in each process. Factory failures reject
OS creation or process startup. Abort is propagated to pending requests before
backend disposal. Modules must work in the main thread and module Workers and be
bundled as separate entries under the application's CORS/CSP policy.

For HTTP/HTTPS over the socket backend, use `http: { transport: 'sockets', module,
config }` with the separate `@walos/http-transport` entry. That module exports
`createHttpTransport(init)` and returns a cancellable WASI HTTP client and async
dispose method. Initialization includes the process's HTTP types and wrapped
socket services. See [the transport package](../packages/http-transport/README.md).

Both modes preserve internal localhost routing priority. A selected local service
failure never retries over the network, and external transport failures never
switch to another transport.

`host.http.expose(service, options)` opens an explicit HTTP ingress bridge.
Specify `address` as a WASI IP socket address; a zero port requests an ephemeral
port. `module` defaults to the configured sockets HTTP module and may be provided
independently when outbound requests use Fetch. The returned exposure reports
the actual address and supports async dispose. Optional `tls` contains PEM
`certificate` and `key`; the bridge serves HTTPS with caller-provided credentials.

Limits default to 32 connections, 64 KiB headers, a 10-second header deadline and
a 30-second idle/read deadline. Busy services receive 503, failures before headers
receive 502, and failures after headers abort the connection. Service exit and OS
disposal close associated bridges and active exchanges. Sockets transport request
options support connect, first-byte and between-byte timeouts; internal localhost
requests retain their existing behavior and do not apply network deadlines.
