> Current runner: `npm run benchmark -- --trials 3` measures jsco-only P1/P2/P3 startup, CPU, memory, local OPFS and direct Pipes. Engine-selection/cache runners were removed; prior JSON/Markdown remain reproducible from their recorded commits. The sections below are a historical pre-integration reference. Current v0.3 behavior and verification: [ProcessContext migration](process-context-migration.md). Old engine/cache/foreground instructions below are historical only.

Current migration samples, toolchains and comparison limits: [Runtime validation](runtime-validation.md).

# Reproducible PoC benchmarks

This implements [issue #4](https://github.com/0x5341/walos/issues/4), baseline
§12 criterion 9 and the performance portion of Slice 7. It measures the actual
P1/P2 Process Worker loader, plus the OPFS FileStream and cross-Worker Pipe
implementations. These are small PoC measurements, not evidence of performance
superiority or a complete application benchmark.

## Run

Use Node >=22.12, wasi-sdk 27, the locked npm dependencies and a Chromium with
JSPI. From the repository root:

```sh
npm ci
bash scripts/setup-sdk.sh
npx playwright install --with-deps chromium
npm run test:benchmark
npm run benchmark -- --trials 5 --output work/benchmarks/latest.json
```

For an installed browser prefix the last command with
`CHROMIUM_PATH=/usr/bin/chromium`. Set `WASI_SDK_PATH` if the SDK is installed
elsewhere. This benchmark builds its own two executables, so it does not need
wit-bindgen or `build:apps`. It builds the OS library, type-checks the harness,
bundles it with Vite in production mode and serves it at `127.0.0.1:4184`.
Keep that port free. Temporary isolated browser contexts own all benchmark OPFS
files and conversion caches; the workbench's filesystem is not used.

The default is five retained trials; `--trials` accepts 1–100. The JSON contains
all individual samples, a per-metric summary and environment metadata. An adjacent
Markdown file contains the summary. CI runs one trial per scenario, validates
cache paths/checksums/byte equality and uploads `benchmark-results`. This is a
reproducibility check with no timing or memory thresholds. Use more trials on a
quiet machine for comparisons. Run benchmarks separately from tests and builds.

## Timing boundaries and cache states

Every launch creates the real `process.worker` with an OPFS executable handle,
real WASI adapters and null/MessagePort stdio. The harness supplies its process
spec directly: it excludes shell parsing, Core spawn RPC, bootstrap downloads and
UI rendering. It still includes Worker construction, module loading, executable
reading, adapter setup, compilation/conversion and instantiation. The fixture
uses the same C source for both targets, compiled with `-O2 -Wall -Wextra -Werror
-Wl,--strip-all` and the corresponding libc cwd compatibility source.

`startupMs` runs from immediately before `new Worker()` to receipt of READY in
the page. Fixture installation and browser/page startup happen before the timer.
The following ordered scenarios run once per retained trial:

| Scenario | Browser / page | Process Worker | Conversion cache |
| --- | --- | --- | --- |
| `p1/startup-cold` | New browser process and context | New | Not applicable |
| `p1/startup-warm` | Same page after cold launch | New | Browser engine/assets may be warm |
| `p2/startup-cold` | New browser process and context | New | Empty OPFS; required miss |
| `p2/startup-warm` | Same page after cold launch | New | Required OPFS hit |
| `p2/startup-opfs-reload` | Reload that page; retain context and OPFS | New | Required OPFS hit |
| `p2/startup-warm-miss` | Same reloaded page; clear conversion cache | New | Required miss; browser/assets warm |

Each cold/warm pair uses a fresh browser process. “Cold” describes application
and browser caches, not the host OS disk/page cache, which is not flushed. Reload
reuse does not measure reopening a persistent profile after browser restart.
The harness checks the observed cache path, rather than assuming a hit from a
shorter duration. Issue #15 removes the process-local L1 conversion cache entirely;
repeated loads and Process Worker launches use the optional OPFS artifact layer.
Cacheless engine adapters skip hashing and OPFS and report `cache: disabled` with
key, lookup and publication timings absent. Jco remains the benchmark default.

Opt-in internal diagnostics split `readMs`, `adapterMs`, P1 `compileMs` and
`instantiateMs`, and P2 `loadMs`. P2's `component.*` further splits content/key
hashing, validated OPFS lookup, converter module loading, Jco conversion and
generated-module import/compilation/instantiation. Deferred cache publication is
reported separately at EXIT. These are
nested spans: **do not add `loadMs` to its component subspans**. Missing conversion
spans on cache hits mean the work was skipped, not that it took zero time. Worker
module startup, scheduling and READY transport explain the remaining startup
time. `converterLoadMs` includes lazy converter initialization/import; Jco may
initialize more state during `convertMs`. These are elapsed times, not CPU time.

## Deferred publication (Issue #14, schema version 2)

On a conversion miss, the Process Worker instantiates from the in-memory result,
posts READY, then explicitly starts `persist()`. Normal return, nonzero exit and
Wasm traps all close WASI resources and join this promise before posting EXIT;
the Core can then terminate the Worker without losing a short command's cache.
Persistence failures are logged and measured independently and do not change the
command's exit status. This can delay EXIT/`wait()` even though READY is earlier.

READY carries `component.publishStatus: pending` on a miss and omits `publishMs`.
EXIT supplies the final component snapshot: `publishStatus` is `saved`, `failed`
or `unavailable`, plus `publishMs`, `publishStartedAtMs`, `publishCompletedAtMs`
and, on failure, `publishError`. The timestamps and top-level `readyAtMs` are in
that Worker's `performance.now()` clock, not page time or UTC. A cache hit has no
publication spans/status. The runner merges EXIT's component snapshot into each
startup sample, while preserving the original READY-based `startupMs`, `loadMs`
and `instantiateMs`. Do not add publication spans to startup or CPU `runMs`.
`publication` in the JSON and the Markdown publication counts cover the retained
startup misses (cold and warm-miss); memory probes are not included in that count.
Older schema-1 runs published before instantiation and included `publishMs` at READY.

Every artifact is written to a unique staging directory, closed, read back and
SHA-256 checked before the manifest is atomically published with writable close.
A save failure removes its staging directory best-effort. Supervisor stop retains
the existing 150 ms grace period: a blocked save can be forcibly terminated.
Unreferenced staging directories or invalid/empty manifests from interrupted writes
are never executed; the next launch validates the manifest and all hashes, then
regenerates on a miss/corruption. Abrupt termination can leave orphan stages until
`clearComponentCache()` removes the directory; this change adds no garbage collector.
The public clear API still requires stopped OS sessions.

`tests/component.spec.ts` gates real OPFS writable closes in the actual Process
Worker, injects quota/unavailable-storage failures and corrupt write/read data,
and covers immediate success/nonzero/trap exits, fresh-Worker and page reload
hits, concurrent publication, raw termination during artifact/manifest writes and
supervisor stop escalation. These fault controls are confined to test fixtures.

The [30-trial before/after report](benchmarks/2026-10-25-deferred.md) retains
production measurements and completion rates for this stage. It does not select
an alternative Component engine; Issue #13 stages #15 and #16 remain separate.

## CPU

The fixture runs 20,000,000 dependent uint32 iterations:
`value = (value ^ i) * 1664525 + 1013904223`, starting at 1. It prints the result,
which is compared to an independent JavaScript `Math.imul` calculation for both
P1 and P2, including warmups. A dependency chain and observable output prevent
elimination of the loop. There is one excluded CPU warmup before every retained
fresh-Worker CPU run; P2 uses an existing OPFS conversion.

`runMs` measures from invoking the WASI command until its return/exit, before
adapter close. It includes libc initialization, cwd and the small checksum
output, and excludes Worker startup/compilation and page exit delivery. It is
wall-clock elapsed time; no per-thread CPU counter, native baseline or sustained
CPU utilization measurement is claimed. Browser tiering and scheduling remain
part of the result.

## Memory

`hold` waits for one stdin byte so the loaded Process Worker stays alive after
READY. The Node runner attaches CDP to that Worker target and calls
`Runtime.getHeapUsage`, then releases stdin, verifies exit 0 and terminates the
Worker. P1 gets a loaded sample; P2 gets separate cache-miss and OPFS-hit samples
in fresh Workers. Converter/module initialization can remain resident in the
miss case. With deferred publication, a miss probe can overlap cache writes and
temporary artifact buffers; it is not a post-publication steady-state sample.
No GC is forced, and these are snapshots, not peak measurements.

| Metric | Available meaning / limitation |
| --- | --- |
| `jsHeapUsedBytes` | CDP `usedSize` in the Process Worker's V8 isolate |
| `jsHeapTotalBytes` | CDP `totalSize`, allocated JS heap capacity, not total process memory |
| `embedderHeapUsedBytes` | CDP `embedderHeapUsedSize`, when supported by that Chromium |
| `backingStorageBytes` | CDP `backingStorageSize`, when supported; external backing storage, not a guaranteed sum of Wasm linear memories |
| `linearMemoryBytes` | P1 exported `memory.buffer.byteLength` at READY; addressable linear memory, not committed physical pages |

P2's generated instantiator does not expose internal memories through the command
interface. A P2-only linear-memory total is therefore unavailable. Worker heaps
include the host adapter and, on a miss, converter state as well as the command;
they do not isolate the Component's own allocations. Do not add these counters
as if they were disjoint. Chromium renderer RSS, compiled Wasm code, browser/Core
memory, reserved/committed pages, filesystem cache and memory peaks are not
reported. If CDP attachment or the method is unavailable, a raw sample records
`memoryStatus: unavailable` and the reason, rather than substituting the page's
heap or zero. Optional unsupported fields are omitted; summaries give each
metric's actual sample count.

## OPFS and Pipe

Sizes are **1 B, 4 KiB, 64 KiB, 1 MiB and 4 MiB**. The payload byte at offset `i`
is `(i * 31 + 7) & 255`. Each size gets one excluded full warmup per transport,
then the retained trials, sequentially. Buffers and payloads are prepared before
timing; all returned data is byte-checked after timing. Failure, short/excess
transfer, wrong checksum or unexpected cache path fails the command.

OPFS uses the runtime's actual `FileStream` in a Dedicated Worker. Writes include
exclusive handle open, truncate, 16 KiB writes, flush and close. Reads include a
read-only synchronous handle open, 16 KiB reads through EOF, copying into the
result buffer and close. Reads immediately follow writes to the same file, so
these are warm storage-cache reads. File creation and Worker startup are excluded.
Flush completion is not proof of physical device durability. This is the stream
microbenchmark, not the P1 asynchronous file-read path or end-to-end WASI syscall
throughput.

Pipe uses two Dedicated Workers and the runtime's actual `PortStream`, a direct
MessageChannel, 64 KiB capacity, at most 16 KiB DATA chunks, cumulative ACKs and
normal EOF. Both workers initialize before the page sends GO. `firstByteMs` is
GO dispatch to the reader's first nonempty read; `elapsedMs` ends at the reader's
observed drained EOF. Worker/page timestamps use `timeOrigin + now`. These include
control-message scheduling and result-buffer copies, but exclude Worker creation,
payload generation, final verification and result transport back to Node. Small
transfers measure scheduling/latency; the large sizes exercise backpressure.
The Pipe figures exclude Wasm/libc/JSPI, shell spawn, OPFS and Core/UI work, so
they should not be compared directly with the old ~1.9 s shell pipeline smoke
measurement.

Throughput is payload MiB divided by seconds for each trial (1 MiB = 1,048,576 B).
Report the median of those trial throughputs, not the inverse of an averaged
duration. There is no storage-cache flush, CPU pinning, power/frequency control
or background-load isolation. Browser timing precision, VM scheduling and GC
can dominate these small samples.

## Aggregation and recorded run

All retained values are included. The summary gives count, minimum, maximum,
arithmetic mean, median (average middle two for even counts), nearest-rank p95
and population standard deviation. There is no outlier rejection or confidence
interval. At five trials p95 is the maximum; CI's single trial has no useful
variance estimate. Compare raw samples and the full range before drawing any
conclusion.

The checked-in [2026-10-24 raw results](benchmarks/2026-10-24.json) and
[complete summary](benchmarks/2026-10-24.md) were produced with:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run benchmark -- --trials 5 --output docs/benchmarks/2026-10-24.json
```

The JSON records Chromium, Node, Playwright, Jco, SDK/LLVM revisions, host kernel,
architecture, CPU/available parallelism, host-reported memory, trial configuration,
executable SHA-256 hashes, timestamps and the base Git revision/dirty flag. Host
CPU counts/memory may exceed a container's quota. The dirty flag marks the issue
implementation being measured before commit; retain the source alongside these
results when reproducing them.

## Component engine comparison (Issues #13 / #16)

The comparison mode retains the original P1/OPFS/Pipe benchmark when `--engines`
is omitted. With `--engines`, it measures only the shared P2 fixture and writes
**schema 3**, grouped by engine and scenario. Every engine runs in a new browser
process/context for every trial; trial blocks rotate engine order. Measurements
are sequential. Cold startup includes lazy engine loading and initialization.
No runtime or translator is preloaded by the page. The component SHA-256 is shared
by all engines and saved with the build revision, dirty state, environment,
chronological execution order, timestamps and production asset inventory.

```sh
# Generate application fixtures for compatibility tests (not startup timing).
bash scripts/setup-wit-bindgen.sh
npm run build:apps
CHROMIUM_PATH=/usr/bin/chromium npm run test:engines
# Experimental engine failures are retained and this command exits nonzero.
CHROMIUM_PATH=/usr/bin/chromium npm run benchmark -- \
  --engines jco,polyengine,jsco --trials 30 \
  --compatibility work/benchmarks/compatibility.json \
  --output work/benchmarks/engine-comparison.json
```

`test:engines` records the existing development and production suites separately.
`--engines jco,jsco` or `--mode dev|production` can limit a diagnostic run;
only a result covering both suites is marked eligible for compatibility.
The Jco-specific application-cache assertion is omitted for other engines;
`engines.spec.ts` checks the actual polyengine plan cache (including corruption,
reload and write failures) and jsco's absence of cache artifacts. Other cache
regressions explicitly exercise Jco. Runtime, stream, OPFS and lifecycle tests
continue to use the selected application engine.

Polyengine 0.6.7 uses the existing engine-neutral atomic OPFS layer to store its
translation envelope, including any adapters, under its own namespace. Original
Component bytes are reattached when restoring the envelope and its hash is
verified by the runtime. Publication starts after READY and is joined before EXIT.
jsco 0.2.0-preview.0 directly parses/compiles the Component; it has no persistent
conversion artifact and skips cache hashing, lookup and publication. Both use the
same `Wasi2` host. The boundary adapts versioned interface names, WIT results,
variants, resource destructors and suspension conventions. wasi-sdk includes
unreachable socket imports that Jco eliminates; the direct runtimes link these
to trapping placeholders. This does not add socket support. Unknown non-socket
interfaces still fail linking. All runtime assets are bundled locally. The jsco
browser build excludes its unused Node-only CLI/server entry points.

The runner verifies cache miss/disabled on cold/warm-miss and hit on warm/reload
for engines that cache. It joins deferred publication before warm launches and
checks CPU stdout against an independent checksum. jsco's cache-hit/reload
scenarios are absent, not fake zero-duration measurements. Engine/translator
load, transform (where applicable), direct parse/compile, lookup, publication and
instantiation have distinct fields. Jco's existing `converterLoadMs` and
`convertMs` correspond to engine load and transform; `loadMs` encloses those spans.
Do not add nested spans. Missing transform timings mean not applicable or skipped.

All success samples contribute to median, nearest-rank p95, min/max, mean and
population standard deviation. Failures and timeouts remain in the JSON and
Markdown; they are not performance samples and are never zero-filled. The
comparison uses `1 - median(candidate) / median(jco)` with 10,000 independent
bootstrap resamples (seed `0x5341`) and a percentile 95% interval. Adoption requires
at least 30 successful cold samples for both engines, no observed scenario
failures, mandatory compatibility, improvement >=5%, and interval lower bound >0.
The fastest eligible cold median wins; otherwise Jco is retained. Without a
compatibility file the report cannot recommend adoption. Intermediate JSON is
saved after every engine trial and decisions remain provisional until completion.

CPU `runMs` is elapsed execution time including host calls, not a per-thread CPU
counter. Memory is CDP Worker JS heap after READY, not RSS, peak memory or total
Wasm memory. The asset inventory includes the entire multi-engine build (raw and
gzip bytes with SHA-256), so it must not be mistaken for bytes fetched by a single
engine. OS page caches are not flushed. These limitations apply to the results.

For application builds, `WALOS_COMPONENT_ENGINE=jco|polyengine|jsco npm run build`
selects the Process Worker engine (the benchmark passes it explicitly on each
start message). This build setting also applies to `npm run dev`. It is internal
and does not alter the public `Walos` constructor or `clearComponentCache` API.

The [2026-10-25 engine decision](benchmarks/2026-10-25-engines.md) retains all 30-trial
results and compatibility failures. It selects jsco as the default; Jco remains
the explicit legacy benchmark baseline.
