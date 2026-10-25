# Terminal E2E benchmark

Revision: bfb5f342ecc6930a4b36ab21a7368ad3a44c28d8; dirty: false; production; jsco; Chromium 154.0.8037.57; headless.
AMD EPYC 9V74 80-Core Processor; linux/x64; Node v24.19.0; Playwright 1.56.1.
0 failures; raw JSON retains first runs, warmups, results, timelines, per-child EXIT/durationMs, clock checks and all summary metrics.

Durations in ms. ON/OFF refers to detailed recording; both use command correlation. Each condition has its own sessions. rAF is not a paint-completion measurement.

| Condition/detail/case | N / attempted | Failures | DOM median | DOM p95 | Min | Max | Mean | Stddev | Frame median | First output median | EXIT median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| warm/on/p1-true | 30 / 30 | 0 | 16.797 | 19.360 | 14.100 | 21.925 | 16.943 | 1.624 | 24.240 | — | 16.227 |
| warm/on/p2-true | 30 / 30 | 0 | 45.785 | 50.995 | 40.170 | 52.115 | 46.222 | 2.713 | 54.568 | — | 45.005 |
| warm/on/p1-echo | 30 / 30 | 0 | 18.880 | 25.260 | 16.900 | 25.665 | 19.720 | 2.457 | 21.165 | 16.400 | 17.693 |
| warm/on/p2-echo | 30 / 30 | 0 | 48.632 | 56.590 | 43.485 | 63.385 | 49.656 | 4.255 | 53.820 | 45.300 | 47.380 |
| warm/on/file | 30 / 30 | 0 | 20.050 | 24.440 | 17.080 | 26.480 | 20.604 | 2.165 | 21.805 | 17.863 | 19.418 |
| warm/on/pipeline | 30 / 30 | 0 | 47.363 | 52.425 | 42.275 | 60.170 | 47.827 | 3.496 | 53.535 | 44.590 | 46.912 |
| warm/on/builtin | 30 / 30 | 0 | 12.187 | 14.580 | 1.995 | 14.700 | 10.957 | 3.623 | 27.672 | — | — |
| warm/off/p1-true | 30 / 30 | 0 | 15.815 | 20.230 | 14.520 | 22.580 | 16.509 | 1.852 | 24.912 | — | 15.392 |
| warm/off/p2-true | 30 / 30 | 0 | 45.638 | 52.765 | 39.865 | 59.725 | 45.946 | 4.081 | 58.067 | — | 45.127 |
| warm/off/p1-echo | 30 / 30 | 0 | 18.755 | 25.905 | 15.790 | 53.290 | 20.144 | 6.483 | 24.755 | 16.188 | 17.788 |
| warm/off/p2-echo | 30 / 30 | 0 | 48.598 | 61.110 | 43.085 | 65.920 | 49.620 | 4.507 | 58.128 | 45.925 | 47.355 |
| warm/off/file | 30 / 30 | 0 | 18.980 | 22.530 | 16.400 | 22.580 | 19.320 | 1.657 | 24.800 | 16.560 | 18.390 |
| warm/off/pipeline | 30 / 30 | 0 | 46.345 | 54.705 | 39.780 | 55.760 | 47.358 | 3.990 | 57.528 | 44.140 | 45.073 |
| warm/off/builtin | 30 / 30 | 0 | 8.737 | 10.170 | 5.350 | 10.655 | 8.597 | 1.156 | 24.745 | — | — |

## Diagnostic intervals (median / p95, ms)

| Condition/detail/case | Metric | N | Median | p95 |
| --- | --- | ---: | ---: | ---: |
| warm/on/p1-true | opfs.getDirectoryHandleMs | 30 | 0.450 | 1.330 |
| warm/on/p1-true | opfs.getFileHandleMs | 30 | 0.330 | 0.660 |
| warm/on/p1-true | shellPromptToDomMs | 30 | 0.197 | 1.555 |
| warm/on/p1-true | localEchoDomAndScrollMs | 30 | 0.975 | 2.090 |
| warm/on/p1-true | outputDomAndScrollMs | 30 | 1.055 | 1.625 |
| warm/on/p1-true | opfsOpenMs | 30 | 0.882 | 1.760 |
| warm/on/p1-true | shellPreparationMs | 30 | 0.948 | 1.800 |
| warm/on/p1-true | shellToFirstSpawnMs | 30 | 0.992 | 1.820 |
| warm/on/p1-true | firstSpawnToLastExitMs | 30 | 14.623 | 17.040 |
| warm/on/p1-true | lastExitToPromptDomMs | 30 | 0.818 | 2.325 |
| warm/on/p1-true | child0.durationMs | 30 | 14.363 | 16.240 |
| warm/on/p1-true | child0.requestToCoreMs | 30 | 0.302 | 0.775 |
| warm/on/p1-true | child0.coreToStartMs | 30 | 0.162 | 0.335 |
| warm/on/p1-true | child0.workerStartupMs | 30 | 12.642 | 14.770 |
| warm/on/p1-true | child0.startToReceiveMs | 30 | 9.307 | 11.220 |
| warm/on/p1-true | child0.workerCreateToModuleMs | 30 | 8.650 | 10.595 |
| warm/on/p1-true | child0.readyToExitMs | 30 | 1.445 | 1.915 |
| warm/on/p1-true | child0.runMs | 30 | 1.060 | 1.450 |
| warm/on/p1-true | child0.closeMs | 30 | 0.182 | 0.240 |
| warm/on/p1-true | child0.exitToUiMs | 30 | 0.130 | 1.765 |
| warm/on/p1-true | child0.readMs | 30 | 1.068 | 1.660 |
| warm/on/p1-true | child0.adapterMs | 30 | 0.880 | 1.710 |
| warm/on/p1-true | child0.compileMs | 30 | 0.420 | 0.635 |
| warm/on/p1-true | child0.instantiateMs | 30 | 0.472 | 0.595 |
| warm/on/p2-true | opfs.getDirectoryHandleMs | 30 | 0.458 | 1.485 |
| warm/on/p2-true | opfs.getFileHandleMs | 30 | 0.365 | 0.705 |
| warm/on/p2-true | shellPromptToDomMs | 30 | 0.167 | 2.275 |
| warm/on/p2-true | localEchoDomAndScrollMs | 30 | 0.963 | 2.460 |
| warm/on/p2-true | outputDomAndScrollMs | 30 | 1.540 | 2.405 |
| warm/on/p2-true | opfsOpenMs | 30 | 0.890 | 1.930 |
| warm/on/p2-true | shellPreparationMs | 30 | 0.932 | 2.025 |
| warm/on/p2-true | shellToFirstSpawnMs | 30 | 0.958 | 2.050 |
| warm/on/p2-true | firstSpawnToLastExitMs | 30 | 43.345 | 49.620 |
| warm/on/p2-true | lastExitToPromptDomMs | 30 | 0.800 | 2.775 |
| warm/on/p2-true | child0.durationMs | 30 | 43.165 | 49.360 |
| warm/on/p2-true | child0.requestToCoreMs | 30 | 0.295 | 0.720 |
| warm/on/p2-true | child0.coreToStartMs | 30 | 0.160 | 0.235 |
| warm/on/p2-true | child0.workerStartupMs | 30 | 39.110 | 45.365 |
| warm/on/p2-true | child0.startToReceiveMs | 30 | 9.625 | 10.890 |
| warm/on/p2-true | child0.workerCreateToModuleMs | 30 | 8.998 | 10.245 |
| warm/on/p2-true | child0.readyToExitMs | 30 | 3.662 | 4.155 |
| warm/on/p2-true | child0.runMs | 30 | 3.345 | 3.805 |
| warm/on/p2-true | child0.closeMs | 30 | 0.255 | 0.395 |
| warm/on/p2-true | child0.exitToUiMs | 30 | 0.108 | 0.385 |
| warm/on/p2-true | child0.readMs | 30 | 1.130 | 2.280 |
| warm/on/p2-true | child0.adapterMs | 30 | 0.823 | 1.030 |
| warm/on/p2-true | child0.component.engineLoadMs | 30 | 7.740 | 9.290 |
| warm/on/p2-true | child0.component.prepareMs | 30 | 13.930 | 17.630 |
| warm/on/p2-true | child0.component.instantiateMs | 30 | 4.900 | 5.655 |
| warm/on/p2-true | child0.loadMs | 30 | 27.110 | 32.090 |
| warm/on/p1-echo | opfs.getDirectoryHandleMs | 30 | 0.450 | 1.865 |
| warm/on/p1-echo | opfs.getFileHandleMs | 30 | 0.328 | 0.915 |
| warm/on/p1-echo | shellPromptToDomMs | 30 | 0.780 | 3.125 |
| warm/on/p1-echo | localEchoDomAndScrollMs | 30 | 1.010 | 1.905 |
| warm/on/p1-echo | outputDomAndScrollMs | 30 | 2.620 | 4.385 |
| warm/on/p1-echo | opfsOpenMs | 30 | 0.935 | 2.535 |
| warm/on/p1-echo | shellPreparationMs | 30 | 0.988 | 2.790 |
| warm/on/p1-echo | shellToFirstSpawnMs | 30 | 1.022 | 2.825 |
| warm/on/p1-echo | firstSpawnToLastExitMs | 30 | 15.835 | 18.735 |
| warm/on/p1-echo | lastExitToPromptDomMs | 30 | 2.310 | 3.885 |
| warm/on/p1-echo | child0.durationMs | 30 | 15.585 | 18.250 |
| warm/on/p1-echo | child0.requestToCoreMs | 30 | 0.295 | 0.700 |
| warm/on/p1-echo | child0.coreToStartMs | 30 | 0.165 | 0.220 |
| warm/on/p1-echo | child0.workerStartupMs | 30 | 12.365 | 15.690 |
| warm/on/p1-echo | child0.startToReceiveMs | 30 | 9.450 | 12.260 |
| warm/on/p1-echo | child0.workerCreateToModuleMs | 30 | 8.980 | 11.530 |
| warm/on/p1-echo | child0.readyToExitMs | 30 | 2.490 | 3.410 |
| warm/on/p1-echo | child0.runMs | 30 | 1.887 | 2.815 |
| warm/on/p1-echo | child0.closeMs | 30 | 0.155 | 0.285 |
| warm/on/p1-echo | child0.exitToUiMs | 30 | 0.693 | 2.805 |
| warm/on/p1-echo | child0.readMs | 30 | 1.020 | 1.225 |
| warm/on/p1-echo | child0.adapterMs | 30 | 0.820 | 0.980 |
| warm/on/p1-echo | child0.compileMs | 30 | 0.438 | 0.545 |
| warm/on/p1-echo | child0.instantiateMs | 30 | 0.475 | 0.595 |
| warm/on/p2-echo | opfs.getDirectoryHandleMs | 30 | 0.390 | 1.545 |
| warm/on/p2-echo | opfs.getFileHandleMs | 30 | 0.295 | 0.835 |
| warm/on/p2-echo | shellPromptToDomMs | 30 | 1.860 | 3.295 |
| warm/on/p2-echo | localEchoDomAndScrollMs | 30 | 0.970 | 2.230 |
| warm/on/p2-echo | outputDomAndScrollMs | 30 | 3.195 | 4.140 |
| warm/on/p2-echo | opfsOpenMs | 30 | 0.848 | 2.000 |
| warm/on/p2-echo | shellPreparationMs | 30 | 0.892 | 2.025 |
| warm/on/p2-echo | shellToFirstSpawnMs | 30 | 0.917 | 2.050 |
| warm/on/p2-echo | firstSpawnToLastExitMs | 30 | 45.350 | 53.140 |
| warm/on/p2-echo | lastExitToPromptDomMs | 30 | 2.515 | 4.435 |
| warm/on/p2-echo | child0.durationMs | 30 | 44.840 | 51.865 |
| warm/on/p2-echo | child0.requestToCoreMs | 30 | 0.280 | 1.345 |
| warm/on/p2-echo | child0.coreToStartMs | 30 | 0.162 | 0.265 |
| warm/on/p2-echo | child0.workerStartupMs | 30 | 39.503 | 44.410 |
| warm/on/p2-echo | child0.startToReceiveMs | 30 | 9.605 | 11.530 |
| warm/on/p2-echo | child0.workerCreateToModuleMs | 30 | 9.055 | 10.840 |
| warm/on/p2-echo | child0.readyToExitMs | 30 | 5.180 | 6.300 |
| warm/on/p2-echo | child0.runMs | 30 | 4.628 | 5.945 |
| warm/on/p2-echo | child0.closeMs | 30 | 0.233 | 0.335 |
| warm/on/p2-echo | child0.exitToUiMs | 30 | 0.903 | 2.685 |
| warm/on/p2-echo | child0.readMs | 30 | 1.035 | 2.415 |
| warm/on/p2-echo | child0.adapterMs | 30 | 0.843 | 1.315 |
| warm/on/p2-echo | child0.component.engineLoadMs | 30 | 8.233 | 10.085 |
| warm/on/p2-echo | child0.component.prepareMs | 30 | 13.965 | 16.845 |
| warm/on/p2-echo | child0.component.instantiateMs | 30 | 4.858 | 5.790 |
| warm/on/p2-echo | child0.loadMs | 30 | 27.427 | 31.580 |
| warm/on/file | opfs.getDirectoryHandleMs | 30 | 0.805 | 1.485 |
| warm/on/file | opfs.getFileHandleMs | 30 | 0.647 | 1.665 |
| warm/on/file | opfs.getFileMs | 30 | 1.245 | 2.180 |
| warm/on/file | opfs.arrayBufferMs | 30 | 0.945 | 2.245 |
| warm/on/file | shellPromptToDomMs | 30 | 0.132 | 1.375 |
| warm/on/file | localEchoDomAndScrollMs | 30 | 0.970 | 2.380 |
| warm/on/file | outputDomAndScrollMs | 30 | 1.948 | 2.940 |
| warm/on/file | opfsOpenMs | 30 | 1.775 | 2.900 |
| warm/on/file | shellPreparationMs | 30 | 1.005 | 1.885 |
| warm/on/file | shellToFirstSpawnMs | 30 | 1.065 | 1.945 |
| warm/on/file | firstSpawnToLastExitMs | 30 | 17.742 | 21.805 |
| warm/on/file | lastExitToPromptDomMs | 30 | 0.748 | 1.660 |
| warm/on/file | child0.durationMs | 30 | 17.498 | 21.440 |
| warm/on/file | child0.requestToCoreMs | 30 | 0.257 | 0.825 |
| warm/on/file | child0.coreToStartMs | 30 | 0.167 | 0.385 |
| warm/on/file | child0.workerStartupMs | 30 | 12.550 | 14.160 |
| warm/on/file | child0.startToReceiveMs | 30 | 9.520 | 11.080 |
| warm/on/file | child0.workerCreateToModuleMs | 30 | 9.017 | 10.495 |
| warm/on/file | child0.readyToExitMs | 30 | 4.940 | 7.910 |
| warm/on/file | child0.runMs | 30 | 4.575 | 7.690 |
| warm/on/file | child0.closeMs | 30 | 0.160 | 0.320 |
| warm/on/file | child0.exitToUiMs | 30 | 0.100 | 0.835 |
| warm/on/file | child0.readMs | 30 | 1.000 | 1.270 |
| warm/on/file | child0.adapterMs | 30 | 0.813 | 0.985 |
| warm/on/file | child0.compileMs | 30 | 0.395 | 0.470 |
| warm/on/file | child0.instantiateMs | 30 | 0.483 | 0.605 |
| warm/on/pipeline | opfs.getDirectoryHandleMs | 30 | 2.355 | 3.820 |
| warm/on/pipeline | opfs.getFileHandleMs | 30 | 1.930 | 3.205 |
| warm/on/pipeline | opfs.getFileMs | 30 | 2.297 | 4.310 |
| warm/on/pipeline | opfs.arrayBufferMs | 30 | 2.177 | 3.375 |
| warm/on/pipeline | shellPromptToDomMs | 30 | 0.982 | 3.085 |
| warm/on/pipeline | localEchoDomAndScrollMs | 30 | 0.930 | 1.805 |
| warm/on/pipeline | outputDomAndScrollMs | 30 | 2.822 | 4.250 |
| warm/on/pipeline | opfsOpenMs | 30 | 4.667 | 7.310 |
| warm/on/pipeline | shellPreparationMs | 30 | 2.897 | 5.085 |
| warm/on/pipeline | shellToFirstSpawnMs | 30 | 1.235 | 2.795 |
| warm/on/pipeline | firstSpawnToLastExitMs | 30 | 43.912 | 47.825 |
| warm/on/pipeline | lastExitToPromptDomMs | 30 | 1.788 | 3.450 |
| warm/on/pipeline | child0.durationMs | 30 | 21.228 | 23.890 |
| warm/on/pipeline | child1.durationMs | 30 | 15.995 | 22.215 |
| warm/on/pipeline | child2.durationMs | 30 | 14.775 | 17.535 |
| warm/on/pipeline | child0.requestToCoreMs | 30 | 0.240 | 0.715 |
| warm/on/pipeline | child0.coreToStartMs | 30 | 0.150 | 0.240 |
| warm/on/pipeline | child0.workerStartupMs | 30 | 12.073 | 13.995 |
| warm/on/pipeline | child0.startToReceiveMs | 30 | 9.050 | 11.045 |
| warm/on/pipeline | child0.workerCreateToModuleMs | 30 | 8.517 | 10.550 |
| warm/on/pipeline | child0.readyToExitMs | 30 | 9.075 | 10.785 |
| warm/on/pipeline | child0.runMs | 30 | 8.712 | 9.890 |
| warm/on/pipeline | child0.closeMs | 30 | 0.195 | 0.385 |
| warm/on/pipeline | child0.exitToUiMs | 30 | 0.120 | 1.525 |
| warm/on/pipeline | child0.readMs | 30 | 0.935 | 1.160 |
| warm/on/pipeline | child0.adapterMs | 30 | 0.825 | 0.940 |
| warm/on/pipeline | child0.compileMs | 30 | 0.415 | 0.615 |
| warm/on/pipeline | child0.instantiateMs | 30 | 0.475 | 0.685 |
| warm/on/pipeline | child1.requestToCoreMs | 30 | 0.247 | 0.560 |
| warm/on/pipeline | child1.coreToStartMs | 30 | 0.130 | 0.200 |
| warm/on/pipeline | child1.workerStartupMs | 30 | 13.715 | 15.525 |
| warm/on/pipeline | child1.startToReceiveMs | 30 | 10.460 | 12.385 |
| warm/on/pipeline | child1.workerCreateToModuleMs | 30 | 9.563 | 11.665 |
| warm/on/pipeline | child1.readyToExitMs | 30 | 2.275 | 4.040 |
| warm/on/pipeline | child1.runMs | 30 | 1.767 | 2.960 |
| warm/on/pipeline | child1.closeMs | 30 | 0.157 | 0.685 |
| warm/on/pipeline | child1.exitToUiMs | 30 | 0.112 | 1.360 |
| warm/on/pipeline | child1.readMs | 30 | 0.930 | 2.550 |
| warm/on/pipeline | child1.adapterMs | 30 | 0.785 | 1.020 |
| warm/on/pipeline | child1.compileMs | 30 | 0.410 | 0.505 |
| warm/on/pipeline | child1.instantiateMs | 30 | 0.480 | 0.590 |
| warm/on/pipeline | child2.requestToCoreMs | 30 | 0.220 | 0.635 |
| warm/on/pipeline | child2.coreToStartMs | 30 | 0.132 | 0.210 |
| warm/on/pipeline | child2.workerStartupMs | 30 | 11.970 | 14.675 |
| warm/on/pipeline | child2.startToReceiveMs | 30 | 9.005 | 11.635 |
| warm/on/pipeline | child2.workerCreateToModuleMs | 30 | 8.430 | 11.020 |
| warm/on/pipeline | child2.readyToExitMs | 30 | 2.423 | 3.415 |
| warm/on/pipeline | child2.runMs | 30 | 1.665 | 2.665 |
| warm/on/pipeline | child2.closeMs | 30 | 0.137 | 0.210 |
| warm/on/pipeline | child2.exitToUiMs | 30 | 1.365 | 3.200 |
| warm/on/pipeline | child2.readMs | 30 | 0.955 | 2.045 |
| warm/on/pipeline | child2.adapterMs | 30 | 0.793 | 1.140 |
| warm/on/pipeline | child2.compileMs | 30 | 0.400 | 0.515 |
| warm/on/pipeline | child2.instantiateMs | 30 | 0.468 | 0.570 |
| warm/on/builtin | shellPromptToDomMs | 30 | 11.400 | 14.085 |
| warm/on/builtin | localEchoDomAndScrollMs | 30 | 0.915 | 1.285 |
| warm/on/builtin | outputDomAndScrollMs | 30 | 0.670 | 0.915 |
| warm/on/builtin | opfsOpenMs | 30 | 0.000 | 0.000 |
| warm/on/builtin | shellPreparationMs | 30 | 0.000 | 0.000 |
| warm/on/builtin | shellToPromptDomMs | 30 | 11.932 | 14.285 |
| warm/off/p1-true | child0.durationMs | 30 | 13.705 | 17.330 |
| warm/off/p2-true | child0.durationMs | 30 | 42.797 | 50.605 |
| warm/off/p1-echo | child0.durationMs | 30 | 15.270 | 18.190 |
| warm/off/p2-echo | child0.durationMs | 30 | 45.073 | 53.780 |
| warm/off/file | child0.durationMs | 30 | 16.750 | 19.875 |
| warm/off/pipeline | child0.durationMs | 30 | 19.845 | 22.375 |
| warm/off/pipeline | child1.durationMs | 30 | 15.162 | 19.705 |
| warm/off/pipeline | child2.durationMs | 30 | 14.732 | 18.635 |

Do not add nested intervals, per-child startup/run/stdio/wait durations, or drawing time. Only input→shell, shell→first spawn, first spawn→last EXIT and last EXIT→prompt DOM form the outer wall-time partition (builtin uses shell→prompt).

See docs/benchmarks-e2e.md for reproduction, cache/clock definitions, trace capture and comparison to the separate Worker benchmark.
