# Runtime migration validation

Baseline: main `b98f7d4cb24ff41e00c5552246c18c16cfbfdd80`.
WASI 0.3.2 upstream tag: `bdadbbb8cadd287cc5014c4b5a0bf76efc60291c`.

## Step 1 gate: passed

| Check | Result |
| --- | --- |
| `npm run check` (including public types, OS build and Runtime dependency check) | pass |
| `npm run check:wit` and `diff -ru wit/generated work/wit-generated` | pass |
| `npm run build:apps` | pass |
| `CHROMIUM_PATH=/usr/bin/chromium npm test` | 130 passed, 2 production-only skipped |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:production` | 2 passed |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:pages` | pass |
| `npm run test:benchmark` | pass |
| `CHROMIUM_PATH=/usr/bin/chromium npm run benchmark -- --trials 1` | pass |

The browser suite preserves standard P1/P2 binaries, Host creation/disposal,
Resource move/borrow, independent descriptor/stream lifetimes, file locking,
Pipe accounting, pending I/O, spawn/wait/stop and actual Worker READY/EXIT races.
Four added tests cover borrowed Context survival, one-shot Runtime execution,
idempotent disposal and partial initialization for P1 and P2.

Context/service logic is shared. Runtime adapters have no value imports of OS
implementations (enforced by `check:runtime`). File stdio retains its ambient
connection when an individual getter view is dropped. Resource drops start
immediately when no I/O must drain, and asynchronous release acknowledgements are
awaited. ABI drop bookkeeping removes settled entries, and P1 fd moves release
metadata descriptors independently of their transferred streams.

The isolated benchmark supervisor now acknowledges stream-release control RPC,
as Core does in production. It still does not relay data. Run timing excludes
cleanup, matching the original measurement interval.

## Step 1 measurements

Node 24.19.0, system Chromium 154.0.8037.57, Playwright 1.56.1, wasi-sdk 27.0,
jsco 0.2.0-preview.0, jco 1.15.1, Linux x64. There is one retained sample per
scenario. Startup values are ms and heap values bytes.

| Scenario / metric | Baseline | Step 1 | Change |
| --- | ---: | ---: | ---: |
| p1/startup-cold / startupMs | 102.45 | 63.35 | -38.2% |
| p1/startup-warm / startupMs | 88.33 | 41.00 | -53.6% |
| p2/startup-cold / startupMs | 375.45 | 193.83 | -48.4% |
| p2/startup-warm / startupMs | 290.26 | 102.02 | -64.9% |
| p1/memory-loaded / jsHeapUsedBytes | 479268.00 | 565612.00 | +18.0% |
| p2/memory-loaded / jsHeapUsedBytes | 1524252.00 | 1618708.00 | +6.2% |

[Baseline raw samples](benchmarks/runtime-baseline.json) and
[Step 1 raw samples](benchmarks/runtime-step1.json) include startup, memory,
CPU, OPFS and direct Pipe measurements. This is an exploratory comparison: the
initial baseline overlapped other regression activity and each scenario has only
one retained sample. Lower startup samples cannot establish a causal speedup.
The shared resource graph increases held-worker JS heap; these measurements do
not establish RSS or sustained-memory growth. No fixed performance threshold was
introduced. Pipe bytes and local filesystem I/O retain their direct data paths.

## Step 2 gate: passed

The public API is now generated from the pinned 0.3.2 graph: 26 standard
interfaces and two Walos interfaces, with 143 operations. Standard Results,
resources, native Future/Stream contracts and explicit Host wrappers replace the
old public groups. P1/P2 keep their standard binary ABI and borrow the new Context.
Walos's custom P1/P2 ABI names changed intentionally; its fixtures were rebuilt.
HTTP, sockets, timezone and unsupported filesystem operations throw identifiable
errors from the common Context. The completeness inventory is checked in CI.

| Check | Result |
| --- | --- |
| `npm run check` (build, public types, Runtime boundaries, generated WIT API) | pass |
| `npm run check:wit` plus generated diff; `npm run check:wit:p3` | pass |
| `npm run build:apps` | pass |
| Full development browser suite | 136 passed, 2 production-only skipped |
| Additional focused raw API, cancellation, errors, P1/P2 and ownership checks | pass |
| Production browser suite | 2 passed |
| Pages build and serving check | pass |
| Statistics tests and one-trial benchmark | pass |

A final focused test preserves the WIT `read-only` filesystem error variant
through the common service and ABI conversions. Dedicated channels test bounded
writes, EOF and cancellation; real P1/P2 probes verify common unimplemented Traps.
No legacy test was removed or skipped to accommodate these changes.

## Step 2 measurements

Same browser and machine as Step 1; jco upgraded to 1.39.0 to parse the official
P3 WIT. P1/P2 fixtures still use wasi-sdk 27.0. One retained sample per scenario.

| Scenario / metric | Step 1 | Step 2 | Change |
| --- | ---: | ---: | ---: |
| p1/startup-cold / startupMs | 63.35 | 57.91 | -8.6% |
| p1/startup-warm / startupMs | 41.00 | 41.67 | +1.6% |
| p2/startup-cold / startupMs | 193.83 | 214.92 | +10.9% |
| p2/startup-warm / startupMs | 102.02 | 116.61 | +14.3% |
| p1/memory-loaded / jsHeapUsedBytes | 565612.00 | 769560.00 | +36.1% |
| p2/memory-loaded / jsHeapUsedBytes | 1618708.00 | 1808240.00 | +11.7% |

[Step 2 raw samples](benchmarks/runtime-step2.json) include OPFS and Pipe paths.
These single samples describe observed costs; they cannot establish performance
trends. The extra public projection and ABI resource views add allocations; no
fixed threshold is applied. Data still flows through local OPFS and direct Ports.

Step 3 has not yet begun at this gate. P3 execution is not claimed here.
