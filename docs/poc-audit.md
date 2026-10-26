> Historical pre-integration reference. Current v0.2 behavior and verification: [ProcessContext migration](process-context-migration.md). Old engine/cache/foreground instructions below are historical only.

# PoC acceptance audit — issue #8

Audit date: 2026-10-24. Baseline: [§12](grilled_webos_concept.md#12-pocの合格基準).
Source before this audit: `19b0215` (includes issue #4 benchmarks and issue #5
Worker recovery). This report includes the accompanying stdio and real-Worker
lifecycle regression tests.

**Decision: all nine criteria pass for the documented Chromium PoC subset.**
Criterion 7 is now backed by real compiled P1/P2 parents and children in native
Workers, with explicit test-only control points for READY and suspended spawn
completion. The matrix includes normal/nonzero exits, traps and observable
Worker failures, plus same-turn races and duplicate/late event replay. The
control points and their limits are disclosed below; this is not full WASI,
POSIX, cross-browser or silent-crash conformance.

`pass` means the stated requirement has executable evidence within the documented
subset; `partial` means evidence or implementation is incomplete; `unsupported`
means deliberately unavailable. A passing subset does not imply full WASI/POSIX
compatibility. Tests executed in Chromium with injected Worker doubles are
explicitly distinguished from tests executing compiled WASI in real Workers.

## Traceability

Test names below are searchable in the linked files and in the retained test
logs. Reproduction commands and environment are recorded below.

| §12 | Status | Evidence and observable assertions | Limits / unfinished work |
| --- | --- | --- | --- |
| 1. WASI shell, spawn, process resource/PID/wait | pass | [shell.spec.ts](../tests/shell.spec.ts), `WASI shell spawns a real pipeline`; [wasip2.spec.ts](../tests/wasip2.spec.ts), `a P2 parent uses generated walos WIT bindings`: real compiled shell and P2 parent start commands; generated [C fixture](../tests/fixtures/process2.c) checks distinct PIDs, exit 0, one-shot wait, consumed streams on failed spawn and request-stop. | Shell is P1; P1 uses handwritten compatibility imports, P2 uses generated canonical WIT bindings. |
| 2. argv/env/cwd/stdin/out/err | pass | `argv, env, cwd and exit status reach WASI commands` and `wasip2 commands receive argv, env, cwd and exit status` verify quoted/Unicode arguments, exported environment, `/home`, exit 1. `upstream cat keeps stderr separate from redirected stdout` and its `p2-cat` counterpart verify missing relative-path diagnostics on terminal, exit 1, empty redirected stdout, and stdin→stdout content. | cwd is initialized by SDK-specific compatibility constructors; general FD duplication is unsupported. |
| 3. OPFS, persistence, redirection | pass | Shell `preserves OPFS files`, `filesystem namespace operations`, `startup failure keeps redirection effects`; P2 `share pipelines, redirection and persistent OPFS files` and `filesystem operations`: `<`, `>`, `>>`, reload persistence, truncate before failed spawn, `/tmp` reset; [filesystem.c](../tests/fixtures/filesystem.c) checks offset I/O and namespace operations. [opfs.spec.ts](../tests/opfs.spec.ts) checks cloned handles and immediate exclusive-lock conflict. | Reload persistence, not power-loss durability. No directory rename, links, P1 readdir or portable O_RDWR target. |
| 4. concurrent bounded Pipe | pass | Shell `cat README.md \| grep TODO \| sort` produces `TODO apple` then `TODO zebra`; P2 mixed pipeline and byte-equal 1 MiB `cat large-p2 \| p2-cat \| cat > copied-p2`; [streams.spec.ts](../tests/streams.spec.ts) checks 64 KiB capacity/backpressure, ACK validation, drained EOF, migration and P2 pollables. | Single reader/writer; no general stream sharing. |
| 5. Linux-source CLI rebuild | pass | [sbase provenance/license](../apps/vendor/sbase/README.md), revision `b30fb56804bfed69b45ef0e944d2e029e4d26258`; [build-apps.mjs](../scripts/build-apps.mjs) compiles the same unmodified cat/concat/eprintf/writeall sources to `cat.wasm` (P1) and `p2-cat.wasm` (`--target=wasm32-wasip2`). Both execute in the pipeline, redirection and stderr tests above. | Local util.h declaration subset and cwd startup helpers are disclosed; this is a WASI rebuild, not execution of a Linux ELF binary. |
| 6. trap/stop/reader loss isolation and cleanup | pass | Shell/P2 `traps and forced stops leave the shell responsive`; [process.spec.ts](../tests/process.spec.ts) `real cat Worker …` / `real p2-cat Worker …` inject error/messageerror/rejection, assert one exit, wait completion, reader EOF, reopened OPFS writer lock and usable shell. `abnormal reader loss wakes a capacity-blocked writer` uses doubles; [streams.spec.ts](../tests/streams.spec.ts) `reader disconnection …` asserts pending write rejection. | Reader loss is tested at stream/supervisor level, not a real CPU-bound writer CLI. Silent self.close/renderer disappearance has no portable detection; forced-stop flush is not guaranteed. |
| 7. parent normal/abnormal exit before/after READY; races | pass | [lifecycle.spec.ts](../tests/lifecycle.spec.ts): 48 cases (P1/P2 parent × P1/P2 child × six exit causes × READY before/after parent exit), plus four same-turn READY/trap races before the Core spawn continuation. Real C parents call public P1/generated P2 spawn; children execute upstream cat. Tests check exit kind/code, adoption/cancellation, surviving child's exact output, settled waits, one exit/TTY close/termination per process, no retained stream/process/child resources or replies to the dead parent. Captured native terminal/READY events are replayed to verify idempotence. [process.spec.ts](../tests/process.spec.ts) retains deterministic timeout/cancellation/notification/migration coverage. | Test-only transport gates and interrupted spawn await force the orderings; see below. Injected messageerror models an observable decode failure, not browser/renderer loss. |
| 8. P1/P2 subset and basic execution | pass | Shell/P2 command suites above, generated WIT probe, cache corruption/concurrent publication tests, dev and bundled production CSP tests. Supported and unsupported interfaces are listed below and in [implementation.md](implementation.md). | No full WASI conformance claim or non-Chromium validation. |
| 9. startup/memory/CPU/file/Pipe measurements | pass | [Issue #4](https://github.com/0x5341/walos/issues/4) closed as completed; implementation merged in PR #10 (`65cd0b2`, merge `c850e23`). [Methodology](benchmarks.md), [five-trial raw JSON](benchmarks/2026-10-24.json), [summary](benchmarks/2026-10-24.md). | Existing recorded run is imported, not rerun for this audit. CDP heap snapshots are not RSS/peak/isolated Component memory; CPU uses elapsed workload time. No superiority claim. |

## Parent-exit policy and real-Worker controls

| Parent event | Child before supervisor observes READY | Child after READY | Evidence |
| --- | --- | --- | --- |
| Normal exit 0 or nonzero (P1: 7; P2: 1) | Survives under supervisor | Survives under supervisor | Real P1/P2 matrix, exact child output and exit 0 |
| Trap, Worker error, incoming messageerror, unhandled rejection | Cancelled, exactly one exit | Survives under supervisor | Real P1/P2 matrix plus existing deterministic supervisor tests |
| Captured terminal event replayed twice; late READY | Cannot resurrect or release twice | First terminal event wins | Every real-Worker matrix case |
| READY then trap in the same event turn | READY child survives | Queued spawn continuation cannot restore ownership to dead parent | Four real P1/P2 format combinations |

The [P1 C parent](../tests/fixtures/lifecycle.c) and [generated-WIT P2 C
parent](../tests/fixtures/lifecycle2.c) call public spawn, then actually return
0/nonzero or execute a Wasm trap. Their children are the rebuilt upstream
`cat`/`p2-cat`, blocked on real TTY stdin until the parent has exited. Surviving
children must echo `audit-child-survived` and exit 0. Cancellation must settle the
supervisor wait and release its resources exactly once.

The [harness](../tests/fixtures/lifecycle-harness.ts) creates native Dedicated
Workers running the production Process Worker. It captures each child's actual
READY event at the Core transport boundary; there is no sleep-based ordering or
fabricated READY/EXIT. Captured native terminal events and late READY are replayed
to test duplicate-event handling. Same-turn cases deliver READY immediately before
the parent's captured trap, without yielding to the Core's awaited spawn
continuation; no reply or resource may be restored to the dead parent.

Public spawn blocks until READY, so a single-threaded C parent cannot normally
return while that call is suspended. The [test-only Worker
wrapper](../tests/fixtures/lifecycle.worker.ts) gates completion of the actual
spawn RPC. Before-READY normal/trap cases interrupt that local await with a test
error, allowing the compiled C parent itself to return/trap while the real child
request remains pending in the supervisor. After-READY cases release the real
response. This exercises parent-death policy under forced orderings; it does not
introduce or claim a production nonblocking spawn API. Worker-error cases throw
from a real Worker handler; rejection cases create a real unhandled rejection;
messageerror is explicitly dispatched in the Worker, since ordinary cloneable
messages cannot portably trigger browser deserialization failure.

As a negative control, temporarily removing the Core's dead-parent ownership
check (`if (r.state !== 'EXITED')`) caused all four same-turn race tests to fail:
each detected one retained child handle instead of zero. The
[expected-failure mutation log](audit/2026-10-24-mutation.txt) is retained. The
original guard was restored before the final build and full regression run.

All controls are confined to test fixtures. The production supervisor, adapters,
Worker loader and public ABI are unchanged. Deterministic Worker doubles still
cover startup timeouts, cancellation, send failures and endpoint migration.
Silent renderer/browser crashes remain outside the observable failure guarantee.

## Format support

| Area | Preview 1 | Preview 2 | Unsupported / constraint |
| --- | --- | --- | --- |
| Executable | Core Wasm, wasi_snapshot_preview1; webos_v1 process bridge | Component, WASI 0.2.x, walos:runtime@0.1.0; Process-local Jco/JSPI | WASI 0.3, Linux ELF, full POSIX |
| CLI | argv/env, cwd helper, stdio, numeric exit | argv/env, initial-cwd helper, stdio, standard success/failure exit | P2 standard CLI exit has only 0/1 |
| Files | read/write/seek/stat, namespace operations, cloned cwd descriptors | Resource-based files, directory listing, offset I/O and metadata subset | P1 readdir/pread/pwrite/poll_oneoff, links, timestamp mutation, directory rename |
| Processes/streams | spawn/PID/wait/drop/stop, bounded Pipe and TTY | Same supervisor via generated WIT, nonblocking streams/pollables | Arbitrary FD/stream duplication; implicit inheritance is TTY/Null only |
| Cache/hosting | Direct browser Wasm compilation | SHA-256 validated OPFS conversion cache, Blob module loading | P2 needs documented CSP; no full browser portability claim |
| Isolation/network | Trusted applications only | Trusted applications only | Capability sandbox, quotas, sockets/HTTP, threads, full PTY/job control |

See [runtime boundaries and compatibility details](implementation.md) for exact
resource ownership, lock, timeout and unsupported-interface behavior.

## Benchmark evidence imported from issue #4

Five retained trials, Chromium 154.0.8037.57, Node 24.19.0, wasi-sdk 27.0,
Jco 1.15.1. Selected medians (full ranges/variability are in the linked summary):

| Metric | P1 | P2 |
| --- | ---: | ---: |
| Cold Worker startup | 66.325 ms | 1734.785 ms (conversion miss) |
| Warm Worker startup | 34.455 ms | 55.945 ms (OPFS hit) |
| CPU workload elapsed time | 54.700 ms | 54.965 ms |
| Loaded Worker JS heap used | 481772 B | 714556 B (OPFS hit); 11213396 B (miss) |

OPFS 1 MiB median write/read: 25.572 / 56.996 MiB/s. Direct Pipe 1 MiB:
258.733 MiB/s, first byte 0.690 ms. These stream microbenchmarks exclude
Wasm/libc/shell overhead and must not be compared directly with the shell's
end-to-end 1 MiB smoke timing. P2 isolated linear memory remains unavailable.

## Reproduce and retained audit logs

From a clean checkout, use the root README setup instructions, including SDK,
wit-bindgen and Chromium installation. Run sequentially; do not overlap benchmark
measurements with builds/tests. Generation output should be fresh (stale
`webos-runtime-*` files from an older build are not canonical WIT differences).

```sh
npm run check:wit
diff -ru wit/generated work/wit-generated
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm test
CHROMIUM_PATH=/usr/bin/chromium npm run test:production
npm run test:benchmark
# Only the real-Worker parent/child matrix:
CHROMIUM_PATH=/usr/bin/chromium npx playwright test lifecycle.spec.ts
# Optional fresh performance run, separate from acceptance regression tests:
CHROMIUM_PATH=/usr/bin/chromium npm run benchmark -- --trials 5 --output work/benchmarks/latest.json
```

Audit environment: Linux x86-64, Node v24.19.0, Chromium 154.0.8037.57,
wasi-sdk 27.0, wit-bindgen 0.46.0, Jco 1.15.1, Playwright 1.56.1.
The [environment manifest](audit/2026-10-24-environment.json) records the base
revision, exact commands and SHA-256 hashes of both rebuilt upstream cat
executables, both compiled lifecycle parents, and the accompanying test/build
sources. It also records the test commit and final log hashes. The test-source hash
identifies the exact audited sources relative to that base revision.
WIT generation and its canonical declaration diff, app compilation, library/UI
type checks (including the lifecycle harness/Worker fixtures) and production
bundling passed. The development Chromium suite
passed all 101 tests, including the 52 real-Worker lifecycle cases and both
upstream stderr regressions. The bundled
production Chromium suite passed all 13 tests; both benchmark aggregation tests
also passed. Criterion 7 now has passing native-Worker evidence under the
explicit controls described above.

Retained logs: [WIT/build](audit/2026-10-24-build.txt),
[development browser tests](audit/2026-10-24-dev.txt),
[production browser tests](audit/2026-10-24-production.txt),
[benchmark aggregation](audit/2026-10-24-stats.txt).
Local results are independent of hosted CI status. No benchmark rerun or
cross-browser validation is implied.
