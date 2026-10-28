# ProcessContext implementation (#27–#31, #33, #35–#38)

This implements the public contract in [process-context-api.md](process-context-api.md).
`@walos/os` is version 0.3.0. Its constructor is private; `Walos.create()` completes
Core registration of exactly one Worker-free Host before returning. No application
or TTY is started, no commands are fetched, and no user directory is initialized.
Only the supervisor Core Worker is created. Creation rollback and OS disposal reclaim
partial resources; repeated disposal returns the same completion promise.

## Ownership and process control

Host and process Workers construct the same `ProcessContextImpl` and `ProcessServices`
implementation. Filesystem/stream semantics and resource ownership live in these
shared services. Runtime adapters borrow Context and keep only Wasm memory,
instances, P1 fd/errno, P2 resource/variant and P3 canonical async representations. `PlatformBackend` connects browser
primitives without duplicating service rules. The Host resource registry
invalidates a resource before asynchronous cleanup, waits for local I/O and control
acknowledgements, and keeps streams alive independently of their original descriptors.
Disposing a resource that is blocking on a pipe wakes the operation before waiting
for cleanup. Calls started before OS disposal are drained, including resources that
finish being constructed during shutdown.

The Core reserves the parent's handle while a process is STARTING, before resolving
READY. Exits are retained until the wait right is consumed or the handle is dropped.
Wait consumes the right at invocation, while resource disposal remains
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
Unsupported operations throw from the shared Context; HTTP and socket transports
remain outside this change. Their complete 0.3.2 API types are public.

Environment snapshots, wall/monotonic clocks, timers, secure random and the independent
insecure PRNG are shared local service implementations. Clocks report 1 ms resolution;
precision remains browser-dependent. Secure random uses chunked Web Crypto calls and
accepts 0–16 MiB per request; negative/oversized requests return `invalid`. Insecure
random/seed do not depend on Web Crypto. The raw Context preserves WIT Results. Host convenience failures expose ServiceError
with a stable code, message and optional cause; ABI conversions translate these to
P1 errno/P2 variants. UnimplementedWasiError is always propagated as a Trap.

## Integration

See [migration details](process-context-migration.md) for the v0.3 API/ABI migration, lazy PWD
bridge and Shell/consumer ownership. P2/P3 execution uses only jsco, with no
runtime selector or Component cache. The demo explicitly installs and spawns the
Shell with byte pipes; no implicit foreground input forwarding is provided.

## Verification

- `npm run check`: OS build, demo typecheck, root-only public API type examples,
  and negative checks for removed/forbidden public interfaces.
- `npm run build:apps`: actual P1/P2 binaries, versioned custom ABI fixtures and official native async P3 components.
- `npm test`: Host lifecycle/streams/filesystem/services and existing actual-worker
  READY/EXIT, parent failure, peer disappearance, OPFS locking and jsco regressions.
- `npm run test:production`, `npm run test:pages`: built-worker and Pages smoke checks.
- `npm run check:wit` and `diff -ru wit/generated work/wit-generated`.
- `npm run test:benchmark` and the reproducible browser benchmark, with a fixed SDK,
  Chromium and sample protocol. See the performance record added with this PR.

Historical #27–#31 results (before engine/cache removal): **151 browser regression tests passed**, with the two production-only
tests excluded from that run and then **2/2 production tests passed** separately.
Typecheck/public negative examples, clean build/pack, WIT regeneration comparison,
Pages subpath smoke test, and 3 benchmark-statistics unit tests passed. The existing
browser benchmark completed three retained samples per scenario on both revisions.
See [performance results and raw data](process-context-performance.md), including
observed slowdowns and limits of the comparison.

## #33/#35–#38 integration verification

Historical jsco-only integration passed 126 browser regressions (2 production-only skips),
2 production checks under CSP, Pages subpath/persistence and 4 final demo/PWD/cache
checks. OS build/pack, public typecheck, WIT regeneration, fixture rebuild and
benchmark statistics pass. [Current comparative results and limitations](process-context-integration-performance.md)
record historical startup, memory, OPFS and direct Pipe samples without performance release gates.
Current Steps 1–3 results are in [runtime-validation.md](runtime-validation.md).

## Runtime integration

See [Runtime/Context architecture](runtime-concept.md). The single internal Runtime
contract has initialize/run/requestStop/asyncDispose. Process Worker owns selection,
initialization before READY, exactly-once outcome reporting and disposal in Runtime-
then-Context order. It remembers stop requests during startup. Partial initialization
and a Runtime cleanup failure cannot bypass Context cleanup. Shared stdio getter
views retain their ambient connection; file locks are released immediately on drop
when no I/O is outstanding, while asynchronous release acknowledgements are drained.

## WASI 0.3.2 public projection

The public Context now exposes WIT package/interface groups, explicit Result,
Thenable Future and dedicated Stream ends. `wasi-services.ts` connects these to
ProcessServices' private shared byte/resource model. That private model is not a
second public Context. Common errors, resource ownership, filesystem policy and
stdio rules stay in services; Main Thread/Worker primitives stay in PlatformBackend.
P1/P2 and explicit Host wrappers use `abi-view.ts` only for representation conversion,
including P3 async-to-P2 readiness/permit conversion. None constructs OS services.

The io endpoint whenWritable Future uses the common stream capacity predicate,
including the requested minimum threshold. Adapter reservations and standard getter
write permits remain shared; pending data does not bypass Pipe backpressure. Dropping
an individual getter wakes its local pollables without closing ambient stdio. P3
operation Futures and streams are cancelled/drained before the remaining kernel
resources close, and an API cleanup failure cannot skip the kernel cleanup attempt.

The complete API and coverage inventories are generated from pinned, hash-checked
0.3.2 WIT, including the optional timezone feature. Unimplemented operations throw
from the shared Context; errors preserve that exception across ABI adapters.

## Native P3 execution

`component.ts` separates core-module headers from component containers. For a
component, `prepareJsco` reads its real imports/exports once and retains the prepared
engine object for initialization. Only CLI run exports are accepted; mixed P2/P3,
unknown imports/worlds and P3 versions other than 0.3.2 fail before READY. P2 retains
standard 0.2.x names. Runtime selection stays in the Worker.

`Wasi3` borrows Context and keeps only the prepared component, instance, one-shot
run/stop state and canonical drop tracking. `p3-bindings.ts` maps generated WIT
operation names directly to Context methods, retaining resource identity and Result
variants. It converts dedicated streams to explicit cancellable native iterators,
and native guest iterators into dedicated Context streams. Futures are consumed once;
their producer cancellation and resource drops are tracked independently. No OS
services, backend, Core connection or filesystem implementation lives in the adapter.

The pinned jsco 0.2.0-preview.2 supports native async lift/lower, waitable sets,
streams and futures. Its future table originally removed the readable handle
without notifying its producer. `vite.jsco.config.ts` applies a small checked
patch that invokes the binding's cancel hook and releases its table entry; an engine upgrade fails the build
until this patch is reviewed. Stream drop uses the engine's onReadableDrop hook.
Explicit iterators permit cancellation during blocked next(), unlike async generators.

Common ProcessExit preserves guest exit codes (including 130); RuntimeStopped
represents adapter stop, and Worker reports it as terminated. Native async stop
aborts the engine's waiters; Core retains its forced Worker-stop timeout for
non-yielding code. Runtime is disposed before its borrowed Context. Partial engine
initialization disposes its bindings, and cleanup continues after individual failures.

Real C fixtures use the official pinned 0.3.2 WIT with wit-bindgen 0.63.0 and
wasi-sdk 34.0's compiler/reactor support. Stock SDK libc references 0.3.0, so fixtures
call generated imports directly. The build checks actual WIT and canonical async,
stream and future instructions. Synthetic components are used only for rejection
tests. Chromium JSPI is required; Node-only jsco hosts are excluded from the bundle.
