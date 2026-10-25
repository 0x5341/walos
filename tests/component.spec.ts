import { test, expect } from '@playwright/test';

test('concurrent Process converters publish complete cache entries and the public API clears them', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { clearComponentCache } = await import('/packages/os/dist/index.js');
    await clearComponentCache();
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle('component-fixture', { create: true });
    const writer = await file.createWritable();
    await writer.write(await (await fetch('/bin/p2-true.wasm')).arrayBuffer());
    await writer.close();
    const run = () =>
      new Promise((resolve, reject) => {
        const worker = new Worker('/tests/fixtures/component.worker.ts', { type: 'module' });
        worker.onmessage = (event) => {
          worker.terminate();
          event.data.ok ? resolve(true) : reject(new Error(event.data.error));
        };
        worker.onerror = (event) => {
          worker.terminate();
          reject(new Error(event.message));
        };
        worker.postMessage(file);
      });
    await Promise.all([run(), run()]);
    const cache = await (
      await (await root.getDirectoryHandle('.walos-components')).getDirectoryHandle('schema-2')
    ).getDirectoryHandle('jco');
    const manifests: string[] = [];
    for await (const [name] of cache.entries()) if (name.endsWith('.json')) manifests.push(name);
    const manifest = JSON.parse(
      await (await (await cache.getFileHandle(manifests[0])).getFile()).text(),
    );
    const artifacts = await cache.getDirectoryHandle(manifest.directory);
    const stages: string[] = [];
    for await (const [name] of cache.entries()) if (name.includes('-stage-')) stages.push(name);
    const sizes = await Promise.all(
      manifest.files.map(
        async ({ name }: { name: string }) =>
          (await (await artifacts.getFileHandle(name)).getFile()).size,
      ),
    );
    await clearComponentCache();
    await clearComponentCache();
    let removed = false;
    try {
      await root.getDirectoryHandle('.walos-components');
    } catch (error) {
      removed = error instanceof DOMException && error.name === 'NotFoundError';
    }
    return {
      manifests: manifests.length,
      stages: stages.length,
      complete: sizes.every((n) => n > 0),
      removed,
    };
  });
  expect(result).toEqual({ manifests: 1, stages: 1, complete: true, removed: true });
});

test('READY precedes deferred publication and immediate EXIT joins it; restart and reload hit OPFS', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/cache-harness.ts');
    await h.prepare();
    const process = await h.launch('hold-artifact');
    try {
      const ready = await process.ready;
      await process.blocked;
      const beforeRelease = [...process.events];
      process.release();
      const exit = await process.exit;
      const warm = await h.launch();
      return { ready, beforeRelease, exit, warm: await warm.ready, warmExit: await warm.exit };
    } finally {
      process.terminate();
    }
  });
  expect(result.beforeRelease).toEqual(['ready', 'cache-write-blocked']);
  expect(result.ready.metrics?.component).toMatchObject({
    cache: 'miss',
    publishStatus: 'pending',
  });
  expect(result.ready.metrics?.component?.publishMs).toBeUndefined();
  expect(result.exit.exit).toEqual({ kind: 'exited', code: 0 });
  expect(result.exit.component).toMatchObject({ cache: 'miss', publishStatus: 'saved' });
  expect(result.exit.component?.publishStartedAtMs).toBeGreaterThanOrEqual(
    result.ready.metrics!.readyAtMs!,
  );
  expect(result.exit.component?.publishCompletedAtMs).toBeGreaterThanOrEqual(
    result.exit.component!.publishStartedAtMs!,
  );
  expect(result.exit.component?.publishMs).toBeGreaterThan(0);
  expect(result.warm.metrics?.component?.cache).toBe('opfs');
  expect(result.warmExit.exit).toEqual({ kind: 'exited', code: 0 });
  await page.reload();
  const reloaded = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/cache-harness.ts');
    const process = await h.launch();
    return { ready: await process.ready, exit: await process.exit };
  });
  expect(reloaded.ready.metrics?.component?.cache).toBe('opfs');
  expect(reloaded.exit.exit).toEqual({ kind: 'exited', code: 0 });
});

for (const mode of ['fail-artifact', 'fail-manifest', 'corrupt-write', 'unavailable'])
  test(`cache ${mode} does not fail the command and next Worker regenerates`, async ({ page }) => {
    await page.goto('/tests/fixtures/library.html');
    const result = await page.evaluate(async (mode) => {
      const h = await import('/tests/fixtures/cache-harness.ts');
      await h.prepare();
      const process = await h.launch(mode);
      const ready = await process.ready;
      const exit = await process.exit;
      const next = await h.launch();
      const nextReady = await next.ready;
      const nextExit = await next.exit;
      const warm = await h.launch();
      return {
        ready,
        exit,
        nextReady,
        nextExit,
        warm: await warm.ready,
        warmExit: await warm.exit,
      };
    }, mode);
    expect(result.ready.metrics?.component?.cache).toBe('miss');
    expect(result.exit.exit).toEqual({ kind: 'exited', code: 0 });
    expect(result.exit.component?.publishStatus).toBe(
      mode === 'unavailable' ? 'unavailable' : 'failed',
    );
    expect(result.exit.component?.publishError).toBeTruthy();
    expect(result.nextReady.metrics?.component?.cache).toBe('miss');
    expect(result.nextExit.component?.publishStatus).toBe('saved');
    expect(result.warm.metrics?.component?.cache).toBe('opfs');
    expect(result.warmExit.exit).toEqual({ kind: 'exited', code: 0 });
  });

test('corrupt committed artifact is never executed and is replaced by a complete publication', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/cache-harness.ts');
    await h.prepare();
    const first = await h.launch();
    await first.exit;
    await h.corrupt();
    const next = await h.launch();
    const ready = await next.ready;
    const exit = await next.exit;
    const warm = await h.launch();
    return { ready, exit, warm: await warm.ready, warmExit: await warm.exit };
  });
  expect(result.ready.metrics?.component?.cache).toBe('miss');
  expect(result.exit.component?.publishStatus).toBe('saved');
  expect(result.exit.exit).toEqual({ kind: 'exited', code: 0 });
  expect(result.warm.metrics?.component?.cache).toBe('opfs');
  expect(result.warmExit.exit).toEqual({ kind: 'exited', code: 0 });
});

for (const mode of ['hold-artifact', 'hold-manifest'])
  test(`Worker termination during ${mode} leaves no usable partial cache`, async ({ page }) => {
    await page.goto('/tests/fixtures/library.html');
    const result = await page.evaluate(async (mode) => {
      const h = await import('/tests/fixtures/cache-harness.ts');
      await h.prepare();
      const process = await h.launch(mode);
      await process.ready;
      await process.blocked;
      const events = [...process.events];
      process.terminate();
      const next = await h.launch();
      const ready = await next.ready;
      const exit = await next.exit;
      const warm = await h.launch();
      return {
        events,
        ready,
        exit,
        warm: await warm.ready,
        warmExit: await warm.exit,
        stages: (await h.entries()).filter((name) => name.includes('-stage-')).length,
      };
    }, mode);
    expect(result.events).toEqual(['ready', 'cache-write-blocked']);
    expect(result.stages).toBe(1);
    expect(result.ready.metrics?.component?.cache).toBe('miss');
    expect(result.exit.component?.publishStatus).toBe('saved');
    expect(result.exit.exit).toEqual({ kind: 'exited', code: 0 });
    expect(result.warm.metrics?.component?.cache).toBe('opfs');
    expect(result.warmExit.exit).toEqual({ kind: 'exited', code: 0 });
  });

for (const command of ['p2-false', 'p2-trap'])
  test(`${command} preserves its failure result while joining deferred publication`, async ({
    page,
  }) => {
    await page.goto('/tests/fixtures/library.html');
    const result = await page.evaluate(async (command) => {
      const h = await import('/tests/fixtures/cache-harness.ts');
      await h.prepare();
      const process = await h.launch('hold-manifest', command);
      await process.ready;
      await process.blocked;
      const beforeRelease = [...process.events];
      process.release();
      return { beforeRelease, exit: await process.exit };
    }, command);
    expect(result.beforeRelease).toEqual(['ready', 'cache-write-blocked']);
    expect(result.exit.component?.publishStatus).toBe('saved');
    if (command === 'p2-false') expect(result.exit.exit).toEqual({ kind: 'exited', code: 1 });
    else expect(result.exit.exit.kind).toBe('trap');
  });

test('supervisor stop escalates a blocked cache save and next process regenerates', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/cache-harness.ts');
    await h.prepare();
    const stopped = await h.stopWhilePublishing();
    const next = await h.launch();
    return { stopped, ready: await next.ready, exit: await next.exit };
  });
  expect(result.stopped).toEqual({ kind: 'terminated', message: 'stop grace period expired' });
  expect(result.ready.metrics?.component?.cache).toBe('miss');
  expect(result.exit.component?.publishStatus).toBe('saved');
  expect(result.exit.exit).toEqual({ kind: 'exited', code: 0 });
});
