import { test, expect } from '@playwright/test';

test('custom fetch snapshots config and is inherited by native P3 processes', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, run } =
      await import('/tests/fixtures/host-harness.ts');
    const { Future } = await import('/packages/os/dist/index.js');
    const events: any[] = [];
    const channel = new BroadcastChannel(`http-transport-${crypto.randomUUID()}`);
    channel.onmessage = (event) => events.push(event.data);
    const config = { audit: channel.name, tag: 'original' };
    const pending = Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('http-transport', { create: true }),
      http: {
        module: new URL('/tests/fixtures/http-fetch-backend.ts', location.href).href,
        config,
      },
    });
    config.tag = 'changed';
    const os = await pending;
    const host = new HostProcessContext(os.getHostProcess());
    const http = host.context.wasi.http;
    const [request] = http.types.request.new(
      http.types.fields.new(),
      undefined,
      new Future({ tag: 'ok', val: undefined }),
      undefined,
    );
    request.setAuthority('example.invalid');
    const reply = await http.client.send(request);
    if (reply.tag !== 'ok') throw new Error(JSON.stringify(reply));
    const [body] = http.types.response.consumeBody(
      reply.val,
      new Future({ tag: 'ok', val: undefined }),
    );
    const hostText = new TextDecoder().decode(Uint8Array.from((await body.read(65536))!));
    await body.read(65536);
    const child = await run(host, await install(host, 'p3-probe'), [
      'p3-probe',
      'http',
      'example.invalid',
    ]);
    const hostPid = host.pid;
    await os.dispose();
    await new Promise((resolve) => setTimeout(resolve, 50));
    channel.close();
    return { events, hostText, child, hostPid };
  });
  expect(result.hostText).toBe('p3-http');
  expect(result.child).toMatchObject({ exit: { kind: 'exited', code: 0 }, stdout: 'p3-http-ok\n' });
  const starts = result.events.filter((e) => e.type === 'init');
  expect(starts).toHaveLength(2);
  expect(starts.every((e) => e.tag === 'original')).toBe(true);
  expect(starts.find((e) => e.pid !== result.hostPid).ppid).toBe(result.hostPid);
  expect(result.events.filter((e) => e.type === 'fetch')).toHaveLength(2);
  expect(result.events.filter((e) => e.type === 'dispose')).toHaveLength(2);
  expect(result.events.filter((e) => e.type === 'dispose').every((e) => e.aborted)).toBe(true);
});

test('custom fetch initialization failure rejects OS creation', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const message = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    try {
      await Walos.create({
        storage: await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('http-transport-failed', { create: true }),
        http: {
          module: new URL('/tests/fixtures/http-fetch-backend.ts', location.href).href,
          config: { fail: true },
        },
      });
      return 'unexpected success';
    } catch (error) {
      return String(error);
    }
  });
  expect(message).toContain('fetch backend initialization failed');
});
