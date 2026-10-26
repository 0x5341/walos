# jsco-only ProcessContext integration performance (#35/#38/#33)

Baseline OS: `006f8c35ef2d6ab8fadce34b26882ce8473753e2` (process-context).
Changed OS: `da3534ac16554712ac86a621168753f2988c9516`, tree
`2121ca7d5bfcd68337ca8c4e0d934c172bfcd216`. Subsequent changes only record results.
Both runs select jsco 0.2.0-preview.0; this compares removal of engine/cache
infrastructure, not Jco versus jsco. The prior [engine selection record](benchmarks/2026-10-25-engines.md)
and [#27–#31 performance record](process-context-performance.md) remain historical evidence.

## Method and artifacts

Sequential baseline then changed runs, one benchmark browser at a time, on the
same managed Linux x64 host: Intel Xeon Platinum 8573C, 3 logical CPUs / 2 available
parallelism, Chromium 154.0.8037.57, Node v24.19.0, Playwright 1.56.1,
wasi-sdk 27.0 / clang 20.1.8, Jco 1.15.1 for build tooling only.
UTC windows: 2026-10-26 22:17:12–22:17:46 and 22:17:55–22:18:31.
Each scenario retains **3 samples**, excludes the runner's integrity-checked warmups,
and retains all outliers. Files, compiler flags and browser configuration match;
the P1/P2 executable SHA256 values are identical across the runs.

- [Before JSON](benchmarks/2026-10-26-integration-before.json) and
  [full table](benchmarks/2026-10-26-integration-before.md).
- [After JSON](benchmarks/2026-10-26-integration-after.json) and
  [full table](benchmarks/2026-10-26-integration-after.md).

Raw metadata records browser, OS, SDK, flags, hashes, commit and timestamps. Raw
samples and summary include median, min/max, mean, nearest-rank p95 and population
standard deviation. Cold means a fresh browser/context/page/Worker, not a flushed
OS page cache. Warm still creates a fresh Worker. There is no conversion cache on
either jsco run. Memory is CDP Runtime.getHeapUsage on a held Process Worker after
READY, without forced GC; it is not RSS or total Component memory. I/O covers
1 byte through 4 MiB, including first-byte latency and throughput, with integrity
checks on every run. Pipe uses 64 KiB capacity and 16 KiB chunks.

The same current benchmark runner/harness was used on both checkouts. Baseline
has only measurement-tool changes: copy `benchmarks/{run.mjs,harness.ts,tsconfig.json}`
from the measured changed revision, and add `engine: 'jsco'` to the baseline
harness's start postMessage. Its dirty flag reflects those files and tool symlinks;
the OS sources are unchanged. The changed dirty flag reflects the newly written
before-results artifacts, not modified OS sources.

```sh
npm run build:os
node benchmarks/build.mjs
CHROMIUM_PATH=/usr/bin/chromium node benchmarks/run.mjs --trials 3 --output results.json
```

## Observations

Medians below; delta is (after/before − 1). Lower is better for latency/memory;
higher is better for throughput. The last column gives population standard deviations.

| Scenario / metric | Unit | Before median | After median | Delta | Before / after stddev |
| --- | --- | ---: | ---: | ---: | ---: |
| p1/startup-cold / startupMs | ms | 104.515 | 139.885 | +33.8% | 11.959 / 19.834 |
| p1/startup-warm / startupMs | ms | 76.180 | 64.040 | -15.9% | 14.701 / 12.053 |
| p2/startup-cold / startupMs | ms | 271.515 | 351.995 | +29.6% | 22.720 / 15.038 |
| p2/startup-warm / startupMs | ms | 194.755 | 204.020 | +4.8% | 38.803 / 13.467 |
| p1/memory-loaded / jsHeapUsedBytes | bytes | 497148.000 | 479840.000 | -3.5% | 0.000 / 0.000 |
| p2/memory-loaded / jsHeapUsedBytes | bytes | 1592512.000 | 1563548.000 | -1.8% | 28507.321 / 3322.384 |
| opfs/1048576 / writeMiBps | MiB/s | 10.937 | 9.311 | -14.9% | 1.257 / 0.860 |
| opfs/1048576 / readMiBps | MiB/s | 20.327 | 18.167 | -10.6% | 0.733 / 1.932 |
| pipe/1048576 / MiBps | MiB/s | 81.566 | 74.104 | -9.1% | 20.054 / 39.025 |

Cold startup medians increased about 30–34%; warm startup was mixed, and the 1 MiB
OPFS/Pipe throughput medians decreased about 9–15%. These are observations, not a
release gate or a claim of statistical significance. Three samples in a shared,
fixed-order cloud environment cannot separate code effects from scheduler/browser
warmup, CPU contention or OPFS variability. P1 cold also slowed despite not using
P2 execution; this supports investigating environment/startup variance before
attributing the delta to jsco preparation. Follow-up candidates are alternating
revision order, more retained trials, and tracing Worker creation, module loading
and OPFS lock/open timing. The prior jsco repeated-startup follow-up is #21.

No Core file/pipe byte relay or per-read/write RPC was added: `core.ts`,
`streams.ts`, `p2-io.ts`, `p2-fs.ts` and `services.ts` retain the established data
paths. Process loading loses cache hashing/lookup/publication entirely. CDP used
heap medians were slightly smaller. The OS dist directory shrank from **13,005,950
bytes / 51 files** to **309,087 bytes / 35 files**, counting JS/declarations and
runtime assets (uncompressed). Existing OPFS cache directories are never deleted.

This runner measures Worker startup/local OPFS/direct Pipe primitives, not UI
installation, Host facade overhead or the Shell's new temporary-file output
capture. The Demo now buffers child output until completion and incurs temporary
OPFS writes; this intentional consumer limitation is documented in the migration
notes. Host↔P1/P2 correctness, large mixed pipes and resource ownership are covered
by browser E2E, not inferred from these microbenchmarks.

## Verification

- Browser regression: **126 passed, 2 production-only skipped**, including actual
  P1/P2 lifecycle races, 1 MiB mixed Host pipes, OPFS persistence, EOF/Broken Pipe,
  move/dispose, clocks/random, lazy missing/invalid PWD, and demo cd/redirect/pipeline.
- Production: **2/2 passed**, with same-origin Worker/Wasm CSP and no JS unsafe-eval
  or Blob module permission. Pages subpath / explicit Shell / reload persistence passed.
- Final Demo/cache/PWD subset after the capture cleanup adjustment: **4/4 passed**.
- OS build/pack, root/public typecheck, full demo/fixture build, WIT regeneration diff,
  benchmark harness typecheck and **3/3 benchmark statistics tests** passed.
- Both benchmark runs completed every scenario and integrity assertion.
