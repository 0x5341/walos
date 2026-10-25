import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { flatten, summarize, bootstrapImprovement } from './stats.mjs';
import { workerMemory } from './memory.mjs';

export async function compareEngines({
  engines,
  trials,
  output,
  metadata,
  openBrowser,
  pageIn,
  compatibility,
}) {
  assert(
    engines.length &&
      new Set(engines).size === engines.length &&
      engines.every((e) => ['jco', 'polyengine', 'jsco'].includes(e)),
    'Invalid --engines',
  );
  const versions = { jco: '1.15.1', polyengine: '0.6.7', jsco: '0.2.0-preview.0' };
  metadata.engines = engines.map((id) => ({
    id,
    version: versions[id],
    adapterRevision: 'walos-1',
    sourceRevision: metadata.revision,
    dirty: metadata.dirty,
    cache: id === 'jsco' ? 'disabled' : 'opfs',
  }));
  metadata.build = {
    mode: 'production',
    minify: 'esbuild',
    target: 'vite default',
    config: 'benchmarks/vite.config.ts',
  };
  metadata.cold =
    'Independent browser process/context/page/Worker; empty application/OPFS cache, verified miss (or disabled). OS page cache is not flushed. No translator/runtime preloading before new Worker().';
  metadata.timeoutMs = 60000;
  metadata.bootstrap = { iterations: 10000, seed: 0x5341, independentResampling: true };
  metadata.memory = 'CDP Runtime.getHeapUsage after READY, held Worker; not peak or browser RSS.';
  metadata.spans =
    'engineLoadMs includes lazy adapter/runtime and translator initialization; transformMs is translation, prepareMs is direct parse/compile (jsco); converterLoadMs/convertMs are legacy Jco engineLoad/transform equivalents. publishMs is after READY, joined before EXIT. loadMs encloses these spans: do not sum nested intervals. Absent transformMs/convertMs means not applicable, never zero-filled.';
  metadata.assets = [];
  for (const name of (await readdir('work/benchmark-site/assets')).sort()) {
    const bytes = await readFile(join('work/benchmark-site/assets', name));
    metadata.assets.push({
      name,
      bytes: bytes.length,
      gzipBytes: gzipSync(bytes).length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  const samples = [],
    order = [];
  let checksum = 1;
  for (let i = 0; i < metadata.cpuIterations; i++)
    checksum = (Math.imul(checksum ^ i, 1664525) + 1013904223) >>> 0;
  const save = async () => {
    const summary = Object.fromEntries(
      engines.map((engine) => [
        engine,
        summarize(samples.filter((s) => s.engine === engine && s.success)),
      ]),
    );
    const cold = (engine) =>
      samples
        .filter((s) => s.engine === engine && s.scenario === 'p2/startup-cold' && s.success)
        .map((s) => s.startupMs);
    const comparisons = {};
    for (const engine of engines.filter((e) => e !== 'jco')) {
      const values = cold(engine),
        base = cold('jco');
      const ci = base.length && values.length ? bootstrapImprovement(base, values) : null;
      const compatible = compatibility?.[engine]?.passed === true;
      const reliable =
        trials >= 30 &&
        values.length === trials &&
        base.length === trials &&
        !samples.some((s) => s.engine === engine && !s.success);
      comparisons[engine] = {
        ...ci,
        compatible,
        reliable,
        eligible: Boolean(ci && compatible && reliable && ci.improvement >= 0.05 && ci.lower > 0),
        reason: !compatible
          ? 'Mandatory compatibility not passed'
          : !reliable
            ? 'Insufficient trials or observed failures'
            : ci.improvement < 0.05 || ci.lower <= 0
              ? 'Cold-start improvement criterion not met'
              : 'Meets adoption criteria',
      };
    }
    const eligible = Object.keys(comparisons)
      .filter((e) => comparisons[e].eligible)
      .sort(
        (a, b) =>
          summary[a]['p2/startup-cold'].startupMs.median -
          summary[b]['p2/startup-cold'].startupMs.median,
      );
    const decision = {
      engine: eligible[0] ?? 'jco',
      provisional: !metadata.finishedAt,
      reason: eligible.length
        ? 'Fastest eligible cold startup median'
        : 'Retain Jco: no candidate meets all mandatory criteria',
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          schemaVersion: 3,
          metadata: { ...metadata, order },
          compatibility: compatibility ?? {},
          samples,
          summary,
          comparisons,
          decision,
        },
        null,
        2,
      ) + '\n',
    );
    const fmt = (n) => (typeof n === 'number' ? n.toFixed(3) : 'N/A');
    const rows = [
      '# Component engine comparison',
      '',
      `Revision: ${metadata.revision} (dirty: ${metadata.dirty}); Chromium ${metadata.chromium}; Node ${metadata.node}; ${metadata.cpu}.`,
      metadata.cold,
      '',
      '| Engine | Cold successes/attempts | Median ms | p95 ms | Improvement | Bootstrap 95% CI | Mandatory compatibility |',
      '| --- | ---: | ---: | ---: | ---: | --- | --- |',
    ];
    for (const engine of engines) {
      const stats = summary[engine]['p2/startup-cold']?.startupMs,
        ci = comparisons[engine];
      const attempts = samples.filter(
        (s) => s.engine === engine && s.scenario === 'p2/startup-cold',
      ).length;
      rows.push(
        `| ${engine} ${versions[engine]} | ${stats?.n ?? 0}/${attempts} | ${fmt(stats?.median)} | ${fmt(stats?.p95)} | ${ci?.improvement !== undefined ? fmt(ci.improvement * 100) + '%' : 'N/A'} | ${ci?.lower !== undefined ? fmt(ci.lower * 100) + '% … ' + fmt(ci.upper * 100) + '%' : 'N/A'} | ${compatibility?.[engine]?.passed === true ? 'Pass' : 'Not passed'} |`,
      );
    }
    rows.push(
      '',
      `Decision: **${decision.engine}** — ${decision.reason}.`,
      '',
      '## All successful measurements',
      '',
      '| Engine | Scenario | Metric | N | Median | Min | Max | Mean | p95 | Stddev |',
      '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    );
    for (const [engine, scenarios] of Object.entries(summary))
      for (const [scenario, metrics] of Object.entries(scenarios))
        for (const [metric, stats] of Object.entries(metrics)) {
          if (['trial', 'position', 'checksum'].includes(metric) || metric.endsWith('AtMs'))
            continue;
          rows.push(
            `| ${engine} | ${scenario} | ${metric} | ${stats.n} | ${['median', 'min', 'max', 'mean', 'p95', 'stddev'].map((k) => fmt(stats[k])).join(' | ')} |`,
          );
        }
    rows.push('', '## Failures (no samples discarded)', '');
    for (const sample of samples.filter((s) => !s.success))
      rows.push(`- ${sample.engine}, trial ${sample.trial}, ${sample.scenario}: ${sample.error}`);
    rows.push(
      '',
      '## Compatibility',
      '',
      '```json',
      JSON.stringify(compatibility ?? {}, null, 2),
      '```',
      '',
      'Full raw samples, chronological order, timestamps, binary SHA-256, asset inventory (raw/gzip bytes and hashes), failures and environment metadata are in the adjacent JSON.',
      '',
      metadata.spans,
      '',
      metadata.memory,
    );
    await writeFile(output.replace(/\.json$/, '') + '.md', rows.join('\n') + '\n');
  };
  const record = (engine, trial, scenario, startedAt, metrics, error) => {
    samples.push({
      engine,
      trial,
      scenario,
      startedAt,
      completedAt: new Date().toISOString(),
      success: !error,
      ...(metrics && flatten(metrics)),
      ...(error && { error: String(error), stack: error.stack }),
    });
    console.log(`${engine} ${scenario} ${trial}/${trials}${error ? ': FAILED ' + error : ''}`);
  };
  for (let trial = 1; trial <= trials; trial++) {
    const rotation = engines.map((_, i) => engines[(i + trial - 1) % engines.length]);
    for (const engine of rotation) {
      order.push({ trial, engine, startedAt: new Date().toISOString() });
      let browser, context, page;
      const measure = async (scenario, fn) => {
        const startedAt = new Date().toISOString();
        try {
          const metrics = await fn();
          record(engine, trial, scenario, startedAt, metrics);
          return true;
        } catch (error) {
          record(engine, trial, scenario, startedAt, null, error);
          return false;
        }
      };
      const launch = async (mode, cache) => {
        const ready = await page.evaluate(
          ({ mode, engine }) => window.bench.launch('p2', mode, engine),
          { mode, engine },
        );
        assert.equal(ready.component?.cache, cache);
        return ready;
      };
      const startup = async (cache) => {
        const ready = await launch('startup', cache);
        const done = await page.evaluate(() => window.bench.finish());
        assert.equal(done.stdout, '');
        if (cache === 'miss') assert.equal(done.component.publishStatus, 'saved');
        return { ...ready, component: { ...ready.component, ...done.component } };
      };
      const cache = engine === 'jsco' ? 'disabled' : 'miss';
      let coldOk = false;
      try {
        browser = await openBrowser();
        context = await browser.newContext();
        page = await pageIn(context);
        assert(await page.evaluate(() => crossOriginIsolated));
        metadata.userAgent ??= await page.evaluate(() => navigator.userAgent);
        await page.evaluate(() => window.bench.clearCache());
        coldOk = await measure('p2/startup-cold', () => startup(cache));
        if (coldOk) {
          if (engine !== 'jsco') {
            await measure('p2/startup-warm', () => startup('opfs'));
            await page.reload();
            await page.waitForFunction(() => Boolean(window.bench));
            await page.evaluate(() => window.bench.prepare());
            await measure('p2/startup-opfs-reload', () => startup('opfs'));
          }
          await page.evaluate(() => window.bench.clearCache());
          await measure('p2/startup-warm-miss', () => startup(cache));
          await measure('p2/cpu', async () => {
            const state = engine === 'jsco' ? 'disabled' : 'opfs';
            for (let i = 0; i < 2; i++) {
              const ready = await launch('cpu', state),
                done = await page.evaluate(() => window.bench.finish());
              assert.equal(done.stdout, `${checksum}\n`);
              if (i) return { runMs: done.runMs, checksum, cache: ready.component.cache };
            }
          });
          for (const state of engine === 'jsco' ? ['disabled'] : ['miss', 'opfs']) {
            if (state === 'miss') await page.evaluate(() => window.bench.clearCache());
            await measure(`p2/memory-${state}`, async () => {
              const held = await launch('hold', state);
              const memory = await workerMemory(browser);
              await page.evaluate(() => window.bench.finish());
              return { ...memory, cache: held.component.cache };
            });
          }
        }
      } catch (error) {
        record(
          engine,
          trial,
          coldOk ? 'trial/setup-or-teardown' : 'p2/startup-cold',
          new Date().toISOString(),
          null,
          error,
        );
      } finally {
        await context?.close();
        await browser?.close();
        await save();
      }
    }
  }
  metadata.finishedAt = new Date().toISOString();
  await save();
  console.log(`Comparison results: ${output}`);
}
