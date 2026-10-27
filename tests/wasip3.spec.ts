import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});

test('command world selects P2 or P3 independently of the Component binary header', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { wasiCommandVersion } = await import('/packages/os/dist/internal/component.js');
    let invalid: string | undefined;
    try {
      wasiCommandVersion(['example:other/foo@1.0.0']);
    } catch (error) {
      invalid = String(error);
    }
    return {
      p2: wasiCommandVersion(['wasi:cli/run@0.2.0']),
      p3: wasiCommandVersion(['wasi:cli/run@0.3.0']),
      rc: wasiCommandVersion(['wasi:cli/run@0.3.0-rc-2026-03-15']),
      invalid,
    };
  });
  expect(result.p2).toBe('p2');
  expect(result.p3).toBe('p3');
  expect(result.rc).toBe('p3');
  expect(result.invalid).toContain('Expected a wasi:cli/run');
});

test('P3 stdout bridge preserves 1 MiB bytes and bounded Pipe backpressure', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { connect } = await import('/packages/os/dist/internal/streams.js');
    const { p3Writable } = await import('/packages/os/dist/internal/p3-io.js');
    const channel = new MessageChannel();
    const output = await connect({
      kind: 'pipe', id: 1, direction: 'out', port: channel.port1, capacity: 65536,
    });
    const input = await connect({
      kind: 'pipe', id: 2, direction: 'in', port: channel.port2, capacity: 65536,
    });
    const expected = Uint8Array.from({ length: 1024 * 1024 }, (_v, i) => i % 251);
    const actual = new Uint8Array(expected.length);
    const writer = p3Writable(output).getWriter();
    const writing = writer.write(expected);
    let offset = 0;
    while (offset < actual.length) {
      const bytes = await input.read(65536);
      if (!bytes.length) throw new Error('Premature EOF');
      actual.set(bytes, offset);
      offset += bytes.length;
    }
    await writing;
    writer.releaseLock();
    output.close();
    const eof = (await input.read(1)).length === 0;
    input.close();
    return {
      bytes: offset,
      equal: actual.every((value, i) => value === expected[i]),
      eof,
    };
  });
  expect(result).toEqual({ bytes: 1024 * 1024, equal: true, eof: true });
});

test('P3 stdin bridge forwards Pipe bytes until EOF', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { connect } = await import('/packages/os/dist/internal/streams.js');
    const { p3Readable } = await import('/packages/os/dist/internal/p3-io.js');
    const channel = new MessageChannel();
    const output = await connect({
      kind: 'pipe', id: 1, direction: 'out', port: channel.port1, capacity: 65536,
    });
    const input = await connect({
      kind: 'pipe', id: 2, direction: 'in', port: channel.port2, capacity: 65536,
    });
    const expected = Uint8Array.from({ length: 1024 * 1024 }, (_v, i) => i % 239);
    const sent = (async () => {
      let offset = 0;
      while (offset < expected.length) offset += await output.write(expected.subarray(offset));
      output.close();
    })();
    const reader = p3Readable(input).getReader();
    const actual = new Uint8Array(expected.length);
    let offset = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      actual.set(value, offset);
      offset += value.length;
    }
    await sent;
    reader.releaseLock();
    input.close();
    return {
      bytes: offset,
      equal: actual.every((value, i) => value === expected[i]),
    };
  });
  expect(result).toEqual({ bytes: 1024 * 1024, equal: true });
});
