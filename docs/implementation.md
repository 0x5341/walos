# Preview 1 review slice

## Scope and review order

The supplied `concept.md` is retained unchanged. The supplied grilled baseline
resolves its earlier open decisions; its statement that implementation was
approved is treated as background context. The work and PR are authorized by
the user's request in this conversation.

This change delivers the Preview 1 vertical path, rather than claiming all seven
baseline slices are complete. Review in this order:

1. `wit/world.wit`, `src/protocol.ts`: public contract and private Worker transport.
2. `src/core.ts`: one Process Worker per process; READY, resource ownership,
   wait/drop, parent exit, timeout/cancellation and stop escalation.
3. `src/streams.ts`, `src/fs.ts`, `src/wasi.ts`, `src/process.worker.ts`: process-local
   resources, direct I/O and Preview 1 adapter.
4. `apps/sh.c`, `apps/webos.h`, `apps/compat.c`: the shell and compatibility bridge.
5. `tests`, CI and the reproducible validation below.

| Baseline slice | Implemented in this PR | Remaining |
| --- | --- | --- |
| 1. Worker/Wasm | Main → Core → Process Worker; real WASI commands; READY/EXIT, trap, terminate | Broader Worker disappearance diagnostics |
| 2. WASI 0.1/OPFS | argv/env, directory descriptor cwd, stdio, read/write/seek, basic stat, mkdir/unlink/rmdir and file rename, persistence | Wider syscall/rights coverage, read/write descriptors, directory rename, readdir |
| 3. spawn/wait | Descriptor-based spawn, local process resources, one-shot wait, drop, stop, parent normal/abnormal distinction, explicit cancel | Full generated C bindings and richer P1 error payloads |
| 4. Streams | Direct MessagePort DATA; 64 KiB capacity, 16 KiB chunks, cumulative ACKs, EOF/Broken Pipe, migration, foreground TTY | Preview 2 nonblocking methods and standard pollables; configurable UI controls for capacities |
| 5. Shell | PATH, cwd, env, exit status, pipelines, `<`, `>`, `>>`, small literal/quote grammar | Full POSIX syntax is outside this PoC |
| 6. WASI 0.2 | WIT validated against standard types; generated TypeScript declarations | Component execution, process-local Jco browser conversion, common P2 adapter, OPFS transformation cache and CSP experiments |
| 7. Completion | Unmodified sbase cat compiled for WASI, regression tests, one large-I/O timing sample | Full startup/memory/CPU/I/O benchmark matrix and all PoC acceptance criteria |

Preview 2 remains a required later PoC stage; this change does not replace it
with a private WASI variant. No Execution Worker pool, central file server or
Pipe DATA relay is introduced. The Web UI displays output and sends keyboard
bytes; command parsing, PATH search and pipelines execute in the WASI shell.

## Runtime boundaries

Main bootstraps `/bin`, creates the initial filesystem and resets `/tmp` before
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

TTY has no capacity limit or ACK. Main has one input owner and discards input
when there is none. Shell foreground changes and restoring its input pass
through the Core. The UI holds the shell prompt until foreground output CLOSE messages
arrive, without adding TTY data ACKs. Ctrl+C interrupts the foreground pipeline and cancels a
pending foreground startup. General FD duplication and file/pipe implicit
inheritance are unsupported; implicit stdio inheritance is TTY/Null only.

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

## Validation evidence

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

Final local validation: TypeScript build, WIT generation/diff, 16 development
browser tests and 5 production browser tests passed. Hosted CI is reported
separately by the PR.
