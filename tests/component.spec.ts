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
    const cache = await root.getDirectoryHandle('.walos-components');
    const manifests: string[] = [];
    for await (const [name] of cache.entries()) if (name.endsWith('.json')) manifests.push(name);
    const manifest = JSON.parse(
      await (await (await cache.getFileHandle(manifests[0])).getFile()).text(),
    );
    const artifacts = await cache.getDirectoryHandle(manifest.directory);
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
    return { manifests: manifests.length, complete: sizes.every((n) => n > 0), removed };
  });
  expect(result).toEqual({ manifests: 1, complete: true, removed: true });
});
