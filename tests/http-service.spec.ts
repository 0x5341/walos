import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});
test('native service returns before upload, streams and reuses its instance', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host, executable, types } = await h.setup();
    try {
      const service = await host.http.start(executable, { listen: { port: 3000, path: '/api' } });
      const channel = h.createStream<number>(8192);
      const trailer = types.fields.new();
      trailer.append('X-End', Uint8Array.of(0x80));
      const outgoing = h.request(
        types,
        '/api/users?q=1',
        'localhost:3000',
        channel.readable,
        new h.Future({ tag: 'ok', val: trailer }),
        types.fields.fromList([
          ['X-Raw', Uint8Array.of(0x80)],
          ['x-raw', Uint8Array.of(65)],
        ]).val,
      );
      const reply = await host.context.wasi.http.client.send(outgoing.value);
      const reading = h.read(types, reply);
      for (let i = 0; i < 40; i++) await channel.writable.write(new Uint8Array(4096).fill(i));
      channel.writable.close();
      const first = await reading;
      const sent = await outgoing.sent;
      const next = h.request(types, '/api');
      const second = await h.read(types, await service.handle(next.value));
      await next.sent;
      await service.requestStop();
      return { first, second, sent, exit: await service.wait() };
    } finally {
      await os.dispose();
    }
  });
  expect(result.first.bytes).toHaveLength(40 * 4096);
  expect(result.first.bytes[4096]).toBe(1);
  expect(result.first.headers.slice(0, 2)).toEqual([
    ['X-Raw', [0x80]],
    ['x-raw', [65]],
  ]);
  expect(result.first.headers).toContainEqual([
    'X-Path',
    Array.from(Buffer.from('/api/users?q=1')),
  ]);
  expect({ trailers: result.first.trailers, error: result.first.ending }).toEqual({
    trailers: [['X-End', [0x80]]],
    error: undefined,
  });
  expect(result.second.headers).toContainEqual(['X-Calls', [50]]);
  expect(result.sent.tag).toBe('ok');
  expect(result.exit).toEqual({ kind: 'terminated', message: 'HTTP service stopped' });
});

test('routes by port and longest path prefix, with Fetch only on no match', async ({ page }) => {
  let fetched = 0;
  await page.route('http://localhost:3000/**', async (route) => {
    fetched++;
    await route.fulfill({
      status: 202,
      headers: { 'access-control-allow-origin': '*' },
      body: 'network',
    });
  });
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host, executable, types } = await h.setup();
    try {
      const root = await host.http.start(executable, { listen: { port: 3000 } });
      const api = await host.http.start(executable, { listen: { port: 3000, path: '/api/' } });
      const other = await host.http.start(executable, { listen: { port: 3001 } });
      let duplicate = '';
      try {
        await host.http.start(executable, { listen: { port: 3000, path: '/api' } });
      } catch (error) {
        duplicate = (error as any).code;
      }
      const values = [];
      for (const [path, authority] of [
        ['/api/users?q=1', 'localhost:3000'],
        ['/apix', 'localhost:3000'],
        ['/api', 'localhost:3001'],
      ]) {
        const outgoing = h.request(types, path, authority);
        values.push(await h.read(types, await host.context.wasi.http.client.send(outgoing.value)));
        await outgoing.sent;
      }
      await api.requestStop();
      await api.wait();
      await root.requestStop();
      await root.wait();
      const outgoing = h.request(types, '/api/users');
      const fallback = await h.read(
        types,
        await host.context.wasi.http.client.send(outgoing.value),
      );
      const restarted = await host.http.start(executable, { listen: { port: 3000, path: '/api' } });
      const fresh = await h.read(types, await restarted.handle(h.request(types, '/api').value));
      await other.requestStop();
      return { values, duplicate, fallback, fresh };
    } finally {
      await os.dispose();
    }
  });
  expect(result.duplicate).toBe('busy');
  expect(result.values.map((v) => v.headers.find(([k]) => k === 'X-Calls')?.[1])).toEqual([
    [49],
    [49],
    [49],
  ]);
  expect(result.values[0].headers).toContainEqual([
    'X-Path',
    Array.from(Buffer.from('/api/users?q=1')),
  ]);
  expect(result.fallback.status).toBe(202);
  expect(result.fresh.headers).toContainEqual(['X-Calls', [49]]);
  expect(fetched).toBe(1);
});

test('native middleware chains change requests and responses', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host, executable, middleware, types } = await h.setup();
    try {
      const service = await host.http.start(executable);
      const inner = await host.http.start(middleware, { next: service });
      const outer = await host.http.start(middleware, { next: inner, listen: { port: 3000 } });
      const outgoing = h.request(types, '/api?q=1');
      const result = await h.read(types, await host.context.wasi.http.client.send(outgoing.value));
      await outgoing.sent;
      await outer.requestStop();
      await inner.requestStop();
      await service.requestStop();
      return result;
    } finally {
      await os.dispose();
    }
  });
  expect(result.status).toBe(201);
  expect(result.headers).toContainEqual(['X-Path', Array.from(Buffer.from('/via/via/api?q=1'))]);
});

test('middleware can return an HTTP error status without calling its next handler', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host, executable, middleware, types } = await h.setup();
    try {
      const service = await host.http.start(executable);
      const middle = await host.http.start(middleware, { next: service });
      const short = await h.read(types, await middle.handle(h.request(types, '/short').value));
      const next = await h.read(types, await service.handle(h.request(types).value));
      return { short, next };
    } finally {
      await os.dispose();
    }
  });
  expect(result.short.status).toBe(403);
  expect(result.next.headers).toContainEqual(['X-Calls', [49]]);
});

for (const kind of [
  'signal-after-response',
  'response-drop',
  'producer-cancel',
  'forced-stop',
  'next-stop',
  'os-dispose',
] as const)
  test(`${kind} settles HTTP streams and pending operations`, async ({ page }) => {
    const result = await page.evaluate(async (kind) => {
      const h = await import('/tests/fixtures/http-harness.ts');
      const { os, host, executable, middleware, types } = await h.setup();
      try {
        const service = await host.http.start(executable);
        const entry =
          kind === 'next-stop' ? await host.http.start(middleware, { next: service }) : service;
        const channel = h.createStream<number>(8);
        const outgoing = h.request(
          types,
          kind === 'forced-stop' ? '/spin' : '/',
          'localhost:3000',
          channel.readable,
        );
        const controller = new AbortController();
        const pending = entry.handle(outgoing.value, { signal: controller.signal });
        if (kind === 'forced-stop') {
          await new Promise((resolve) => setTimeout(resolve, 40));
          await service.requestStop();
          const reply = await pending;
          return {
            error: reply.tag,
            sent: (await outgoing.sent).tag,
            exit: (await service.wait()).kind,
          };
        }
        const reply = await pending;
        if (reply.tag === 'err') throw new Error(JSON.stringify(reply));
        const [body, trailers] = types.response.consumeBody(
          reply.val,
          new h.Future(new Promise(() => {})),
        );
        const read = body.read(8);
        if (kind === 'signal-after-response') controller.abort();
        else if (kind === 'response-drop') await body.cancel();
        else if (kind === 'producer-cancel') await outgoing.sent.cancel();
        else if (kind === 'next-stop') await service.requestStop();
        else await os.dispose();
        const bytes = await read;
        const trailerResult = await trailers;
        return {
          error: trailerResult.tag,
          sent: (await outgoing.sent).tag,
          eof: bytes === undefined,
          exit: kind === 'os-dispose' ? 'disposed' : (await service.wait()).kind,
        };
      } finally {
        await os.dispose();
      }
    }, kind);
    expect(result.error).toBe('err');
    expect(result.sent).toBe('err');
    if (kind !== 'forced-stop') expect(result.eof).toBe(true);
    expect(result.exit).toBe(kind === 'os-dispose' ? 'disposed' : 'terminated');
  });

test('native failed trailer futures preserve their HTTP error', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host, executable, types } = await h.setup();
    try {
      const service = await host.http.start(executable);
      return await h.read(types, await service.handle(h.request(types, '/trailer-error').value));
    } finally {
      await os.dispose();
    }
  });
  expect(result.ending).toEqual({ tag: 'HTTP-response-incomplete' });
});

test('stopping a sending native process also reclaims the active service request', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host, executable } = await h.setup();
    try {
      const service = await host.http.start(executable, { listen: { port: 3000 } });
      const client = await host.process.spawn(
        await h.install(host, 'p3-probe'),
        ['p3-probe', 'http-pending', 'localhost:3000'],
        [],
      );
      await new Promise((resolve) => setTimeout(resolve, 60));
      await client.requestStop();
      return { client: await client.wait(), service: await service.wait() };
    } finally {
      await os.dispose();
    }
  });
  expect(result.client.kind).toBe('terminated');
  expect(result.service.kind).toBe('terminated');
});

test('another native P3 process sends HTTP through the shared registry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host, executable } = await h.setup();
    try {
      await host.http.start(executable, { listen: { port: 3000 } });
      return await h.run(host, await h.install(host, 'p3-probe'), [
        'p3-probe',
        'http-local',
        'localhost:3000',
      ]);
    } finally {
      await os.dispose();
    }
  });
  expect(result).toMatchObject({
    exit: { kind: 'exited', code: 0 },
    stdout: 'p3-http-ok\n',
    stderr: '',
  });
});

test('native P3 starts, calls, stops and waits for a private HTTP service', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host } = await h.setup();
    try {
      return await h.run(host, await h.install(host, 'p3-probe'), ['p3-probe', 'http-start']);
    } finally {
      await os.dispose();
    }
  });
  expect(result).toMatchObject({
    exit: { kind: 'exited', code: 0 },
    stdout: 'p3-http-ok\np3-http-start-ok\n',
    stderr: '',
  });
});

test('busy, typed errors and traps never fall back to Fetch', async ({ page }) => {
  let fetched = 0;
  await page.route('http://localhost:3000/**', async (route) => {
    fetched++;
    await route.abort();
  });
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host, executable, types } = await h.setup();
    try {
      const service = await host.http.start(executable, { listen: { port: 3000 } });
      const cycle = await host.context.wasi.http.client.send(h.request(types, '/recurse').value);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const error = await host.context.wasi.http.client.send(h.request(types, '/error').value);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const controller = new AbortController();
      const pending = service.handle(h.request(types, '/hang').value, {
        signal: controller.signal,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const busy = await host.context.wasi.http.client.send(h.request(types).value);
      let directBusy = '';
      try {
        await service.handle(h.request(types).value);
      } catch (e) {
        directBusy = (e as any).code;
      }
      controller.abort();
      const cancelled = await pending;
      const exit = await service.wait();
      const replacement = await host.http.start(executable, { listen: { port: 3000 } });
      const trap = await host.context.wasi.http.client.send(h.request(types, '/trap').value);
      const trapExit = await replacement.wait();
      return { cycle, error, busy, directBusy, cancelled, exit, trap, trapExit };
    } finally {
      await os.dispose();
    }
  });
  expect(result.error).toEqual({ tag: 'err', val: { tag: 'configuration-error' } });
  expect(result.cycle).toMatchObject({ tag: 'err', val: { tag: 'internal-error' } });
  expect(result.busy).toMatchObject({ tag: 'err', val: { tag: 'internal-error' } });
  expect(result.directBusy).toBe('busy');
  expect(result.cancelled.tag).toBe('err');
  expect(result.exit).toEqual({ kind: 'terminated', message: 'HTTP service stopped' });
  expect(result.trap.tag).toBe('err');
  expect(result.trapExit.kind).toBe('trap');
  expect(fetched).toBe(0);
});

test('dedicated start validates component world and middleware configuration', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host, executable, middleware } = await h.setup();
    try {
      const failures: string[] = [];
      for (const operation of [
        () => host.http.start(middleware),
        () => host.process.spawn(executable, [], []),
        async () => host.http.start(await h.install(host, 'p3-probe')),
        () => host.http.start(executable, { listen: { port: 0 } }),
      ]) {
        try {
          await operation();
        } catch (error) {
          failures.push((error as any).code);
        }
      }
      return failures;
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual(['startup', 'startup', 'startup', 'startup']);
});

test('service remains busy until the consumer reports handling completion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/http-harness.ts');
    const { os, host, executable, types } = await h.setup();
    try {
      const service = await host.http.start(executable);
      const reply = await service.handle(h.request(types).value);
      if (reply.tag === 'err') throw new Error(JSON.stringify(reply));
      let handled!: (value: { tag: 'ok'; val: undefined }) => void;
      const [body, trailers] = types.response.consumeBody(
        reply.val,
        new h.Future(
          new Promise((resolve) => {
            handled = resolve;
          }),
        ),
      );
      while (await body.read(8)) {}
      await trailers;
      let busy = '';
      try {
        await service.handle(h.request(types).value);
      } catch (error) {
        busy = (error as any).code;
      }
      handled({ tag: 'ok', val: undefined });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const next = await h.read(types, await service.handle(h.request(types).value));
      return { busy, next };
    } finally {
      await os.dispose();
    }
  });
  expect(result.busy).toBe('busy');
  expect(result.next.headers).toContainEqual(['X-Calls', [50]]);
});
