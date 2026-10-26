# ProcessContext implementation (#27–#31, #33, #35–#38)

This implements the public contract in [process-context-api.md](process-context-api.md).
`@walos/os` is version 0.2.0. Its constructor is private; `Walos.create()` completes
Core registration of exactly one Worker-free Host before returning. No application
or TTY is started, no commands are fetched, and no user directory is initialized.
Only the supervisor Core Worker is created. Creation rollback and OS disposal reclaim
partial resources; repeated disposal returns the same completion promise.

## Ownership and process control

Host resources are private facades over the existing P2 filesystem/stream semantics.
Wasm adapters keep P1 errno and P2 variant/drop conventions. The Host resource registry
invalidates a resource before asynchronous cleanup, waits for local I/O and control
acknowledgements, and keeps streams alive independently of their original descriptors.
Disposing a resource that is blocking on a pipe wakes the operation before waiting
for cleanup. Calls started before OS disposal are drained, including resources that
finish being constructed during shutdown.

The Core reserves the parent's handle while a process is STARTING, before resolving
READY. Exits are retained until the wait right is consumed or the handle is dropped.
Wait consumes the right at invocation, while P2/Host local resource disposal remains
separate. P1 wait additionally releases the integer handle. Stop stays usable during
an outstanding wait. Parent normal exit preserves children; abnormal exit cancels
STARTING children, while already READY children survive. OS shutdown stops children
before releasing Host resources so pending waits receive terminated results; complete
Core loss rejects outstanding RPCs with a typed operation error; disposal also
rejects if resource-release acknowledgements are no longer possible. Resources
stay invalid after that failure.

Explicit stdio is consumed synchronously, even on validation/startup failure. An
attempt to move a Host stream with an outstanding I/O operation consumes it and
fails with `busy`; await I/O before moving it. Omitted file/pipe stdio is rejected.
Null stdio can be inherited. Stdio getter resources are independent views of the
process connection, with shared P2 write permits.

## Local I/O and services

No file/pipe bytes cross Core RPC. The Core registers pipe endpoints and moves their
MessagePorts once; DATA/ACK/EOF/Broken Pipe flow directly between peers. The existing
64 KiB bound, 16 KiB chunks, cumulative ACKs and buffer-before-EOF behavior remain.
Host code uses local OPFS async APIs (exclusive writable streams); Worker code keeps
sync access handles. Host file output flush/disposal commits writes and confirms
completion. Directory-entry disposal awaits iterator completion. Descriptor-relative
paths reject absolute paths and escapes above their descriptor; PWD is not consulted.
Unsupported operations remain unsupported; this does not expand #6/#7's WASI surface.

Environment snapshots, wall/monotonic clocks, timers, secure random and the independent
insecure PRNG are shared local service implementations. Clocks report 1 ms resolution;
precision remains browser-dependent. Secure random uses chunked Web Crypto calls and
accepts 0–16 MiB per request; negative/oversized requests return `invalid`. Insecure
random/seed do not depend on Web Crypto. Host failures expose `ServiceError` with a
stable code, message and optional cause; adapters translate to P1 errno/P2 variants.

## Integration

See [migration details](process-context-migration.md) for the v0.2 ABI, lazy PWD
bridge and Shell/consumer ownership. P2 execution now uses only jsco, with no
runtime selector or Component cache. The demo explicitly installs and spawns the
Shell with byte pipes; no implicit foreground input forwarding is provided.

## Verification

- `npm run check`: OS build, demo typecheck, root-only public API type examples,
  and negative checks for removed/forbidden public interfaces.
- `npm run build:apps`: actual P1/P2 binaries plus generated v0.2.0 WIT fixtures.
- `npm test`: Host lifecycle/streams/filesystem/services and existing actual-worker
  READY/EXIT, parent failure, peer disappearance, OPFS locking and jsco regressions.
- `npm run test:production`, `npm run test:pages`: built-worker and Pages smoke checks.
- `npm run check:wit` and `diff -ru wit/generated work/wit-generated`.
- `npm run test:benchmark` and the reproducible browser benchmark, with a fixed SDK,
  Chromium and sample protocol. See the performance record added with this PR.

Final local results: **151 browser regression tests passed**, with the two production-only
tests excluded from that run and then **2/2 production tests passed** separately.
Typecheck/public negative examples, clean build/pack, WIT regeneration comparison,
Pages subpath smoke test, and 3 benchmark-statistics unit tests passed. The existing
browser benchmark completed three retained samples per scenario on both revisions.
See [performance results and raw data](process-context-performance.md), including
observed slowdowns and limits of the comparison.
