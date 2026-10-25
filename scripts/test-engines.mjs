import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    engines: { type: 'string', default: 'jco,polyengine,jsco' },
    mode: { type: 'string', default: 'both' },
    output: { type: 'string', default: 'work/benchmarks/compatibility.json' },
  },
});
if (!['dev', 'production', 'both'].includes(values.mode)) throw new Error('Invalid --mode');
const engines = values.engines.split(',');
if (!engines.length || engines.some((e) => !['jco', 'polyengine', 'jsco'].includes(e)))
  throw new Error('Invalid --engines');
const output = resolve(values.output),
  dir = dirname(output);
mkdirSync(dir, { recursive: true });
const result = {};
const run = (cmd, args, env, log) => {
  const fd = openSync(log, 'w');
  try {
    const r = spawnSync(cmd, args, { env, stdio: ['ignore', fd, fd] });
    return { status: r.status, signal: r.signal, error: r.error?.message };
  } finally {
    closeSync(fd);
  }
};
for (const engine of engines) {
  const env = { ...process.env, WALOS_COMPONENT_ENGINE: engine };
  const entry = (result[engine] = {
    passed: false,
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
    engine,
    startedAt: new Date().toISOString(),
    suites: {},
    cacheTestPolicy:
      engine === 'jco'
        ? 'Existing Jco cache regression included'
        : 'Jco-specific application-cache assertion excluded; engine-specific cache/disabled tests in engines.spec.ts included in dev suite',
  });
  for (const mode of values.mode === 'both' ? ['dev', 'production'] : [values.mode]) {
    const prefix = resolve(dir, `${engine}-${mode}`);
    const testEnv = {
      ...env,
      PLAYWRIGHT_JSON_OUTPUT_NAME: `${prefix}.json`,
      WALOS_TEST_BUILD: mode === 'production' ? '1' : '',
    };
    if (mode === 'production') {
      const built = run('npm', ['run', 'build'], env, `${prefix}-build.log`);
      if (built.status !== 0) {
        entry.suites[mode] = { passed: false, build: built };
        continue;
      }
    }
    const args = [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--reporter=list,json',
      '--output',
      `${prefix}-test-results`,
      ...(engine !== 'jco' ? ['--grep-invert', 'persistent component cache'] : []),
    ];
    const command = run(process.execPath, args, testEnv, `${prefix}.log`);
    let report;
    try {
      report = JSON.parse(readFileSync(`${prefix}.json`, 'utf8'));
    } catch {}
    const failures = [];
    const walk = (suite) => {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests ?? [])
          for (const sample of test.results ?? [])
            if (sample.status !== 'passed' && sample.status !== 'skipped')
              failures.push({
                title: spec.title,
                status: sample.status,
                error: sample.error?.message,
              });
      for (const child of suite.suites ?? []) walk(child);
    };
    if (report) walk(report);
    entry.suites[mode] = {
      passed:
        command.status === 0 && report?.stats?.unexpected === 0 && report?.stats?.expected > 0,
      command,
      stats: report?.stats,
      failures,
      report: `${engine}-${mode}.json`,
      log: `${engine}-${mode}.log`,
    };
    console.log(`${engine} ${mode}: ${entry.suites[mode].passed ? 'PASS' : 'FAIL'}`);
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  }
  entry.passed = entry.suites.dev?.passed === true && entry.suites.production?.passed === true;
  entry.finishedAt = new Date().toISOString();
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
}
console.log(`Compatibility results: ${output}`);
// Incompatible experimental engines are recorded, not silently counted as passing.
if (Object.values(result).some((e) => Object.values(e.suites).some((s) => !s.passed)))
  process.exitCode = 1;
