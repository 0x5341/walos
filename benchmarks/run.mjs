import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { flatten, summarize } from './stats.mjs';
import { workerMemory } from './memory.mjs';

const { values } = parseArgs({
  options: {
    trials: { type: 'string', default: '5' },
    output: { type: 'string', default: 'work/benchmarks/latest.json' },
  },
});
const trials = Number(values.trials);
assert(
  Number.isInteger(trials) && trials >= 1 && trials <= 100,
  '--trials must be an integer from 1 to 100',
);
const output = resolve(values.output);
const sdk = process.env.WASI_SDK_PATH || resolve('work/wasi-sdk-27.0-x86_64-linux');
const cli = async (command, args) =>
  (await promisify(execFile)(command, args, { encoding: 'utf8' })).stdout.trim();
const metadata = {
  startedAt: new Date().toISOString(),
  revision: await cli('git', ['rev-parse', 'HEAD']),
  dirty: Boolean(await cli('git', ['status', '--porcelain'])),
  node: process.version,
  playwright: JSON.parse(await readFile('node_modules/@playwright/test/package.json', 'utf8'))
    .version,
  jco: JSON.parse(await readFile('node_modules/@bytecodealliance/jco/package.json', 'utf8'))
    .version,
  wasiSdk: (await readFile(`${sdk}/VERSION`, 'utf8')).trim().split('\n')[0],
  wasiSdkBuild: (await readFile(`${sdk}/VERSION`, 'utf8')).trim(),
  clang: await cli(`${sdk}/bin/clang`, ['--version']),
  platform: process.platform,
  arch: process.arch,
  release: os.release(),
  cpu: os.cpus()[0]?.model,
  logicalCpus: os.cpus().length,
  parallelism: os.availableParallelism(),
  totalMemoryBytes: os.totalmem(),
  trials,
  sizes: [1, 4096, 65536, 1048576, 4194304],
  cpuIterations: 20000000,
  pipeCapacityBytes: 65536,
  chunkBytes: 16384,
  headless: true,
  compilerFlags: ['-O2', '-Wall', '-Wextra', '-Werror', '-Wl,--strip-all'],
  warmups:
    'Cold startup primes warm startup; one excluded CPU run per trial and one I/O run per size/transport.',
  statistics:
    'All samples; median, nearest-rank p95, min/max, arithmetic mean and population standard deviation; no outlier removal.',
  memory:
    'CDP Runtime.getHeapUsage in held Process Worker after READY; no forced GC; no RSS or Component-only total.',
};
for (const format of ['p1', 'p2']) {
  metadata[`${format}Sha256`] = createHash('sha256')
    .update(await readFile(`work/benchmark-bin/${format}.wasm`))
    .digest('hex');
}
await build({ configFile: 'benchmarks/vite.config.ts', logLevel: 'warn' });
const server = await preview({ configFile: 'benchmarks/vite.config.ts', logLevel: 'warn' });
let browser;
async function openBrowser() {
  const instance = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
    args: ['--no-sandbox'],
  });
  metadata.chromium = instance.version();
  metadata.chromiumPath = process.env.CHROMIUM_PATH || chromium.executablePath();
  metadata.launchArgs = ['--no-sandbox'];
  return instance;
}
const samples = [];
let checksum = 1;
for (let i = 0; i < metadata.cpuIterations; i++)
  checksum = (Math.imul(checksum ^ i, 1664525) + 1013904223) >>> 0;
function record(scenario, trial, metrics) {
  const flat = flatten(metrics);
  for (const [key, value] of Object.entries(flat)) {
    assert(value !== undefined, `Missing metric: ${key}`);
    if (typeof value === 'number')
      assert(Number.isFinite(value) && value >= 0, `Invalid ${key}: ${value}`);
  }
  samples.push({ scenario, trial, ...flat });
  console.log(`${scenario} ${trial}/${trials}`);
}
async function pageIn(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  await page.goto('http://127.0.0.1:4184/benchmarks/index.html');
  await page.waitForFunction(() => Boolean(window.bench));
  await page.evaluate(() => window.bench.prepare());
  return page;
}
async function launch(page, format, mode = 'startup') {
  const ready = await page.evaluate(({ format, mode }) => window.bench.launch(format, mode), {
    format,
    mode,
  });
  return ready;
}
const finish = (page) => page.evaluate(() => window.bench.finish());
async function completeStartup(page, ready) {
  const exit = await finish(page);
  return { ...ready, ...(exit.component && { component: exit.component }) };
}
try {
  {
    for (const format of ['p1', 'p2']) {
      for (let trial = 1; trial <= trials; trial++) {
        browser = await openBrowser();
        const context = await browser.newContext();
        try {
          const page = await pageIn(context);
          if (!metadata.userAgent)
            metadata.userAgent = await page.evaluate(() => navigator.userAgent);
          assert(
            await page.evaluate(() => crossOriginIsolated),
            'Benchmark requires cross-origin isolation',
          );
          const cold = await launch(page, format, 'startup');
          record(`${format}/startup-cold`, trial, await completeStartup(page, cold));
          const warm = await launch(page, format, 'startup');
          record(`${format}/startup-warm`, trial, await completeStartup(page, warm));
          // One excluded CPU warmup before each retained fresh-Worker CPU trial.
          await launch(page, format, 'cpu');
          assert.equal((await finish(page)).stdout, `${checksum}\n`);
          await launch(page, format, 'cpu');
          const cpu = await finish(page);
          assert.equal(cpu.stdout, `${checksum}\n`);
          record(`${format}/cpu`, trial, { runMs: cpu.runMs, checksum });
          for (const state of ['loaded']) {
            const held = await launch(page, format, 'hold');
            const memory = await workerMemory(browser);
            if (memory.memoryStatus === 'unavailable') console.warn(memory.memoryReason);
            await finish(page);
            record(`${format}/memory-${state}`, trial, {
              ...memory,
              ...(held.linearMemoryBytes !== undefined && {
                linearMemoryBytes: held.linearMemoryBytes,
              }),
            });
          }
        } finally {
          await context.close();
          await browser.close();
        }
      }
    }
    browser = await openBrowser();
    const context = await browser.newContext();
    try {
      const page = await pageIn(context);
      for (const size of metadata.sizes) {
        // Exclude one complete integrity-checked warmup per size and transport.
        await page.evaluate((size) => window.bench.opfs(size), size);
        await page.evaluate((size) => window.bench.pipe(size), size);
        for (let trial = 1; trial <= trials; trial++) {
          const io = await page.evaluate((size) => window.bench.opfs(size), size);
          assert.equal(io.bytes, size);
          record(`opfs/${size}`, trial, {
            ...io,
            writeMiBps: size / 1048576 / (io.writeMs / 1000),
            readMiBps: size / 1048576 / (io.readMs / 1000),
          });
          const pipe = await page.evaluate((size) => window.bench.pipe(size), size);
          assert.equal(pipe.bytes, size);
          record(`pipe/${size}`, trial, {
            ...pipe,
            MiBps: size / 1048576 / (pipe.elapsedMs / 1000),
          });
        }
      }
    } finally {
      await context.close();
    }
    const summary = summarize(samples);
    metadata.finishedAt = new Date().toISOString();
    const result = { schemaVersion: 3, metadata, samples, summary };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(result, null, 2) + '\n');
    const rows = [
      '# walos benchmark results',
      '',
      `Chromium ${metadata.chromium}; Node ${metadata.node}; wasi-sdk ${metadata.wasiSdk}; jsco 0.2.0-preview.0 (Jco ${metadata.jco} build tooling).`,
      `${trials} retained trials per scenario. Durations in ms; memory in bytes; throughput in MiB/s.`,
      '',
      '| Scenario | Metric | N | Median | Min | Max | Mean | p95 | Stddev |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ];
    for (const [scenario, metrics] of Object.entries(summary)) {
      for (const [name, stats] of Object.entries(metrics)) {
        if (['bytes', 'checksum'].includes(name)) continue;
        rows.push(
          `| ${scenario} | ${name} | ${stats.n} | ${['median', 'min', 'max', 'mean', 'p95', 'stddev'].map((key) => stats[key].toFixed(3)).join(' | ')} |`,
        );
      }
    }
    for (const sample of samples.filter((s) => s.memoryStatus === 'unavailable'))
      rows.push(
        '',
        `Memory unavailable (${sample.scenario}, trial ${sample.trial}): ${sample.memoryReason}`,
      );
    await writeFile(output.replace(/\.json$/, '') + '.md', rows.join('\n') + '\n');
    console.log(`Results: ${output}`);
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
