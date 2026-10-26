# ProcessContext performance record

Baseline: `20ca7fddcd4045f9ade819bf05415316a91452b3` (#26).
Implementation: `b75d4f1d13c5973c0f4e8bde9923a4d5a0f6acb0` (tree `ae637ead982c6e3852dac27b476d55a896aa6eef`).
The measurement's original revision was amended solely to use the GitHub noreply
email required by repository privacy protection. Its tree is identical to the
published implementation; the original revision and mapping remain in the JSON.

## Method

The existing `benchmarks/run.mjs` protocol ran sequentially, baseline then changed
implementation, on the same managed Linux x64 host: AMD EPYC 9V74, 3 logical CPUs,
2 available parallelism; Chromium 154.0.8037.57; Node v24.19.0; Playwright 1.56.1;
wasi-sdk 27.0 / clang 20.1.8; Jco 1.15.1. Each scenario retains **3 samples** after
the protocol's excluded warmups. No outliers are removed. Full samples, nearest-rank
p95, population standard deviation, memory metrics, hashes, flags and UTC timestamps
are in [before.json](benchmarks/process-context/before.json) and
[after.json](benchmarks/process-context/after.json). The baseline's dirty flag is
only the untracked dependency symlink used to reuse the same node_modules.

Commands, from each checkout with identical dependencies and the same SDK:

```sh
npm run build:os
node benchmarks/build.mjs
CHROMIUM_PATH=/usr/bin/chromium node benchmarks/run.mjs --trials 3 --output work/performance.json
```

These are the existing **Worker-local** startup/OPFS/direct-pipe workloads. They
retain the benchmark's **Jco engine selection** for P2 so the comparison is like
for like; they do not claim to measure Host facade overhead or a jsco-vs-Jco
comparison. The new benchmark harness supplies explicit `PWD=/`, which preserves
the baseline's effective initial cwd under the new no-auto-inheritance contract.
Binary hashes match across the two runs.

## Results

Durations in milliseconds. Delta is changed median relative to baseline; positive
means slower. The small sample count and shared managed host limit causal inference.

| Scenario / metric | Before median | After median | Delta | Before range | After range |
| --- | ---: | ---: | ---: | ---: | ---: |
| p1/startup-cold / startupMs | 43.080 | 58.395 | +35.6% | 20.200–52.420 | 54.565–58.630 |
| p1/startup-warm / startupMs | 25.405 | 25.730 | +1.3% | 19.080–33.530 | 16.470–28.225 |
| p2/startup-cold / startupMs | 1228.795 | 1231.885 | +0.3% | 1228.335–1239.670 | 1145.695–1239.075 |
| p2/startup-warm / startupMs | 53.265 | 41.915 | -21.3% | 31.890–53.850 | 34.655–56.140 |
| p2/startup-opfs-reload / startupMs | 55.290 | 35.925 | -35.0% | 38.885–58.935 | 35.265–40.820 |
| opfs/1048576 / writeMs | 31.335 | 36.240 | +15.7% | 31.270–33.285 | 33.545–36.380 |
| opfs/1048576 / readMs | 14.340 | 16.815 | +17.3% | 12.160–15.020 | 13.330–17.045 |
| pipe/1048576 / elapsedMs | 2.730 | 3.075 | +12.6% | 2.465–2.815 | 2.900–4.475 |
| opfs/4194304 / writeMs | 128.470 | 123.200 | -4.1% | 122.430–146.890 | 119.845–130.290 |
| opfs/4194304 / readMs | 54.355 | 63.910 | +17.6% | 54.170–67.770 | 57.285–64.685 |
| pipe/4194304 / elapsedMs | 6.910 | 10.685 | +54.6% | 6.560–8.115 | 9.900–12.690 |

Observed regressions include cold P1 startup, 1 MiB OPFS I/O, and the 4 MiB pipe
median; warm P2 startup improves in this sample. These results do **not** establish
performance equivalence or isolate a cause. Per #25/#26, performance regressions
are recorded rather than used as automatic completion blockers; larger controlled
measurements and investigation remain #38. The data path still uses local OPFS
and direct MessagePort DATA, with no per-byte Core RPC.

Separately, integrity tests exercise Host→P1/P2→P1/P2→Host with 1 MiB payloads and
the default jsco engine. A final run recorded 278.2/468.0/581.9/559.3 ms for
P1→P1/P1→P2/P2→P1/P2→P2 respectively (including startup; single integrity run,
not a statistically controlled comparison). These tests also verify EOF and
byte-for-byte equality.
