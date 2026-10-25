# Terminal E2E benchmark

Revision: bfb5f342ecc6930a4b36ab21a7368ad3a44c28d8; dirty: false; production; jsco; Chromium 154.0.8037.57; headless.
AMD EPYC 9V74 80-Core Processor; linux/x64; Node v24.19.0; Playwright 1.56.1.
0 failures; raw JSON retains first runs, warmups, results, timelines, per-child EXIT/durationMs, clock checks and all summary metrics.

Durations in ms. ON/OFF refers to detailed recording; both use command correlation. Each condition has its own sessions. rAF is not a paint-completion measurement.

| Condition/detail/case | N / attempted | Failures | DOM median | DOM p95 | Min | Max | Mean | Stddev | Frame median | First output median | EXIT median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| warm/on/p1-true | 1 / 1 | 0 | 16.695 | 16.695 | 16.695 | 16.695 | 16.695 | 0.000 | 26.635 | — | 15.635 |
| warm/on/p2-true | 1 / 1 | 0 | 45.315 | 45.315 | 45.315 | 45.315 | 45.315 | 0.000 | 53.960 | — | 43.995 |
| warm/on/p1-echo | 1 / 1 | 0 | 17.180 | 17.180 | 17.180 | 17.180 | 17.180 | 0.000 | 20.275 | 16.065 | 16.505 |
| warm/on/p2-echo | 1 / 1 | 0 | 45.900 | 45.900 | 45.900 | 45.900 | 45.900 | 0.000 | 53.690 | 43.570 | 44.695 |
| warm/on/file | 1 / 1 | 0 | 21.200 | 21.200 | 21.200 | 21.200 | 21.200 | 0.000 | 36.380 | 17.815 | 18.875 |
| warm/on/pipeline | 1 / 1 | 0 | 48.265 | 48.265 | 48.265 | 48.265 | 48.265 | 0.000 | 52.260 | 47.445 | 47.880 |
| warm/on/builtin | 1 / 1 | 0 | 11.460 | 11.460 | 11.460 | 11.460 | 11.460 | 0.000 | 27.395 | — | — |

## Diagnostic intervals (median / p95, ms)

| Condition/detail/case | Metric | N | Median | p95 |
| --- | --- | ---: | ---: | ---: |
| warm/on/p1-true | opfs.getDirectoryHandleMs | 1 | 1.050 | 1.050 |
| warm/on/p1-true | opfs.getFileHandleMs | 1 | 0.370 | 0.370 |
| warm/on/p1-true | shellPromptToDomMs | 1 | 0.690 | 0.690 |
| warm/on/p1-true | localEchoDomAndScrollMs | 1 | 0.325 | 0.325 |
| warm/on/p1-true | outputDomAndScrollMs | 1 | 0.400 | 0.400 |
| warm/on/p1-true | opfsOpenMs | 1 | 1.520 | 1.520 |
| warm/on/p1-true | shellPreparationMs | 1 | 1.610 | 1.610 |
| warm/on/p1-true | shellToFirstSpawnMs | 1 | 1.640 | 1.640 |
| warm/on/p1-true | firstSpawnToLastExitMs | 1 | 13.585 | 13.585 |
| warm/on/p1-true | lastExitToPromptDomMs | 1 | 1.210 | 1.210 |
| warm/on/p1-true | child0.durationMs | 1 | 13.020 | 13.020 |
| warm/on/p1-true | child0.requestToCoreMs | 1 | 0.625 | 0.625 |
| warm/on/p1-true | child0.coreToStartMs | 1 | 0.190 | 0.190 |
| warm/on/p1-true | child0.workerStartupMs | 1 | 11.670 | 11.670 |
| warm/on/p1-true | child0.startToReceiveMs | 1 | 8.825 | 8.825 |
| warm/on/p1-true | child0.workerCreateToModuleMs | 1 | 7.985 | 7.985 |
| warm/on/p1-true | child0.readyToExitMs | 1 | 1.240 | 1.240 |
| warm/on/p1-true | child0.runMs | 1 | 1.045 | 1.045 |
| warm/on/p1-true | child0.closeMs | 1 | 0.170 | 0.170 |
| warm/on/p1-true | child0.exitToUiMs | 1 | 0.150 | 0.150 |
| warm/on/p1-true | child0.readMs | 1 | 0.950 | 0.950 |
| warm/on/p1-true | child0.adapterMs | 1 | 0.710 | 0.710 |
| warm/on/p1-true | child0.compileMs | 1 | 0.415 | 0.415 |
| warm/on/p1-true | child0.instantiateMs | 1 | 0.465 | 0.465 |
| warm/on/p2-true | opfs.getDirectoryHandleMs | 1 | 0.650 | 0.650 |
| warm/on/p2-true | opfs.getFileHandleMs | 1 | 0.395 | 0.395 |
| warm/on/p2-true | shellPromptToDomMs | 1 | 0.525 | 0.525 |
| warm/on/p2-true | localEchoDomAndScrollMs | 1 | 0.300 | 0.300 |
| warm/on/p2-true | outputDomAndScrollMs | 1 | 0.545 | 0.545 |
| warm/on/p2-true | opfsOpenMs | 1 | 1.080 | 1.080 |
| warm/on/p2-true | shellPreparationMs | 1 | 1.120 | 1.120 |
| warm/on/p2-true | shellToFirstSpawnMs | 1 | 1.150 | 1.150 |
| warm/on/p2-true | firstSpawnToLastExitMs | 1 | 42.305 | 42.305 |
| warm/on/p2-true | lastExitToPromptDomMs | 1 | 1.570 | 1.570 |
| warm/on/p2-true | child0.durationMs | 1 | 42.155 | 42.155 |
| warm/on/p2-true | child0.requestToCoreMs | 1 | 0.250 | 0.250 |
| warm/on/p2-true | child0.coreToStartMs | 1 | 0.170 | 0.170 |
| warm/on/p2-true | child0.workerStartupMs | 1 | 38.510 | 38.510 |
| warm/on/p2-true | child0.startToReceiveMs | 1 | 9.575 | 9.575 |
| warm/on/p2-true | child0.workerCreateToModuleMs | 1 | 8.965 | 8.965 |
| warm/on/p2-true | child0.readyToExitMs | 1 | 3.515 | 3.515 |
| warm/on/p2-true | child0.runMs | 1 | 3.240 | 3.240 |
| warm/on/p2-true | child0.closeMs | 1 | 0.230 | 0.230 |
| warm/on/p2-true | child0.exitToUiMs | 1 | 0.250 | 0.250 |
| warm/on/p2-true | child0.readMs | 1 | 1.055 | 1.055 |
| warm/on/p2-true | child0.adapterMs | 1 | 0.795 | 0.795 |
| warm/on/p2-true | child0.component.engineLoadMs | 1 | 7.695 | 7.695 |
| warm/on/p2-true | child0.component.prepareMs | 1 | 13.880 | 13.880 |
| warm/on/p2-true | child0.component.instantiateMs | 1 | 4.720 | 4.720 |
| warm/on/p2-true | child0.loadMs | 1 | 26.755 | 26.755 |
| warm/on/p1-echo | opfs.getDirectoryHandleMs | 1 | 0.360 | 0.360 |
| warm/on/p1-echo | opfs.getFileHandleMs | 1 | 0.340 | 0.340 |
| warm/on/p1-echo | shellPromptToDomMs | 1 | 0.570 | 0.570 |
| warm/on/p1-echo | localEchoDomAndScrollMs | 1 | 0.275 | 0.275 |
| warm/on/p1-echo | outputDomAndScrollMs | 1 | 1.185 | 1.185 |
| warm/on/p1-echo | opfsOpenMs | 1 | 0.755 | 0.755 |
| warm/on/p1-echo | shellPreparationMs | 1 | 0.790 | 0.790 |
| warm/on/p1-echo | shellToFirstSpawnMs | 1 | 0.815 | 0.815 |
| warm/on/p1-echo | firstSpawnToLastExitMs | 1 | 14.810 | 14.810 |
| warm/on/p1-echo | lastExitToPromptDomMs | 1 | 0.935 | 0.935 |
| warm/on/p1-echo | child0.durationMs | 1 | 14.575 | 14.575 |
| warm/on/p1-echo | child0.requestToCoreMs | 1 | 0.260 | 0.260 |
| warm/on/p1-echo | child0.coreToStartMs | 1 | 0.160 | 0.160 |
| warm/on/p1-echo | child0.workerStartupMs | 1 | 12.320 | 12.320 |
| warm/on/p1-echo | child0.startToReceiveMs | 1 | 9.420 | 9.420 |
| warm/on/p1-echo | child0.workerCreateToModuleMs | 1 | 8.825 | 8.825 |
| warm/on/p1-echo | child0.readyToExitMs | 1 | 2.210 | 2.210 |
| warm/on/p1-echo | child0.runMs | 1 | 2.030 | 2.030 |
| warm/on/p1-echo | child0.closeMs | 1 | 0.145 | 0.145 |
| warm/on/p1-echo | child0.exitToUiMs | 1 | 0.260 | 0.260 |
| warm/on/p1-echo | child0.readMs | 1 | 0.985 | 0.985 |
| warm/on/p1-echo | child0.adapterMs | 1 | 0.740 | 0.740 |
| warm/on/p1-echo | child0.compileMs | 1 | 0.310 | 0.310 |
| warm/on/p1-echo | child0.instantiateMs | 1 | 0.480 | 0.480 |
| warm/on/p2-echo | opfs.getDirectoryHandleMs | 1 | 0.575 | 0.575 |
| warm/on/p2-echo | opfs.getFileHandleMs | 1 | 0.500 | 0.500 |
| warm/on/p2-echo | shellPromptToDomMs | 1 | 0.080 | 0.080 |
| warm/on/p2-echo | localEchoDomAndScrollMs | 1 | 0.295 | 0.295 |
| warm/on/p2-echo | outputDomAndScrollMs | 1 | 0.925 | 0.925 |
| warm/on/p2-echo | opfsOpenMs | 1 | 1.105 | 1.105 |
| warm/on/p2-echo | shellPreparationMs | 1 | 1.145 | 1.145 |
| warm/on/p2-echo | shellToFirstSpawnMs | 1 | 1.170 | 1.170 |
| warm/on/p2-echo | firstSpawnToLastExitMs | 1 | 43.010 | 43.010 |
| warm/on/p2-echo | lastExitToPromptDomMs | 1 | 1.480 | 1.480 |
| warm/on/p2-echo | child0.durationMs | 1 | 42.775 | 42.775 |
| warm/on/p2-echo | child0.requestToCoreMs | 1 | 0.265 | 0.265 |
| warm/on/p2-echo | child0.coreToStartMs | 1 | 0.165 | 0.165 |
| warm/on/p2-echo | child0.workerStartupMs | 1 | 37.435 | 37.435 |
| warm/on/p2-echo | child0.startToReceiveMs | 1 | 10.150 | 10.150 |
| warm/on/p2-echo | child0.workerCreateToModuleMs | 1 | 9.705 | 9.705 |
| warm/on/p2-echo | child0.readyToExitMs | 1 | 5.285 | 5.285 |
| warm/on/p2-echo | child0.runMs | 1 | 4.665 | 4.665 |
| warm/on/p2-echo | child0.closeMs | 1 | 0.205 | 0.205 |
| warm/on/p2-echo | child0.exitToUiMs | 1 | 0.275 | 0.275 |
| warm/on/p2-echo | child0.readMs | 1 | 1.030 | 1.030 |
| warm/on/p2-echo | child0.adapterMs | 1 | 0.830 | 0.830 |
| warm/on/p2-echo | child0.component.engineLoadMs | 1 | 7.100 | 7.100 |
| warm/on/p2-echo | child0.component.prepareMs | 1 | 12.690 | 12.690 |
| warm/on/p2-echo | child0.component.instantiateMs | 1 | 4.850 | 4.850 |
| warm/on/p2-echo | child0.loadMs | 1 | 25.115 | 25.115 |
| warm/on/file | opfs.getDirectoryHandleMs | 1 | 0.835 | 0.835 |
| warm/on/file | opfs.getFileHandleMs | 1 | 0.670 | 0.670 |
| warm/on/file | opfs.getFileMs | 1 | 0.485 | 0.485 |
| warm/on/file | opfs.arrayBufferMs | 1 | 0.775 | 0.775 |
| warm/on/file | shellPromptToDomMs | 1 | 0.950 | 0.950 |
| warm/on/file | localEchoDomAndScrollMs | 1 | 0.300 | 0.300 |
| warm/on/file | outputDomAndScrollMs | 1 | 0.680 | 0.680 |
| warm/on/file | opfsOpenMs | 1 | 1.695 | 1.695 |
| warm/on/file | shellPreparationMs | 1 | 1.030 | 1.030 |
| warm/on/file | shellToFirstSpawnMs | 1 | 1.235 | 1.235 |
| warm/on/file | firstSpawnToLastExitMs | 1 | 17.295 | 17.295 |
| warm/on/file | lastExitToPromptDomMs | 1 | 2.445 | 2.445 |
| warm/on/file | child0.durationMs | 1 | 16.985 | 16.985 |
| warm/on/file | child0.requestToCoreMs | 1 | 0.355 | 0.355 |
| warm/on/file | child0.coreToStartMs | 1 | 0.175 | 0.175 |
| warm/on/file | child0.workerStartupMs | 1 | 13.095 | 13.095 |
| warm/on/file | child0.startToReceiveMs | 1 | 10.230 | 10.230 |
| warm/on/file | child0.workerCreateToModuleMs | 1 | 9.640 | 9.640 |
| warm/on/file | child0.readyToExitMs | 1 | 3.820 | 3.820 |
| warm/on/file | child0.runMs | 1 | 3.385 | 3.385 |
| warm/on/file | child0.closeMs | 1 | 0.155 | 0.155 |
| warm/on/file | child0.exitToUiMs | 1 | 0.120 | 0.120 |
| warm/on/file | child0.readMs | 1 | 0.930 | 0.930 |
| warm/on/file | child0.adapterMs | 1 | 0.760 | 0.760 |
| warm/on/file | child0.compileMs | 1 | 0.395 | 0.395 |
| warm/on/file | child0.instantiateMs | 1 | 0.475 | 0.475 |
| warm/on/pipeline | opfs.getDirectoryHandleMs | 1 | 3.475 | 3.475 |
| warm/on/pipeline | opfs.getFileHandleMs | 1 | 2.940 | 2.940 |
| warm/on/pipeline | opfs.getFileMs | 1 | 0.815 | 0.815 |
| warm/on/pipeline | opfs.arrayBufferMs | 1 | 2.500 | 2.500 |
| warm/on/pipeline | shellPromptToDomMs | 1 | 0.540 | 0.540 |
| warm/on/pipeline | localEchoDomAndScrollMs | 1 | 0.270 | 0.270 |
| warm/on/pipeline | outputDomAndScrollMs | 1 | 0.760 | 0.760 |
| warm/on/pipeline | opfsOpenMs | 1 | 7.445 | 7.445 |
| warm/on/pipeline | shellPreparationMs | 1 | 3.070 | 3.070 |
| warm/on/pipeline | shellToFirstSpawnMs | 1 | 1.505 | 1.505 |
| warm/on/pipeline | firstSpawnToLastExitMs | 1 | 45.700 | 45.700 |
| warm/on/pipeline | lastExitToPromptDomMs | 1 | 0.820 | 0.820 |
| warm/on/pipeline | child0.durationMs | 1 | 24.155 | 24.155 |
| warm/on/pipeline | child1.durationMs | 1 | 16.710 | 16.710 |
| warm/on/pipeline | child2.durationMs | 1 | 14.290 | 14.290 |
| warm/on/pipeline | child0.requestToCoreMs | 1 | 0.350 | 0.350 |
| warm/on/pipeline | child0.coreToStartMs | 1 | 0.165 | 0.165 |
| warm/on/pipeline | child0.workerStartupMs | 1 | 13.265 | 13.265 |
| warm/on/pipeline | child0.startToReceiveMs | 1 | 9.860 | 9.860 |
| warm/on/pipeline | child0.workerCreateToModuleMs | 1 | 9.235 | 9.235 |
| warm/on/pipeline | child0.readyToExitMs | 1 | 10.845 | 10.845 |
| warm/on/pipeline | child0.runMs | 1 | 10.030 | 10.030 |
| warm/on/pipeline | child0.closeMs | 1 | 0.460 | 0.460 |
| warm/on/pipeline | child0.exitToUiMs | 1 | 1.085 | 1.085 |
| warm/on/pipeline | child0.readMs | 1 | 0.940 | 0.940 |
| warm/on/pipeline | child0.adapterMs | 1 | 0.920 | 0.920 |
| warm/on/pipeline | child0.compileMs | 1 | 0.690 | 0.690 |
| warm/on/pipeline | child0.instantiateMs | 1 | 0.560 | 0.560 |
| warm/on/pipeline | child1.requestToCoreMs | 1 | 0.380 | 0.380 |
| warm/on/pipeline | child1.coreToStartMs | 1 | 0.220 | 0.220 |
| warm/on/pipeline | child1.workerStartupMs | 1 | 14.590 | 14.590 |
| warm/on/pipeline | child1.startToReceiveMs | 1 | 11.675 | 11.675 |
| warm/on/pipeline | child1.workerCreateToModuleMs | 1 | 10.450 | 10.450 |
| warm/on/pipeline | child1.readyToExitMs | 1 | 2.060 | 2.060 |
| warm/on/pipeline | child1.runMs | 1 | 1.760 | 1.760 |
| warm/on/pipeline | child1.closeMs | 1 | 0.215 | 0.215 |
| warm/on/pipeline | child1.exitToUiMs | 1 | 0.105 | 0.105 |
| warm/on/pipeline | child1.readMs | 1 | 0.910 | 0.910 |
| warm/on/pipeline | child1.adapterMs | 1 | 0.750 | 0.750 |
| warm/on/pipeline | child1.compileMs | 1 | 0.440 | 0.440 |
| warm/on/pipeline | child1.instantiateMs | 1 | 0.490 | 0.490 |
| warm/on/pipeline | child2.requestToCoreMs | 1 | 0.240 | 0.240 |
| warm/on/pipeline | child2.coreToStartMs | 1 | 0.135 | 0.135 |
| warm/on/pipeline | child2.workerStartupMs | 1 | 12.235 | 12.235 |
| warm/on/pipeline | child2.startToReceiveMs | 1 | 9.310 | 9.310 |
| warm/on/pipeline | child2.workerCreateToModuleMs | 1 | 8.780 | 8.780 |
| warm/on/pipeline | child2.readyToExitMs | 1 | 2.010 | 2.010 |
| warm/on/pipeline | child2.runMs | 1 | 1.815 | 1.815 |
| warm/on/pipeline | child2.closeMs | 1 | 0.135 | 0.135 |
| warm/on/pipeline | child2.exitToUiMs | 1 | 0.435 | 0.435 |
| warm/on/pipeline | child2.readMs | 1 | 0.930 | 0.930 |
| warm/on/pipeline | child2.adapterMs | 1 | 0.755 | 0.755 |
| warm/on/pipeline | child2.compileMs | 1 | 0.425 | 0.425 |
| warm/on/pipeline | child2.instantiateMs | 1 | 0.555 | 0.555 |
| warm/on/builtin | shellPromptToDomMs | 1 | 10.875 | 10.875 |
| warm/on/builtin | localEchoDomAndScrollMs | 1 | 0.295 | 0.295 |
| warm/on/builtin | outputDomAndScrollMs | 1 | 0.365 | 0.365 |
| warm/on/builtin | opfsOpenMs | 1 | 0.000 | 0.000 |
| warm/on/builtin | shellPreparationMs | 1 | 0.000 | 0.000 |
| warm/on/builtin | shellToPromptDomMs | 1 | 11.230 | 11.230 |

Do not add nested intervals, per-child startup/run/stdio/wait durations, or drawing time. Only input→shell, shell→first spawn, first spawn→last EXIT and last EXIT→prompt DOM form the outer wall-time partition (builtin uses shell→prompt).

See docs/benchmarks-e2e.md for reproduction, cache/clock definitions, trace capture and comparison to the separate Worker benchmark.
