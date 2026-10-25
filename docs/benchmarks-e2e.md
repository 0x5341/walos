# Terminal command E2E latency

[Issue #20](https://github.com/0x5341/walos/issues/20) measures the workbench's
real Enter → `Walos.writeInput` → P1 shell → OPFS → Core → Process Worker →
EXIT/wait → foreground restoration → TTY drain → prompt DOM path. The existing
[Worker benchmark](benchmarks.md) and its `startupMs` schema are unchanged.

## Reproduce

Use the locked dependencies, Node >=22.14, wasi-sdk 27, wit-bindgen 0.46.0 and a
desktop Chromium with JSPI. See the README setup instructions. Run on an idle
machine, separately from builds/tests/other benchmarks:

```sh
npm ci
bash scripts/setup-sdk.sh
bash scripts/setup-wit-bindgen.sh
npx playwright install --with-deps chromium
npm run test:benchmark:e2e
npm run benchmark:e2e -- --trials 30 --warmups 3 --output work/benchmarks/e2e.json
```

`CHROMIUM_PATH=/usr/bin/chromium` selects a system browser. The npm command builds
the actual application in production mode, then previews it on `127.0.0.1:4185`.
Keep that port free. The runner launches its own temporary browser contexts;
the user's existing workbench OPFS and `/home` are untouched. Each context gets
the same README fixture after boot, outside command timing. It uses the bundled
real applications, rather than the standalone synthetic Worker fixture.

The default runs all seven issue scenarios, first with detailed recording ON,
then OFF. Each mode uses one booted session: one labelled first-run cycle,
three excluded warmup cycles, then 30 retained cycles. Every cycle rotates its
first case. Order, session and command IDs are saved. Enter is delivered with
Playwright `press('Enter')`, after filling the actual input. The next input waits
for prompt DOM, its next rAF and diagnostic collection. The measured interval
starts inside the application's Enter handler; it excludes Playwright dispatch,
page loading and OS bootstrap.

After building once, additional conditions can use the runner directly:

```sh
# Repeat with reversed instrumentation order to assess session drift.
node benchmarks/e2e.mjs --trials 30 --details off,on --output work/benchmarks/e2e-reversed.json
# Reload retains context/OPFS. Fresh creates a context for every retained cycle.
node benchmarks/e2e.mjs --trials 30 --conditions reload,fresh --output work/benchmarks/e2e-cache.json
# Requires a display (or a separately documented Xvfb display).
node benchmarks/e2e.mjs --trials 30 --headed --output work/benchmarks/e2e-headed.json
# Auxiliary development-server measurement, never mix with production samples.
node benchmarks/e2e.mjs --mode development --trials 30 --output work/benchmarks/e2e-dev.json
```

`--details on`, `--details off` and `--details on,off` control detailed recording.
`--warmups 0` and `--trials 1` are appropriate for correctness smoke tests.
The fresh condition intentionally has no excluded warmups: each retained cycle
uses a fresh context. Within that cycle all cases still execute sequentially,
so the order states exactly which resources have already been used. Fresh
context does not mean a cold host filesystem or a new browser process. Reload
primes all applications before reloading and running its own labelled first
cycle, warmups and retained cycles. Raw boot timelines are separate session
metadata, including the `ui.bootstrap.start/end` span, never command samples.

The engine is the Vite `WALOS_COMPONENT_ENGINE` build selection (default `jsco`).
To compare Jco, rebuild with `WALOS_COMPONENT_ENGINE=jco npm run benchmark:e2e ...`;
label and store that run separately. P1 launches never invoke a P2 converter.
Development mode uses the current environment's engine define and source;
production mode requires rebuilding after changing the engine/source.

## Correlation and measurement boundaries

Diagnostics are installed only with `?benchmark=e2e`. The experimental
`@walos/os/diagnostics` subpath attaches before boot; `WalosOptions`, `WalosEvent`,
`writeInput` and the public WIT ABI are unchanged. Normal sessions never add
diagnostic fields to stream/control messages or record events. There is one
module-entry clock read in each Process Worker, so that late START receipt can
still describe module initialization. The shell's private `walos_diagnostics.mark`
import is otherwise a no-op. It is not a new public OS syscall.

1. Enter assigns a monotonic command ID, which travels on the existing stdin
   DATA message. The shell records receipt after `getline`, and its adapter
   propagates the ID through control RPCs and child specs.
2. After `printf` writes the next prompt, the shell sends a marker on the **same
   stdout MessagePort**, with that ID, exit status and the exact prompt byte
   count. Marker ordering follows the prompt DATA messages. It adds no RPC wait.
3. `Walos` holds the marker behind the same foreground/output-drain gate as the
   shell's buffered prompt. The UI correlates it with the actual DOM append
   timestamp of the final prompt bytes (before synchronous scrolling/layout),
   rather than the later marker receipt.
   It removes exactly the reported suffix bytes from captured shell output.
   Neither old prompt text nor `$ ` in input/output can signal completion.
4. Each DOM output append schedules rAF; the marker identifies the callback for
   the final prompt append. This is the next animation callback, **not evidence
   that painting/compositing or physical display completed**. Afterwards the
   harness checks shell input ownership and that the DOM input is enabled.

| Metric                        | Definition                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `inputToPromptDomMs`          | Enter handler → final prompt bytes appended to DOM; primary wall latency                                             |
| `inputToPromptFrameMs`        | Enter handler → rAF following those bytes                                                                            |
| `inputToFirstOutputMs`        | Enter handler → first command stdout/stderr appended; excludes local echo and the prompt; absent for silent commands |
| `inputToExitMs`               | Enter handler → last target child EXIT received by Walos; absent for builtin; per-child receipts are also saved      |
| `exits[].durationMs`          | Existing Core spawn → finish duration, retained without redefining it                                                |
| `processes[].workerStartupMs` | Real application `new Worker` → Core READY; comparable boundary to `startupMs`, with different executables/stdio     |

The successful scenarios use the shell stdout for the prompt and child streams
for application output. The shell's long-lived stderr is an independent port;
this harness does not claim a general terminal protocol for asynchronously
interleaved shell error output or interactive/multiline commands. It deliberately
submits one complete line, only when the prior command's marker is complete.

## Diagnostic timeline and clocks

Recording is buffered locally, with no hot-path diagnostic console output.
READY and EXIT carry the child's buffer along with existing `ProcessMetrics`.
The shell's prompt marker carries its buffer. Core and UI buffers are collected
after the measured rAF, so collection and JSON serialization stay outside E2E.
Stream read/write/CLOSE/EOF, pipe creation RPCs, foreground/wait RPCs, OPFS
open/native handle/read operations, shell spawn preparation, Worker construction,
module initialization/START, read/adapter/compile/instantiate or component load,
READY, run, close, EXIT and prompt/DOM/frame events retain timestamps and IDs.
P2's existing component/cache metrics stay nested in the raw READY/EXIT events.

Each realm records `performance.timeOrigin + performance.now()`. Original
origins are retained. Cross-origin isolation is mandatory. The runner verifies
both directions of UI↔shell, shell↔Core RPC and Core↔child START/READY/EXIT
causality for every detailed sample, allowing 0.25 ms for clock quantization.
The shell-to-UI edge uses the final nonempty stdout DATA **send** before prompt
DOM append. The post-write marker can legitimately execute after DOM append and
is not a valid clock-ordering bound. UI append/scroll spans, including local
echo's synchronous layout work, are retained separately.
Missing/incompatible clocks fail and preserve the sample; timestamps are never
silently clamped or corrected. This checks consistency within observed message
brackets, not exact zero clock skew. On another browser without aligned clocks,
use calibrated offset bounds or one-sided round trips before interpreting spans.

Only this outer partition is sequential:

```text
Enter → shell input → first spawn RPC → last Core EXIT → prompt DOM
```

For builtin, use Enter → shell input → prompt DOM. Inner per-process loader/run,
stdio, wait, native OPFS and prompt transport spans can overlap or nest. **Do not
add them**, or sum pipeline Workers to infer command wall time. `opfsOpenMs`
includes its native handle subspans; `loadMs` includes component subspans.
Pipeline pids, spawn order, every EXIT and stream IDs make overlap reviewable.

OFF retains IDs, prompt markers and the minimal UI measurement required for
correct E2E correlation, while disabling buffered detailed traces and loader
metrics. ON/OFF therefore measures incremental diagnostic overhead, not the cost
of an entirely uninstrumented terminal. Normal-path browser regressions verify
the latter's behavior. ON/OFF sessions are sequential; rerun with reversed order
before treating a small difference as causal. No overhead is subtracted from
reported measurements.

## Results, failures and outliers

The JSON includes revision/dirty/diff hash, production asset and binary byte
counts/SHA-256, engine, Chromium/Playwright/Node, platform/CPU, headless/headed,
cache/session/order conditions, raw first runs/warmups/retained samples, output,
exit codes, readiness, all timeline events, clock checks and failures. An adjacent
Markdown file reports N/attempted, failures, median, nearest-rank p95, min/max,
mean, population standard deviation and interval summaries. JSON adds p99 at
N >=100. First runs/warmups are retained but excluded from steady-state summary.

No outliers are dropped. Each attempted timeout/validation failure is saved,
and the session aborts before another input can overlap a live command. Failed
attempts count in the denominator but have no successful timing observation.
The runner exits nonzero; a runner/bootstrap failure is also saved. CI runs one
retained trial and no warmups for correctness, with no absolute latency gate.

Capture a separate Chrome trace to investigate an outlier:

```sh
node benchmarks/e2e.mjs --trials 1 --warmups 0 --details on \
  --trace work/benchmarks/e2e-trace.json --output work/benchmarks/e2e-traced.json
```

Load the trace in Chrome DevTools Performance (or a compatible trace viewer).
Correlate the raw command timeline's epoch timestamps and Worker pids/argv with
Worker startup, module fetch/compile, filesystem and task scheduling. Trace
capture changes timings; traced samples are explicitly labelled and must never
be pooled with the normal run. Reproduce a large outlier with the same revision,
assets, browser, engine, cache state and command order before attributing it.

For standalone comparison, run `npm run benchmark -- --trials 30` on the same
idle host/browser. Jco is that older harness's default; use its explicit engine
comparison mode for jsco (`--engines jsco --trials 30`) when comparing to the
default workbench engine. Read its cache-state labels and binary hashes/sizes.
`startupMs`, actual application's `workerStartupMs`, `durationMs` and UI E2E are
different boundaries. Compare like formats and engine/cache conditions; subtract
per-sample wall spans when explaining E2E remainder, rather than subtracting or
adding unrelated medians. Fixture/app size differences remain a limitation.
