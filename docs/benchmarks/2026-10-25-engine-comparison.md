# Component engine comparison

Revision: da7a02adcf8070723d90a652ad659b1f7775dd69 (dirty: false); Chromium 154.0.8037.57; Node v24.19.0; INTEL(R) XEON(R) PLATINUM 8573C.
Independent browser process/context/page/Worker; empty application/OPFS cache, verified miss (or disabled). OS page cache is not flushed. No translator/runtime preloading before new Worker().

| Engine | Cold successes/attempts | Median ms | p95 ms | Improvement | Bootstrap 95% CI | Mandatory compatibility |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| jco 1.15.1 | 30/30 | 1407.693 | 2434.805 | N/A | N/A | Pass |
| polyengine 0.6.7 | 30/30 | 415.448 | 606.700 | 70.487% | 69.840% … 73.830% | Not passed |
| jsco 0.2.0-preview.0 | 30/30 | 115.105 | 200.985 | 91.823% | 91.243% … 92.847% | Pass |

Decision: **jsco** — Fastest eligible cold startup median.

## All successful measurements

| Engine | Scenario | Metric | N | Median | Min | Max | Mean | p95 | Stddev |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| jco | p2/startup-cold | startupMs | 30 | 1407.693 | 1303.885 | 2520.390 | 1550.274 | 2434.805 | 294.526 |
| jco | p2/startup-cold | readMs | 30 | 2.265 | 1.395 | 30.980 | 5.779 | 30.080 | 8.228 |
| jco | p2/startup-cold | adapterMs | 30 | 1.833 | 1.110 | 29.630 | 3.309 | 12.565 | 5.308 |
| jco | p2/startup-cold | component.keyMs | 30 | 0.920 | 0.610 | 4.765 | 1.467 | 4.380 | 1.180 |
| jco | p2/startup-cold | component.lookupMs | 30 | 8.292 | 3.680 | 45.340 | 12.059 | 32.175 | 10.087 |
| jco | p2/startup-cold | component.converterLoadMs | 30 | 678.370 | 610.720 | 1291.450 | 722.813 | 904.685 | 130.170 |
| jco | p2/startup-cold | component.convertMs | 30 | 665.858 | 589.135 | 1474.800 | 743.004 | 1178.300 | 189.494 |
| jco | p2/startup-cold | component.instantiateMs | 30 | 17.315 | 10.995 | 79.305 | 23.004 | 46.670 | 14.171 |
| jco | p2/startup-cold | component.publishMs | 30 | 44.985 | 23.915 | 141.685 | 48.148 | 89.680 | 22.491 |
| jco | p2/startup-cold | loadMs | 30 | 1371.470 | 1277.945 | 2492.515 | 1503.351 | 2391.255 | 287.728 |
| jco | p2/startup-warm | startupMs | 30 | 46.453 | 29.550 | 90.980 | 49.339 | 79.025 | 13.820 |
| jco | p2/startup-warm | readMs | 30 | 1.265 | 0.965 | 13.620 | 1.762 | 2.770 | 2.230 |
| jco | p2/startup-warm | adapterMs | 30 | 1.085 | 0.860 | 9.000 | 1.879 | 7.300 | 2.092 |
| jco | p2/startup-warm | component.keyMs | 30 | 0.573 | 0.405 | 3.065 | 0.653 | 0.790 | 0.458 |
| jco | p2/startup-warm | component.lookupMs | 30 | 11.320 | 6.810 | 19.225 | 11.927 | 16.555 | 2.585 |
| jco | p2/startup-warm | component.instantiateMs | 30 | 9.495 | 6.335 | 32.795 | 12.204 | 24.590 | 6.485 |
| jco | p2/startup-warm | loadMs | 30 | 22.545 | 14.040 | 50.000 | 25.552 | 46.170 | 8.342 |
| jco | p2/startup-opfs-reload | startupMs | 30 | 34.245 | 26.230 | 74.280 | 39.240 | 70.635 | 12.158 |
| jco | p2/startup-opfs-reload | readMs | 30 | 1.292 | 0.935 | 6.590 | 1.671 | 3.520 | 1.087 |
| jco | p2/startup-opfs-reload | adapterMs | 30 | 1.040 | 0.765 | 10.640 | 1.637 | 5.335 | 1.902 |
| jco | p2/startup-opfs-reload | component.keyMs | 30 | 0.523 | 0.375 | 14.225 | 1.105 | 2.170 | 2.459 |
| jco | p2/startup-opfs-reload | component.lookupMs | 30 | 10.902 | 7.445 | 23.150 | 11.638 | 23.075 | 3.616 |
| jco | p2/startup-opfs-reload | component.instantiateMs | 30 | 8.113 | 6.620 | 25.720 | 9.945 | 20.725 | 4.270 |
| jco | p2/startup-opfs-reload | loadMs | 30 | 20.038 | 15.680 | 42.070 | 23.458 | 40.555 | 7.256 |
| jco | p2/startup-warm-miss | startupMs | 30 | 944.458 | 826.610 | 1707.635 | 1010.844 | 1633.980 | 205.110 |
| jco | p2/startup-warm-miss | readMs | 30 | 1.158 | 0.955 | 11.055 | 1.650 | 3.555 | 1.819 |
| jco | p2/startup-warm-miss | adapterMs | 30 | 0.952 | 0.820 | 3.820 | 1.110 | 2.290 | 0.565 |
| jco | p2/startup-warm-miss | component.keyMs | 30 | 0.465 | 0.400 | 2.635 | 0.553 | 0.620 | 0.390 |
| jco | p2/startup-warm-miss | component.lookupMs | 30 | 2.898 | 2.155 | 4.885 | 2.993 | 4.815 | 0.693 |
| jco | p2/startup-warm-miss | component.converterLoadMs | 30 | 247.145 | 232.020 | 535.540 | 268.394 | 403.845 | 61.937 |
| jco | p2/startup-warm-miss | component.convertMs | 30 | 651.538 | 543.965 | 1406.255 | 704.624 | 1059.360 | 174.125 |
| jco | p2/startup-warm-miss | component.instantiateMs | 30 | 15.105 | 11.595 | 42.630 | 18.530 | 36.435 | 7.557 |
| jco | p2/startup-warm-miss | component.publishMs | 30 | 41.753 | 22.795 | 156.235 | 48.679 | 89.625 | 26.371 |
| jco | p2/startup-warm-miss | loadMs | 30 | 932.360 | 809.340 | 1695.335 | 995.631 | 1621.260 | 206.147 |
| jco | p2/cpu | runMs | 30 | 37.605 | 33.055 | 115.530 | 45.106 | 84.590 | 17.575 |
| jco | p2/memory-miss | jsHeapUsedBytes | 30 | 11151898.000 | 11079376.000 | 11208336.000 | 11149013.333 | 11184888.000 | 33137.742 |
| jco | p2/memory-miss | jsHeapTotalBytes | 30 | 12840960.000 | 12578816.000 | 13103104.000 | 12814745.600 | 12840960.000 | 103759.584 |
| jco | p2/memory-miss | embedderHeapUsedBytes | 30 | 724432.000 | 722384.000 | 725680.000 | 724533.333 | 725424.000 | 558.143 |
| jco | p2/memory-miss | backingStorageBytes | 30 | 20035136.000 | 20034939.000 | 20069302.000 | 20036229.733 | 20035175.000 | 6142.132 |
| jco | p2/memory-opfs | jsHeapUsedBytes | 30 | 756710.000 | 722960.000 | 803364.000 | 761176.800 | 803364.000 | 26686.602 |
| jco | p2/memory-opfs | jsHeapTotalBytes | 30 | 2097152.000 | 2097152.000 | 2097152.000 | 2097152.000 | 2097152.000 | 0.000 |
| jco | p2/memory-opfs | embedderHeapUsedBytes | 30 | 773712.000 | 773712.000 | 773712.000 | 773712.000 | 773712.000 | 0.000 |
| jco | p2/memory-opfs | backingStorageBytes | 30 | 536774.000 | 536769.000 | 536868.000 | 536795.067 | 536868.000 | 40.316 |
| polyengine | p2/startup-cold | startupMs | 30 | 415.448 | 315.775 | 817.645 | 434.762 | 606.700 | 96.315 |
| polyengine | p2/startup-cold | readMs | 30 | 2.507 | 1.265 | 34.340 | 4.535 | 18.945 | 6.430 |
| polyengine | p2/startup-cold | adapterMs | 30 | 2.233 | 1.040 | 23.815 | 3.232 | 6.440 | 4.040 |
| polyengine | p2/startup-cold | component.engineLoadMs | 30 | 290.868 | 234.265 | 451.145 | 299.820 | 439.830 | 53.899 |
| polyengine | p2/startup-cold | component.keyMs | 30 | 0.747 | 0.530 | 21.035 | 1.592 | 4.620 | 3.684 |
| polyengine | p2/startup-cold | component.lookupMs | 30 | 4.335 | 2.640 | 142.955 | 10.612 | 42.495 | 25.591 |
| polyengine | p2/startup-cold | component.transformMs | 30 | 66.637 | 46.705 | 122.605 | 69.860 | 114.375 | 18.557 |
| polyengine | p2/startup-cold | component.instantiateMs | 30 | 12.538 | 10.015 | 24.225 | 13.325 | 20.675 | 2.861 |
| polyengine | p2/startup-cold | component.publishMs | 30 | 19.448 | 15.460 | 54.620 | 23.927 | 42.830 | 9.742 |
| polyengine | p2/startup-cold | loadMs | 30 | 373.198 | 298.460 | 744.860 | 396.259 | 567.210 | 87.513 |
| polyengine | p2/startup-warm | startupMs | 30 | 76.790 | 67.720 | 121.000 | 81.621 | 111.715 | 12.497 |
| polyengine | p2/startup-warm | readMs | 30 | 1.105 | 0.915 | 4.655 | 1.244 | 1.460 | 0.650 |
| polyengine | p2/startup-warm | adapterMs | 30 | 1.038 | 0.740 | 2.470 | 1.088 | 1.850 | 0.323 |
| polyengine | p2/startup-warm | component.engineLoadMs | 30 | 43.180 | 38.840 | 74.175 | 46.213 | 69.245 | 8.424 |
| polyengine | p2/startup-warm | component.keyMs | 30 | 0.470 | 0.390 | 0.980 | 0.496 | 0.810 | 0.117 |
| polyengine | p2/startup-warm | component.lookupMs | 30 | 7.615 | 6.265 | 14.055 | 8.141 | 11.855 | 1.733 |
| polyengine | p2/startup-warm | component.instantiateMs | 30 | 11.073 | 9.000 | 17.860 | 11.380 | 13.910 | 1.772 |
| polyengine | p2/startup-warm | loadMs | 30 | 63.110 | 57.300 | 97.060 | 66.723 | 94.820 | 9.969 |
| polyengine | p2/startup-opfs-reload | startupMs | 30 | 78.337 | 66.205 | 181.410 | 88.209 | 137.525 | 25.806 |
| polyengine | p2/startup-opfs-reload | readMs | 30 | 1.253 | 0.905 | 5.095 | 1.510 | 3.960 | 0.901 |
| polyengine | p2/startup-opfs-reload | adapterMs | 30 | 0.992 | 0.705 | 3.530 | 1.144 | 2.335 | 0.547 |
| polyengine | p2/startup-opfs-reload | component.engineLoadMs | 30 | 44.337 | 39.495 | 105.515 | 51.319 | 84.385 | 14.862 |
| polyengine | p2/startup-opfs-reload | component.keyMs | 30 | 0.458 | 0.360 | 2.625 | 0.592 | 1.985 | 0.471 |
| polyengine | p2/startup-opfs-reload | component.lookupMs | 30 | 7.600 | 6.050 | 19.770 | 9.241 | 19.665 | 3.866 |
| polyengine | p2/startup-opfs-reload | component.instantiateMs | 30 | 11.435 | 9.695 | 28.580 | 13.437 | 26.415 | 5.068 |
| polyengine | p2/startup-opfs-reload | loadMs | 30 | 65.218 | 56.655 | 154.750 | 75.077 | 123.975 | 22.964 |
| polyengine | p2/startup-warm-miss | startupMs | 30 | 183.958 | 162.025 | 456.960 | 200.965 | 262.750 | 53.505 |
| polyengine | p2/startup-warm-miss | readMs | 30 | 1.172 | 0.935 | 4.680 | 1.401 | 3.155 | 0.731 |
| polyengine | p2/startup-warm-miss | adapterMs | 30 | 0.993 | 0.830 | 2.675 | 1.071 | 1.590 | 0.339 |
| polyengine | p2/startup-warm-miss | component.engineLoadMs | 30 | 103.670 | 93.755 | 276.445 | 116.902 | 174.575 | 35.448 |
| polyengine | p2/startup-warm-miss | component.keyMs | 30 | 0.488 | 0.395 | 3.395 | 0.658 | 2.505 | 0.629 |
| polyengine | p2/startup-warm-miss | component.lookupMs | 30 | 3.063 | 2.565 | 13.095 | 3.783 | 7.560 | 2.030 |
| polyengine | p2/startup-warm-miss | component.transformMs | 30 | 49.350 | 39.570 | 121.460 | 53.766 | 68.610 | 15.119 |
| polyengine | p2/startup-warm-miss | component.instantiateMs | 30 | 11.463 | 9.240 | 27.660 | 12.668 | 25.680 | 4.307 |
| polyengine | p2/startup-warm-miss | component.publishMs | 30 | 18.580 | 14.520 | 63.100 | 21.767 | 40.465 | 9.603 |
| polyengine | p2/startup-warm-miss | loadMs | 30 | 173.323 | 150.280 | 434.540 | 188.345 | 252.040 | 50.952 |
| polyengine | p2/cpu | runMs | 30 | 41.855 | 38.475 | 52.950 | 42.628 | 47.805 | 2.897 |
| polyengine | p2/memory-miss | jsHeapUsedBytes | 30 | 4453592.000 | 4229732.000 | 4682960.000 | 4442087.867 | 4659952.000 | 177191.761 |
| polyengine | p2/memory-miss | jsHeapTotalBytes | 30 | 6967296.000 | 6443008.000 | 6967296.000 | 6810009.600 | 6967296.000 | 230527.790 |
| polyengine | p2/memory-miss | embedderHeapUsedBytes | 30 | 2650792.000 | 2650792.000 | 2650792.000 | 2650792.000 | 2650792.000 | 0.000 |
| polyengine | p2/memory-miss | backingStorageBytes | 30 | 11671046.000 | 11671045.000 | 11723874.000 | 11681628.300 | 11697526.000 | 14636.856 |
| polyengine | p2/memory-opfs | jsHeapUsedBytes | 30 | 1430128.000 | 1403308.000 | 2122900.000 | 1475322.000 | 1636684.000 | 132177.690 |
| polyengine | p2/memory-opfs | jsHeapTotalBytes | 30 | 4194304.000 | 3670016.000 | 4980736.000 | 4106922.667 | 4718592.000 | 326951.011 |
| polyengine | p2/memory-opfs | embedderHeapUsedBytes | 30 | 773712.000 | 773712.000 | 773712.000 | 773712.000 | 773712.000 | 0.000 |
| polyengine | p2/memory-opfs | backingStorageBytes | 30 | 2923628.000 | 2923628.000 | 2923629.000 | 2923628.033 | 2923628.000 | 0.180 |
| jsco | p2/startup-cold | startupMs | 30 | 115.105 | 75.365 | 206.015 | 120.616 | 200.985 | 31.433 |
| jsco | p2/startup-cold | readMs | 30 | 3.048 | 1.290 | 85.285 | 7.744 | 30.490 | 15.994 |
| jsco | p2/startup-cold | adapterMs | 30 | 1.823 | 1.100 | 8.810 | 2.555 | 7.045 | 1.863 |
| jsco | p2/startup-cold | component.engineLoadMs | 30 | 26.408 | 17.715 | 53.840 | 30.506 | 49.265 | 11.306 |
| jsco | p2/startup-cold | component.prepareMs | 30 | 34.958 | 18.220 | 78.245 | 37.717 | 68.285 | 14.575 |
| jsco | p2/startup-cold | component.instantiateMs | 30 | 8.233 | 6.385 | 50.725 | 13.235 | 36.450 | 10.554 |
| jsco | p2/startup-cold | loadMs | 30 | 81.670 | 46.955 | 150.505 | 82.379 | 135.140 | 22.573 |
| jsco | p2/startup-warm-miss | startupMs | 30 | 63.318 | 40.860 | 185.035 | 67.222 | 95.160 | 25.042 |
| jsco | p2/startup-warm-miss | readMs | 30 | 1.640 | 0.930 | 8.655 | 2.392 | 8.110 | 1.914 |
| jsco | p2/startup-warm-miss | adapterMs | 30 | 1.120 | 0.885 | 3.745 | 1.446 | 3.700 | 0.709 |
| jsco | p2/startup-warm-miss | component.engineLoadMs | 30 | 11.888 | 8.525 | 28.830 | 13.483 | 27.270 | 4.850 |
| jsco | p2/startup-warm-miss | component.prepareMs | 30 | 20.620 | 13.855 | 48.100 | 23.159 | 43.580 | 8.569 |
| jsco | p2/startup-warm-miss | component.instantiateMs | 30 | 6.425 | 5.450 | 27.535 | 8.443 | 20.760 | 4.827 |
| jsco | p2/startup-warm-miss | loadMs | 30 | 43.657 | 30.320 | 74.115 | 45.715 | 66.355 | 11.000 |
| jsco | p2/cpu | runMs | 30 | 35.923 | 33.760 | 66.640 | 38.089 | 58.705 | 6.957 |
| jsco | p2/memory-disabled | jsHeapUsedBytes | 30 | 1569142.000 | 1485080.000 | 1629780.000 | 1572614.400 | 1614932.000 | 31910.767 |
| jsco | p2/memory-disabled | jsHeapTotalBytes | 30 | 4849664.000 | 4194304.000 | 5242880.000 | 4718592.000 | 4980736.000 | 295033.338 |
| jsco | p2/memory-disabled | embedderHeapUsedBytes | 30 | 773712.000 | 773712.000 | 773712.000 | 773712.000 | 773712.000 | 0.000 |
| jsco | p2/memory-disabled | backingStorageBytes | 30 | 346741.500 | 346737.000 | 346848.000 | 346764.467 | 346848.000 | 43.473 |

## Failures (no samples discarded)


## Compatibility

```json
{
  "jco": {
    "passed": true,
    "revision": "2a1c6292675fff36b6729ad088a30497a2ae099a",
    "dirty": true,
    "engine": "jco",
    "startedAt": "2026-10-25T02:50:28.369Z",
    "suites": {
      "production": {
        "passed": true,
        "command": {
          "status": 0,
          "signal": null
        },
        "stats": {
          "startTime": "2026-10-25T02:51:01.192Z",
          "duration": 44898.471,
          "expected": 13,
          "skipped": 0,
          "unexpected": 0,
          "flaky": 0
        },
        "failures": [],
        "report": "jco-production.json",
        "log": "jco-production.log"
      },
      "dev": {
        "passed": true,
        "stats": {
          "startTime": "2026-10-25T02:52:07.463Z",
          "duration": 326632.293,
          "expected": 127,
          "skipped": 0,
          "unexpected": 2,
          "flaky": 0
        },
        "failures": [
          {
            "title": "real lifecycle-parent → p2-cat: nonzero, exit-first",
            "status": "failed",
            "error": "Error: page.evaluate: Execution context was destroyed, most likely because of a navigation."
          },
          {
            "title": "real lifecycle-parent → p2-cat: nonzero, ready-first",
            "status": "failed",
            "error": "Error: page.evaluate: Execution context was destroyed, most likely because of a navigation."
          }
        ],
        "report": "jco-dev.json",
        "rerun": {
          "passed": true,
          "stats": {
            "startTime": "2026-10-25T02:57:51.241Z",
            "duration": 11666.119,
            "expected": 2,
            "skipped": 0,
            "unexpected": 0,
            "flaky": 0
          },
          "failures": [],
          "report": "jco-dev-rerun.json"
        },
        "infrastructureNote": "Two cases interrupted by Vite reload during concurrent build/metadata updates. Both pass with no file updates. Original failed results retained."
      }
    },
    "cacheTestPolicy": "Existing Jco cache regression included",
    "finishedAt": "2026-10-25T02:51:46.119Z",
    "note": "Full development suite plus production application suite.",
    "fixtures": {
      "p2-echo": "7be440403d2e37950ae9d1a663087d9b759c7bfb16a47972ddf37e8a28f2994d",
      "p2-cat": "104954b303320430d3de6f3b9b63caf5673b1544161747c83ac663ffef29a061",
      "p2-fs-probe": "7820453d1118dd459930a12d2462318364840293c24a7e1bf3baa6c63c4093c4",
      "p2-process-probe": "cab2645d403cda2e2ae9804ba47f9015a8a5dfed2ab6516954d6d5753e823a54"
    }
  },
  "polyengine": {
    "passed": false,
    "revision": "2a1c6292675fff36b6729ad088a30497a2ae099a",
    "dirty": true,
    "engine": "polyengine",
    "startedAt": "2026-10-25T02:51:46.134Z",
    "suites": {
      "production": {
        "passed": false,
        "command": {
          "status": 1,
          "signal": null
        },
        "stats": {
          "startTime": "2026-10-25T02:52:41.160Z",
          "duration": 51916.56,
          "expected": 11,
          "skipped": 0,
          "unexpected": 1,
          "flaky": 0
        },
        "failures": [
          {
            "title": "wasip2 commands receive argv, env, cwd and exit status",
            "status": "failed",
            "error": "Error: \u001b[2mexpect(\u001b[22m\u001b[31mreceived\u001b[39m\u001b[2m).\u001b[22mtoContain\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m) // indexOf\u001b[22m\n\nExpected substring: \u001b[32m\"hello component こんにちは\u001b[39m\n\u001b[32m\"\u001b[39m\nReceived string:    \u001b[31m\"p2-echo \\\"hello component\\\" こんにちは\u001b[39m\n\u001b[31m/home $ \"\u001b[39m"
          }
        ],
        "report": "polyengine-production.json",
        "log": "polyengine-production.log"
      },
      "dev": {
        "passed": false,
        "stats": {
          "startTime": "2026-10-25T02:58:03.811Z",
          "duration": 36753.23,
          "expected": 6,
          "skipped": 0,
          "unexpected": 1,
          "flaky": 0
        },
        "failures": [
          {
            "title": "wasip2 commands receive argv, env, cwd and exit status",
            "status": "failed",
            "error": "Error: \u001b[2mexpect(\u001b[22m\u001b[31mreceived\u001b[39m\u001b[2m).\u001b[22mtoContain\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m) // indexOf\u001b[22m\n\nExpected substring: \u001b[32m\"hello component こんにちは\u001b[39m\n\u001b[32m\"\u001b[39m\nReceived string:    \u001b[31m\"p2-echo \\\"hello component\\\" こんにちは\u001b[39m\n\u001b[31m/home $ \"\u001b[39m"
          }
        ],
        "report": "polyengine-dev.json"
      }
    },
    "cacheTestPolicy": "Jco-specific application-cache assertion excluded; engine-specific cache/disabled tests in engines.spec.ts included in dev suite",
    "finishedAt": "2026-10-25T02:53:33.161Z",
    "note": "Focused WASI P2 dev suite, not full suite; ineligible because Unicode argv traps. Original may_leave violation reproduced with p2-echo こんにちは.",
    "fixtures": {
      "p2-echo": "7be440403d2e37950ae9d1a663087d9b759c7bfb16a47972ddf37e8a28f2994d",
      "p2-cat": "104954b303320430d3de6f3b9b63caf5673b1544161747c83ac663ffef29a061",
      "p2-fs-probe": "7820453d1118dd459930a12d2462318364840293c24a7e1bf3baa6c63c4093c4",
      "p2-process-probe": "cab2645d403cda2e2ae9804ba47f9015a8a5dfed2ab6516954d6d5753e823a54"
    }
  },
  "jsco": {
    "passed": true,
    "revision": "2a1c6292675fff36b6729ad088a30497a2ae099a",
    "dirty": true,
    "engine": "jsco",
    "startedAt": "2026-10-25T02:53:33.182Z",
    "suites": {
      "production": {
        "passed": true,
        "command": {
          "status": 0,
          "signal": null
        },
        "stats": {
          "startTime": "2026-10-25T02:54:36.155Z",
          "duration": 48081.438,
          "expected": 12,
          "skipped": 0,
          "unexpected": 0,
          "flaky": 0
        },
        "failures": [],
        "report": "jsco-production.json",
        "log": "jsco-production.log"
      },
      "dev": {
        "passed": true,
        "stats": {
          "startTime": "2026-10-25T02:47:25.919Z",
          "duration": 152107.215,
          "expected": 128,
          "skipped": 0,
          "unexpected": 0,
          "flaky": 0
        },
        "failures": [],
        "report": "jsco-dev.json"
      }
    },
    "cacheTestPolicy": "Jco-specific application-cache assertion excluded; engine-specific cache/disabled tests in engines.spec.ts included in dev suite",
    "finishedAt": "2026-10-25T02:55:24.324Z",
    "note": "Full development suite plus production application suite.",
    "fixtures": {
      "p2-echo": "7be440403d2e37950ae9d1a663087d9b759c7bfb16a47972ddf37e8a28f2994d",
      "p2-cat": "104954b303320430d3de6f3b9b63caf5673b1544161747c83ac663ffef29a061",
      "p2-fs-probe": "7820453d1118dd459930a12d2462318364840293c24a7e1bf3baa6c63c4093c4",
      "p2-process-probe": "cab2645d403cda2e2ae9804ba47f9015a8a5dfed2ab6516954d6d5753e823a54"
    }
  }
}
```

Full raw samples, chronological order, timestamps, binary SHA-256, asset inventory (raw/gzip bytes and hashes), failures and environment metadata are in the adjacent JSON.

engineLoadMs includes lazy adapter/runtime and translator initialization; transformMs is translation, prepareMs is direct parse/compile (jsco); converterLoadMs/convertMs are legacy Jco engineLoad/transform equivalents. publishMs is after READY, joined before EXIT. loadMs encloses these spans: do not sum nested intervals. Absent transformMs/convertMs means not applicable, never zero-filled.

CDP Runtime.getHeapUsage after READY, held Worker; not peak or browser RSS.
