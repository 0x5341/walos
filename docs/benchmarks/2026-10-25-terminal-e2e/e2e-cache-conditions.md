# Terminal E2E benchmark

Revision: bfb5f342ecc6930a4b36ab21a7368ad3a44c28d8; dirty: false; production; jsco; Chromium 154.0.8037.57; headless.
AMD EPYC 9V74 80-Core Processor; linux/x64; Node v24.19.0; Playwright 1.56.1.
0 failures; raw JSON retains first runs, warmups, results, timelines, per-child EXIT/durationMs, clock checks and all summary metrics.

Durations in ms. ON/OFF refers to detailed recording; both use command correlation. Each condition has its own sessions. rAF is not a paint-completion measurement.

| Condition/detail/case | N / attempted | Failures | DOM median | DOM p95 | Min | Max | Mean | Stddev | Frame median | First output median | EXIT median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| reload/on/p1-true | 3 / 3 | 0 | 17.045 | 22.290 | 16.120 | 22.290 | 18.485 | 2.717 | 24.945 | — | 16.425 |
| reload/on/p2-true | 3 / 3 | 0 | 46.225 | 55.960 | 45.095 | 55.960 | 49.093 | 4.877 | 56.835 | — | 44.920 |
| reload/on/p1-echo | 3 / 3 | 0 | 18.530 | 19.255 | 16.650 | 19.255 | 18.145 | 1.098 | 21.410 | 16.650 | 17.135 |
| reload/on/p2-echo | 3 / 3 | 0 | 45.825 | 46.945 | 45.235 | 46.945 | 46.002 | 0.709 | 54.675 | 44.460 | 45.585 |
| reload/on/file | 3 / 3 | 0 | 20.200 | 24.435 | 18.665 | 24.435 | 21.100 | 2.440 | 30.910 | 17.360 | 20.030 |
| reload/on/pipeline | 3 / 3 | 0 | 45.160 | 59.560 | 40.290 | 59.560 | 48.337 | 8.181 | 51.545 | 43.850 | 44.755 |
| reload/on/builtin | 3 / 3 | 0 | 12.430 | 13.205 | 11.990 | 13.205 | 12.542 | 0.502 | 28.360 | — | — |
| fresh/on/p1-true | 3 / 3 | 0 | 14.850 | 21.460 | 14.190 | 21.460 | 16.833 | 3.283 | 23.830 | — | 14.745 |
| fresh/on/p2-true | 3 / 3 | 0 | 53.195 | 53.375 | 39.210 | 53.375 | 48.593 | 6.635 | 61.615 | — | 52.445 |
| fresh/on/p1-echo | 3 / 3 | 0 | 18.700 | 23.300 | 18.150 | 23.300 | 20.050 | 2.309 | 24.595 | 16.010 | 17.830 |
| fresh/on/p2-echo | 3 / 3 | 0 | 50.490 | 67.620 | 47.290 | 67.620 | 55.133 | 8.926 | 52.100 | 47.800 | 49.720 |
| fresh/on/file | 3 / 3 | 0 | 19.395 | 20.545 | 19.180 | 20.545 | 19.707 | 0.599 | 29.915 | 17.720 | 19.025 |
| fresh/on/pipeline | 3 / 3 | 0 | 44.975 | 58.105 | 43.295 | 58.105 | 48.792 | 6.621 | 54.240 | 43.985 | 44.810 |
| fresh/on/builtin | 3 / 3 | 0 | 11.405 | 12.080 | 11.110 | 12.080 | 11.532 | 0.406 | 27.520 | — | — |
| reload/off/p1-true | 3 / 3 | 0 | 15.350 | 17.620 | 15.340 | 17.620 | 16.103 | 1.072 | 23.985 | — | 15.195 |
| reload/off/p2-true | 3 / 3 | 0 | 45.430 | 47.335 | 42.945 | 47.335 | 45.237 | 1.797 | 58.015 | — | 45.150 |
| reload/off/p1-echo | 3 / 3 | 0 | 17.185 | 18.015 | 16.875 | 18.015 | 17.358 | 0.481 | 25.470 | 15.685 | 16.780 |
| reload/off/p2-echo | 3 / 3 | 0 | 50.465 | 51.995 | 43.060 | 51.995 | 48.507 | 3.902 | 58.215 | 48.840 | 50.200 |
| reload/off/file | 3 / 3 | 0 | 18.590 | 19.470 | 17.285 | 19.470 | 18.448 | 0.898 | 25.510 | 16.740 | 18.475 |
| reload/off/pipeline | 3 / 3 | 0 | 45.805 | 48.720 | 43.535 | 48.720 | 46.020 | 2.122 | 58.120 | 44.055 | 45.640 |
| reload/off/builtin | 3 / 3 | 0 | 7.370 | 8.550 | 5.335 | 8.550 | 7.085 | 1.328 | 23.330 | — | — |
| fresh/off/p1-true | 3 / 3 | 0 | 15.945 | 18.760 | 14.545 | 18.760 | 16.417 | 1.753 | 25.460 | — | 15.020 |
| fresh/off/p2-true | 3 / 3 | 0 | 52.130 | 59.090 | 40.295 | 59.090 | 50.505 | 7.759 | 54.105 | — | 50.850 |
| fresh/off/p1-echo | 3 / 3 | 0 | 17.545 | 20.285 | 17.275 | 20.285 | 18.368 | 1.360 | 21.900 | 15.425 | 15.830 |
| fresh/off/p2-echo | 3 / 3 | 0 | 47.515 | 53.435 | 45.900 | 53.435 | 48.950 | 3.239 | 57.605 | 45.680 | 46.260 |
| fresh/off/file | 3 / 3 | 0 | 19.465 | 22.355 | 16.385 | 22.355 | 19.402 | 2.438 | 23.080 | 17.130 | 18.695 |
| fresh/off/pipeline | 3 / 3 | 0 | 43.805 | 46.520 | 40.845 | 46.520 | 43.723 | 2.318 | 58.150 | 42.735 | 42.510 |
| fresh/off/builtin | 3 / 3 | 0 | 7.955 | 7.990 | 7.795 | 7.990 | 7.913 | 0.085 | 23.780 | — | — |

## Diagnostic intervals (median / p95, ms)

| Condition/detail/case | Metric | N | Median | p95 |
| --- | --- | ---: | ---: | ---: |
| reload/on/p1-true | opfs.getDirectoryHandleMs | 3 | 0.650 | 1.700 |
| reload/on/p1-true | opfs.getFileHandleMs | 3 | 0.370 | 0.925 |
| reload/on/p1-true | shellPromptToDomMs | 3 | 0.140 | 1.390 |
| reload/on/p1-true | localEchoDomAndScrollMs | 3 | 0.685 | 1.225 |
| reload/on/p1-true | outputDomAndScrollMs | 3 | 0.550 | 0.565 |
| reload/on/p1-true | opfsOpenMs | 3 | 1.070 | 2.675 |
| reload/on/p1-true | shellPreparationMs | 3 | 1.125 | 2.745 |
| reload/on/p1-true | shellToFirstSpawnMs | 3 | 1.155 | 2.790 |
| reload/on/p1-true | firstSpawnToLastExitMs | 3 | 14.865 | 17.510 |
| reload/on/p1-true | lastExitToPromptDomMs | 3 | 0.740 | 1.615 |
| reload/on/p1-true | child0.durationMs | 3 | 14.665 | 17.255 |
| reload/on/p1-true | child0.requestToCoreMs | 3 | 0.280 | 0.310 |
| reload/on/p1-true | child0.coreToStartMs | 3 | 0.170 | 0.190 |
| reload/on/p1-true | child0.workerStartupMs | 3 | 13.285 | 14.560 |
| reload/on/p1-true | child0.startToReceiveMs | 3 | 10.270 | 11.190 |
| reload/on/p1-true | child0.workerCreateToModuleMs | 3 | 9.445 | 10.390 |
| reload/on/p1-true | child0.readyToExitMs | 3 | 1.840 | 2.645 |
| reload/on/p1-true | child0.runMs | 3 | 1.135 | 2.010 |
| reload/on/p1-true | child0.closeMs | 3 | 0.265 | 0.275 |
| reload/on/p1-true | child0.exitToUiMs | 3 | 0.195 | 1.425 |
| reload/on/p1-true | child0.readMs | 3 | 0.915 | 1.030 |
| reload/on/p1-true | child0.adapterMs | 3 | 0.890 | 0.950 |
| reload/on/p1-true | child0.compileMs | 3 | 0.520 | 0.555 |
| reload/on/p1-true | child0.instantiateMs | 3 | 0.520 | 0.525 |
| reload/on/p2-true | opfs.getDirectoryHandleMs | 3 | 0.420 | 0.640 |
| reload/on/p2-true | opfs.getFileHandleMs | 3 | 0.760 | 1.860 |
| reload/on/p2-true | shellPromptToDomMs | 3 | 0.225 | 0.400 |
| reload/on/p2-true | localEchoDomAndScrollMs | 3 | 0.385 | 0.540 |
| reload/on/p2-true | outputDomAndScrollMs | 3 | 0.790 | 1.885 |
| reload/on/p2-true | opfsOpenMs | 3 | 1.460 | 2.305 |
| reload/on/p2-true | shellPreparationMs | 3 | 1.525 | 2.350 |
| reload/on/p2-true | shellToFirstSpawnMs | 3 | 1.570 | 2.380 |
| reload/on/p2-true | firstSpawnToLastExitMs | 3 | 43.265 | 53.300 |
| reload/on/p2-true | lastExitToPromptDomMs | 3 | 0.820 | 1.530 |
| reload/on/p2-true | child0.durationMs | 3 | 43.015 | 53.105 |
| reload/on/p2-true | child0.requestToCoreMs | 3 | 0.235 | 0.280 |
| reload/on/p2-true | child0.coreToStartMs | 3 | 0.170 | 0.210 |
| reload/on/p2-true | child0.workerStartupMs | 3 | 38.960 | 48.005 |
| reload/on/p2-true | child0.startToReceiveMs | 3 | 10.100 | 11.660 |
| reload/on/p2-true | child0.workerCreateToModuleMs | 3 | 9.545 | 10.955 |
| reload/on/p2-true | child0.readyToExitMs | 3 | 4.010 | 5.035 |
| reload/on/p2-true | child0.runMs | 3 | 3.355 | 4.675 |
| reload/on/p2-true | child0.closeMs | 3 | 0.235 | 0.310 |
| reload/on/p2-true | child0.exitToUiMs | 3 | 0.235 | 0.645 |
| reload/on/p2-true | child0.readMs | 3 | 1.005 | 2.470 |
| reload/on/p2-true | child0.adapterMs | 3 | 0.845 | 1.930 |
| reload/on/p2-true | child0.component.engineLoadMs | 3 | 8.255 | 8.910 |
| reload/on/p2-true | child0.component.prepareMs | 3 | 13.375 | 16.535 |
| reload/on/p2-true | child0.component.instantiateMs | 3 | 4.670 | 5.510 |
| reload/on/p2-true | child0.loadMs | 3 | 26.810 | 31.560 |
| reload/on/p1-echo | opfs.getDirectoryHandleMs | 3 | 0.570 | 0.715 |
| reload/on/p1-echo | opfs.getFileHandleMs | 3 | 0.280 | 0.385 |
| reload/on/p1-echo | shellPromptToDomMs | 3 | 0.590 | 0.690 |
| reload/on/p1-echo | localEchoDomAndScrollMs | 3 | 0.395 | 0.470 |
| reload/on/p1-echo | outputDomAndScrollMs | 3 | 1.030 | 1.615 |
| reload/on/p1-echo | opfsOpenMs | 3 | 0.995 | 1.075 |
| reload/on/p1-echo | shellPreparationMs | 3 | 1.050 | 1.125 |
| reload/on/p1-echo | shellToFirstSpawnMs | 3 | 1.080 | 1.160 |
| reload/on/p1-echo | firstSpawnToLastExitMs | 3 | 15.315 | 16.320 |
| reload/on/p1-echo | lastExitToPromptDomMs | 3 | 1.060 | 2.395 |
| reload/on/p1-echo | child0.durationMs | 3 | 14.785 | 16.090 |
| reload/on/p1-echo | child0.requestToCoreMs | 3 | 0.260 | 0.540 |
| reload/on/p1-echo | child0.coreToStartMs | 3 | 0.150 | 0.235 |
| reload/on/p1-echo | child0.workerStartupMs | 3 | 12.555 | 13.395 |
| reload/on/p1-echo | child0.startToReceiveMs | 3 | 9.200 | 9.655 |
| reload/on/p1-echo | child0.workerCreateToModuleMs | 3 | 8.695 | 8.890 |
| reload/on/p1-echo | child0.readyToExitMs | 3 | 2.495 | 2.645 |
| reload/on/p1-echo | child0.runMs | 3 | 1.855 | 1.900 |
| reload/on/p1-echo | child0.closeMs | 3 | 0.175 | 0.190 |
| reload/on/p1-echo | child0.exitToUiMs | 3 | 0.275 | 0.715 |
| reload/on/p1-echo | child0.readMs | 3 | 1.145 | 1.770 |
| reload/on/p1-echo | child0.adapterMs | 3 | 0.995 | 1.015 |
| reload/on/p1-echo | child0.compileMs | 3 | 0.425 | 0.495 |
| reload/on/p1-echo | child0.instantiateMs | 3 | 0.470 | 0.475 |
| reload/on/p2-echo | opfs.getDirectoryHandleMs | 3 | 0.340 | 0.365 |
| reload/on/p2-echo | opfs.getFileHandleMs | 3 | 0.260 | 0.360 |
| reload/on/p2-echo | shellPromptToDomMs | 3 | 0.175 | 0.230 |
| reload/on/p2-echo | localEchoDomAndScrollMs | 3 | 0.750 | 0.785 |
| reload/on/p2-echo | outputDomAndScrollMs | 3 | 1.105 | 1.130 |
| reload/on/p2-echo | opfsOpenMs | 3 | 0.650 | 0.780 |
| reload/on/p2-echo | shellPreparationMs | 3 | 0.685 | 0.815 |
| reload/on/p2-echo | shellToFirstSpawnMs | 3 | 0.710 | 0.840 |
| reload/on/p2-echo | firstSpawnToLastExitMs | 3 | 44.245 | 44.375 |
| reload/on/p2-echo | lastExitToPromptDomMs | 3 | 0.630 | 1.665 |
| reload/on/p2-echo | child0.durationMs | 3 | 44.085 | 44.210 |
| reload/on/p2-echo | child0.requestToCoreMs | 3 | 0.200 | 0.220 |
| reload/on/p2-echo | child0.coreToStartMs | 3 | 0.140 | 0.160 |
| reload/on/p2-echo | child0.workerStartupMs | 3 | 38.830 | 39.085 |
| reload/on/p2-echo | child0.startToReceiveMs | 3 | 9.795 | 10.000 |
| reload/on/p2-echo | child0.workerCreateToModuleMs | 3 | 9.130 | 9.285 |
| reload/on/p2-echo | child0.readyToExitMs | 3 | 5.210 | 6.785 |
| reload/on/p2-echo | child0.runMs | 3 | 4.620 | 6.200 |
| reload/on/p2-echo | child0.closeMs | 3 | 0.235 | 0.350 |
| reload/on/p2-echo | child0.exitToUiMs | 3 | 0.290 | 0.690 |
| reload/on/p2-echo | child0.readMs | 3 | 0.935 | 0.975 |
| reload/on/p2-echo | child0.adapterMs | 3 | 0.775 | 0.925 |
| reload/on/p2-echo | child0.component.engineLoadMs | 3 | 7.570 | 8.290 |
| reload/on/p2-echo | child0.component.prepareMs | 3 | 13.710 | 13.745 |
| reload/on/p2-echo | child0.component.instantiateMs | 3 | 4.825 | 5.020 |
| reload/on/p2-echo | child0.loadMs | 3 | 26.860 | 27.330 |
| reload/on/file | opfs.getDirectoryHandleMs | 3 | 1.085 | 1.600 |
| reload/on/file | opfs.getFileHandleMs | 3 | 0.805 | 1.805 |
| reload/on/file | opfs.getFileMs | 3 | 1.015 | 2.100 |
| reload/on/file | opfs.arrayBufferMs | 3 | 1.030 | 1.125 |
| reload/on/file | shellPromptToDomMs | 3 | 0.175 | 0.440 |
| reload/on/file | localEchoDomAndScrollMs | 3 | 0.505 | 0.635 |
| reload/on/file | outputDomAndScrollMs | 3 | 1.185 | 1.855 |
| reload/on/file | opfsOpenMs | 3 | 2.050 | 3.640 |
| reload/on/file | shellPreparationMs | 3 | 1.030 | 1.745 |
| reload/on/file | shellToFirstSpawnMs | 3 | 1.065 | 1.780 |
| reload/on/file | firstSpawnToLastExitMs | 3 | 18.530 | 20.640 |
| reload/on/file | lastExitToPromptDomMs | 3 | 0.595 | 1.690 |
| reload/on/file | child0.durationMs | 3 | 17.785 | 19.365 |
| reload/on/file | child0.requestToCoreMs | 3 | 0.775 | 1.295 |
| reload/on/file | child0.coreToStartMs | 3 | 0.170 | 0.310 |
| reload/on/file | child0.workerStartupMs | 3 | 12.510 | 13.260 |
| reload/on/file | child0.startToReceiveMs | 3 | 9.515 | 9.880 |
| reload/on/file | child0.workerCreateToModuleMs | 3 | 9.020 | 9.415 |
| reload/on/file | child0.readyToExitMs | 3 | 5.710 | 6.060 |
| reload/on/file | child0.runMs | 3 | 5.490 | 5.775 |
| reload/on/file | child0.closeMs | 3 | 0.170 | 0.200 |
| reload/on/file | child0.exitToUiMs | 3 | 0.185 | 0.430 |
| reload/on/file | child0.readMs | 3 | 1.040 | 1.100 |
| reload/on/file | child0.adapterMs | 3 | 0.885 | 1.140 |
| reload/on/file | child0.compileMs | 3 | 0.465 | 0.470 |
| reload/on/file | child0.instantiateMs | 3 | 0.485 | 0.485 |
| reload/on/pipeline | opfs.getDirectoryHandleMs | 3 | 2.545 | 4.950 |
| reload/on/pipeline | opfs.getFileHandleMs | 3 | 2.510 | 2.649 |
| reload/on/pipeline | opfs.getFileMs | 3 | 1.585 | 2.075 |
| reload/on/pipeline | opfs.arrayBufferMs | 3 | 2.190 | 3.565 |
| reload/on/pipeline | shellPromptToDomMs | 3 | 0.640 | 0.985 |
| reload/on/pipeline | localEchoDomAndScrollMs | 3 | 0.450 | 0.685 |
| reload/on/pipeline | outputDomAndScrollMs | 3 | 1.545 | 1.775 |
| reload/on/pipeline | opfsOpenMs | 3 | 5.485 | 7.780 |
| reload/on/pipeline | shellPreparationMs | 3 | 2.986 | 5.675 |
| reload/on/pipeline | shellToFirstSpawnMs | 3 | 1.990 | 3.200 |
| reload/on/pipeline | firstSpawnToLastExitMs | 3 | 41.760 | 55.010 |
| reload/on/pipeline | lastExitToPromptDomMs | 3 | 1.130 | 1.455 |
| reload/on/pipeline | child0.durationMs | 3 | 20.775 | 23.290 |
| reload/on/pipeline | child1.durationMs | 3 | 14.875 | 20.855 |
| reload/on/pipeline | child2.durationMs | 3 | 13.140 | 18.490 |
| reload/on/pipeline | child0.requestToCoreMs | 3 | 0.410 | 0.675 |
| reload/on/pipeline | child0.coreToStartMs | 3 | 0.200 | 0.245 |
| reload/on/pipeline | child0.workerStartupMs | 3 | 11.970 | 14.435 |
| reload/on/pipeline | child0.startToReceiveMs | 3 | 9.170 | 10.840 |
| reload/on/pipeline | child0.workerCreateToModuleMs | 3 | 8.660 | 10.360 |
| reload/on/pipeline | child0.readyToExitMs | 3 | 8.790 | 8.805 |
| reload/on/pipeline | child0.runMs | 3 | 8.360 | 8.405 |
| reload/on/pipeline | child0.closeMs | 3 | 0.175 | 0.240 |
| reload/on/pipeline | child0.exitToUiMs | 3 | 0.200 | 0.310 |
| reload/on/pipeline | child0.readMs | 3 | 0.935 | 1.290 |
| reload/on/pipeline | child0.adapterMs | 3 | 0.755 | 0.970 |
| reload/on/pipeline | child0.compileMs | 3 | 0.330 | 0.415 |
| reload/on/pipeline | child0.instantiateMs | 3 | 0.475 | 0.515 |
| reload/on/pipeline | child1.requestToCoreMs | 3 | 0.235 | 0.355 |
| reload/on/pipeline | child1.coreToStartMs | 3 | 0.130 | 0.255 |
| reload/on/pipeline | child1.workerStartupMs | 3 | 12.305 | 16.835 |
| reload/on/pipeline | child1.startToReceiveMs | 3 | 9.595 | 13.345 |
| reload/on/pipeline | child1.workerCreateToModuleMs | 3 | 8.490 | 12.635 |
| reload/on/pipeline | child1.readyToExitMs | 3 | 2.610 | 3.975 |
| reload/on/pipeline | child1.runMs | 3 | 1.880 | 3.775 |
| reload/on/pipeline | child1.closeMs | 3 | 0.125 | 0.170 |
| reload/on/pipeline | child1.exitToUiMs | 3 | 0.120 | 0.125 |
| reload/on/pipeline | child1.readMs | 3 | 1.005 | 1.260 |
| reload/on/pipeline | child1.adapterMs | 3 | 0.810 | 0.930 |
| reload/on/pipeline | child1.compileMs | 3 | 0.400 | 0.560 |
| reload/on/pipeline | child1.instantiateMs | 3 | 0.575 | 0.580 |
| reload/on/pipeline | child2.requestToCoreMs | 3 | 0.265 | 1.530 |
| reload/on/pipeline | child2.coreToStartMs | 3 | 0.125 | 0.220 |
| reload/on/pipeline | child2.workerStartupMs | 3 | 11.170 | 15.675 |
| reload/on/pipeline | child2.startToReceiveMs | 3 | 8.410 | 12.485 |
| reload/on/pipeline | child2.workerCreateToModuleMs | 3 | 7.980 | 11.825 |
| reload/on/pipeline | child2.readyToExitMs | 3 | 2.195 | 2.730 |
| reload/on/pipeline | child2.runMs | 3 | 1.700 | 1.960 |
| reload/on/pipeline | child2.closeMs | 3 | 0.150 | 0.205 |
| reload/on/pipeline | child2.exitToUiMs | 3 | 0.810 | 1.275 |
| reload/on/pipeline | child2.readMs | 3 | 0.830 | 0.965 |
| reload/on/pipeline | child2.adapterMs | 3 | 0.885 | 0.910 |
| reload/on/pipeline | child2.compileMs | 3 | 0.375 | 0.465 |
| reload/on/pipeline | child2.instantiateMs | 3 | 0.495 | 0.605 |
| reload/on/builtin | shellPromptToDomMs | 3 | 11.920 | 12.395 |
| reload/on/builtin | localEchoDomAndScrollMs | 3 | 0.380 | 0.605 |
| reload/on/builtin | outputDomAndScrollMs | 3 | 0.400 | 0.575 |
| reload/on/builtin | opfsOpenMs | 3 | 0.000 | 0.000 |
| reload/on/builtin | shellPreparationMs | 3 | 0.000 | 0.000 |
| reload/on/builtin | shellToPromptDomMs | 3 | 12.195 | 13.015 |
| fresh/on/p1-true | opfs.getDirectoryHandleMs | 3 | 0.360 | 1.140 |
| fresh/on/p1-true | opfs.getFileHandleMs | 3 | 0.330 | 0.580 |
| fresh/on/p1-true | shellPromptToDomMs | 3 | 0.115 | 1.370 |
| fresh/on/p1-true | localEchoDomAndScrollMs | 3 | 0.295 | 0.615 |
| fresh/on/p1-true | outputDomAndScrollMs | 3 | 0.335 | 1.340 |
| fresh/on/p1-true | opfsOpenMs | 3 | 0.730 | 1.980 |
| fresh/on/p1-true | shellPreparationMs | 3 | 0.775 | 2.225 |
| fresh/on/p1-true | shellToFirstSpawnMs | 3 | 0.850 | 2.580 |
| fresh/on/p1-true | firstSpawnToLastExitMs | 3 | 13.505 | 14.725 |
| fresh/on/p1-true | lastExitToPromptDomMs | 3 | 0.270 | 2.960 |
| fresh/on/p1-true | child0.durationMs | 3 | 13.265 | 14.220 |
| fresh/on/p1-true | child0.requestToCoreMs | 3 | 0.285 | 0.715 |
| fresh/on/p1-true | child0.coreToStartMs | 3 | 0.270 | 0.305 |
| fresh/on/p1-true | child0.workerStartupMs | 3 | 11.655 | 12.375 |
| fresh/on/p1-true | child0.startToReceiveMs | 3 | 7.970 | 8.780 |
| fresh/on/p1-true | child0.workerCreateToModuleMs | 3 | 7.580 | 8.260 |
| fresh/on/p1-true | child0.readyToExitMs | 3 | 1.595 | 1.700 |
| fresh/on/p1-true | child0.runMs | 3 | 1.180 | 1.200 |
| fresh/on/p1-true | child0.closeMs | 3 | 0.185 | 0.185 |
| fresh/on/p1-true | child0.exitToUiMs | 3 | 0.165 | 2.425 |
| fresh/on/p1-true | child0.readMs | 3 | 0.940 | 2.475 |
| fresh/on/p1-true | child0.adapterMs | 3 | 0.740 | 0.810 |
| fresh/on/p1-true | child0.compileMs | 3 | 0.410 | 0.425 |
| fresh/on/p1-true | child0.instantiateMs | 3 | 0.475 | 0.515 |
| fresh/on/p2-true | opfs.getDirectoryHandleMs | 3 | 0.485 | 0.515 |
| fresh/on/p2-true | opfs.getFileHandleMs | 3 | 0.385 | 0.885 |
| fresh/on/p2-true | shellPromptToDomMs | 3 | 0.255 | 1.150 |
| fresh/on/p2-true | localEchoDomAndScrollMs | 3 | 0.285 | 0.440 |
| fresh/on/p2-true | outputDomAndScrollMs | 3 | 0.540 | 0.560 |
| fresh/on/p2-true | opfsOpenMs | 3 | 1.180 | 1.600 |
| fresh/on/p2-true | shellPreparationMs | 3 | 1.270 | 1.810 |
| fresh/on/p2-true | shellToFirstSpawnMs | 3 | 1.350 | 2.120 |
| fresh/on/p2-true | firstSpawnToLastExitMs | 3 | 48.850 | 49.970 |
| fresh/on/p2-true | lastExitToPromptDomMs | 3 | 1.455 | 1.570 |
| fresh/on/p2-true | child0.durationMs | 3 | 48.595 | 49.665 |
| fresh/on/p2-true | child0.requestToCoreMs | 3 | 0.355 | 0.455 |
| fresh/on/p2-true | child0.coreToStartMs | 3 | 0.200 | 0.265 |
| fresh/on/p2-true | child0.workerStartupMs | 3 | 44.705 | 45.580 |
| fresh/on/p2-true | child0.startToReceiveMs | 3 | 8.260 | 8.760 |
| fresh/on/p2-true | child0.workerCreateToModuleMs | 3 | 7.910 | 8.420 |
| fresh/on/p2-true | child0.readyToExitMs | 3 | 3.980 | 4.005 |
| fresh/on/p2-true | child0.runMs | 3 | 3.375 | 3.720 |
| fresh/on/p2-true | child0.closeMs | 3 | 0.235 | 0.250 |
| fresh/on/p2-true | child0.exitToUiMs | 3 | 0.705 | 0.965 |
| fresh/on/p2-true | child0.readMs | 3 | 1.155 | 1.595 |
| fresh/on/p2-true | child0.adapterMs | 3 | 0.825 | 0.860 |
| fresh/on/p2-true | child0.component.engineLoadMs | 3 | 10.920 | 12.665 |
| fresh/on/p2-true | child0.component.prepareMs | 3 | 16.100 | 17.670 |
| fresh/on/p2-true | child0.component.instantiateMs | 3 | 4.650 | 5.175 |
| fresh/on/p2-true | child0.loadMs | 3 | 33.690 | 34.390 |
| fresh/on/p1-echo | opfs.getDirectoryHandleMs | 3 | 0.710 | 0.800 |
| fresh/on/p1-echo | opfs.getFileHandleMs | 3 | 0.415 | 0.555 |
| fresh/on/p1-echo | shellPromptToDomMs | 3 | 1.280 | 1.485 |
| fresh/on/p1-echo | localEchoDomAndScrollMs | 3 | 0.245 | 0.315 |
| fresh/on/p1-echo | outputDomAndScrollMs | 3 | 0.800 | 1.050 |
| fresh/on/p1-echo | opfsOpenMs | 3 | 1.215 | 1.480 |
| fresh/on/p1-echo | shellPreparationMs | 3 | 1.285 | 1.715 |
| fresh/on/p1-echo | shellToFirstSpawnMs | 3 | 1.400 | 2.065 |
| fresh/on/p1-echo | firstSpawnToLastExitMs | 3 | 14.855 | 18.685 |
| fresh/on/p1-echo | lastExitToPromptDomMs | 3 | 2.065 | 2.950 |
| fresh/on/p1-echo | child0.durationMs | 3 | 14.235 | 18.415 |
| fresh/on/p1-echo | child0.requestToCoreMs | 3 | 0.645 | 0.655 |
| fresh/on/p1-echo | child0.coreToStartMs | 3 | 0.200 | 0.210 |
| fresh/on/p1-echo | child0.workerStartupMs | 3 | 11.780 | 14.945 |
| fresh/on/p1-echo | child0.startToReceiveMs | 3 | 8.600 | 11.955 |
| fresh/on/p1-echo | child0.workerCreateToModuleMs | 3 | 8.090 | 10.960 |
| fresh/on/p1-echo | child0.readyToExitMs | 3 | 2.560 | 3.225 |
| fresh/on/p1-echo | child0.runMs | 3 | 1.830 | 1.905 |
| fresh/on/p1-echo | child0.closeMs | 3 | 0.135 | 0.160 |
| fresh/on/p1-echo | child0.exitToUiMs | 3 | 1.255 | 1.750 |
| fresh/on/p1-echo | child0.readMs | 3 | 0.960 | 1.035 |
| fresh/on/p1-echo | child0.adapterMs | 3 | 0.820 | 0.885 |
| fresh/on/p1-echo | child0.compileMs | 3 | 0.370 | 0.405 |
| fresh/on/p1-echo | child0.instantiateMs | 3 | 0.460 | 0.525 |
| fresh/on/p2-echo | opfs.getDirectoryHandleMs | 3 | 0.395 | 0.475 |
| fresh/on/p2-echo | opfs.getFileHandleMs | 3 | 0.290 | 0.415 |
| fresh/on/p2-echo | shellPromptToDomMs | 3 | 0.945 | 1.030 |
| fresh/on/p2-echo | localEchoDomAndScrollMs | 3 | 0.240 | 0.855 |
| fresh/on/p2-echo | outputDomAndScrollMs | 3 | 0.880 | 0.895 |
| fresh/on/p2-echo | opfsOpenMs | 3 | 0.735 | 0.980 |
| fresh/on/p2-echo | shellPreparationMs | 3 | 0.785 | 1.035 |
| fresh/on/p2-echo | shellToFirstSpawnMs | 3 | 0.835 | 1.095 |
| fresh/on/p2-echo | firstSpawnToLastExitMs | 3 | 47.000 | 65.700 |
| fresh/on/p2-echo | lastExitToPromptDomMs | 3 | 1.220 | 2.015 |
| fresh/on/p2-echo | child0.durationMs | 3 | 46.680 | 65.605 |
| fresh/on/p2-echo | child0.requestToCoreMs | 3 | 0.295 | 0.420 |
| fresh/on/p2-echo | child0.coreToStartMs | 3 | 0.185 | 0.210 |
| fresh/on/p2-echo | child0.workerStartupMs | 3 | 41.310 | 59.535 |
| fresh/on/p2-echo | child0.startToReceiveMs | 3 | 8.725 | 9.425 |
| fresh/on/p2-echo | child0.workerCreateToModuleMs | 3 | 8.300 | 8.930 |
| fresh/on/p2-echo | child0.readyToExitMs | 3 | 5.310 | 5.955 |
| fresh/on/p2-echo | child0.runMs | 3 | 5.080 | 5.615 |
| fresh/on/p2-echo | child0.closeMs | 3 | 0.205 | 0.335 |
| fresh/on/p2-echo | child0.exitToUiMs | 3 | 0.805 | 1.245 |
| fresh/on/p2-echo | child0.readMs | 3 | 1.070 | 1.085 |
| fresh/on/p2-echo | child0.adapterMs | 3 | 0.765 | 0.815 |
| fresh/on/p2-echo | child0.component.engineLoadMs | 3 | 8.525 | 27.045 |
| fresh/on/p2-echo | child0.component.prepareMs | 3 | 15.260 | 16.565 |
| fresh/on/p2-echo | child0.component.instantiateMs | 3 | 4.895 | 5.525 |
| fresh/on/p2-echo | child0.loadMs | 3 | 29.640 | 49.000 |
| fresh/on/file | opfs.getDirectoryHandleMs | 3 | 0.860 | 1.030 |
| fresh/on/file | opfs.getFileHandleMs | 3 | 0.580 | 0.580 |
| fresh/on/file | opfs.getFileMs | 3 | 0.895 | 0.935 |
| fresh/on/file | opfs.arrayBufferMs | 3 | 0.825 | 0.910 |
| fresh/on/file | shellPromptToDomMs | 3 | 0.345 | 2.770 |
| fresh/on/file | localEchoDomAndScrollMs | 3 | 0.260 | 0.810 |
| fresh/on/file | outputDomAndScrollMs | 3 | 0.685 | 1.040 |
| fresh/on/file | opfsOpenMs | 3 | 1.675 | 1.905 |
| fresh/on/file | shellPreparationMs | 3 | 0.965 | 1.165 |
| fresh/on/file | shellToFirstSpawnMs | 3 | 1.010 | 1.250 |
| fresh/on/file | firstSpawnToLastExitMs | 3 | 16.820 | 17.475 |
| fresh/on/file | lastExitToPromptDomMs | 3 | 1.325 | 3.090 |
| fresh/on/file | child0.durationMs | 3 | 16.600 | 17.175 |
| fresh/on/file | child0.requestToCoreMs | 3 | 0.255 | 0.415 |
| fresh/on/file | child0.coreToStartMs | 3 | 0.210 | 0.305 |
| fresh/on/file | child0.workerStartupMs | 3 | 12.250 | 12.620 |
| fresh/on/file | child0.startToReceiveMs | 3 | 8.805 | 9.340 |
| fresh/on/file | child0.workerCreateToModuleMs | 3 | 8.280 | 8.960 |
| fresh/on/file | child0.readyToExitMs | 3 | 4.275 | 4.395 |
| fresh/on/file | child0.runMs | 3 | 3.930 | 3.955 |
| fresh/on/file | child0.closeMs | 3 | 0.145 | 0.260 |
| fresh/on/file | child0.exitToUiMs | 3 | 0.285 | 2.935 |
| fresh/on/file | child0.readMs | 3 | 1.000 | 1.065 |
| fresh/on/file | child0.adapterMs | 3 | 0.795 | 1.045 |
| fresh/on/file | child0.compileMs | 3 | 0.410 | 1.090 |
| fresh/on/file | child0.instantiateMs | 3 | 0.470 | 0.485 |
| fresh/on/pipeline | opfs.getDirectoryHandleMs | 3 | 2.735 | 4.315 |
| fresh/on/pipeline | opfs.getFileHandleMs | 3 | 2.115 | 3.410 |
| fresh/on/pipeline | opfs.getFileMs | 3 | 1.190 | 1.810 |
| fresh/on/pipeline | opfs.arrayBufferMs | 3 | 1.695 | 3.295 |
| fresh/on/pipeline | shellPromptToDomMs | 3 | 0.820 | 0.915 |
| fresh/on/pipeline | localEchoDomAndScrollMs | 3 | 0.385 | 0.410 |
| fresh/on/pipeline | outputDomAndScrollMs | 3 | 0.805 | 1.060 |
| fresh/on/pipeline | opfsOpenMs | 3 | 4.925 | 8.330 |
| fresh/on/pipeline | shellPreparationMs | 3 | 2.645 | 3.535 |
| fresh/on/pipeline | shellToFirstSpawnMs | 3 | 1.870 | 2.010 |
| fresh/on/pipeline | firstSpawnToLastExitMs | 3 | 42.580 | 54.680 |
| fresh/on/pipeline | lastExitToPromptDomMs | 3 | 1.055 | 1.145 |
| fresh/on/pipeline | child0.durationMs | 3 | 21.010 | 25.150 |
| fresh/on/pipeline | child1.durationMs | 3 | 16.450 | 19.525 |
| fresh/on/pipeline | child2.durationMs | 3 | 14.805 | 21.240 |
| fresh/on/pipeline | child0.requestToCoreMs | 3 | 0.230 | 0.460 |
| fresh/on/pipeline | child0.coreToStartMs | 3 | 0.165 | 0.200 |
| fresh/on/pipeline | child0.workerStartupMs | 3 | 11.670 | 14.345 |
| fresh/on/pipeline | child0.startToReceiveMs | 3 | 8.940 | 11.265 |
| fresh/on/pipeline | child0.workerCreateToModuleMs | 3 | 8.450 | 10.450 |
| fresh/on/pipeline | child0.readyToExitMs | 3 | 9.260 | 10.720 |
| fresh/on/pipeline | child0.runMs | 3 | 8.800 | 10.325 |
| fresh/on/pipeline | child0.closeMs | 3 | 0.170 | 0.180 |
| fresh/on/pipeline | child0.exitToUiMs | 3 | 0.190 | 1.025 |
| fresh/on/pipeline | child0.readMs | 3 | 0.875 | 1.025 |
| fresh/on/pipeline | child0.adapterMs | 3 | 0.745 | 0.850 |
| fresh/on/pipeline | child0.compileMs | 3 | 0.355 | 0.390 |
| fresh/on/pipeline | child0.instantiateMs | 3 | 0.470 | 0.500 |
| fresh/on/pipeline | child1.requestToCoreMs | 3 | 0.205 | 0.235 |
| fresh/on/pipeline | child1.coreToStartMs | 3 | 0.265 | 0.630 |
| fresh/on/pipeline | child1.workerStartupMs | 3 | 13.315 | 15.280 |
| fresh/on/pipeline | child1.startToReceiveMs | 3 | 10.060 | 10.565 |
| fresh/on/pipeline | child1.workerCreateToModuleMs | 3 | 9.290 | 10.140 |
| fresh/on/pipeline | child1.readyToExitMs | 3 | 3.085 | 4.190 |
| fresh/on/pipeline | child1.runMs | 3 | 1.610 | 3.990 |
| fresh/on/pipeline | child1.closeMs | 3 | 0.155 | 1.050 |
| fresh/on/pipeline | child1.exitToUiMs | 3 | 0.110 | 0.325 |
| fresh/on/pipeline | child1.readMs | 3 | 1.740 | 2.825 |
| fresh/on/pipeline | child1.adapterMs | 3 | 0.730 | 1.240 |
| fresh/on/pipeline | child1.compileMs | 3 | 0.355 | 0.365 |
| fresh/on/pipeline | child1.instantiateMs | 3 | 0.505 | 0.515 |
| fresh/on/pipeline | child2.requestToCoreMs | 3 | 0.290 | 0.350 |
| fresh/on/pipeline | child2.coreToStartMs | 3 | 0.155 | 0.160 |
| fresh/on/pipeline | child2.workerStartupMs | 3 | 11.895 | 18.620 |
| fresh/on/pipeline | child2.startToReceiveMs | 3 | 9.320 | 15.505 |
| fresh/on/pipeline | child2.workerCreateToModuleMs | 3 | 8.770 | 14.985 |
| fresh/on/pipeline | child2.readyToExitMs | 3 | 2.560 | 2.840 |
| fresh/on/pipeline | child2.runMs | 3 | 1.765 | 2.160 |
| fresh/on/pipeline | child2.closeMs | 3 | 0.140 | 0.140 |
| fresh/on/pipeline | child2.exitToUiMs | 3 | 0.985 | 0.990 |
| fresh/on/pipeline | child2.readMs | 3 | 0.800 | 1.030 |
| fresh/on/pipeline | child2.adapterMs | 3 | 0.745 | 1.855 |
| fresh/on/pipeline | child2.compileMs | 3 | 0.425 | 0.435 |
| fresh/on/pipeline | child2.instantiateMs | 3 | 0.450 | 0.615 |
| fresh/on/builtin | shellPromptToDomMs | 3 | 10.870 | 11.465 |
| fresh/on/builtin | localEchoDomAndScrollMs | 3 | 0.255 | 0.410 |
| fresh/on/builtin | outputDomAndScrollMs | 3 | 0.195 | 0.270 |
| fresh/on/builtin | opfsOpenMs | 3 | 0.000 | 0.000 |
| fresh/on/builtin | shellPreparationMs | 3 | 0.000 | 0.000 |
| fresh/on/builtin | shellToPromptDomMs | 3 | 11.145 | 11.825 |
| reload/off/p1-true | child0.durationMs | 3 | 13.495 | 14.730 |
| reload/off/p2-true | child0.durationMs | 3 | 43.645 | 45.465 |
| reload/off/p1-echo | child0.durationMs | 3 | 14.770 | 15.090 |
| reload/off/p2-echo | child0.durationMs | 3 | 48.350 | 50.465 |
| reload/off/file | child0.durationMs | 3 | 16.380 | 17.290 |
| reload/off/pipeline | child0.durationMs | 3 | 19.555 | 23.140 |
| reload/off/pipeline | child1.durationMs | 3 | 18.145 | 19.240 |
| reload/off/pipeline | child2.durationMs | 3 | 12.705 | 15.555 |
| fresh/off/p1-true | child0.durationMs | 3 | 13.480 | 14.295 |
| fresh/off/p2-true | child0.durationMs | 3 | 48.880 | 54.830 |
| fresh/off/p1-echo | child0.durationMs | 3 | 13.885 | 16.295 |
| fresh/off/p2-echo | child0.durationMs | 3 | 44.730 | 51.255 |
| fresh/off/file | child0.durationMs | 3 | 15.760 | 19.575 |
| fresh/off/pipeline | child0.durationMs | 3 | 19.140 | 19.300 |
| fresh/off/pipeline | child1.durationMs | 3 | 15.455 | 15.690 |
| fresh/off/pipeline | child2.durationMs | 3 | 12.735 | 13.455 |

Do not add nested intervals, per-child startup/run/stdio/wait durations, or drawing time. Only input→shell, shell→first spawn, first spawn→last EXIT and last EXIT→prompt DOM form the outer wall-time partition (builtin uses shell→prompt).

See docs/benchmarks-e2e.md for reproduction, cache/clock definitions, trace capture and comparison to the separate Worker benchmark.
