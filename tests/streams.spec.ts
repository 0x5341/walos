import { test, expect } from '@playwright/test';
test('bounded pipe wakes a blocked writer after even a small read and drains before EOF', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { PortStream } = await import('/packages/os/dist/internal/streams.js');
    const c = new MessageChannel();
    const reader = new PortStream({
      kind: 'pipe',
      id: 1,
      direction: 'in',
      port: c.port1,
      capacity: 8,
    });
    const writer = new PortStream({
      kind: 'pipe',
      id: 2,
      direction: 'out',
      port: c.port2,
      capacity: 8,
    });
    await writer.write(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    let completed = false;
    const pending = writer.write(new Uint8Array([9])).then(() => {
      completed = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    const blocked = !completed;
    const first = await reader.read(1);
    await pending;
    writer.close();
    const rest: number[] = [];
    for (;;) {
      const b = await reader.read(100);
      if (!b.length) break;
      rest.push(...b);
    }
    reader.close();
    return { blocked, bytes: [...first, ...rest] };
  });
  expect(result).toEqual({ blocked: true, bytes: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
});
test('reader disconnection and invalid cumulative ACKs reject pending writes', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { PortStream } = await import('/packages/os/dist/internal/streams.js');
    const c = new MessageChannel();
    const reader = new PortStream({
      kind: 'pipe',
      id: 1,
      direction: 'in',
      port: c.port1,
      capacity: 1,
    });
    const writer = new PortStream({
      kind: 'pipe',
      id: 2,
      direction: 'out',
      port: c.port2,
      capacity: 1,
    });
    await writer.write(new Uint8Array([1]));
    const pending = writer.write(new Uint8Array([2])).then(
      () => 0,
      (e: any) => e.errno,
    );
    reader.close();
    const broken = await pending;
    writer.close();
    const d = new MessageChannel();
    const invalid = new PortStream({
      kind: 'pipe',
      id: 3,
      direction: 'out',
      port: d.port1,
      capacity: 1,
    });
    await invalid.write(new Uint8Array([1]));
    const bad = invalid.write(new Uint8Array([2])).then(
      () => 0,
      (e: any) => e.errno,
    );
    d.port2.postMessage({ type: 'ack', consumed: 2 });
    const error = await bad;
    invalid.close();
    d.port2.close();
    return { broken, error };
  });
  expect(result).toEqual({ broken: 64, error: 29 });
});
test('endpoint migration preserves buffered bytes and cumulative accounting', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { PortStream } = await import('/packages/os/dist/internal/streams.js');
    const c = new MessageChannel();
    const r = new PortStream({ kind: 'pipe', id: 1, direction: 'in', port: c.port1, capacity: 8 });
    const w = new PortStream({ kind: 'pipe', id: 2, direction: 'out', port: c.port2, capacity: 8 });
    await w.write(new Uint8Array([1, 2, 3]));
    const first = await r.read(1);
    const ref = r.detach();
    const moved = structuredClone(ref, { transfer: [ref.port] });
    const next = new PortStream(moved);
    const rest = await next.read(2);
    w.close();
    const eof = await next.read(1);
    next.close();
    return [...first, ...rest, ...eof];
  });
  expect(result).toEqual([1, 2, 3]);
});
