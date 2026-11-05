# @walos/tailscale-socket

A browser Tailscale node shared by all processes of a Walos instance. The network
implementation uses pinned Tailscale Go code compiled with standard Go/Wasm.
It supports TCP, prepared UDP sockets, peer-name lookup and external DNS through
an explicitly selected exit node. It has no independent WebSocket-to-TCP relay.

Build with `bash scripts/setup-network-tools.sh`, `npm run build:os` and
`npm run build --workspace @walos/tailscale-socket`. Serve or bundle the session
Worker as a separate module entry and serve `tailscale.wasm` with its matching
`wasm_exec.js`. Dynamic backend entries must include their `@walos/os` dependency.

```ts
const session = await createTailscaleSession({
  worker: sessionWorkerUrl,
  wasm: tailscaleWasmUrl,
  runtime: wasmExecUrl,
  onEvent(event) {
    if (event.type === 'auth-url') showLoginLink(event.url);
    if (event.type === 'status') renderStatus(event.status);
  },
});
await session.login();
// Wait for Running, then choose an advertised exit node explicitly.
await session.selectExitNode(selectedExitNodeId);
// Poll status().exitReady before initiating external traffic.
const os = await Walos.create({
  storage,
  sockets: session.socketOptions(socketBackendUrl),
  http: { transport: 'sockets', module: httpTransportUrl },
});
// Dispose Walos before disposing its shared session.
```

`authKey` is an optional alternative to interactive login. The key is supplied
only during shared-session initialization; process configuration contains a
session capability and no auth key. State is kept in memory, the node is
ephemeral, and reload requires login again. `controlURL` can select a compatible
control server. SharedWorker is required in the Host browser window.

Dedicated Workers cannot construct SharedWorker. Walos supplies
`SocketBackendInit.connect()` to process factories; the optional Host export
`connectSocketBackend(init, port)` transfers that process's MessagePort to the
session. TCP/UDP data bypass Core after attachment. All sockets belong to their
client port; separate ports cannot operate on each other's handles. Heartbeats
keep leases alive; a terminated Worker loses its resources after the lease
expires. This ownership check is not a sandbox against trusted same-origin code.

WASI bind/listen/UDP configuration operations stay synchronous. Generic TCP
bind/listen return `not-supported`; HTTP ingress uses `SocketBackend.listenTcp`.
UDP bindings are prepared during backend initialization. By default an ephemeral
binding is attempted for each family; unavailable families are skipped. Set
`udpBindings` in `socketOptions` to prepare explicit addresses or additional
sockets. Synchronous UDP bind can only claim a prepared matching binding. A
wildcard bind selects this node's assigned virtual-interface address. Options
without transport support return `not-supported`, and are never stored as if
they took effect. Connected UDP filters both sending and receiving peers.

Peer names are resolved from the tailnet map. External DNS uses UDP to
`1.1.1.1:53` over the selected exit route. External TCP/UDP and external DNS fail
when no exit node is selected or the node is unavailable; they never switch to
browser Fetch or an OS network connection. HTTP redirects remain responses.
Inbound listeners expose the tailnet node, not an Internet port on the exit node.

CSP must allow the Worker/module/assets, Wasm compilation, Tailscale control-plane
HTTPS and DERP WebSocket endpoints. TLS certificate verification stays enabled
in shipped code. The local end-to-end harness uses a test-only Chromium flag
for its self-signed DERP certificate; that flag is not part of the application.

Validation includes a mock shared-session transport, ownership/lease tests,
real browser Wasm initialization, and an opt-in Go test `TestBrowserExitNode`
which starts local control/DERP/tsnet exit-node servers and invokes Chromium.
Set `WALOS_TAILSCALE_E2E=1` when running that Go test. No real tailnet credentials
are required. The harness uses a documentation IP as a deterministic external
HTTP destination and asserts that requests crossed the exit node.

TinyGo evaluation is experimental. The current pinned Tailscale entry point
fails TinyGo 0.44.0 compilation on Go internal runtime-map definitions. The build
ships standard Go; compiler logs are kept under `work/network-evaluation`.
