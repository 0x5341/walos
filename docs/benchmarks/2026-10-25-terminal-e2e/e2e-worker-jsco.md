# Component engine comparison

Revision: bfb5f342ecc6930a4b36ab21a7368ad3a44c28d8 (dirty: false); Chromium 154.0.8037.57; Node v24.19.0; AMD EPYC 9V74 80-Core Processor.
Independent browser process/context/page/Worker; empty application/OPFS cache, verified miss (or disabled). OS page cache is not flushed. No translator/runtime preloading before new Worker().

| Engine | Cold successes/attempts | Median ms | p95 ms | Improvement | Bootstrap 95% CI | Mandatory compatibility |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| jsco 0.2.0-preview.0 | 30/30 | 90.538 | 104.315 | N/A | N/A | Not passed |

Decision: **jco** — Retain Jco: no candidate meets all mandatory criteria.

## All successful measurements

| Engine | Scenario | Metric | N | Median | Min | Max | Mean | p95 | Stddev |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| jsco | p2/startup-cold | startupMs | 30 | 90.538 | 52.340 | 148.210 | 88.520 | 104.315 | 16.607 |
| jsco | p2/startup-cold | readMs | 30 | 2.373 | 0.905 | 26.200 | 3.286 | 6.165 | 4.392 |
| jsco | p2/startup-cold | adapterMs | 30 | 1.505 | 0.805 | 4.090 | 1.829 | 3.580 | 0.890 |
| jsco | p2/startup-cold | component.engineLoadMs | 30 | 18.503 | 11.635 | 53.990 | 19.959 | 36.685 | 7.886 |
| jsco | p2/startup-cold | component.prepareMs | 30 | 25.148 | 16.300 | 56.070 | 30.274 | 46.965 | 11.531 |
| jsco | p2/startup-cold | component.instantiateMs | 30 | 6.085 | 5.130 | 29.480 | 8.532 | 24.965 | 6.075 |
| jsco | p2/startup-cold | loadMs | 30 | 60.787 | 34.420 | 100.320 | 59.520 | 82.970 | 14.853 |
| jsco | p2/startup-warm-miss | startupMs | 30 | 46.560 | 39.050 | 134.305 | 53.163 | 73.075 | 17.532 |
| jsco | p2/startup-warm-miss | readMs | 30 | 1.160 | 0.895 | 3.570 | 1.372 | 2.655 | 0.576 |
| jsco | p2/startup-warm-miss | adapterMs | 30 | 0.917 | 0.710 | 2.760 | 1.237 | 2.625 | 0.605 |
| jsco | p2/startup-warm-miss | component.engineLoadMs | 30 | 10.025 | 7.425 | 30.015 | 10.630 | 13.115 | 3.952 |
| jsco | p2/startup-warm-miss | component.prepareMs | 30 | 15.698 | 13.515 | 40.865 | 17.344 | 36.665 | 5.949 |
| jsco | p2/startup-warm-miss | component.instantiateMs | 30 | 5.483 | 4.695 | 8.965 | 5.798 | 8.330 | 0.983 |
| jsco | p2/startup-warm-miss | loadMs | 30 | 32.670 | 26.160 | 59.835 | 34.256 | 51.605 | 7.148 |
| jsco | p2/cpu | runMs | 30 | 32.792 | 31.955 | 39.010 | 33.237 | 36.010 | 1.399 |
| jsco | p2/memory-disabled | jsHeapUsedBytes | 30 | 1599592.000 | 1517808.000 | 1637628.000 | 1598778.667 | 1636796.000 | 27405.619 |
| jsco | p2/memory-disabled | jsHeapTotalBytes | 30 | 4718592.000 | 4194304.000 | 5242880.000 | 4718592.000 | 4980736.000 | 270741.159 |
| jsco | p2/memory-disabled | embedderHeapUsedBytes | 30 | 773712.000 | 773712.000 | 773712.000 | 773712.000 | 773712.000 | 0.000 |
| jsco | p2/memory-disabled | backingStorageBytes | 30 | 349648.000 | 349641.000 | 349752.000 | 349677.100 | 349752.000 | 46.634 |

## Failures (no samples discarded)


## Compatibility

```json
{}
```

Full raw samples, chronological order, timestamps, binary SHA-256, asset inventory (raw/gzip bytes and hashes), failures and environment metadata are in the adjacent JSON.

engineLoadMs includes lazy adapter/runtime and translator initialization; transformMs is translation, prepareMs is direct parse/compile (jsco); converterLoadMs/convertMs are legacy Jco engineLoad/transform equivalents. publishMs is after READY, joined before EXIT. loadMs encloses these spans: do not sum nested intervals. Absent transformMs/convertMs means not applicable, never zero-filled.

CDP Runtime.getHeapUsage after READY, held Worker; not peak or browser RSS.
