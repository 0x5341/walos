import { test, expect } from '@playwright/test';
test('cloned OPFS handles preserve offset I/O and lock conflicts fail immediately', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const tmp = await root.getDirectoryHandle('lock-test', { create: true });
    const file = await tmp.getFileHandle('probe', { create: true });
    const a = new Worker('/tests/fixtures/opfs.worker.ts', { type: 'module' }),
      b = new Worker('/tests/fixtures/opfs.worker.ts', { type: 'module' });
    const request = (w: Worker, m: unknown) =>
      new Promise<any>((resolve) => {
        w.onmessage = (e) => resolve(e.data);
        w.postMessage(m);
      });
    const first = await request(a, { file });
    const second = await request(b, { file });
    await request(a, { op: 'release' });
    const retry = await request(b, { file });
    await request(b, { op: 'release' });
    const bytes = [...new Uint8Array(await (await file.getFile()).arrayBuffer())];
    a.terminate();
    b.terminate();
    await root.removeEntry('lock-test', { recursive: true });
    return { first, second, retry, bytes };
  });
  expect(result.first).toEqual({ ok: true });
  expect(result.second).toEqual({ ok: false, name: 'NoModificationAllowedError' });
  expect(result.retry).toEqual({ ok: true });
  expect(result.bytes).toEqual([0, 0, 4, 5, 6]);
});
