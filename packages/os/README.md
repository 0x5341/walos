# @walos/os

A browser OS with one logical Host process and explicit WASI Preview 1/2 processes.
The v0.3 API is a breaking change. Creating an OS starts no shell, installs no
commands, and leaves existing OPFS user content unchanged.

```ts
import { HostProcessContext, Walos, ServiceError } from '@walos/os';

await using os = await Walos.create({ env: { PWD: '/', PATH: '/bin' }, argv: [] });
await using host = new HostProcessContext(os.getHostProcess()); // explicitly borrows the raw Context
const [[root]] = host.fs.getDirectories();
await using directory = root;
await using executable = await directory.openAt({}, 'app.wasm', {}, { read: true });
const [reader, writer] = await host.io.createPipe();
const output = (async () => {
  try {
    for (;;) console.log(await reader.blockingRead(65536n));
  } catch (error) {
    if (!(error instanceof ServiceError) || error.code !== 'closed') throw error;
  } finally {
    await reader[Symbol.asyncDispose]();
  }
})();
await using child = await host.process.spawn(
  executable, ['app'], [{ key: 'PWD', value: '/' }], undefined, writer,
);
console.log(await child.wait());
await output;
```

Consumers place their own Wasm files in OPFS, for example with
`openAt({}, 'app.wasm', { create: true }, { write: true })` and `writeViaStream(0n)`.
For each write, call `checkWrite()`, respect its byte permit, and await `write()`.
Use `subscribe().block()` when no permit is available. Pipe capacity is 64 KiB;
individual pipe permits are at most 16 KiB. Release every acquired resource with
`Symbol.asyncDispose`, including pollables and resources returned by stdio getters.
All Host read/write/file operations returning promises must be awaited before
moving their stream. Moving a busy stream consumes it and rejects with `busy`.
File output `flush()` commits writes locally; disposal also confirms completion.

The raw API follows WASI 0.3.2 packages/interfaces and preserves Result, Future
and Stream. HostDescriptor, HostInput, HostOutput and HostChildProcess are explicit
wrapper views; the former P2-style public resource type names are removed.
ProcessContext, the WIT namespaces, Exit and ServiceError are exported at the root. Browser handles, MessagePorts and RPC structures are internal.

- Only Host creation supplies a missing `PWD=/`. Child argv/env are explicit copied
  snapshots; empty argv is valid. Child PWD is never inherited, validated or filled in
  during spawn. Wasm code that actually needs cwd can fail through its usual error path.
- A descriptor is borrowed by spawn. Explicit stdio is moved at the call, even if
  spawn fails. Omitted stdio can inherit Null; pipe/file connections require explicit
  endpoints. Host stdin is EOF, and stdout/stderr discard bytes.
- `wait()` consumes its right at invocation. Results include `exited`, `trap`, and
  `terminated`. The ChildProcess resource remains valid until asynchronous disposal.
  Dropping a child handle does not stop the child; call `requestStop()` to stop it.
- Descriptor disposal does not close already acquired file streams. StdIO getter
  resources have independent lifetimes and do not close the process connection.
- `dispose()` and `Symbol.asyncDispose` on Walos are idempotent. They terminate owned
  processes, settle pending waits, release resources, and reject later Host operations.
- `Walos.create()` works without JSPI. Starting Wasm requires a current browser with
  JSPI. Secure randomness uses Web Crypto (maximum 16 MiB per request); insecure
  randomness uses a separate non-cryptographic PRNG. Clock resolution is reported as
  1 ms and is subject to browser precision limits. Timers execute locally.

There is no `boot`, `attach`, `binUrl`, `cwd`, `chdir`, `terminal`, `writeInput`,
`interrupt`, `output` event, or foreground controller. Standard WASI terminal
introspection remains available; Null and Pipe are not TTYs. The old C shell's
interactive input forwarding to grandchildren is unavailable. See the
[integration/migration notes](../../docs/process-context-migration.md) for explicit
Shell stdio wiring, PWD/libc timing and ABI rebuild instructions.

P2 execution uses jsco only. No Component conversion cache or engine selector is
exported. OS build/pack requires Node/npm only, with no WASI SDK or command assets.
`@bytecodealliance/jco` is repository build tooling, not a package runtime dependency.
No capability/security isolation model is introduced here.

Serve ESM and Worker assets from the installed package through your bundler, with
HTTPS (or localhost) for OPFS. Current Chromium JSPI is required for Wasm execution.
The production preview tests use `script-src 'self' 'wasm-unsafe-eval'` and
`worker-src 'self'`, with same-origin assets/fetches; no JavaScript `unsafe-eval` or
Blob module permission is required. Cross-origin isolation is optional for the OS.


The underlying `getHostProcess()` always returns the raw WASI 0.3.2 Context.
`HostProcessContext` is a separately constructed borrowing wrapper; import it
explicitly from `@walos/os`. Its disposal releases its generated resources and
does not dispose the Context or stop processes. Standard P1/P2 binaries remain
supported; Walos custom ABI consumers need to recompile. See the repository API,
migration and coverage documents for Result/Future/Stream and unsupported APIs.
