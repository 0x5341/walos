import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import { parseArgs, promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';
import { analyzeTimeline, scenarios, summarizeE2E, validateSample } from './e2e-metrics.mjs';

const { values } = parseArgs({
  options: {
    trials: { type: 'string', default: '30' },
    warmups: { type: 'string', default: '3' },
    details: { type: 'string', default: 'on,off' },
    conditions: { type: 'string', default: 'warm' },
    output: { type: 'string', default: 'work/benchmarks/e2e.json' },
    headed: { type: 'boolean', default: false },
    trace: { type: 'string' },
    mode: { type: 'string', default: 'production' },
  },
});
const trials = Number(values.trials),
  warmups = Number(values.warmups);
assert(Number.isInteger(trials) && trials >= 1 && trials <= 1000, '--trials: 1–1000');
assert(Number.isInteger(warmups) && warmups >= 0 && warmups <= 100, '--warmups: 0–100');
const details = values.details.split(',');
assert(['production', 'development'].includes(values.mode), '--mode: production|development');
const conditions = values.conditions.split(',');
assert(
  details.length &&
    details.every((x) => ['on', 'off'].includes(x)) &&
    new Set(details).size === details.length,
  '--details: on,off (order is preserved)',
);
assert(
  conditions.length &&
    conditions.every((x) => ['warm', 'reload', 'fresh'].includes(x)) &&
    new Set(conditions).size === conditions.length,
  '--conditions: warm,reload,fresh',
);
const cli = async (cmd, args) =>
  (await promisify(execFile)(cmd, args, { maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const output = resolve(values.output);
const metadata = {
  startedAt: new Date().toISOString(),
  revision: await cli('git', ['rev-parse', 'HEAD']),
  dirty: Boolean(await cli('git', ['status', '--porcelain'])),
  diffSha256: sha(await cli('git', ['diff', 'HEAD'])),
  buildMode: values.mode,
  engine: process.env.WALOS_COMPONENT_ENGINE || 'jsco',
  engineVersions: Object.fromEntries(
    await Promise.all(
      ['@pavelsavara/jsco', '@bytecodealliance/jco', '@polyengine/runtime'].map(async (name) => [
        name,
        JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8')).version,
      ]),
    ),
  ),
  wasiSdk: (
    await readFile(
      `${process.env.WASI_SDK_PATH || 'work/wasi-sdk-27.0-x86_64-linux'}/VERSION`,
      'utf8',
    )
  ).trim(),
  node: process.version,
  playwright: JSON.parse(await readFile('node_modules/@playwright/test/package.json', 'utf8'))
    .version,
  platform: process.platform,
  arch: process.arch,
  release: os.release(),
  cpu: os.cpus()[0]?.model,
  logicalCpus: os.cpus().length,
  parallelism: os.availableParallelism(),
  totalMemoryBytes: os.totalmem(),
  headless: !values.headed,
  trials,
  warmups,
  details,
  conditions,
  traced: Boolean(values.trace),
  launchArgs: ['--no-sandbox'],
  chromiumPath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  binaries: {},
  assets: {},
  statistics:
    'All successful retained samples, no outlier removal; failures and incomplete runs are retained separately. Nearest-rank p95; population standard deviation; p99 only for N >= 100.',
  cachePolicy:
    'Temporary contexts only; no host disk cache flush. warm: one booted session; reload: prime then reload same context; fresh: new context per retained cycle, rotated command order, no excluded command warmup.',
  instrumentation:
    'on: buffered detailed trace. off: command ID and ordered prompt marker only; correlation overhead is present in both. Sessions execute in details order, so cross-session drift is possible.',
  clocks:
    'performance.timeOrigin + performance.now(); verify cross-realm causal edges with 0.25 ms quantization tolerance; reject incompatible samples. Nested/parallel durations are not summed.',
  frameLimit:
    'First rAF callback following prompt DOM mutation; not proof of completed paint or pixels reaching the display.',
};
const assetRoot = values.mode === 'production' ? 'dist' : 'public';
for (const path of (await readdir(assetRoot, { recursive: true })).sort()) {
  if (!/\.(wasm|js|html|css)$/.test(path)) continue;
  const bytes = await readFile(`${assetRoot}/${path}`);
  (path.startsWith('bin/') ? metadata.binaries : metadata.assets)[path] = {
    bytes: bytes.length,
    sha256: sha(bytes),
  };
}
const samples = [],
  sessions = [],
  failures = [];
let browser, server, traceSession;
let nextSessionId = 0;
const markdown = (summary) => {
  const rows = [
    '# Terminal E2E benchmark',
    '',
    `Revision: ${metadata.revision}; dirty: ${metadata.dirty}; ${metadata.buildMode}; ${metadata.engine}; Chromium ${metadata.chromium}; ${metadata.headless ? 'headless' : 'headed'}.`,
    `${metadata.cpu}; ${metadata.platform}/${metadata.arch}; Node ${metadata.node}; Playwright ${metadata.playwright}.`,
    `${failures.length} failures; raw JSON retains first runs, warmups, results, timelines, per-child EXIT/durationMs, clock checks and all summary metrics.`,
    '',
    'Durations in ms. ON/OFF refers to detailed recording; both use command correlation. Each condition has its own sessions. rAF is not a paint-completion measurement.',
    '',
    '| Condition/detail/case | N / attempted | Failures | DOM median | DOM p95 | Min | Max | Mean | Stddev | Frame median | First output median | EXIT median |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const number = (v) => (v === undefined ? '—' : v.toFixed(3));
  for (const [name, group] of Object.entries(summary)) {
    const dom = group.metrics.inputToPromptDomMs ?? {};
    rows.push(
      `| ${name} | ${dom.n ?? 0} / ${group.attempted} | ${group.failed} | ${['median', 'p95', 'min', 'max', 'mean', 'stddev'].map((k) => number(dom[k])).join(' | ')} | ${['inputToPromptFrameMs', 'inputToFirstOutputMs', 'inputToExitMs'].map((k) => number(group.metrics[k]?.median)).join(' | ')} |`,
    );
  }
  rows.push(
    '',
    '## Diagnostic intervals (median / p95, ms)',
    '',
    '| Condition/detail/case | Metric | N | Median | p95 |',
    '| --- | --- | ---: | ---: | ---: |',
  );
  for (const [name, group] of Object.entries(summary))
    for (const [metric, stats] of Object.entries(group.metrics)) {
      if (metric.startsWith('inputTo')) continue;
      rows.push(
        `| ${name} | ${metric} | ${stats.n} | ${number(stats.median)} | ${number(stats.p95)} |`,
      );
    }
  for (const failure of failures) rows.push('', `Failure: ${JSON.stringify(failure)}`);
  rows.push(
    '',
    'Do not add nested intervals, per-child startup/run/stdio/wait durations, or drawing time. Only input→shell, shell→first spawn, first spawn→last EXIT and last EXIT→prompt DOM form the outer wall-time partition (builtin uses shell→prompt).',
    '',
    'See docs/benchmarks-e2e.md for reproduction, cache/clock definitions, trace capture and comparison to the separate Worker benchmark.',
  );
  return rows.join('\n') + '\n';
};
async function save() {
  const summary = summarizeE2E(samples);
  metadata.finishedAt = new Date().toISOString();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify({ schemaVersion: 1, metadata, sessions, samples, failures, summary }) + '\n',
  );
  await writeFile(output.replace(/\.json$/, '') + '.md', markdown(summary));
}
async function openSession(detailed, condition) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const session = { sessionId: ++nextSessionId, detailed, condition, errors };
  sessions.push(session);
  try {
    await page.goto(`http://127.0.0.1:4185/?benchmark=e2e&detail=${detailed ? 1 : 0}`);
    assert(await page.evaluate(() => crossOriginIsolated), 'Cross-origin isolation required');
    await page.waitForFunction(() => window.walosBenchmark?.snapshot().ready);
    // Deterministic file fixture is installed through OPFS, after boot, outside
    // command timing. It never touches the user's real workbench context.
    await page.evaluate(async () => {
      const home = await (await navigator.storage.getDirectory()).getDirectoryHandle('home');
      const writer = await (
        await home.getFileHandle('README.md', { create: true })
      ).createWritable();
      await writer.write('TODO zebra\nhello from OPFS\nTODO apple\n');
      await writer.close();
    });
    session.bootTimeline = (
      await page.evaluate(() => window.walosBenchmark.snapshot())
    ).bootTimeline;
    return { context, page, session };
  } catch (error) {
    await context.close();
    throw error;
  }
}
async function cycle(handle, phase, trial) {
  // Rotate the first case; the complete order is retained on every sample.
  const order = scenarios.map((_, i) => scenarios[(i + trial) % scenarios.length]);
  for (const [position, scenario] of order.entries()) {
    const base = {
      scenario: scenario.name,
      condition: handle.session.condition,
      detailed: handle.session.detailed,
      sessionId: handle.session.sessionId,
      phase,
      trial,
      position,
      order: order.map((s) => s.name),
    };
    let sample;
    try {
      await handle.page.getByLabel('Terminal input').fill(scenario.command);
      await handle.page.getByLabel('Terminal input').press('Enter');
      await handle.page.waitForFunction(() => {
        const snapshot = window.walosBenchmark.snapshot();
        if (snapshot.error) throw new Error(snapshot.error);
        return Boolean(snapshot.completed);
      });
      sample = await handle.page.evaluate(() => window.walosBenchmark.snapshot().completed);
      validateSample(sample, scenario);
      assert.equal(handle.session.errors.length, 0, handle.session.errors.join('\n'));
      if (handle.session.detailed) Object.assign(sample, analyzeTimeline(sample));
      samples.push({ ...base, ...sample });
    } catch (error) {
      const snapshot = await handle.page
        .evaluate(() => window.walosBenchmark?.snapshot())
        .catch(() => undefined);
      const failure = { ...base, error: String(error), snapshot };
      samples.push({
        ...base,
        ...(sample ?? snapshot?.active ?? snapshot?.completed),
        error: String(error),
      });
      failures.push(failure);
      // A timeout may leave a real command running. Never overlap the next input
      // or silently count a replacement sample; abort this session.
      await save();
      throw error;
    }
  }
  console.log(
    `${handle.session.condition}/${handle.session.detailed ? 'on' : 'off'} ${phase} ${trial}/${trials}`,
  );
}
try {
  if (values.mode === 'production')
    server = await preview({
      configFile: 'vite.config.ts',
      logLevel: 'warn',
      preview: { host: '127.0.0.1', port: 4185, strictPort: true },
    });
  else {
    server = await createServer({
      configFile: 'vite.config.ts',
      logLevel: 'warn',
      server: { host: '127.0.0.1', port: 4185, strictPort: true },
    });
    await server.listen();
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: !values.headed,
    args: metadata.launchArgs,
  });
  metadata.chromium = browser.version();
  if (values.trace) {
    traceSession = await browser.newBrowserCDPSession();
    await traceSession.send('Tracing.start', {
      categories: 'devtools.timeline,v8,disabled-by-default-devtools.timeline',
      transferMode: 'ReturnAsStream',
    });
  }
  for (const detail of details)
    for (const condition of conditions) {
      const detailed = detail === 'on';
      if (condition === 'fresh') {
        for (let trial = 1; trial <= trials; trial++) {
          const handle = await openSession(detailed, condition);
          try {
            await cycle(handle, 'retained', trial);
          } catch {
          } finally {
            await handle.context.close();
          }
        }
      } else {
        const handle = await openSession(detailed, condition);
        try {
          await cycle(handle, 'first-run', 0);
          if (condition === 'reload') {
            await handle.page.reload();
            await handle.page.waitForFunction(() => window.walosBenchmark?.snapshot().ready);
            handle.session.reloadBootTimeline = (
              await handle.page.evaluate(() => window.walosBenchmark.snapshot())
            ).bootTimeline;
            await cycle(handle, 'first-after-reload', 0);
          }
          for (let i = 0; i < warmups; i++) await cycle(handle, 'warmup', i);
          for (let trial = 1; trial <= trials; trial++) await cycle(handle, 'retained', trial);
        } catch {
        } finally {
          await handle.context.close();
        }
      }
      await save();
    }
} catch (error) {
  failures.push({ error: String(error), stage: 'runner' });
} finally {
  if (traceSession) {
    try {
      const complete = new Promise((resolve) =>
        traceSession.once('Tracing.tracingComplete', resolve),
      );
      await traceSession.send('Tracing.end');
      const { stream } = await complete;
      const parts = [];
      for (;;) {
        const { data, base64Encoded, eof } = await traceSession.send('IO.read', { handle: stream });
        parts.push(Buffer.from(data, base64Encoded ? 'base64' : 'utf8'));
        if (eof) break;
      }
      await mkdir(dirname(resolve(values.trace)), { recursive: true });
      await writeFile(values.trace, Buffer.concat(parts));
      await traceSession.send('IO.close', { handle: stream });
    } catch (error) {
      failures.push({ stage: 'trace', error: String(error) });
    }
  }
  await browser?.close();
  if (server) {
    if (values.mode === 'development') await server.close();
    else await new Promise((resolve) => server.httpServer.close(resolve));
  }
  await save();
}
console.log(`Results: ${output}; failures: ${failures.length}`);
if (failures.length) process.exitCode = 1;
