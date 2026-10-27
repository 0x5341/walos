# ProcessContext integration: #33, #35–#38

The public API and Walos extensions are v0.2.0. Standard WASI P1/P2 imports keep
their existing ABI. Rebuild applications importing Walos extensions; old binaries
using the cwd spawn argument or foreground import are incompatible.

| Previous interface | v0.2.0 |
| --- | --- |
| new Walos / boot / attach / binUrl | await Walos.create; consumer installs binaries |
| automatic Shell / OPFS bootstrap | one Worker-free Host; no automatic applications |
| path/options spawn and cwd FD | borrowed executable Descriptor, full argv, env entries, owned stdio positions |
| writeInput / output / foreground / interrupt | explicit byte pipes, consumer decoding/echo, ChildProcess.requestStop |
| ctx.cwd / chdir / terminal | readonly env/args; PWD for initial cwd |
| Resource.close / Symbol.dispose | await Resource[Symbol.asyncDispose]() |
| Jco/polyengine selection / Component cache | direct jsco; no cache API or cache writes |

## ABI and PWD

`wit/world.wit` declares `walos:runtime@0.2.0`, imports only process/ipc and has
no custom terminal or cwd spawn argument. P1 `apps/webos.h` likewise drops the
foreground import and cwd argument. Standard WASI terminal queries remain and
report Null/Pipe as non-TTY. Regenerate TS with `npm run check:wit` and rebuild
C/Component fixtures with `npm run build:apps` (wasi-sdk 27, wit-bindgen 0.46.0).

Only Host creation supplies a missing PWD=/; child spawn never inherits, supplies
or validates PWD. P1 initial_cwd and P2 environment.initial-cwd read the snapshot
when Wasm calls them. Descriptor-relative operations do not consult PWD. The
compat.c/compat2.c constructors initialize wasi-libc cwd **inside Wasm before
main**. Thus invalid PWD may produce an ordinary exit/trap during that constructor,
after READY (P1 code 126; P2 wasi:cli/run maps unsuccessful exit to code 1); cwd-free services fixtures omit those constructors and run without
PWD. The Shell uses libc chdir/getcwd/setenv and explicitly serializes its current
environment into each child spawn. Host env remains a readonly launch snapshot.

## Demo ownership

The UI installs named command files under /bin and creates missing /home,/tmp;
it never clears those directories. It connects Shell stdin/out/err through three
explicit Pipes, drains both output readers, waits once and disposes resources.
Echo and UTF-8 decoding are consumer code. Page teardown disposes the OS.

The C Shell retains its own standard endpoints. Child stdin defaults to an
explicit EOF pipe; use `< file` for input. Intermediate pipeline endpoints move
straight between children. Final stdout and each child's stderr are explicit
temporary files, drained after wait and unlinked. This deliberately bounded-scope
consumer strategy avoids stealing the Shell's endpoints or adding implicit Pipe
inheritance. Output is buffered on disk until completion, stderr ordering relative
to stdout is not preserved, and aborted Shells can leave temporary captures in
/tmp. No automatic terminal forwarding or job control is promised in Phase 1.
The Stop button targets the Shell handle, not global foreground state; READY
children survive a parent's exit, and OS disposal ends all managed processes.

## Service and execution paths

Host facades and P1/P2 adapters share filesystem/streams and local service
implementations (`services.ts`, `p2-fs.ts`, `p2-io.ts`, `streams.ts`). Host OPFS uses
async browser APIs; Process Workers retain sync access handles. Core controls PID,
ownership and MessagePort transfer, never byte DATA. The 64 KiB Pipe bound,
16 KiB chunks, cumulative ACK, EOF and Broken Pipe behavior stay intact.

P2 load is createComponent → jsco import adaptation → instantiate → run. Old
Jco/polyengine runtime loaders, registry/options, translator dependencies, OPFS
artifact/cache hashing/staging/publication and clearComponentCache are removed.
Existing `.walos-components` data is left untouched. Jco is retained in root
**devDependencies** solely for WIT and fixture build tooling. OS package build and
pack do not invoke SDK or command builds. Historical benchmark JSON/Markdown stay
in docs/benchmarks; obsolete multi-engine runners/tests are removed.

CI validates public types, WIT regeneration, command fixtures, browser lifecycle,
services and I/O, production workers and Pages subpaths. Performance numbers are
observations, not release thresholds. See the [integration performance record](process-context-integration-performance.md) for
current startup, memory, local OPFS and direct Pipe measurements and limitations.
