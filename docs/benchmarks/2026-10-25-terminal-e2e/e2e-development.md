# Terminal E2E benchmark

Revision: bfb5f342ecc6930a4b36ab21a7368ad3a44c28d8; dirty: false; development; jsco; Chromium 154.0.8037.57; headless.
AMD EPYC 9V74 80-Core Processor; linux/x64; Node v24.19.0; Playwright 1.56.1.
0 failures; raw JSON retains first runs, warmups, results, timelines, per-child EXIT/durationMs, clock checks and all summary metrics.

Durations in ms. ON/OFF refers to detailed recording; both use command correlation. Each condition has its own sessions. rAF is not a paint-completion measurement.

| Condition/detail/case | N / attempted | Failures | DOM median | DOM p95 | Min | Max | Mean | Stddev | Frame median | First output median | EXIT median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| warm/on/p1-true | 30 / 30 | 0 | 38.268 | 46.455 | 30.150 | 47.885 | 39.110 | 4.176 | 42.217 | — | 37.688 |
| warm/on/p2-true | 30 / 30 | 0 | 73.610 | 91.945 | 65.220 | 92.000 | 73.933 | 7.057 | 86.132 | — | 72.962 |
| warm/on/p1-echo | 30 / 30 | 0 | 42.228 | 53.495 | 35.505 | 85.610 | 43.669 | 8.891 | 52.883 | 39.155 | 40.475 |
| warm/on/p2-echo | 30 / 30 | 0 | 74.517 | 79.850 | 66.910 | 85.600 | 74.467 | 4.035 | 85.710 | 71.460 | 73.453 |
| warm/on/file | 30 / 30 | 0 | 41.922 | 47.370 | 33.920 | 59.810 | 41.848 | 4.851 | 53.012 | 38.725 | 40.938 |
| warm/on/pipeline | 30 / 30 | 0 | 113.478 | 138.455 | 100.510 | 138.550 | 115.762 | 9.682 | 120.167 | 110.340 | 113.220 |
| warm/on/builtin | 30 / 30 | 0 | 12.345 | 14.935 | 2.580 | 15.455 | 11.236 | 3.404 | 28.080 | — | — |
| warm/off/p1-true | 30 / 30 | 0 | 37.395 | 43.190 | 33.595 | 46.030 | 37.895 | 2.973 | 42.122 | — | 36.765 |
| warm/off/p2-true | 30 / 30 | 0 | 73.343 | 81.105 | 63.745 | 81.225 | 72.965 | 4.645 | 76.005 | — | 72.232 |
| warm/off/p1-echo | 30 / 30 | 0 | 42.025 | 48.605 | 33.305 | 51.870 | 41.878 | 4.206 | 43.102 | 38.250 | 40.453 |
| warm/off/p2-echo | 30 / 30 | 0 | 74.465 | 89.335 | 65.150 | 99.920 | 76.472 | 7.491 | 76.060 | 71.052 | 73.390 |
| warm/off/file | 30 / 30 | 0 | 43.332 | 51.540 | 33.700 | 86.650 | 44.565 | 8.921 | 55.525 | 39.235 | 41.240 |
| warm/off/pipeline | 30 / 30 | 0 | 113.102 | 120.580 | 92.465 | 124.370 | 112.209 | 7.267 | 123.928 | 110.865 | 112.910 |
| warm/off/builtin | 30 / 30 | 0 | 8.802 | 10.635 | 4.955 | 10.705 | 8.671 | 1.377 | 24.610 | — | — |

## Diagnostic intervals (median / p95, ms)

| Condition/detail/case | Metric | N | Median | p95 |
| --- | --- | ---: | ---: | ---: |
| warm/on/p1-true | opfs.getDirectoryHandleMs | 30 | 0.415 | 1.465 |
| warm/on/p1-true | opfs.getFileHandleMs | 30 | 0.320 | 0.830 |
| warm/on/p1-true | shellPromptToDomMs | 30 | 0.275 | 2.535 |
| warm/on/p1-true | localEchoDomAndScrollMs | 30 | 0.960 | 1.850 |
| warm/on/p1-true | outputDomAndScrollMs | 30 | 1.245 | 2.155 |
| warm/on/p1-true | opfsOpenMs | 30 | 0.863 | 1.910 |
| warm/on/p1-true | shellPreparationMs | 30 | 0.910 | 1.950 |
| warm/on/p1-true | shellToFirstSpawnMs | 30 | 0.943 | 2.020 |
| warm/on/p1-true | firstSpawnToLastExitMs | 30 | 35.843 | 43.985 |
| warm/on/p1-true | lastExitToPromptDomMs | 30 | 1.333 | 2.990 |
| warm/on/p1-true | child0.durationMs | 30 | 35.543 | 43.605 |
| warm/on/p1-true | child0.requestToCoreMs | 30 | 0.310 | 0.745 |
| warm/on/p1-true | child0.coreToStartMs | 30 | 0.170 | 0.245 |
| warm/on/p1-true | child0.workerStartupMs | 30 | 34.078 | 42.190 |
| warm/on/p1-true | child0.startToReceiveMs | 30 | 29.890 | 38.150 |
| warm/on/p1-true | child0.workerCreateToModuleMs | 30 | 29.250 | 36.325 |
| warm/on/p1-true | child0.readyToExitMs | 30 | 1.468 | 1.800 |
| warm/on/p1-true | child0.runMs | 30 | 1.063 | 1.290 |
| warm/on/p1-true | child0.closeMs | 30 | 0.190 | 0.335 |
| warm/on/p1-true | child0.exitToUiMs | 30 | 0.110 | 2.520 |
| warm/on/p1-true | child0.readMs | 30 | 1.828 | 2.725 |
| warm/on/p1-true | child0.adapterMs | 30 | 0.860 | 1.705 |
| warm/on/p1-true | child0.compileMs | 30 | 0.432 | 0.510 |
| warm/on/p1-true | child0.instantiateMs | 30 | 0.510 | 0.615 |
| warm/on/p2-true | opfs.getDirectoryHandleMs | 30 | 0.487 | 1.660 |
| warm/on/p2-true | opfs.getFileHandleMs | 30 | 0.310 | 0.915 |
| warm/on/p2-true | shellPromptToDomMs | 30 | 0.320 | 1.355 |
| warm/on/p2-true | localEchoDomAndScrollMs | 30 | 0.970 | 1.775 |
| warm/on/p2-true | outputDomAndScrollMs | 30 | 1.365 | 2.680 |
| warm/on/p2-true | opfsOpenMs | 30 | 0.923 | 2.210 |
| warm/on/p2-true | shellPreparationMs | 30 | 0.973 | 2.250 |
| warm/on/p2-true | shellToFirstSpawnMs | 30 | 1.023 | 2.475 |
| warm/on/p2-true | firstSpawnToLastExitMs | 30 | 70.035 | 86.160 |
| warm/on/p2-true | lastExitToPromptDomMs | 30 | 1.210 | 2.880 |
| warm/on/p2-true | child0.durationMs | 30 | 69.770 | 86.525 |
| warm/on/p2-true | child0.requestToCoreMs | 30 | 0.248 | 0.675 |
| warm/on/p2-true | child0.coreToStartMs | 30 | 0.155 | 0.260 |
| warm/on/p2-true | child0.workerStartupMs | 30 | 65.400 | 81.890 |
| warm/on/p2-true | child0.startToReceiveMs | 30 | 29.515 | 37.705 |
| warm/on/p2-true | child0.workerCreateToModuleMs | 30 | 28.845 | 36.315 |
| warm/on/p2-true | child0.readyToExitMs | 30 | 3.995 | 5.210 |
| warm/on/p2-true | child0.runMs | 30 | 3.502 | 4.360 |
| warm/on/p2-true | child0.closeMs | 30 | 0.263 | 0.530 |
| warm/on/p2-true | child0.exitToUiMs | 30 | 0.140 | 2.035 |
| warm/on/p2-true | child0.readMs | 30 | 1.780 | 2.440 |
| warm/on/p2-true | child0.adapterMs | 30 | 0.890 | 1.970 |
| warm/on/p2-true | child0.component.engineLoadMs | 30 | 12.993 | 17.045 |
| warm/on/p2-true | child0.component.prepareMs | 30 | 14.215 | 17.815 |
| warm/on/p2-true | child0.component.instantiateMs | 30 | 4.615 | 5.575 |
| warm/on/p2-true | child0.loadMs | 30 | 32.113 | 40.100 |
| warm/on/p1-echo | opfs.getDirectoryHandleMs | 30 | 0.537 | 1.720 |
| warm/on/p1-echo | opfs.getFileHandleMs | 30 | 0.323 | 0.970 |
| warm/on/p1-echo | shellPromptToDomMs | 30 | 1.633 | 3.755 |
| warm/on/p1-echo | localEchoDomAndScrollMs | 30 | 1.042 | 2.135 |
| warm/on/p1-echo | outputDomAndScrollMs | 30 | 3.190 | 4.855 |
| warm/on/p1-echo | opfsOpenMs | 30 | 1.080 | 2.105 |
| warm/on/p1-echo | shellPreparationMs | 30 | 1.152 | 2.170 |
| warm/on/p1-echo | shellToFirstSpawnMs | 30 | 1.187 | 2.205 |
| warm/on/p1-echo | firstSpawnToLastExitMs | 30 | 37.305 | 46.800 |
| warm/on/p1-echo | lastExitToPromptDomMs | 30 | 2.965 | 5.785 |
| warm/on/p1-echo | child0.durationMs | 30 | 37.092 | 46.270 |
| warm/on/p1-echo | child0.requestToCoreMs | 30 | 0.265 | 0.775 |
| warm/on/p1-echo | child0.coreToStartMs | 30 | 0.170 | 0.805 |
| warm/on/p1-echo | child0.workerStartupMs | 30 | 34.237 | 41.785 |
| warm/on/p1-echo | child0.startToReceiveMs | 30 | 29.670 | 37.790 |
| warm/on/p1-echo | child0.workerCreateToModuleMs | 30 | 28.977 | 37.180 |
| warm/on/p1-echo | child0.readyToExitMs | 30 | 2.575 | 4.720 |
| warm/on/p1-echo | child0.runMs | 30 | 1.995 | 3.275 |
| warm/on/p1-echo | child0.closeMs | 30 | 0.145 | 0.215 |
| warm/on/p1-echo | child0.exitToUiMs | 30 | 1.302 | 2.875 |
| warm/on/p1-echo | child0.readMs | 30 | 1.820 | 4.560 |
| warm/on/p1-echo | child0.adapterMs | 30 | 0.882 | 1.310 |
| warm/on/p1-echo | child0.compileMs | 30 | 0.408 | 0.585 |
| warm/on/p1-echo | child0.instantiateMs | 30 | 0.522 | 0.640 |
| warm/on/p2-echo | opfs.getDirectoryHandleMs | 30 | 0.378 | 1.080 |
| warm/on/p2-echo | opfs.getFileHandleMs | 30 | 0.273 | 0.945 |
| warm/on/p2-echo | shellPromptToDomMs | 30 | 1.530 | 3.245 |
| warm/on/p2-echo | localEchoDomAndScrollMs | 30 | 1.178 | 1.875 |
| warm/on/p2-echo | outputDomAndScrollMs | 30 | 2.707 | 4.490 |
| warm/on/p2-echo | opfsOpenMs | 30 | 0.702 | 1.910 |
| warm/on/p2-echo | shellPreparationMs | 30 | 0.740 | 1.945 |
| warm/on/p2-echo | shellToFirstSpawnMs | 30 | 0.775 | 1.980 |
| warm/on/p2-echo | firstSpawnToLastExitMs | 30 | 70.333 | 76.660 |
| warm/on/p2-echo | lastExitToPromptDomMs | 30 | 2.465 | 3.770 |
| warm/on/p2-echo | child0.durationMs | 30 | 70.100 | 76.485 |
| warm/on/p2-echo | child0.requestToCoreMs | 30 | 0.273 | 1.015 |
| warm/on/p2-echo | child0.coreToStartMs | 30 | 0.167 | 0.260 |
| warm/on/p2-echo | child0.workerStartupMs | 30 | 64.190 | 70.650 |
| warm/on/p2-echo | child0.startToReceiveMs | 30 | 29.637 | 34.870 |
| warm/on/p2-echo | child0.workerCreateToModuleMs | 30 | 28.935 | 34.160 |
| warm/on/p2-echo | child0.readyToExitMs | 30 | 5.520 | 7.160 |
| warm/on/p2-echo | child0.runMs | 30 | 4.730 | 6.800 |
| warm/on/p2-echo | child0.closeMs | 30 | 0.205 | 0.255 |
| warm/on/p2-echo | child0.exitToUiMs | 30 | 1.267 | 3.175 |
| warm/on/p2-echo | child0.readMs | 30 | 1.838 | 2.710 |
| warm/on/p2-echo | child0.adapterMs | 30 | 0.847 | 1.115 |
| warm/on/p2-echo | child0.component.engineLoadMs | 30 | 12.905 | 14.440 |
| warm/on/p2-echo | child0.component.prepareMs | 30 | 13.893 | 15.940 |
| warm/on/p2-echo | child0.component.instantiateMs | 30 | 4.555 | 5.015 |
| warm/on/p2-echo | child0.loadMs | 30 | 31.965 | 34.600 |
| warm/on/file | opfs.getDirectoryHandleMs | 30 | 0.802 | 2.015 |
| warm/on/file | opfs.getFileHandleMs | 30 | 0.643 | 1.940 |
| warm/on/file | opfs.getFileMs | 30 | 1.397 | 2.185 |
| warm/on/file | opfs.arrayBufferMs | 30 | 0.970 | 2.235 |
| warm/on/file | shellPromptToDomMs | 30 | 0.158 | 0.830 |
| warm/on/file | localEchoDomAndScrollMs | 30 | 0.932 | 1.850 |
| warm/on/file | outputDomAndScrollMs | 30 | 2.125 | 3.015 |
| warm/on/file | opfsOpenMs | 30 | 1.780 | 3.520 |
| warm/on/file | shellPreparationMs | 30 | 0.863 | 1.805 |
| warm/on/file | shellToFirstSpawnMs | 30 | 0.890 | 1.830 |
| warm/on/file | firstSpawnToLastExitMs | 30 | 39.183 | 44.850 |
| warm/on/file | lastExitToPromptDomMs | 30 | 1.020 | 2.745 |
| warm/on/file | child0.durationMs | 30 | 38.865 | 44.630 |
| warm/on/file | child0.requestToCoreMs | 30 | 0.245 | 0.395 |
| warm/on/file | child0.coreToStartMs | 30 | 0.167 | 0.255 |
| warm/on/file | child0.workerStartupMs | 30 | 32.540 | 39.195 |
| warm/on/file | child0.startToReceiveMs | 30 | 28.645 | 34.930 |
| warm/on/file | child0.workerCreateToModuleMs | 30 | 27.835 | 34.155 |
| warm/on/file | child0.readyToExitMs | 30 | 5.570 | 7.110 |
| warm/on/file | child0.runMs | 30 | 5.338 | 6.735 |
| warm/on/file | child0.closeMs | 30 | 0.170 | 0.255 |
| warm/on/file | child0.exitToUiMs | 30 | 0.142 | 0.685 |
| warm/on/file | child0.readMs | 30 | 1.955 | 3.070 |
| warm/on/file | child0.adapterMs | 30 | 0.870 | 1.235 |
| warm/on/file | child0.compileMs | 30 | 0.410 | 0.575 |
| warm/on/file | child0.instantiateMs | 30 | 0.515 | 0.730 |
| warm/on/pipeline | opfs.getDirectoryHandleMs | 30 | 2.738 | 4.920 |
| warm/on/pipeline | opfs.getFileHandleMs | 30 | 2.223 | 4.210 |
| warm/on/pipeline | opfs.getFileMs | 30 | 1.748 | 4.015 |
| warm/on/pipeline | opfs.arrayBufferMs | 30 | 1.672 | 7.085 |
| warm/on/pipeline | shellPromptToDomMs | 30 | 1.737 | 3.890 |
| warm/on/pipeline | localEchoDomAndScrollMs | 30 | 0.960 | 2.115 |
| warm/on/pipeline | outputDomAndScrollMs | 30 | 3.065 | 4.800 |
| warm/on/pipeline | opfsOpenMs | 30 | 5.300 | 9.075 |
| warm/on/pipeline | shellPreparationMs | 30 | 2.527 | 5.870 |
| warm/on/pipeline | shellToFirstSpawnMs | 30 | 1.537 | 2.495 |
| warm/on/pipeline | firstSpawnToLastExitMs | 30 | 109.168 | 132.160 |
| warm/on/pipeline | lastExitToPromptDomMs | 30 | 2.435 | 4.915 |
| warm/on/pipeline | child0.durationMs | 30 | 43.040 | 50.580 |
| warm/on/pipeline | child1.durationMs | 30 | 40.477 | 48.405 |
| warm/on/pipeline | child2.durationMs | 30 | 35.470 | 43.310 |
| warm/on/pipeline | child0.requestToCoreMs | 30 | 0.273 | 0.910 |
| warm/on/pipeline | child0.coreToStartMs | 30 | 0.143 | 0.245 |
| warm/on/pipeline | child0.workerStartupMs | 30 | 33.455 | 39.880 |
| warm/on/pipeline | child0.startToReceiveMs | 30 | 29.517 | 35.330 |
| warm/on/pipeline | child0.workerCreateToModuleMs | 30 | 28.648 | 33.845 |
| warm/on/pipeline | child0.readyToExitMs | 30 | 8.790 | 18.110 |
| warm/on/pipeline | child0.runMs | 30 | 8.235 | 16.550 |
| warm/on/pipeline | child0.closeMs | 30 | 0.190 | 1.095 |
| warm/on/pipeline | child0.exitToUiMs | 30 | 0.190 | 1.665 |
| warm/on/pipeline | child0.readMs | 30 | 1.897 | 2.925 |
| warm/on/pipeline | child0.adapterMs | 30 | 0.848 | 1.675 |
| warm/on/pipeline | child0.compileMs | 30 | 0.412 | 0.630 |
| warm/on/pipeline | child0.instantiateMs | 30 | 0.517 | 0.725 |
| warm/on/pipeline | child1.requestToCoreMs | 30 | 0.238 | 0.670 |
| warm/on/pipeline | child1.coreToStartMs | 30 | 0.150 | 0.200 |
| warm/on/pipeline | child1.workerStartupMs | 30 | 37.472 | 43.890 |
| warm/on/pipeline | child1.startToReceiveMs | 30 | 33.202 | 40.410 |
| warm/on/pipeline | child1.workerCreateToModuleMs | 30 | 32.142 | 39.450 |
| warm/on/pipeline | child1.readyToExitMs | 30 | 2.470 | 3.515 |
| warm/on/pipeline | child1.runMs | 30 | 1.833 | 3.305 |
| warm/on/pipeline | child1.closeMs | 30 | 0.155 | 0.425 |
| warm/on/pipeline | child1.exitToUiMs | 30 | 0.162 | 2.780 |
| warm/on/pipeline | child1.readMs | 30 | 1.765 | 2.490 |
| warm/on/pipeline | child1.adapterMs | 30 | 0.830 | 1.050 |
| warm/on/pipeline | child1.compileMs | 30 | 0.455 | 0.610 |
| warm/on/pipeline | child1.instantiateMs | 30 | 0.533 | 0.660 |
| warm/on/pipeline | child2.requestToCoreMs | 30 | 0.260 | 0.690 |
| warm/on/pipeline | child2.coreToStartMs | 30 | 0.168 | 0.340 |
| warm/on/pipeline | child2.workerStartupMs | 30 | 32.648 | 41.200 |
| warm/on/pipeline | child2.startToReceiveMs | 30 | 28.162 | 37.075 |
| warm/on/pipeline | child2.workerCreateToModuleMs | 30 | 27.185 | 35.830 |
| warm/on/pipeline | child2.readyToExitMs | 30 | 2.323 | 4.355 |
| warm/on/pipeline | child2.runMs | 30 | 1.905 | 2.335 |
| warm/on/pipeline | child2.closeMs | 30 | 0.140 | 0.235 |
| warm/on/pipeline | child2.exitToUiMs | 30 | 2.027 | 3.365 |
| warm/on/pipeline | child2.readMs | 30 | 1.770 | 2.625 |
| warm/on/pipeline | child2.adapterMs | 30 | 0.842 | 1.355 |
| warm/on/pipeline | child2.compileMs | 30 | 0.410 | 0.660 |
| warm/on/pipeline | child2.instantiateMs | 30 | 0.527 | 0.755 |
| warm/on/builtin | shellPromptToDomMs | 30 | 11.765 | 14.470 |
| warm/on/builtin | localEchoDomAndScrollMs | 30 | 0.880 | 1.395 |
| warm/on/builtin | outputDomAndScrollMs | 30 | 0.685 | 1.375 |
| warm/on/builtin | opfsOpenMs | 30 | 0.000 | 0.000 |
| warm/on/builtin | shellPreparationMs | 30 | 0.000 | 0.000 |
| warm/on/builtin | shellToPromptDomMs | 30 | 12.017 | 14.725 |
| warm/off/p1-true | child0.durationMs | 30 | 34.932 | 41.095 |
| warm/off/p2-true | child0.durationMs | 30 | 70.475 | 77.935 |
| warm/off/p1-echo | child0.durationMs | 30 | 37.067 | 43.860 |
| warm/off/p2-echo | child0.durationMs | 30 | 70.002 | 81.865 |
| warm/off/file | child0.durationMs | 30 | 39.368 | 48.810 |
| warm/off/pipeline | child0.durationMs | 30 | 43.923 | 49.385 |
| warm/off/pipeline | child1.durationMs | 30 | 38.498 | 42.755 |
| warm/off/pipeline | child2.durationMs | 30 | 34.875 | 40.820 |

Do not add nested intervals, per-child startup/run/stdio/wait durations, or drawing time. Only input→shell, shell→first spawn, first spawn→last EXIT and last EXIT→prompt DOM form the outer wall-time partition (builtin uses shell→prompt).

See docs/benchmarks-e2e.md for reproduction, cache/clock definitions, trace capture and comparison to the separate Worker benchmark.
