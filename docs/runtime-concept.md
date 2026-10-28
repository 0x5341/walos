# Runtime and ProcessContext

This records the Runtime Concept and the subsequent WASI 0.3.2 migration requirements.
Process, Runtime and Worker are separate concepts. A Process owns its identity,
resources and exit result; a Worker is an execution location; a Runtime translates
an executable's ABI to the process's services.

## Migration order

1. Share Context and services between Host, P1 and P2, keeping the current public
   API and standard binary ABIs. Introduce the single Runtime contract.
2. Replace the public Context with the official WASI 0.3.2 WIT contract. Adapt
   Host and P1/P2 to it before introducing an actual P3 Runtime. The old public TS
   API and Walos extension ABI do not constrain the new API.
3. Execute real WASI 0.3.2 command components, including native async, and test
   interoperability between P1, P2 and P3.

Each step has its own validation gate. Internal JS Process placement, a Host
MessagePort proxy and working HTTP/socket services are outside these steps.
Unimplemented standard APIs still belong in the Step 2 public surface and must
throw from the shared Context rather than silently succeeding.

## Shared implementation

`ProcessContextImpl` is the same implementation in Main Thread and each process
Worker, with a separate instance in each location. `ProcessServices` owns the
local filesystem, stdio, stream/descriptor registry, child handles, service error
conversion, clock/random and shutdown drain. It never branches on caller ABI.

`PlatformBackend` supplies browser root access and local stream connection. The
same filesystem rules use Main Thread asynchronous OPFS or Worker sync access
handles. Backend code does not implement separate permission, ownership, stdio
or error semantics.

Core owns PID allocation, process registration, READY/EXIT, wait rights, forced
termination and transfer ownership. File and Pipe payloads remain local or flow
directly between MessagePorts; Core only carries control messages.

The Host is one logical Process in Main Thread without a Runtime or its own
Process Worker. Walos owns its lifetime and returns its identical raw Context on
every `getHostProcess()` call. In Step 2 a public `HostProcessContext` wrapper is
explicitly constructed by consumers and only borrows that Context.

## Runtime contract

```ts
interface Runtime extends AsyncDisposable {
  initialize(executable: Uint8Array, context: ProcessContext): Promise<void>;
  run(): Promise<number>;
  requestStop(): void;
}
```

There is no RuntimeFactory or RuntimeInstance. The Process Worker reads and
classifies the executable, creates Context/services, selects the adapter and
initializes it before READY. Run is one-shot. Runtime-specific state consists of
Wasm memory/instances, ABI handle tables, fd offsets and representation conversion.
Runtime never creates a second filesystem, Pipe transport or process service.

P1/P2 Component-header classification is an intermediate Step 1 state. Step 3
must inspect actual imports/exports and versions to distinguish P2/P3 and reject
ambiguous, mixed, unknown or unsupported command worlds.

## Lifetime and ownership

Runtime borrows Context. Cleanup attempts Runtime disposal first and Context
disposal second, even if the first attempt fails. Disposal is idempotent and
partial initialization is covered. A stop received before Runtime creation is
remembered. Worker completion notifications are guarded against duplicates.

Failures before READY report boot-error; failures after READY report EXIT. A
normal numeric result is an exited result. Traps and supervisor termination stay
distinct. External Worker faults may require supervisor reclamation when normal
cooperative cleanup cannot finish.

Executable descriptors are borrowed. Explicit spawn stdio moves at invocation,
including on failed launch; omitted stdio follows the existing Null-only
inheritance rule. Child wait is one-shot; stop, wait and handle drop stay separate.
Dropping a child handle does not stop the process. Descriptor and derived Stream
lifetimes are independent. Ambient stdio survives dropping an individual getter
view, including file stdio. Pipe EOF, broken pipe, bounds and transfer accounting
remain common service behavior.

PWD is read lazily from the process's copied environment. Host creation alone
supplies its existing default. Spawn does not inherit, fill or validate PWD, and
Context has no new cwd/chdir operation.

## WASI 0.3.2 public contract

The official tagged WIT is the specification, independent of a binding generator.
Its packages/interfaces, functions, records, variants, resources and async
signatures determine the TS mapping. Imports become services; exports such as
CLI run remain Runtime entrypoints. All target APIs, including HTTP and sockets,
are inventoried and covered by a completeness check.

Async functions map to Promise, future to a dedicated one-shot Thenable Future,
and stream to dedicated endpoints with cancellation, backpressure and lifetime.
Result remains a Result. Own/borrow responsibilities are documented without new
runtime ownership-violation or repeated-Future-consumption checks. Host convenience
conversions do not introduce new OS behavior.

See the validation record for executed checks, performance samples and the current
completion status. A P3 label or a P2-only fixture is not evidence of P3 support.
