import { test, expect } from '@playwright/test';

// Actual Process Worker, same host, atomic plan publication and resource lifetimes.
test('polyengine plan cache survives Workers/reload and repairs corrupt envelopes', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/cache-harness.ts');
    await h.prepare();
    const run = async () => {
      const process = await h.launch('', 'p2-true', 'polyengine');
      return { ready: await process.ready, exit: await process.exit };
    };
    const cold = await run(),
      warm = await run();
    await h.corrupt('polyengine');
    const repaired = await run();
    return { cold, warm, repaired, hit: await run() };
  });
  for (const state of [result.cold, result.repaired]) {
    expect(state.ready.metrics?.component?.cache).toBe('miss');
    expect(state.exit.component?.publishStatus).toBe('saved');
    expect(state.exit.exit).toEqual({ kind: 'exited', code: 0 });
  }
  for (const state of [result.warm, result.hit])
    expect(state.ready.metrics?.component?.cache).toBe('opfs');
  await page.reload();
  const reloaded = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/cache-harness.ts');
    const process = await h.launch('', 'p2-true', 'polyengine');
    return { ready: await process.ready, exit: await process.exit };
  });
  expect(reloaded.ready.metrics?.component?.cache).toBe('opfs');
  expect(reloaded.exit.exit).toEqual({ kind: 'exited', code: 0 });
});

test('polyengine READY precedes publication and cache failure does not fail execution', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/cache-harness.ts');
    await h.prepare();
    const process = await h.launch('hold-artifact', 'p2-true', 'polyengine');
    const ready = await process.ready;
    await process.blocked;
    const events = [...process.events];
    process.release();
    const exit = await process.exit;
    await h.prepare();
    const failed = await h.launch('fail-artifact', 'p2-true', 'polyengine');
    return { ready, events, exit, failure: await failed.exit };
  });
  expect(result.events).toEqual(['ready', 'cache-write-blocked']);
  expect(result.ready.metrics?.component?.publishStatus).toBe('pending');
  expect(result.exit.component?.publishStatus).toBe('saved');
  expect(result.failure.component?.publishStatus).toBe('failed');
  expect(result.failure.exit).toEqual({ kind: 'exited', code: 0 });
});

test('jsco executes without OPFS artifacts or cache hash spans', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/cache-harness.ts');
    await h.prepare();
    const results = [];
    for (let i = 0; i < 2; i++) {
      const process = await h.launch('unavailable', 'p2-true', 'jsco');
      results.push({ ready: await process.ready, exit: await process.exit });
    }
    let exists = false;
    try {
      await (await navigator.storage.getDirectory()).getDirectoryHandle('.walos-components');
      exists = true;
    } catch {}
    return { results, exists };
  });
  expect(result.exists).toBe(false);
  for (const { ready, exit } of result.results) {
    expect(ready.metrics?.component?.cache).toBe('disabled');
    expect(ready.metrics?.component?.keyMs).toBeUndefined();
    expect(ready.metrics?.component?.lookupMs).toBeUndefined();
    expect(exit.component?.publishMs).toBeUndefined();
    expect(exit.exit).toEqual({ kind: 'exited', code: 0 });
  }
});
