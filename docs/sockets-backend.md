# WASI P3 sockets backend

TCP, UDP and name lookup use the pinned WASI 0.3.2 interfaces on the common
ProcessContext. Configure a backend explicitly:

```ts
const storage = await (await navigator.storage.getDirectory())
  .getDirectoryHandle('my-os-v1', { create: true });
const os = await Walos.create({
  storage,
  sockets: {
    module: new URL('./socket-backend.js', import.meta.url).href,
    config: { endpoint: 'wss://your-relay.example' },
  },
});
```

The module must export `createSocketBackend(init: SocketBackendInit)`, returning
`SocketBackend` or a promise of it. Both types are exported by `@walos/os`.
`init` contains cloned `config`, `pid`, `ppid`, and an `AbortSignal`. The config
must be structured-cloneable; functions and backend instances cannot be cloned.
Use an absolute module URL (relative strings resolve against the OS library).
The module must work in both the browser main thread and module Workers and be
served under the application's module/CORS/CSP policy. Bundle it as a separate
entry point; Walos does not bundle a dynamic URL's dependencies for the caller.

Each Host/process loads the module and creates its own backend before becoming
ready. Children and grandchildren inherit the OS configuration. Calls go directly
to that process's backend. Module initialization failure rejects OS creation or
child startup. Configuration is copied before OS creation first awaits.

## Backend contract

`SocketBackend.types` implements `WasiSocketsTypes.Interface`, and
`SocketBackend.ipNameLookup` implements `WasiSocketsIpNameLookup.Interface`.
Use the exported address, Result, Stream, and Future types. Expected network
failures are tagged WASI Results; unexpected exceptions trap. The factory also
returns `Symbol.asyncDispose`, which must be idempotent.

All synchronous WIT operations remain synchronous, including create, bind,
listen, UDP connect/disconnect and socket options. A backend must return
`not-supported` for capabilities it cannot implement with those semantics;
it must not acknowledge an asynchronous bind before it has succeeded. Browser
WebSocket alone cannot supply arbitrary TCP listen or UDP. No external relay,
DNS service or production transport is included.

The backend enforces authorization, actual address allocation, UDP peer filtering,
transport state, supported options and effective option values. It must implement
all interface methods, returning `not-supported` where appropriate. Permission
failures return `access-denied`. Options must affect the transport rather than
merely store values. IPv6 sockets are IPv6-only. Honor the pinned WIT's state and
error rules, including retry behavior after failed operations.

The common wrapper validates address family, address/option ranges and TCP
one-shot send/receive. It tracks created and accepted sockets and their streams
and futures. TCP send input EOF means half-close; receive EOF closes its stream,
then resolves its completion Future to success or the transport error. Canceling
send/receive must interrupt pending work without waiting for the peer. Listen
stream cancellation must reclaim queued, unaccepted sockets in the backend.

Streams must use bounded queues and apply backpressure before accepting more
bytes/connections. UDP preserves datagram boundaries, empty payloads and source
addresses; oversize datagrams return `datagram-too-large`. Connected UDP must
restrict sends and receives to the configured peer. Pending resolver promises must expose a `cancel()` method (the exported
`SocketOperation` type) so dropping an async lookup interrupts it. Socket async
operation cancellation closes the socket and propagates its optional promise
`cancel()` hook. Dispose must unblock all
pending reads, writes, accepts and lookups. The OS aborts the process signal and
releases tracked resources and the backend on cleanup. Worker termination cannot
run asynchronous finalizers: remote transports need their own disconnect/lease
cleanup. Worker boundaries do not add a security sandbox.

Without a backend, TCP/UDP creation and host-name lookup return `access-denied`.
IPv4/IPv6 literals are parsed locally, including without a backend. Host names
are converted to ASCII with browser URL/IDNA processing. Empty lookup results
and results containing only excluded addresses become `name-unresolvable`;
IPv4-mapped IPv6 results are excluded. Other result order is retained.

## Validation and capabilities

`tests/fixtures/socket-backend.ts` is a deterministic test backend with bounded
TCP echo/accept queues, UDP datagrams and IPv4/IPv6 lookup results. It has no
external network access and models socket options for adapter testing only.
It is not a production transport. `tests/sockets.spec.ts` exercises the Host
Context and native P3 components, including typed failures and stream/resource
conversion. `tests/fixtures/sockets.h` is compiled against official WIT bindings.
The coverage table marks all socket operations backend-dependent, not universal
browser networking support. P1/P2 socket support is outside this change.
