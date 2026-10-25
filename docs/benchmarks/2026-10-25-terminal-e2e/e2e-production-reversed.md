# Terminal E2E benchmark

Revision: bfb5f342ecc6930a4b36ab21a7368ad3a44c28d8; dirty: false; production; jsco; Chromium 154.0.8037.57; headless.
AMD EPYC 9V74 80-Core Processor; linux/x64; Node v24.19.0; Playwright 1.56.1.
0 failures; raw JSON retains first runs, warmups, results, timelines, per-child EXIT/durationMs, clock checks and all summary metrics.

Durations in ms. ON/OFF refers to detailed recording; both use command correlation. Each condition has its own sessions. rAF is not a paint-completion measurement.

| Condition/detail/case | N / attempted | Failures | DOM median | DOM p95 | Min | Max | Mean | Stddev | Frame median | First output median | EXIT median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| warm/off/p1-true | 30 / 30 | 0 | 16.590 | 19.820 | 14.465 | 20.385 | 16.851 | 1.616 | 24.677 | — | 15.670 |
| warm/off/p2-true | 30 / 30 | 0 | 46.922 | 56.130 | 40.350 | 56.380 | 47.918 | 4.735 | 57.580 | — | 46.228 |
| warm/off/p1-echo | 30 / 30 | 0 | 19.320 | 23.120 | 15.775 | 29.045 | 19.282 | 2.385 | 24.965 | 16.315 | 17.960 |
| warm/off/p2-echo | 30 / 30 | 0 | 50.287 | 60.805 | 42.520 | 60.930 | 50.831 | 5.725 | 58.627 | 46.515 | 48.925 |
| warm/off/file | 30 / 30 | 0 | 19.448 | 25.990 | 16.130 | 26.030 | 20.205 | 2.658 | 24.787 | 17.483 | 19.022 |
| warm/off/pipeline | 30 / 30 | 0 | 49.068 | 62.770 | 40.395 | 63.410 | 49.802 | 5.248 | 58.203 | 46.127 | 48.973 |
| warm/off/builtin | 30 / 30 | 0 | 8.350 | 10.720 | 2.840 | 16.095 | 8.092 | 2.543 | 23.765 | — | — |
| warm/on/p1-true | 30 / 30 | 0 | 17.432 | 24.005 | 14.365 | 32.665 | 18.243 | 3.380 | 24.602 | — | 16.850 |
| warm/on/p2-true | 30 / 30 | 0 | 47.078 | 70.210 | 42.655 | 77.360 | 49.150 | 7.436 | 54.993 | — | 46.455 |
| warm/on/p1-echo | 30 / 30 | 0 | 20.945 | 31.840 | 16.265 | 33.810 | 21.260 | 3.880 | 23.588 | 17.050 | 19.647 |
| warm/on/p2-echo | 30 / 30 | 0 | 51.130 | 61.415 | 45.375 | 63.490 | 51.574 | 4.934 | 54.688 | 47.423 | 49.813 |
| warm/on/file | 30 / 30 | 0 | 22.118 | 30.475 | 18.140 | 55.210 | 23.206 | 6.474 | 33.250 | 18.783 | 21.010 |
| warm/on/pipeline | 30 / 30 | 0 | 50.125 | 59.135 | 41.485 | 63.825 | 50.866 | 5.280 | 55.048 | 47.330 | 50.003 |
| warm/on/builtin | 30 / 30 | 0 | 12.355 | 14.730 | 3.355 | 14.895 | 11.388 | 3.439 | 28.185 | — | — |

## Diagnostic intervals (median / p95, ms)

| Condition/detail/case | Metric | N | Median | p95 |
| --- | --- | ---: | ---: | ---: |
| warm/off/p1-true | child0.durationMs | 30 | 14.142 | 17.170 |
| warm/off/p2-true | child0.durationMs | 30 | 44.357 | 53.260 |
| warm/off/p1-echo | child0.durationMs | 30 | 15.430 | 17.525 |
| warm/off/p2-echo | child0.durationMs | 30 | 44.950 | 54.415 |
| warm/off/file | child0.durationMs | 30 | 17.680 | 21.010 |
| warm/off/pipeline | child0.durationMs | 30 | 20.305 | 26.450 |
| warm/off/pipeline | child1.durationMs | 30 | 16.640 | 20.585 |
| warm/off/pipeline | child2.durationMs | 30 | 14.960 | 22.715 |
| warm/on/p1-true | opfs.getDirectoryHandleMs | 30 | 0.417 | 1.445 |
| warm/on/p1-true | opfs.getFileHandleMs | 30 | 0.320 | 0.665 |
| warm/on/p1-true | shellPromptToDomMs | 30 | 0.170 | 0.630 |
| warm/on/p1-true | localEchoDomAndScrollMs | 30 | 1.052 | 1.900 |
| warm/on/p1-true | outputDomAndScrollMs | 30 | 1.133 | 1.975 |
| warm/on/p1-true | opfsOpenMs | 30 | 0.770 | 1.830 |
| warm/on/p1-true | shellPreparationMs | 30 | 0.840 | 1.865 |
| warm/on/p1-true | shellToFirstSpawnMs | 30 | 0.865 | 2.135 |
| warm/on/p1-true | firstSpawnToLastExitMs | 30 | 15.180 | 22.140 |
| warm/on/p1-true | lastExitToPromptDomMs | 30 | 0.728 | 1.515 |
| warm/on/p1-true | child0.durationMs | 30 | 14.795 | 21.935 |
| warm/on/p1-true | child0.requestToCoreMs | 30 | 0.287 | 0.590 |
| warm/on/p1-true | child0.coreToStartMs | 30 | 0.192 | 0.270 |
| warm/on/p1-true | child0.workerStartupMs | 30 | 13.223 | 19.120 |
| warm/on/p1-true | child0.startToReceiveMs | 30 | 9.932 | 14.015 |
| warm/on/p1-true | child0.workerCreateToModuleMs | 30 | 9.325 | 11.610 |
| warm/on/p1-true | child0.readyToExitMs | 30 | 1.495 | 2.105 |
| warm/on/p1-true | child0.runMs | 30 | 1.165 | 1.495 |
| warm/on/p1-true | child0.closeMs | 30 | 0.195 | 0.285 |
| warm/on/p1-true | child0.exitToUiMs | 30 | 0.115 | 0.415 |
| warm/on/p1-true | child0.readMs | 30 | 0.998 | 1.875 |
| warm/on/p1-true | child0.adapterMs | 30 | 0.878 | 2.400 |
| warm/on/p1-true | child0.compileMs | 30 | 0.425 | 0.580 |
| warm/on/p1-true | child0.instantiateMs | 30 | 0.503 | 0.655 |
| warm/on/p2-true | opfs.getDirectoryHandleMs | 30 | 0.392 | 1.440 |
| warm/on/p2-true | opfs.getFileHandleMs | 30 | 0.282 | 0.715 |
| warm/on/p2-true | shellPromptToDomMs | 30 | 0.167 | 1.085 |
| warm/on/p2-true | localEchoDomAndScrollMs | 30 | 1.157 | 2.240 |
| warm/on/p2-true | outputDomAndScrollMs | 30 | 1.263 | 2.340 |
| warm/on/p2-true | opfsOpenMs | 30 | 0.732 | 2.115 |
| warm/on/p2-true | shellPreparationMs | 30 | 0.810 | 2.165 |
| warm/on/p2-true | shellToFirstSpawnMs | 30 | 0.845 | 2.210 |
| warm/on/p2-true | firstSpawnToLastExitMs | 30 | 44.968 | 65.860 |
| warm/on/p2-true | lastExitToPromptDomMs | 30 | 0.590 | 2.805 |
| warm/on/p2-true | child0.durationMs | 30 | 44.738 | 65.550 |
| warm/on/p2-true | child0.requestToCoreMs | 30 | 0.295 | 0.430 |
| warm/on/p2-true | child0.coreToStartMs | 30 | 0.165 | 0.275 |
| warm/on/p2-true | child0.workerStartupMs | 30 | 40.500 | 58.975 |
| warm/on/p2-true | child0.startToReceiveMs | 30 | 9.965 | 12.525 |
| warm/on/p2-true | child0.workerCreateToModuleMs | 30 | 9.392 | 11.860 |
| warm/on/p2-true | child0.readyToExitMs | 30 | 4.005 | 4.930 |
| warm/on/p2-true | child0.runMs | 30 | 3.547 | 4.240 |
| warm/on/p2-true | child0.closeMs | 30 | 0.273 | 0.440 |
| warm/on/p2-true | child0.exitToUiMs | 30 | 0.110 | 0.760 |
| warm/on/p2-true | child0.readMs | 30 | 1.135 | 4.325 |
| warm/on/p2-true | child0.adapterMs | 30 | 0.870 | 1.030 |
| warm/on/p2-true | child0.component.engineLoadMs | 30 | 8.295 | 10.680 |
| warm/on/p2-true | child0.component.prepareMs | 30 | 13.983 | 17.460 |
| warm/on/p2-true | child0.component.instantiateMs | 30 | 4.983 | 6.255 |
| warm/on/p2-true | child0.loadMs | 30 | 28.318 | 35.965 |
| warm/on/p1-echo | opfs.getDirectoryHandleMs | 30 | 0.448 | 1.380 |
| warm/on/p1-echo | opfs.getFileHandleMs | 30 | 0.305 | 0.855 |
| warm/on/p1-echo | shellPromptToDomMs | 30 | 1.492 | 4.020 |
| warm/on/p1-echo | localEchoDomAndScrollMs | 30 | 0.965 | 2.010 |
| warm/on/p1-echo | outputDomAndScrollMs | 30 | 2.873 | 6.355 |
| warm/on/p1-echo | opfsOpenMs | 30 | 0.833 | 1.995 |
| warm/on/p1-echo | shellPreparationMs | 30 | 0.873 | 2.040 |
| warm/on/p1-echo | shellToFirstSpawnMs | 30 | 0.897 | 2.070 |
| warm/on/p1-echo | firstSpawnToLastExitMs | 30 | 16.212 | 27.875 |
| warm/on/p1-echo | lastExitToPromptDomMs | 30 | 2.458 | 5.230 |
| warm/on/p1-echo | child0.durationMs | 30 | 15.830 | 27.695 |
| warm/on/p1-echo | child0.requestToCoreMs | 30 | 0.285 | 0.780 |
| warm/on/p1-echo | child0.coreToStartMs | 30 | 0.160 | 0.275 |
| warm/on/p1-echo | child0.workerStartupMs | 30 | 13.130 | 25.375 |
| warm/on/p1-echo | child0.startToReceiveMs | 30 | 10.015 | 16.490 |
| warm/on/p1-echo | child0.workerCreateToModuleMs | 30 | 9.438 | 16.110 |
| warm/on/p1-echo | child0.readyToExitMs | 30 | 2.365 | 5.110 |
| warm/on/p1-echo | child0.runMs | 30 | 1.845 | 3.195 |
| warm/on/p1-echo | child0.closeMs | 30 | 0.150 | 0.255 |
| warm/on/p1-echo | child0.exitToUiMs | 30 | 1.220 | 4.110 |
| warm/on/p1-echo | child0.readMs | 30 | 1.027 | 1.635 |
| warm/on/p1-echo | child0.adapterMs | 30 | 0.815 | 3.805 |
| warm/on/p1-echo | child0.compileMs | 30 | 0.420 | 0.530 |
| warm/on/p1-echo | child0.instantiateMs | 30 | 0.498 | 0.600 |
| warm/on/p2-echo | opfs.getDirectoryHandleMs | 30 | 0.378 | 1.560 |
| warm/on/p2-echo | opfs.getFileHandleMs | 30 | 0.280 | 2.915 |
| warm/on/p2-echo | shellPromptToDomMs | 30 | 1.432 | 4.365 |
| warm/on/p2-echo | localEchoDomAndScrollMs | 30 | 1.155 | 2.285 |
| warm/on/p2-echo | outputDomAndScrollMs | 30 | 3.243 | 4.410 |
| warm/on/p2-echo | opfsOpenMs | 30 | 0.698 | 3.880 |
| warm/on/p2-echo | shellPreparationMs | 30 | 0.748 | 4.070 |
| warm/on/p2-echo | shellToFirstSpawnMs | 30 | 0.800 | 4.215 |
| warm/on/p2-echo | firstSpawnToLastExitMs | 30 | 47.870 | 54.005 |
| warm/on/p2-echo | lastExitToPromptDomMs | 30 | 2.490 | 4.675 |
| warm/on/p2-echo | child0.durationMs | 30 | 47.390 | 53.450 |
| warm/on/p2-echo | child0.requestToCoreMs | 30 | 0.268 | 0.660 |
| warm/on/p2-echo | child0.coreToStartMs | 30 | 0.170 | 0.290 |
| warm/on/p2-echo | child0.workerStartupMs | 30 | 40.525 | 47.235 |
| warm/on/p2-echo | child0.startToReceiveMs | 30 | 9.800 | 12.090 |
| warm/on/p2-echo | child0.workerCreateToModuleMs | 30 | 9.282 | 11.055 |
| warm/on/p2-echo | child0.readyToExitMs | 30 | 5.433 | 7.570 |
| warm/on/p2-echo | child0.runMs | 30 | 4.745 | 6.735 |
| warm/on/p2-echo | child0.closeMs | 30 | 0.238 | 0.310 |
| warm/on/p2-echo | child0.exitToUiMs | 30 | 0.610 | 3.065 |
| warm/on/p2-echo | child0.readMs | 30 | 1.115 | 2.475 |
| warm/on/p2-echo | child0.adapterMs | 30 | 0.862 | 1.115 |
| warm/on/p2-echo | child0.component.engineLoadMs | 30 | 8.408 | 10.730 |
| warm/on/p2-echo | child0.component.prepareMs | 30 | 14.432 | 19.280 |
| warm/on/p2-echo | child0.component.instantiateMs | 30 | 4.973 | 5.910 |
| warm/on/p2-echo | child0.loadMs | 30 | 28.083 | 35.595 |
| warm/on/file | opfs.getDirectoryHandleMs | 30 | 0.848 | 2.185 |
| warm/on/file | opfs.getFileHandleMs | 30 | 0.625 | 1.765 |
| warm/on/file | opfs.getFileMs | 30 | 1.303 | 2.235 |
| warm/on/file | opfs.arrayBufferMs | 30 | 0.895 | 2.200 |
| warm/on/file | shellPromptToDomMs | 30 | 0.318 | 1.200 |
| warm/on/file | localEchoDomAndScrollMs | 30 | 1.110 | 2.550 |
| warm/on/file | outputDomAndScrollMs | 30 | 1.987 | 3.760 |
| warm/on/file | opfsOpenMs | 30 | 1.870 | 3.505 |
| warm/on/file | shellPreparationMs | 30 | 0.950 | 2.540 |
| warm/on/file | shellToFirstSpawnMs | 30 | 0.982 | 2.575 |
| warm/on/file | firstSpawnToLastExitMs | 30 | 19.443 | 27.825 |
| warm/on/file | lastExitToPromptDomMs | 30 | 0.910 | 2.565 |
| warm/on/file | child0.durationMs | 30 | 19.163 | 27.605 |
| warm/on/file | child0.requestToCoreMs | 30 | 0.312 | 0.610 |
| warm/on/file | child0.coreToStartMs | 30 | 0.173 | 0.275 |
| warm/on/file | child0.workerStartupMs | 30 | 13.402 | 21.125 |
| warm/on/file | child0.startToReceiveMs | 30 | 9.950 | 15.140 |
| warm/on/file | child0.workerCreateToModuleMs | 30 | 9.258 | 13.980 |
| warm/on/file | child0.readyToExitMs | 30 | 5.205 | 7.120 |
| warm/on/file | child0.runMs | 30 | 4.773 | 6.645 |
| warm/on/file | child0.closeMs | 30 | 0.165 | 0.230 |
| warm/on/file | child0.exitToUiMs | 30 | 0.110 | 1.230 |
| warm/on/file | child0.readMs | 30 | 1.060 | 3.355 |
| warm/on/file | child0.adapterMs | 30 | 0.827 | 1.085 |
| warm/on/file | child0.compileMs | 30 | 0.422 | 1.265 |
| warm/on/file | child0.instantiateMs | 30 | 0.495 | 0.680 |
| warm/on/pipeline | opfs.getDirectoryHandleMs | 30 | 3.223 | 4.995 |
| warm/on/pipeline | opfs.getFileHandleMs | 30 | 1.900 | 5.425 |
| warm/on/pipeline | opfs.getFileMs | 30 | 1.870 | 4.285 |
| warm/on/pipeline | opfs.arrayBufferMs | 30 | 1.815 | 3.675 |
| warm/on/pipeline | shellPromptToDomMs | 30 | 0.915 | 2.695 |
| warm/on/pipeline | localEchoDomAndScrollMs | 30 | 0.983 | 1.715 |
| warm/on/pipeline | outputDomAndScrollMs | 30 | 2.552 | 3.670 |
| warm/on/pipeline | opfsOpenMs | 30 | 5.425 | 10.110 |
| warm/on/pipeline | shellPreparationMs | 30 | 3.263 | 6.775 |
| warm/on/pipeline | shellToFirstSpawnMs | 30 | 1.458 | 2.665 |
| warm/on/pipeline | firstSpawnToLastExitMs | 30 | 46.700 | 55.380 |
| warm/on/pipeline | lastExitToPromptDomMs | 30 | 1.725 | 3.170 |
| warm/on/pipeline | child0.durationMs | 30 | 22.215 | 31.470 |
| warm/on/pipeline | child1.durationMs | 30 | 16.657 | 21.370 |
| warm/on/pipeline | child2.durationMs | 30 | 15.532 | 19.145 |
| warm/on/pipeline | child0.requestToCoreMs | 30 | 0.290 | 0.540 |
| warm/on/pipeline | child0.coreToStartMs | 30 | 0.145 | 0.225 |
| warm/on/pipeline | child0.workerStartupMs | 30 | 12.708 | 16.480 |
| warm/on/pipeline | child0.startToReceiveMs | 30 | 9.515 | 13.230 |
| warm/on/pipeline | child0.workerCreateToModuleMs | 30 | 8.915 | 12.640 |
| warm/on/pipeline | child0.readyToExitMs | 30 | 9.042 | 13.405 |
| warm/on/pipeline | child0.runMs | 30 | 8.478 | 12.570 |
| warm/on/pipeline | child0.closeMs | 30 | 0.208 | 0.510 |
| warm/on/pipeline | child0.exitToUiMs | 30 | 0.120 | 2.125 |
| warm/on/pipeline | child0.readMs | 30 | 0.972 | 2.095 |
| warm/on/pipeline | child0.adapterMs | 30 | 0.858 | 1.890 |
| warm/on/pipeline | child0.compileMs | 30 | 0.380 | 0.510 |
| warm/on/pipeline | child0.instantiateMs | 30 | 0.488 | 0.630 |
| warm/on/pipeline | child1.requestToCoreMs | 30 | 0.253 | 0.500 |
| warm/on/pipeline | child1.coreToStartMs | 30 | 0.130 | 0.215 |
| warm/on/pipeline | child1.workerStartupMs | 30 | 13.815 | 18.420 |
| warm/on/pipeline | child1.startToReceiveMs | 30 | 10.278 | 12.330 |
| warm/on/pipeline | child1.workerCreateToModuleMs | 30 | 9.585 | 11.675 |
| warm/on/pipeline | child1.readyToExitMs | 30 | 2.250 | 5.030 |
| warm/on/pipeline | child1.runMs | 30 | 1.747 | 4.195 |
| warm/on/pipeline | child1.closeMs | 30 | 0.155 | 0.580 |
| warm/on/pipeline | child1.exitToUiMs | 30 | 0.152 | 1.920 |
| warm/on/pipeline | child1.readMs | 30 | 0.978 | 3.785 |
| warm/on/pipeline | child1.adapterMs | 30 | 0.815 | 2.645 |
| warm/on/pipeline | child1.compileMs | 30 | 0.412 | 0.575 |
| warm/on/pipeline | child1.instantiateMs | 30 | 0.500 | 0.585 |
| warm/on/pipeline | child2.requestToCoreMs | 30 | 0.245 | 0.725 |
| warm/on/pipeline | child2.coreToStartMs | 30 | 0.138 | 0.275 |
| warm/on/pipeline | child2.workerStartupMs | 30 | 12.525 | 16.545 |
| warm/on/pipeline | child2.startToReceiveMs | 30 | 9.165 | 13.090 |
| warm/on/pipeline | child2.workerCreateToModuleMs | 30 | 8.603 | 11.895 |
| warm/on/pipeline | child2.readyToExitMs | 30 | 2.427 | 3.820 |
| warm/on/pipeline | child2.runMs | 30 | 1.718 | 3.120 |
| warm/on/pipeline | child2.closeMs | 30 | 0.155 | 0.285 |
| warm/on/pipeline | child2.exitToUiMs | 30 | 1.172 | 2.730 |
| warm/on/pipeline | child2.readMs | 30 | 0.940 | 2.005 |
| warm/on/pipeline | child2.adapterMs | 30 | 0.827 | 1.395 |
| warm/on/pipeline | child2.compileMs | 30 | 0.438 | 0.675 |
| warm/on/pipeline | child2.instantiateMs | 30 | 0.483 | 0.565 |
| warm/on/builtin | shellPromptToDomMs | 30 | 11.850 | 14.440 |
| warm/on/builtin | localEchoDomAndScrollMs | 30 | 0.973 | 1.500 |
| warm/on/builtin | outputDomAndScrollMs | 30 | 0.728 | 2.040 |
| warm/on/builtin | opfsOpenMs | 30 | 0.000 | 0.000 |
| warm/on/builtin | shellPreparationMs | 30 | 0.000 | 0.000 |
| warm/on/builtin | shellToPromptDomMs | 30 | 12.083 | 14.560 |

Do not add nested intervals, per-child startup/run/stdio/wait durations, or drawing time. Only input→shell, shell→first spawn, first spawn→last EXIT and last EXIT→prompt DOM form the outer wall-time partition (builtin uses shell→prompt).

See docs/benchmarks-e2e.md for reproduction, cache/clock definitions, trace capture and comparison to the separate Worker benchmark.
