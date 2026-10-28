# Runtime migration validation

Baseline: main `b98f7d4cb24ff41e00c5552246c18c16cfbfdd80`.
WASI 0.3.2 upstream tag: `bdadbbb8cadd287cc5014c4b5a0bf76efc60291c`.

## Step 1 gate: passed

| Check | Result |
| --- | --- |
| `npm run check` (including public types, OS build and Runtime dependency check) | pass |
| `npm run check:wit` and `diff -ru wit/generated work/wit-generated` | pass |
| `npm run build:apps` | pass |
| `CHROMIUM_PATH=/usr/bin/chromium npm test` | 130 passed, 2 production-only skipped |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:production` | 2 passed |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:pages` | pass |
| `npm run test:benchmark` | pass |
| `CHROMIUM_PATH=/usr/bin/chromium npm run benchmark -- --trials 1` | pass |

The browser suite preserves standard P1/P2 binaries, Host creation/disposal,
Resource move/borrow, independent descriptor/stream lifetimes, file locking,
Pipe accounting, pending I/O, spawn/wait/stop and actual Worker READY/EXIT races.
Four added tests cover borrowed Context survival, one-shot Runtime execution,
idempotent disposal and partial initialization for P1 and P2.

Context/service logic is shared. Runtime adapters have no value imports of OS
implementations (enforced by `check:runtime`). File stdio retains its ambient
connection when an individual getter view is dropped. Resource drops start
immediately when no I/O must drain, and asynchronous release acknowledgements are
awaited. ABI drop bookkeeping removes settled entries, and P1 fd moves release
metadata descriptors independently of their transferred streams.

The isolated benchmark supervisor now acknowledges stream-release control RPC,
as Core does in production. It still does not relay data. Run timing excludes
cleanup, matching the original measurement interval.

## Step 1 measurements

Node 24.19.0, system Chromium 154.0.8037.57, Playwright 1.56.1, wasi-sdk 27.0,
jsco 0.2.0-preview.0, jco 1.15.1, Linux x64. There is one retained sample per
scenario. Startup values are ms and heap values bytes.

| Scenario / metric | Baseline | Step 1 | Change |
| --- | ---: | ---: | ---: |
| p1/startup-cold / startupMs | 102.45 | 63.35 | -38.2% |
| p1/startup-warm / startupMs | 88.33 | 41.00 | -53.6% |
| p2/startup-cold / startupMs | 375.45 | 193.83 | -48.4% |
| p2/startup-warm / startupMs | 290.26 | 102.02 | -64.9% |
| p1/memory-loaded / jsHeapUsedBytes | 479268.00 | 565612.00 | +18.0% |
| p2/memory-loaded / jsHeapUsedBytes | 1524252.00 | 1618708.00 | +6.2% |

[Baseline raw samples](benchmarks/runtime-baseline.json) and
[Step 1 raw samples](benchmarks/runtime-step1.json) include startup, memory,
CPU, OPFS and direct Pipe measurements. This is an exploratory comparison: the
initial baseline overlapped other regression activity and each scenario has only
one retained sample. Lower startup samples cannot establish a causal speedup.
The shared resource graph increases held-worker JS heap; these measurements do
not establish RSS or sustained-memory growth. No fixed performance threshold was
introduced. Pipe bytes and local filesystem I/O retain their direct data paths.

## Step 2 gate: passed

The public API is now generated from the pinned 0.3.2 graph: 26 standard
interfaces and two Walos interfaces, with 143 operations. Standard Results,
resources, native Future/Stream contracts and explicit Host wrappers replace the
old public groups. P1/P2 keep their standard binary ABI and borrow the new Context.
Walos's custom P1/P2 ABI names changed intentionally; its fixtures were rebuilt.
HTTP, sockets, timezone and unsupported filesystem operations throw identifiable
errors from the common Context. The completeness inventory is checked in CI.

| Check | Result |
| --- | --- |
| `npm run check` (build, public types, Runtime boundaries, generated WIT API) | pass |
| `npm run check:wit` plus generated diff; `npm run check:wit:p3` | pass |
| `npm run build:apps` | pass |
| Full development browser suite | 136 passed, 2 production-only skipped |
| Additional focused raw API, cancellation, errors, P1/P2 and ownership checks | pass |
| Production browser suite | 2 passed |
| Pages build and serving check | pass |
| Statistics tests and one-trial benchmark | pass |

A final focused test preserves the WIT `read-only` filesystem error variant
through the common service and ABI conversions. Dedicated channels test bounded
writes, EOF and cancellation; real P1/P2 probes verify common unimplemented Traps.
No legacy test was removed or skipped to accommodate these changes.

## Step 2 measurements

Same browser and machine as Step 1; jco upgraded to 1.39.0 to parse the official
P3 WIT. P1/P2 fixtures still use wasi-sdk 27.0. One retained sample per scenario.

| Scenario / metric | Step 1 | Step 2 | Change |
| --- | ---: | ---: | ---: |
| p1/startup-cold / startupMs | 63.35 | 57.91 | -8.6% |
| p1/startup-warm / startupMs | 41.00 | 41.67 | +1.6% |
| p2/startup-cold / startupMs | 193.83 | 214.92 | +10.9% |
| p2/startup-warm / startupMs | 102.02 | 116.61 | +14.3% |
| p1/memory-loaded / jsHeapUsedBytes | 565612.00 | 769560.00 | +36.1% |
| p2/memory-loaded / jsHeapUsedBytes | 1618708.00 | 1808240.00 | +11.7% |

[Step 2 raw samples](benchmarks/runtime-step2.json) include OPFS and Pipe paths.
These single samples describe observed costs; they cannot establish performance
trends. The extra public projection and ABI resource views add allocations; no
fixed threshold is applied. Data still flows through local OPFS and direct Ports.

Step 3 has not yet begun at this gate. P3 execution is not claimed here.


## Step 3 gate: passed

The single Runtime contract now has P1, P2 and native P3 adapters. Selection reads
actual component interface imports/exports and versions; headers only distinguish
core modules from component containers. Unknown, mixed and unsupported CLI worlds
fail before READY. There is no fallback from P3 to P2.

Real native async fixtures target the official 0.3.2 WIT, with async CLI run,
async filesystem/process/clock imports, canonical streams/futures, resources and
waitable sets. The fixture build checks the produced WIT and canonical instructions.
The SDK's stock libc is not relabelled: wasi-sdk 34 embeds 0.3.0 libc bindings, so
fixtures call wit-bindgen 0.63's generated 0.3.2 imports directly and use the SDK's
reactor/compiler support. Synthetic components are used only for rejection tests.

| Check | Result |
| --- | --- |
| `npm run check` (OS build, public types, Runtime dependency guard, WIT API) | pass |
| `npm run check:wit` plus exact generated diff; `npm run check:wit:p3` | pass |
| `npm run build:apps` (SDK 27 P1/P2, SDK 34 + official bindings P3) | pass |
| Full development browser suite | 233 passed, 3 production-only skipped |
| Latest native future-table release patch and stronger cooperative/forced-stop assertions | 29 focused P3/Runtime/mixed-Pipe tests passed |
| Final production browser suite | 3 passed (P1/P2/P3), under CSP |
| Final Pages subpath/persistence check | pass |
| `npm --cache work/npm-cache pack --workspace @walos/os --dry-run` | pass, 62 files |
| Statistics tests and browser benchmark (P1/P2/P3, one trial) | pass |

The full suite includes 117 real-Worker lifecycle ordering cases across all three
formats. Native P3 checks cover stdio EOF, bounded/backpressured transfer, stream
cancel and Future completion, dropping pending Futures, descriptor/stream lifetime,
file stdio moves, filesystem Result variants/directory streams, clocks/random,
spawn/borrow/wait-one-shot/stop and dropped child handles. Five added mixed-Pipe
cases transfer 1 MiB exactly. A blocked native clock stops cooperatively with
`stop requested`; non-yielding code exercises Core's forced stop grace period.
Guest exit(130) remains a normal numeric exit. Invalid worlds reclaim moved stdio.
Host, P1/P2 and P3 observe common unimplemented operation paths as exceptions/Traps.
No legacy regression was deleted or newly skipped.

The bundle shares Future identity and async cancellation with Context. The pinned
jsco 0.2.0-preview.2 engine has a checked build patch to notify the producer and
release the future-table entry on readable drop. Native bindings retain only live
resources/operations, drain drops and reclaim resources created during cleanup.
Runtime disposal precedes Context disposal, and never disposes the borrowed Context.

## Step 3 measurements

Node 24.19.0, Chromium 154.0.8037.57, Playwright 1.56.1, jco 1.39.0,
jsco 0.2.0-preview.2, wasi-sdk 27.0 (P1/P2), wasi-sdk 34.0 + wit-bindgen 0.63.0
(P3), wasm-tools 1.262.0, same Linux x64 machine. Measurements ran after browser
regressions finished. One retained sample per scenario, with the same warmup and
integrity checks. A later focused run checks the final future-entry cleanup patch
and explicit cooperative/forced stop messages; no fixed threshold is used.

| Scenario / metric | Step 2 | Step 3 | Change |
| --- | ---: | ---: | ---: |
| p1/startup-cold / startupMs | 57.91 | 62.96 | +8.7% |
| p1/startup-warm / startupMs | 41.67 | 49.12 | +17.9% |
| p2/startup-cold / startupMs | 214.92 | 156.36 | -27.2% |
| p2/startup-warm / startupMs | 116.61 | 77.94 | -33.2% |
| p1/memory-loaded / jsHeapUsedBytes | 769560.00 | 774644.00 | +0.7% |
| p2/memory-loaded / jsHeapUsedBytes | 1808240.00 | 1845336.00 | +2.1% |
| p1/cpu / runMs | 59.33 | 56.24 | -5.2% |
| p2/cpu / runMs | 51.34 | 62.38 | +21.5% |
| opfs/4194304 / writeMs | 281.63 | 242.94 | -13.7% |
| opfs/4194304 / readMs | 145.26 | 114.55 | -21.1% |
| pipe/4194304 / elapsedMs | 20.11 | 19.68 | -2.1% |

| New P3 scenario | Observed sample |
| --- | ---: |
| p3/startup-cold / startupMs | 177.15 |
| p3/startup-warm / startupMs | 109.81 |
| p3/memory-loaded / jsHeapUsedBytes | 1739208.00 |
| p3/cpu / runMs | 62.26 |

[Step 3 raw samples](benchmarks/runtime-step3.json) include all startup, CPU,
held-Worker heap, OPFS and direct-Pipe measurements, tool versions and executable
hashes. Startup/run values are ms; heap values bytes. P3 has no earlier executable
baseline. Its benchmark runs the same integer loop and observable modes, using
minimal generated bindings instead of P1/P2 libc; binary sizes differ, so the
samples do not isolate a format's intrinsic overhead. All CPU checksums agree.

The P1 warm-startup and P2 CPU samples are higher than Step 2. The engine changed
from preview.0 to preview.2, adds native async state and changes bundle size;
API/ABI projections add allocations relative to the original baseline. These
single samples cannot attribute time differences to a specific cause or establish
sustained memory trends. Step 2 also observed higher 4 MiB OPFS write/read samples
(281.63/145.26 ms versus Step 1's 235.32/119.06) and Pipe time (20.12 versus 18.08 ms),
while the local I/O/direct Port structure did not change. The initial baseline was
contended and is exploratory. No causal speedup claim or performance gate is made.
Pipe payloads still bypass Core; OPFS data stays local.

## Remaining scope and limitations

- HTTP, sockets, timezone, hard/symbolic links and setting timestamps remain typed
  common-Context Traps. Partial OPFS/advice/metadata behavior is listed in the
  complete [coverage table](wasi-p3-coverage.md).
- P3 accepts official 0.3.2 CLI components. Other entrypoints/worlds and mixed or
  unsupported versions fail startup; working HTTP handlers are outside this scope.
- This validation uses compiled C components and system Chromium with JSPI.
  Rust nightly components and other browsers were not tested. The preview engine's
  arbitrary component compositions are not established by these CLI tests.
- Internal JS Process placement (Phase 4) remains outside this change. Host remains
  a Main Thread logical Process without a Runtime or dedicated Process Worker.
- The default Playwright browser could not be downloaded through this environment's
  network policy. Every browser command explicitly used `/usr/bin/chromium`.

The first final pack attempt could not write this sandbox's default home npm cache.
The workspace-cache command above completed successfully; no permission escalation
or package-content change was required.

## Follow-up: p3-cat file operands (#46)

Reproduced in the demo Shell before the fix: after writing a file, `p2-cat /home/...`
printed its content while `p3-cat /home/...` printed nothing and returned to the
prompt. The installed p3-cat was a copy of the stdin-only runtime probe and ignored
file operands. It is now compiled independently from `apps/p3-cat.c` against the
same official native async 0.3.2 bindings. It reads absolute/PWD-relative paths,
concatenates operands, retains stdin/`-`, and reports failures on stderr with exit 1.

The added error cases also exposed a native Future representation mismatch. jsco
wraps resolved/rejected `future<result<T,E>>` payloads in ok/err; the adapter had
passed an already-tagged Result, hiding errors and misrepresenting non-void success
payloads. The adapter now translates only Future payloads to that convention.
Raw Context Results and async-function Results remain tagged. Real C probes verify
an is-directory completion error and a nonzero u64 writable-capacity success.

Validation (Chromium 154 via `CHROMIUM_PATH=/usr/bin/chromium`):

- The initial demo regression failed on p3-cat after the same p2-cat command passed.
- 39 focused demo, P2/P3 cat, native async and error tests passed after correction.
- Final `npm run check` and `node scripts/build-p3-probe.mjs` passed.
- Final development browser suite: 241 passed, 5 production-only skipped.
- Final production suite: 5 passed, including P2/P3 file operands.
- Final Pages smoke test: passed, including real Shell file output from p3-cat at
  the `/walos/` subpath and reload persistence.
- Cat coverage includes relative/parent paths, multiple/empty files, UTF-8 names,
  NUL bytes, a 1 MiB binary with a delayed Pipe reader, stdin and mixed P2/P3 pipes,
  stderr separation and continuing after a missing operand.
