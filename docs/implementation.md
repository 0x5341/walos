# WASI runtime implementation

## Scope and review order

`concept.md` is retained unchanged. The grilled baseline resolves its earlier
open decisions. The runtime implements the Preview 1 path and the Preview 2
(wasip2) vertical slice, with the supported subsets described below.

Review the commits in this order:

1. WIT extension rename: `webos:runtime` → `walos:runtime`; regenerated declarations.
2. Shared nonblocking stream operations and standard P2 pollables.
3. Browser Jco packaging, Process-local conversion, OPFS cache and manual clearing.
4. P2 filesystem/process adapter, executable detection and bundled wasip2 commands.
5. Generated-WIT C fixture, browser integration tests, CSP/cache tests and CI.
6. Updated support status and reproducible hosting/build instructions.

| Baseline slice | Implemented | Remaining |
| --- | --- | --- |
| 1. Worker/Wasm | Main → Core → Process Worker; real WASI commands; READY/EXIT, trap, terminate, Worker failure recovery | Silent browser/renderer loss is not observable |
| 2. WASI 0.1/OPFS | argv/env, directory descriptor cwd, stdio, read/write/seek, basic stat, mkdir/unlink/rmdir and file rename, persistence | Wider P1 syscall/rights coverage, P1 read/write descriptors and readdir; directory rename |
| 3. spawn/wait | Descriptor-based spawn, local process resources, one-shot wait, drop, stop, parent normal/abnormal distinction, explicit cancel | Full generated C bindings and richer P1 error payloads |
| 4. Streams | Direct MessagePort DATA; 64 KiB capacity, 16 KiB chunks, cumulative ACKs, EOF/Broken Pipe, migration, foreground TTY, P2 nonblocking operations and standard pollables | Configurable UI controls for capacities |
| 5. Shell | PATH, cwd, env, exit status, pipelines, `<`, `>`, `>>`, small literal/quote grammar | Full POSIX syntax is outside this PoC |
| 6. WASI 0.2 | Real wasip2 commands; Process-local Jco conversion; shared P2 host adapter; persistent cache; generated-WIT spawn/IPC; CSP tests | Broader filesystem coverage and unsupported network interfaces |
| 7. Completion | Unmodified sbase cat compiled for P1/P2, regression tests, reproducible P1/P2 startup/cache, Worker memory, CPU, OPFS and Pipe benchmarks with raw samples and variability; [nine-criterion audit](poc-audit.md) | No unpassed §12 criterion within the documented Chromium PoC subset; broader conformance and silent-crash recovery remain outside that claim |

Preview 2 uses standard WASI 0.2.x interfaces and the `walos:runtime@0.1.0`
extension. No Execution Worker pool, central file server or Pipe DATA relay is
introduced. The Web UI displays output and sends keyboard
bytes; command parsing, PATH search and pipelines execute in the WASI shell.

## Runtime boundaries

The `@walos/os` library bootstraps `/bin`, creates the initial filesystem and resets `/tmp` before
launching the shell. After boot, each Process Worker opens its executable from a
cloned `FileSystemFileHandle`, and performs file/namespace I/O directly against
OPFS. The Core receives handles and control messages, not executable bytes.
Cwd and executable handles are borrowed for spawn. argv/env are copied; duplicate
environment keys use the last value when encoded into the internal object.

The Core allocates monotonically increasing PIDs and stream IDs. Worker-local
FD/process-resource numbers are never copied as cross-worker resource handles.
Explicit streams move immediately out of the caller's table, including on
subsequent spawn failure. Partial startup is released, and late READY/replies
are ignored. Port transfers include buffered protocol continuation state when
an already-used stream moves; normal streaming DATA travels directly between
processes. Normal close is delivered on the data port so EOF cannot overtake
queued DATA. On abnormal exit, the Core also wakes surviving peers.

A normal parent exit (including nonzero status) leaves starting children under
the supervisor. A trap/abnormal exit cancels children that have not reached
READY. READY children survive either event; dropping a process resource does
not stop it. `wait` consumes an exit once. Explicit cancellation affects only a
STARTING process. `request-stop` sets the adapter's cooperative stop flag; after
150 ms the Core terminates the Worker if it has not exited. Startup timeout is
15 seconds; ordinary RPC timeout is 30 seconds. `wait` has a 24-hour RPC timeout
in this first adapter. Timeout of a spawn RPC sends a cancellation request.

File output uses an OPFS synchronous access handle with explicit offsets.
Parent-side redirection creates/truncates before spawn and closes that handle
before transferring the file reference. The child opens its own handle without
re-resolving a path. Append obtains the current size on every write; close
flushes. Locks produce an immediate error; there is no retry/locking service.
A forced Worker exit does not guarantee flushing outstanding output. Directory
operations use the descriptor's actual cloned directory handle. File rename
uses Chromium's OPFS `FileSystemFileHandle.move`; directory rename is not
implemented. Snapshot path names are descriptive, not an isolation mechanism.

TTY has no capacity limit or ACK. The library has one input owner and discards input
when there is none. Shell foreground changes and restoring its input pass
through the Core. The library holds the shell prompt until foreground output CLOSE messages
arrive, without adding TTY data ACKs. Ctrl+C interrupts the foreground pipeline and cancels a
pending foreground startup. General FD duplication and file/pipe implicit
inheritance are unsupported; implicit stdio inheritance is TTY/Null only.

## Unexpected Process Worker failure

The Core treats Worker `error`, Core-side `messageerror`, Process-side incoming
`messageerror` and unhandled promise rejections as abnormal exits. Synchronous
control `postMessage` failures (startup, RPC replies, stop and peer notifications)
also enter the same one-shot cleanup path. The existing `exit` diagnostic event
contains `pid`, `exit.kind`, a reason in `exit.message`, and `durationMs`; Worker
errors and send/decode failures have distinct reason text. A channel send failure
means the protocol cannot continue, even when it does not prove Worker death.

Cleanup marks the record EXITED before terminating its Worker, rejects pending
startup, resolves its pending wait, clears process resources and stream ownership,
and emits one TTY close and one exit event. Late READY/EXIT and duplicate failure
events are ignored. Starting children of an abnormal parent are cancelled; READY
children survive and are adopted by the supervisor. A child that becomes READY
just before the parent's asynchronous spawn continuation does not restore a
resource to the dead parent.

Transferred ports cannot be recovered or closed from the Core. Worker termination
releases its realm's ports and OPFS access handles through the browser; output
flush and immediate lock-release timing are not guaranteed. Untransferred ports
are closed locally. The Core removes ownership before notifying remaining peers,
so even a second Worker failing during notification cannot interrupt or duplicate
the first cleanup. A lost writer wakes readers with EOF; a lost reader wakes
writers with Broken Pipe. Loss during startup is retained on the endpoint and
sent after READY, including when that endpoint moves to another child before
READY. Normal close still travels on the data port to preserve queued DATA order.

Dedicated Workers/MessagePorts provide no portable close/death event. A successful
`postMessage` does not prove a receiver is alive. Silent `self.close()`, external
`terminate()`, renderer/browser crashes, OS kills and an unresponsive CPU-bound
Worker may produce no detectable event. There is no heartbeat that would falsely
classify busy or background-throttled Workers as dead. Startup timeout and explicit
stop escalation remain the available bounds for those operations; post-READY
silent disappearance has no automatic detection guarantee, and peer/wait may
remain pending until explicit supervisor disposal/termination. Losing the Core or
the whole browser is outside Process recovery.

## Library boundary

`packages/os` is an npm workspace with one public entry, `@walos/os`. Its `Walos`
class exposes boot, input, interrupt, disposal, state snapshots and typed events.
No DOM access or workbench selectors exist inside the package. Boot installs the
hosted WASI commands; `binUrl` lets another UI choose their asset location. The
public entry owns TTY decoding and prompt ordering; `internal` contains private
bootstrap, Worker transport, process management and WASI adapters.

The root workbench imports the compiled package. Its `src/main.ts` subscribes to
output/state/process events and forwards input/interrupt actions. It does not
know about OPFS handles, Worker messages or MessagePorts. Disposal terminates all
session processes through the supervisor before terminating the Core Worker and
closing terminal ports; it can also cancel an in-flight boot.

The package build uses TypeScript to emit ESM and declarations. Relative module
Worker URLs remain in the output for the consumer bundler to process. Vite's
production build bundles both levels of Workers. Browser library tests use an
empty HTML host to verify real pipelines, Unicode output, file I/O, interrupts,
boot errors and cancellation without creating the workbench UI.

## Preview 1 compatibility ABI

`apps/webos.h` describes the Core Wasm imports in module `webos_v1`. They are a
handwritten compatibility bridge for this slice; WIT remains the intended
component ABI source. The bridge uses little-endian wasm32 values:

| Import | Contract |
| --- | --- |
| `spawn(exe_fd, cwd_fd, json_ptr, json_len, in_fd, out_fd, err_fd, handle_out)` | Borrow a readable file FD and a directory FD. JSON contains argv and env. Explicit stdio FDs are consumed; `-1` inherits. Return errno, write a worker-local resource on success after READY. |
| `pid(handle)` | Return the process PID without consuming the resource. |
| `wait(handle, result_out)` | Consume resource; write two u32s: exit tag (0 normal, 1 trap, 2 terminated), then code (normal code, 125 for trap, 130 for forced stop). Rich diagnostic strings remain in supervisor events in this slice. |
| `drop(handle)` / `request_stop(handle)` | Drop ownership without killing / request cooperative stop. |
| `create_pipe(fds_out)` | Write input/output FD pair backed by directly connected MessagePorts. |
| `foreground(handles_ptr, count, input_handle)` | WIT terminal bridge: select children and a single input owner; `-1` means none, `0` with an empty list restores caller input. |
| `initial_cwd(buffer, capacity)` | P1-only libc startup helper: return the descriptor snapshot's cwd path bytes, or -1 when the buffer is too small. |

Preview 1 lacks the standard Preview 2 initial-cwd interface. `apps/compat.c` is
linked as a constructor so wasi-libc initializes its local cwd before `main`.
This preserves upstream `cat` sources. The runtime provides root and cwd
preopens and uses the supplied cwd directory handle; it does not substitute
`PWD` for the descriptor. Programs using a different libc may need an equivalent
compatibility startup helper.

Internal RPC errors distinguish invalid resources, startup, timeout,
cancellation and internal failure. P1 maps these to BADF/IO/TIMEDOUT/CANCELED/IO.
OPFS NotFound, permission, lock, quota and type errors map to the corresponding
WASI errors; unsupported syscalls return NOSYS (52). The adapter is intentionally
a documented subset: no sockets, poll_oneoff, pread/pwrite, symlinks, arbitrary
FD sharing or complete rights enforcement. Read-only and write-only file
streams are supported; O_RDWR is not a supported portability target yet.

## Preview 2 adapter and supported subset

The Wasm header selects the P1 Core Wasm or P2 Component loader. In the P2 path,
the Process Worker prepares stdio, loads or converts the Component with Jco
1.15.1, instantiates its JSPI bindings, validates `wasi:cli/run`, then sends READY.
Conversion, import or initial resource failures are startup errors. After READY,
`run` success/failure maps to exit 0/1, standard CLI exit maps to 0/1, Wasm traps
remain traps, and the supervisor can terminate a CPU-bound Component. The P2
standard CLI exit API has no arbitrary numeric exit status. A P2 parent can
still observe the full exit variant/code of a P1 child through the walos WIT.

`wasi2.ts`, `p2-fs.ts` and `p2-io.ts` adapt Component resources to the existing
Core RPC, `Filesystem`, `FileStream` and `PortStream`. Resource objects never
cross Workers. `spawn` borrows descriptors and consumes every explicit stream
before descriptor validation; failed preparation releases the consumed streams.
Standard stdio getters return independent local resource owners of the same
logical stream. Dropping one leaves the ambient stream and other owners alive;
transferring stdio with multiple live owners returns `invalid-stream`, since
general stream sharing across Workers is outside the PoC.
P1/P2 use the same startup/parent-exit/stop/wait supervisor. Child resource drop
leaves the child running; wait consumes the result once. The P1 `webos_v1`
compatibility import names remain stable; only the WIT namespace was renamed.

| Interface | Supported | Limits |
| --- | --- | --- |
| CLI | argv/env, standard initial-cwd, stdin/out/err, terminal detection, exit | Standard success/failure exit; shell remains P1 |
| I/O | Nonblocking read/write/check-write, blocking convenience methods, skip/splice/zeroes, flush, subscribe, level-triggered poll/pollable | Single reader/writer per Pipe; no general stream duplication |
| Filesystem | Borrowed file/directory resources, preopens, open, read/write streams, offset reads/writes, stat, size, directory listing, mkdir/unlink/rmdir, file rename, metadata hashes, identity and flush | No links, timestamp mutation, directory rename or integrity-sync open flags |
| Clocks/random | Wall and monotonic clocks, timer pollables, cryptographic random and insecure interfaces | Browser clock precision and allocation limits |
| walos extensions | spawn, PID, wait/drop/request-stop, Pipe creation, foreground terminal operations | Same TTY/Null-only implicit stdio inheritance as P1 |
| Network/other imports | Explicit unsupported-import startup errors | Sockets/HTTP and WASI 0.3 are outside this slice |

File input uses shared read-only OPFS sync access handles; output uses exclusive
readwrite handles. Conflicting opens fail immediately without retries. File
streams maintain independent logical offsets and move their handle/offset state
at spawn. A writer cannot coexist with a read-only sync handle for the same file;
OPFS lock errors are exposed as standard filesystem/stream errors. Close flushes
output only and releases handles. Browser crash/forced-stop flush is not promised.
`apps/compat2.c` initializes wasi-sdk 27's libc cwd through standard `initial-cwd`;
libc otherwise starts at `/`. Preopen calls return fresh owned resources.

## Component conversion, cache and CSP

The library build bundles Jco's browser converter and Wasm assets into a lazy
module. The production converter is about 9.8 MB before compression and is loaded
only on a cold conversion. The Process Worker performs conversion; the main
thread and Core do not convert Components. The only execution engine is the
browser's WebAssembly runtime.

Cache keys include the Component SHA-256, converter version, host cache revision
and all Jco options, including exact JSPI import/export selectors. Each Worker
keeps an in-memory promise/result cache and accesses `.walos-components` in OPFS.
A unique staging directory holds JS and Core Wasm artifacts. Publishing the
manifest with `createWritable().close()` happens after every artifact is closed.
Concurrent duplicate conversions are allowed; either completed manifest can win.
Readers validate manifest shape and SHA-256 hashes. Incomplete/corrupt entries are
regenerated. Cache quota/write errors leave execution using the in-memory result.
Partial/superseded staging directories are reclaimed by the exported
`clearComponentCache()` API; automatic LRU and a central cache manager are absent.

Generated JS is loaded through a temporary Blob module URL, which is revoked
after instantiation. Core Wasm bytes are supplied explicitly to Jco's generated
instantiator, avoiding OPFS fetch URLs or JS rewriting. CSP tests serve policy on
the page and Workers, allowing `'self'`, Blob modules, `'wasm-unsafe-eval'` and
`data:` fetches for Jco's bundled Wasm. The exact tested policy is in the library
README. No `eval`/`new Function` fallback is used.

## Validation evidence

The [2026-10-24 final acceptance audit](poc-audit.md) maps all nine baseline
criteria to named tests, retained local logs, reproduction commands and the
completed issue #4 benchmark results. All nine criteria pass within the documented
subset; criterion 7 now also has 52 real-Worker cases spanning compiled P1/P2
parents and children, normal/nonzero exits, traps, observable failures,
same-turn READY/exit races and replayed terminal/late READY events. The audit
discloses the test-only transport gates and interrupted spawn await used to force
otherwise inaccessible orderings. Unsupported features remain listed separately.

Environment: Linux x86-64, Node 24.19.0, wasi-sdk 27.0, Chromium
154.0.8037.57, TypeScript 5.9.3, Jco 1.15.1. See README for commands; CI repeats
WIT generation, type checking/build, browser tests and bundled production tests.

The actual browser pipeline `cat README.md | grep TODO | sort` returns
`TODO apple` followed by `TODO zebra`. Tests also cover argv/env/cwd, exit code
1, file truncation before failed spawn, reload persistence and `/tmp` reset,
read/write/seek, mkdir/rename/unlink/rmdir, trap and infinite-loop termination.
A 1 MiB `cat large.txt | cat > copied.txt` transfer exceeded the 64 KiB pipe
capacity, completed with byte-for-byte equality, and took approximately 1.9 s
in an initial dev-server run including process launch and test polling. This
is a smoke measurement, not a throughput or CPU benchmark.

Direct browser probes confirmed cloned OPFS handles, exclusive-lock failure
(`NoModificationAllowedError`) and successful reopening after close; offset I/O
and flush are checked. JSPI successfully suspends real compiled libc calls across
asynchronous Worker RPC and OPFS reads. Small protocol tests cover cumulative
ACK validation, small-read writer wakeup, drained EOF, Broken Pipe and endpoint
migration. Deterministic Worker doubles test event order for parent normal/trap
exit before/after READY, timeout/late READY, explicit cancellation, one-shot wait
and resource drop. They do not claim to reproduce an unexpected browser crash.

The security scope remains trusted applications only. There is no enforced
capability sandbox or resource quota. Shared OPFS and boot-time `/tmp` reset mean
multiple simultaneous OS tabs are not supported in this slice.

Final local validation after library extraction: TypeScript library/UI builds,
WIT generation/diff, 21 development browser tests and 5 production browser tests
passed. Packing the library, installing its tarball in a separate consumer,
consumer type checking and a consumer Vite production build also passed. Hosted
CI is reported separately by the PR.

## wasip2 validation

Run the setup/build/test commands in the root README. `setup-wit-bindgen.sh`
installs checksum-pinned wit-bindgen 0.46.0, and `build-p2-probe.mjs` generates C
bindings and a real Component from the canonical WIT plus `process2.wit`. This
fixture starts a P2 producer and P1 consumer through public WIT, transfers a Pipe,
checks distinct PIDs and one-shot wait, and checks invalid-descriptor spawn after
stream consumption. It also verifies independent stdio getter resource lifetimes,
file-stream ownership/offset transfer and WIT request-stop escalation. `p2-*` CLI fixtures are compiled by wasi-sdk 27's native
`--target=wasm32-wasip2` toolchain. The upstream sbase cat also runs as a P2 CLI.

The browser suite covers P1/P2 mixed pipelines, a byte-equal 1 MiB transfer,
argv/env/cwd/exit, persistent file redirection, namespace operations, trap/stop
recovery, nonblocking permits and multiple pollable wakeups. Cache tests check
fresh-Worker reuse while blocking the converter fetch, hash-corruption recovery,
concurrent Worker publication and idempotent public cache clearing. Both dev and
production tests exercise the supported CSP.

Earlier wasip2 slice validation: Node 24.19.0, wasi-sdk 27.0, wit-bindgen 0.46.0,
Jco 1.15.1 and system Chromium. WIT generation/diff, TypeScript/production builds,
all 29 development browser tests and all 11 production browser tests pass.
Packing the library, installing it in a separate consumer, consumer type checking
and a consumer Vite production build (with `worker.format: 'es'`) also pass.

The performance portion of Slice 7 and baseline §12 criterion 9 are covered by
`npm run benchmark`. See [methodology and recorded results](benchmarks.md) for
five-trial P1/P2 comparisons, cold/warm/OPFS conversion reuse, Worker heap
snapshots, CPU, OPFS and size-dependent Pipe throughput/latency. Raw samples,
toolchain/environment metadata, aggregation and measurement limits are retained.
CI runs a single-trial integrity check without performance thresholds. No
performance superiority claim is made.

Issue #5 regression coverage adds error/messageerror/send failures before and after
READY, parent/child races, duplicate and late events, endpoint migration during
startup, failed peer notifications, blocked reader/writer wakeup, and failed READY
notification. Test-only real P1/P2 Workers inject uncaught handler errors, incoming
messageerror and unhandled rejections; tests check wait completion, Pipe EOF, OPFS
writer-lock reopening and continued shell execution. These injected failures test
observable browser events, not silent renderer crashes.
Local Issue #5 validation: app compilation, library/UI type checking and production
bundling, WIT generation/diff, 47 development browser tests, 11 production browser
tests and both benchmark aggregation tests pass with system Chromium.

Issue #8 final local validation: WIT generation/diff, app compilation,
library/UI and lifecycle-fixture type checks, production bundling, 101 development
browser tests, 13 production browser tests and both benchmark aggregation tests
pass. The four same-turn race tests also detect a temporarily removed ownership
guard (expected failures); the runtime was restored for the final run. See the
[audit and retained evidence](poc-audit.md) for the nine-criterion decision,
reproduction commands, fault-injection controls and measurement limits.
