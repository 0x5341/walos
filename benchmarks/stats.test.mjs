import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flatten, statistics, summarize } from './stats.mjs';

test('aggregation keeps outliers and uses even median, nearest-rank p95 and population deviation', () => {
  const actual = statistics([100, 2, 1, 3]);
  assert.deepEqual(actual, {
    n: 4,
    min: 1,
    max: 100,
    mean: 26.5,
    median: 2.5,
    p95: 100,
    stddev: Math.sqrt(1801.25),
  });
  assert.equal(statistics([4]).stddev, 0);
  assert.equal(statistics([5, 1, 3]).median, 3);
  assert.equal(statistics(Array.from({ length: 20 }, (_, i) => i + 1)).p95, 19);
  for (const invalid of [[], [NaN], [Infinity]]) assert.throws(() => statistics(invalid));
});

test('summary separates scenarios and preserves sparse metric sample counts', () => {
  const samples = [
    {
      scenario: 'miss',
      trial: 1,
      ...flatten({ component: { cache: 'miss', convertMs: 30 }, startupMs: 40 }),
    },
    { scenario: 'miss', trial: 2, startupMs: 50 },
    { scenario: 'hit', trial: 1, ...flatten({ component: { cache: 'opfs' }, startupMs: 4 }) },
  ];
  const summary = summarize(samples);
  assert.equal(summary.miss.startupMs.median, 45);
  assert.equal(summary.miss['component.convertMs'].n, 1);
  assert.equal(summary.hit.startupMs.median, 4);
  assert.equal(summary.hit['component.cache'], undefined);
  assert.equal(summary.hit.trial, undefined);
});

test('bootstrap compares independent medians with a fixed seed, retaining outliers', async () => {
  const { bootstrapImprovement } = await import('./stats.mjs');
  assert.deepEqual(bootstrapImprovement([100, 100, 100], [40, 40, 40]), {
    improvement: 0.6,
    lower: 0.6,
    upper: 0.6,
    iterations: 10000,
    seed: 0x5341,
  });
  const a = bootstrapImprovement([90, 100, 110, 200], [80, 85, 90, 100]);
  assert.deepEqual(a, bootstrapImprovement([90, 100, 110, 200], [80, 85, 90, 100]));
  assert(a.lower < a.improvement && a.upper > a.improvement);
  assert(bootstrapImprovement([100], [200]).upper < 0);
  assert.throws(() => bootstrapImprovement([], [100]));
});
