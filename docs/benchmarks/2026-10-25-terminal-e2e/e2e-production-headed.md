# Terminal E2E benchmark

Revision: bfb5f342ecc6930a4b36ab21a7368ad3a44c28d8; dirty: false; production; jsco; Chromium 154.0.8037.57; headed.
AMD EPYC 9V74 80-Core Processor; linux/x64; Node v24.19.0; Playwright 1.56.1.
0 failures; raw JSON retains first runs, warmups, results, timelines, per-child EXIT/durationMs, clock checks and all summary metrics.

Durations in ms. ON/OFF refers to detailed recording; both use command correlation. Each condition has its own sessions. rAF is not a paint-completion measurement.

| Condition/detail/case | N / attempted | Failures | DOM median | DOM p95 | Min | Max | Mean | Stddev | Frame median | First output median | EXIT median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| warm/on/p1-true | 30 / 30 | 0 | 16.935 | 19.915 | 13.440 | 22.150 | 17.095 | 1.783 | 24.525 | — | 16.680 |
| warm/on/p2-true | 30 / 30 | 0 | 45.677 | 51.315 | 41.350 | 56.965 | 45.951 | 3.505 | 54.528 | — | 45.172 |
| warm/on/p1-echo | 30 / 30 | 0 | 19.205 | 23.055 | 16.050 | 24.425 | 19.371 | 2.005 | 22.028 | 16.480 | 18.458 |
| warm/on/p2-echo | 30 / 30 | 0 | 48.342 | 55.315 | 43.920 | 62.400 | 48.503 | 3.790 | 54.552 | 45.065 | 46.420 |
| warm/on/file | 30 / 30 | 0 | 20.847 | 25.605 | 17.970 | 26.975 | 21.552 | 2.510 | 31.705 | 17.920 | 20.035 |
| warm/on/pipeline | 30 / 30 | 0 | 49.733 | 60.240 | 43.300 | 81.245 | 51.592 | 7.021 | 54.200 | 47.612 | 49.165 |
| warm/on/builtin | 30 / 30 | 0 | 12.333 | 15.785 | 3.615 | 15.855 | 11.787 | 3.200 | 27.762 | — | — |
| warm/off/p1-true | 30 / 30 | 0 | 16.840 | 19.780 | 14.690 | 20.365 | 16.775 | 1.312 | 25.270 | — | 16.343 |
| warm/off/p2-true | 30 / 30 | 0 | 46.390 | 53.470 | 40.555 | 53.955 | 46.750 | 3.378 | 57.590 | — | 45.950 |
| warm/off/p1-echo | 30 / 30 | 0 | 19.120 | 23.560 | 16.485 | 29.195 | 19.608 | 2.489 | 24.515 | 16.707 | 17.713 |
| warm/off/p2-echo | 30 / 30 | 0 | 48.527 | 55.615 | 44.885 | 63.910 | 49.344 | 3.771 | 58.235 | 45.307 | 46.743 |
| warm/off/file | 30 / 30 | 0 | 20.392 | 22.780 | 16.370 | 23.050 | 20.336 | 1.612 | 24.608 | 17.965 | 19.955 |
| warm/off/pipeline | 30 / 30 | 0 | 52.100 | 55.580 | 44.970 | 58.075 | 51.162 | 3.178 | 58.655 | 48.998 | 51.280 |
| warm/off/builtin | 30 / 30 | 0 | 9.215 | 11.365 | 2.985 | 11.755 | 9.094 | 1.751 | 24.515 | — | — |

## Diagnostic intervals (median / p95, ms)

| Condition/detail/case | Metric | N | Median | p95 |
| --- | --- | ---: | ---: | ---: |
| warm/on/p1-true | opfs.getDirectoryHandleMs | 30 | 0.410 | 1.265 |
| warm/on/p1-true | opfs.getFileHandleMs | 30 | 0.302 | 0.560 |
| warm/on/p1-true | shellPromptToDomMs | 30 | 0.135 | 0.845 |
| warm/on/p1-true | localEchoDomAndScrollMs | 30 | 0.928 | 1.900 |
| warm/on/p1-true | outputDomAndScrollMs | 30 | 1.132 | 2.115 |
| warm/on/p1-true | opfsOpenMs | 30 | 0.827 | 1.995 |
| warm/on/p1-true | shellPreparationMs | 30 | 0.867 | 2.040 |
| warm/on/p1-true | shellToFirstSpawnMs | 30 | 0.897 | 2.070 |
| warm/on/p1-true | firstSpawnToLastExitMs | 30 | 14.810 | 17.580 |
| warm/on/p1-true | lastExitToPromptDomMs | 30 | 0.535 | 1.240 |
| warm/on/p1-true | child0.durationMs | 30 | 14.527 | 17.250 |
| warm/on/p1-true | child0.requestToCoreMs | 30 | 0.268 | 0.680 |
| warm/on/p1-true | child0.coreToStartMs | 30 | 0.172 | 0.425 |
| warm/on/p1-true | child0.workerStartupMs | 30 | 13.147 | 15.610 |
| warm/on/p1-true | child0.startToReceiveMs | 30 | 9.732 | 11.675 |
| warm/on/p1-true | child0.workerCreateToModuleMs | 30 | 9.108 | 10.865 |
| warm/on/p1-true | child0.readyToExitMs | 30 | 1.427 | 2.950 |
| warm/on/p1-true | child0.runMs | 30 | 1.065 | 1.935 |
| warm/on/p1-true | child0.closeMs | 30 | 0.193 | 0.315 |
| warm/on/p1-true | child0.exitToUiMs | 30 | 0.100 | 1.075 |
| warm/on/p1-true | child0.readMs | 30 | 1.022 | 1.780 |
| warm/on/p1-true | child0.adapterMs | 30 | 0.840 | 1.295 |
| warm/on/p1-true | child0.compileMs | 30 | 0.400 | 0.570 |
| warm/on/p1-true | child0.instantiateMs | 30 | 0.465 | 0.615 |
| warm/on/p2-true | opfs.getDirectoryHandleMs | 30 | 0.408 | 1.360 |
| warm/on/p2-true | opfs.getFileHandleMs | 30 | 0.290 | 1.120 |
| warm/on/p2-true | shellPromptToDomMs | 30 | 0.125 | 0.910 |
| warm/on/p2-true | localEchoDomAndScrollMs | 30 | 0.958 | 2.170 |
| warm/on/p2-true | outputDomAndScrollMs | 30 | 1.343 | 2.670 |
| warm/on/p2-true | opfsOpenMs | 30 | 0.807 | 1.820 |
| warm/on/p2-true | shellPreparationMs | 30 | 0.867 | 1.860 |
| warm/on/p2-true | shellToFirstSpawnMs | 30 | 0.890 | 1.910 |
| warm/on/p2-true | firstSpawnToLastExitMs | 30 | 43.468 | 49.415 |
| warm/on/p2-true | lastExitToPromptDomMs | 30 | 0.555 | 2.925 |
| warm/on/p2-true | child0.durationMs | 30 | 43.040 | 49.130 |
| warm/on/p2-true | child0.requestToCoreMs | 30 | 0.308 | 0.970 |
| warm/on/p2-true | child0.coreToStartMs | 30 | 0.175 | 0.360 |
| warm/on/p2-true | child0.workerStartupMs | 30 | 39.200 | 44.865 |
| warm/on/p2-true | child0.startToReceiveMs | 30 | 9.920 | 11.130 |
| warm/on/p2-true | child0.workerCreateToModuleMs | 30 | 9.300 | 10.405 |
| warm/on/p2-true | child0.readyToExitMs | 30 | 3.672 | 4.375 |
| warm/on/p2-true | child0.runMs | 30 | 3.300 | 3.685 |
| warm/on/p2-true | child0.closeMs | 30 | 0.248 | 0.395 |
| warm/on/p2-true | child0.exitToUiMs | 30 | 0.152 | 2.435 |
| warm/on/p2-true | child0.readMs | 30 | 1.027 | 1.320 |
| warm/on/p2-true | child0.adapterMs | 30 | 0.787 | 0.940 |
| warm/on/p2-true | child0.component.engineLoadMs | 30 | 8.037 | 11.490 |
| warm/on/p2-true | child0.component.prepareMs | 30 | 13.378 | 18.140 |
| warm/on/p2-true | child0.component.instantiateMs | 30 | 4.743 | 5.275 |
| warm/on/p2-true | child0.loadMs | 30 | 26.905 | 32.875 |
| warm/on/p1-echo | opfs.getDirectoryHandleMs | 30 | 0.448 | 1.680 |
| warm/on/p1-echo | opfs.getFileHandleMs | 30 | 0.315 | 0.680 |
| warm/on/p1-echo | shellPromptToDomMs | 30 | 1.438 | 3.080 |
| warm/on/p1-echo | localEchoDomAndScrollMs | 30 | 0.995 | 1.565 |
| warm/on/p1-echo | outputDomAndScrollMs | 30 | 2.610 | 3.995 |
| warm/on/p1-echo | opfsOpenMs | 30 | 0.857 | 2.095 |
| warm/on/p1-echo | shellPreparationMs | 30 | 0.893 | 2.135 |
| warm/on/p1-echo | shellToFirstSpawnMs | 30 | 0.927 | 2.170 |
| warm/on/p1-echo | firstSpawnToLastExitMs | 30 | 15.922 | 18.345 |
| warm/on/p1-echo | lastExitToPromptDomMs | 30 | 1.820 | 3.315 |
| warm/on/p1-echo | child0.durationMs | 30 | 15.530 | 18.895 |
| warm/on/p1-echo | child0.requestToCoreMs | 30 | 0.308 | 0.680 |
| warm/on/p1-echo | child0.coreToStartMs | 30 | 0.172 | 0.445 |
| warm/on/p1-echo | child0.workerStartupMs | 30 | 12.965 | 15.535 |
| warm/on/p1-echo | child0.startToReceiveMs | 30 | 9.963 | 12.220 |
| warm/on/p1-echo | child0.workerCreateToModuleMs | 30 | 9.472 | 11.330 |
| warm/on/p1-echo | child0.readyToExitMs | 30 | 2.503 | 4.305 |
| warm/on/p1-echo | child0.runMs | 30 | 1.825 | 2.995 |
| warm/on/p1-echo | child0.closeMs | 30 | 0.140 | 0.320 |
| warm/on/p1-echo | child0.exitToUiMs | 30 | 0.792 | 1.880 |
| warm/on/p1-echo | child0.readMs | 30 | 1.000 | 1.575 |
| warm/on/p1-echo | child0.adapterMs | 30 | 0.755 | 1.025 |
| warm/on/p1-echo | child0.compileMs | 30 | 0.383 | 0.600 |
| warm/on/p1-echo | child0.instantiateMs | 30 | 0.470 | 0.575 |
| warm/on/p2-echo | opfs.getDirectoryHandleMs | 30 | 0.402 | 1.415 |
| warm/on/p2-echo | opfs.getFileHandleMs | 30 | 0.310 | 1.775 |
| warm/on/p2-echo | shellPromptToDomMs | 30 | 1.447 | 2.880 |
| warm/on/p2-echo | localEchoDomAndScrollMs | 30 | 1.052 | 1.860 |
| warm/on/p2-echo | outputDomAndScrollMs | 30 | 2.903 | 4.330 |
| warm/on/p2-echo | opfsOpenMs | 30 | 0.760 | 3.250 |
| warm/on/p2-echo | shellPreparationMs | 30 | 0.800 | 3.315 |
| warm/on/p2-echo | shellToFirstSpawnMs | 30 | 0.830 | 3.355 |
| warm/on/p2-echo | firstSpawnToLastExitMs | 30 | 44.100 | 51.435 |
| warm/on/p2-echo | lastExitToPromptDomMs | 30 | 1.920 | 3.425 |
| warm/on/p2-echo | child0.durationMs | 30 | 43.868 | 51.225 |
| warm/on/p2-echo | child0.requestToCoreMs | 30 | 0.285 | 1.140 |
| warm/on/p2-echo | child0.coreToStartMs | 30 | 0.167 | 0.300 |
| warm/on/p2-echo | child0.workerStartupMs | 30 | 38.442 | 44.135 |
| warm/on/p2-echo | child0.startToReceiveMs | 30 | 9.125 | 11.580 |
| warm/on/p2-echo | child0.workerCreateToModuleMs | 30 | 8.732 | 11.015 |
| warm/on/p2-echo | child0.readyToExitMs | 30 | 5.168 | 7.030 |
| warm/on/p2-echo | child0.runMs | 30 | 4.673 | 5.700 |
| warm/on/p2-echo | child0.closeMs | 30 | 0.222 | 0.315 |
| warm/on/p2-echo | child0.exitToUiMs | 30 | 0.555 | 2.380 |
| warm/on/p2-echo | child0.readMs | 30 | 0.995 | 1.715 |
| warm/on/p2-echo | child0.adapterMs | 30 | 0.810 | 1.505 |
| warm/on/p2-echo | child0.component.engineLoadMs | 30 | 7.657 | 10.605 |
| warm/on/p2-echo | child0.component.prepareMs | 30 | 13.615 | 16.150 |
| warm/on/p2-echo | child0.component.instantiateMs | 30 | 4.680 | 5.220 |
| warm/on/p2-echo | child0.loadMs | 30 | 27.320 | 31.245 |
| warm/on/file | opfs.getDirectoryHandleMs | 30 | 0.880 | 2.205 |
| warm/on/file | opfs.getFileHandleMs | 30 | 0.645 | 1.675 |
| warm/on/file | opfs.getFileMs | 30 | 1.218 | 1.965 |
| warm/on/file | opfs.arrayBufferMs | 30 | 0.865 | 1.565 |
| warm/on/file | shellPromptToDomMs | 30 | 0.227 | 4.265 |
| warm/on/file | localEchoDomAndScrollMs | 30 | 1.177 | 1.765 |
| warm/on/file | outputDomAndScrollMs | 30 | 1.845 | 3.260 |
| warm/on/file | opfsOpenMs | 30 | 1.745 | 4.020 |
| warm/on/file | shellPreparationMs | 30 | 0.983 | 2.110 |
| warm/on/file | shellToFirstSpawnMs | 30 | 1.012 | 2.140 |
| warm/on/file | firstSpawnToLastExitMs | 30 | 17.965 | 22.445 |
| warm/on/file | lastExitToPromptDomMs | 30 | 0.842 | 4.610 |
| warm/on/file | child0.durationMs | 30 | 17.632 | 22.250 |
| warm/on/file | child0.requestToCoreMs | 30 | 0.298 | 1.345 |
| warm/on/file | child0.coreToStartMs | 30 | 0.165 | 0.230 |
| warm/on/file | child0.workerStartupMs | 30 | 13.013 | 15.935 |
| warm/on/file | child0.startToReceiveMs | 30 | 10.120 | 12.705 |
| warm/on/file | child0.workerCreateToModuleMs | 30 | 9.553 | 12.225 |
| warm/on/file | child0.readyToExitMs | 30 | 4.887 | 7.190 |
| warm/on/file | child0.runMs | 30 | 4.417 | 6.980 |
| warm/on/file | child0.closeMs | 30 | 0.165 | 0.705 |
| warm/on/file | child0.exitToUiMs | 30 | 0.150 | 3.960 |
| warm/on/file | child0.readMs | 30 | 0.970 | 1.115 |
| warm/on/file | child0.adapterMs | 30 | 0.768 | 1.015 |
| warm/on/file | child0.compileMs | 30 | 0.392 | 0.570 |
| warm/on/file | child0.instantiateMs | 30 | 0.475 | 0.620 |
| warm/on/pipeline | opfs.getDirectoryHandleMs | 30 | 3.043 | 5.835 |
| warm/on/pipeline | opfs.getFileHandleMs | 30 | 2.065 | 4.065 |
| warm/on/pipeline | opfs.getFileMs | 30 | 1.668 | 3.655 |
| warm/on/pipeline | opfs.arrayBufferMs | 30 | 2.267 | 4.425 |
| warm/on/pipeline | shellPromptToDomMs | 30 | 1.185 | 4.980 |
| warm/on/pipeline | localEchoDomAndScrollMs | 30 | 1.025 | 2.005 |
| warm/on/pipeline | outputDomAndScrollMs | 30 | 2.810 | 3.640 |
| warm/on/pipeline | opfsOpenMs | 30 | 5.478 | 9.215 |
| warm/on/pipeline | shellPreparationMs | 30 | 2.865 | 5.015 |
| warm/on/pipeline | shellToFirstSpawnMs | 30 | 1.602 | 3.155 |
| warm/on/pipeline | firstSpawnToLastExitMs | 30 | 45.578 | 53.645 |
| warm/on/pipeline | lastExitToPromptDomMs | 30 | 2.265 | 5.115 |
| warm/on/pipeline | child0.durationMs | 30 | 23.115 | 30.260 |
| warm/on/pipeline | child1.durationMs | 30 | 16.765 | 22.530 |
| warm/on/pipeline | child2.durationMs | 30 | 14.685 | 19.065 |
| warm/on/pipeline | child0.requestToCoreMs | 30 | 0.278 | 0.995 |
| warm/on/pipeline | child0.coreToStartMs | 30 | 0.145 | 0.250 |
| warm/on/pipeline | child0.workerStartupMs | 30 | 13.743 | 15.870 |
| warm/on/pipeline | child0.startToReceiveMs | 30 | 10.267 | 12.025 |
| warm/on/pipeline | child0.workerCreateToModuleMs | 30 | 9.750 | 11.590 |
| warm/on/pipeline | child0.readyToExitMs | 30 | 9.190 | 15.550 |
| warm/on/pipeline | child0.runMs | 30 | 8.860 | 15.145 |
| warm/on/pipeline | child0.closeMs | 30 | 0.185 | 0.770 |
| warm/on/pipeline | child0.exitToUiMs | 30 | 0.122 | 1.235 |
| warm/on/pipeline | child0.readMs | 30 | 0.967 | 1.365 |
| warm/on/pipeline | child0.adapterMs | 30 | 0.813 | 3.320 |
| warm/on/pipeline | child0.compileMs | 30 | 0.395 | 0.545 |
| warm/on/pipeline | child0.instantiateMs | 30 | 0.475 | 0.555 |
| warm/on/pipeline | child1.requestToCoreMs | 30 | 0.275 | 0.580 |
| warm/on/pipeline | child1.coreToStartMs | 30 | 0.135 | 0.295 |
| warm/on/pipeline | child1.workerStartupMs | 30 | 14.013 | 20.630 |
| warm/on/pipeline | child1.startToReceiveMs | 30 | 10.380 | 15.285 |
| warm/on/pipeline | child1.workerCreateToModuleMs | 30 | 9.852 | 14.745 |
| warm/on/pipeline | child1.readyToExitMs | 30 | 2.347 | 4.015 |
| warm/on/pipeline | child1.runMs | 30 | 1.778 | 3.750 |
| warm/on/pipeline | child1.closeMs | 30 | 0.155 | 0.865 |
| warm/on/pipeline | child1.exitToUiMs | 30 | 0.140 | 1.770 |
| warm/on/pipeline | child1.readMs | 30 | 0.897 | 2.230 |
| warm/on/pipeline | child1.adapterMs | 30 | 0.795 | 2.800 |
| warm/on/pipeline | child1.compileMs | 30 | 0.418 | 0.570 |
| warm/on/pipeline | child1.instantiateMs | 30 | 0.475 | 0.610 |
| warm/on/pipeline | child2.requestToCoreMs | 30 | 0.258 | 1.410 |
| warm/on/pipeline | child2.coreToStartMs | 30 | 0.133 | 0.490 |
| warm/on/pipeline | child2.workerStartupMs | 30 | 12.575 | 15.515 |
| warm/on/pipeline | child2.startToReceiveMs | 30 | 9.215 | 12.035 |
| warm/on/pipeline | child2.workerCreateToModuleMs | 30 | 8.587 | 12.095 |
| warm/on/pipeline | child2.readyToExitMs | 30 | 1.910 | 3.805 |
| warm/on/pipeline | child2.runMs | 30 | 1.660 | 3.405 |
| warm/on/pipeline | child2.closeMs | 30 | 0.140 | 0.175 |
| warm/on/pipeline | child2.exitToUiMs | 30 | 1.810 | 3.385 |
| warm/on/pipeline | child2.readMs | 30 | 0.938 | 2.275 |
| warm/on/pipeline | child2.adapterMs | 30 | 0.787 | 1.805 |
| warm/on/pipeline | child2.compileMs | 30 | 0.392 | 0.565 |
| warm/on/pipeline | child2.instantiateMs | 30 | 0.463 | 0.640 |
| warm/on/builtin | shellPromptToDomMs | 30 | 11.630 | 15.070 |
| warm/on/builtin | localEchoDomAndScrollMs | 30 | 0.973 | 1.465 |
| warm/on/builtin | outputDomAndScrollMs | 30 | 0.647 | 1.075 |
| warm/on/builtin | opfsOpenMs | 30 | 0.000 | 0.000 |
| warm/on/builtin | shellPreparationMs | 30 | 0.000 | 0.000 |
| warm/on/builtin | shellToPromptDomMs | 30 | 11.823 | 15.550 |
| warm/off/p1-true | child0.durationMs | 30 | 14.412 | 17.615 |
| warm/off/p2-true | child0.durationMs | 30 | 43.338 | 51.140 |
| warm/off/p1-echo | child0.durationMs | 30 | 15.445 | 18.515 |
| warm/off/p2-echo | child0.durationMs | 30 | 44.475 | 51.420 |
| warm/off/file | child0.durationMs | 30 | 17.682 | 20.660 |
| warm/off/pipeline | child0.durationMs | 30 | 22.045 | 28.615 |
| warm/off/pipeline | child1.durationMs | 30 | 17.020 | 19.840 |
| warm/off/pipeline | child2.durationMs | 30 | 14.800 | 17.680 |

Do not add nested intervals, per-child startup/run/stdio/wait durations, or drawing time. Only input→shell, shell→first spawn, first spawn→last EXIT and last EXIT→prompt DOM form the outer wall-time partition (builtin uses shell→prompt).

See docs/benchmarks-e2e.md for reproduction, cache/clock definitions, trace capture and comparison to the separate Worker benchmark.
