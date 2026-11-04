import { test, expect } from '@playwright/test';
test('bundled native HTTP service accepts another P3 process client', async ({ page }) => {
  await page.goto('/tests/fixtures/production.html');
  await page.waitForFunction(() => Boolean((window as any).testHost));
  const result = await page.evaluate(async () => {
    const h = (window as any).testHost;
    const os = await h.Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('http-production', { create: true }),
    });
    try {
      const host = new h.HostProcessContext(os.getHostProcess());
      const service = await host.http.start(await h.install(host, 'p3-http-service'), {
        listen: { port: 3000 },
      });
      const result = await h.run(host, await h.install(host, 'p3-probe'), [
        'p3-probe',
        'http-local',
        'localhost:3000',
      ]);
      await service.requestStop();
      return { result, exit: await service.wait() };
    } finally {
      await os.dispose();
    }
  });
  expect(result.result).toMatchObject({
    exit: { kind: 'exited', code: 0 },
    stdout: 'p3-http-ok\n',
  });
  expect(result.exit.kind).toBe('terminated');
});
test.skip(
  !process.env.WALOS_TEST_BUILD,
  'Production bundle checks run through npm run test:production',
);
for (const name of ['echo', 'p2-echo', 'p3-probe'])
  test(`bundled Host starts ${name} through bundled Core/Process Workers`, async ({ page }) => {
    const response = await page.goto('/tests/fixtures/production.html');
    expect(response?.headers()['content-security-policy']).toContain(
      "script-src 'self' 'wasm-unsafe-eval'",
    );
    await page.waitForFunction(() => Boolean((window as any).testHost));
    const result = await page.evaluate(async (name) => {
      const h = (window as any).testHost;
      const os = await h.Walos.create({
        storage: await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('walos-v1', { create: true }),
      });
      try {
        const host = new h.HostProcessContext(os.getHostProcess());
        return await h.run(host, await h.install(host, name), [name, 'production']);
      } finally {
        await os.dispose();
      }
    }, name);
    expect(result.exit).toEqual({ kind: 'exited', code: 0 });
    expect(result.stdout).toBe(name === 'p3-probe' ? 'native-p3-0.3.2\n' : 'production\n');
  });

for (const name of ['p2-cat', 'p3-cat'])
  test(`bundled ${name} displays a file operand`, async ({ page }) => {
    await page.goto('/tests/fixtures/production.html');
    await page.waitForFunction(() => Boolean((window as any).testHost));
    const result = await page.evaluate(async (name) => {
      const h = (window as any).testHost;
      const os = await h.Walos.create({
        storage: await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('walos-v1', { create: true }),
      });
      try {
        const host = new h.HostProcessContext(os.getHostProcess());
        const [[root]] = host.fs.getDirectories();
        const file = await root.openAt({}, 'production-input', { create: true }, { write: true });
        await file.write(new TextEncoder().encode('production-file-data\n'), 0n);
        await file[Symbol.asyncDispose]();
        return await h.run(host, await h.install(host, name), [name, '/production-input']);
      } finally {
        await os.dispose();
      }
    }, name);
    expect(result).toMatchObject({
      exit: { kind: 'exited', code: 0 },
      stdout: 'production-file-data\n',
      stderr: '',
    });
  });

for (const [mode, output] of [
  ['timezone', 'p3-timezone-ok\n'],
  ['fs-extended', 'p3-fs-extended-ok\n'],
])
  test(`bundled native P3 ${mode}`, async ({ page }) => {
    await page.goto('/tests/fixtures/production.html');
    await page.waitForFunction(() => Boolean((window as any).testHost));
    const result = await page.evaluate(async (mode) => {
      const h = (window as any).testHost;
      const os = await h.Walos.create({
        storage: await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('walos-v1', { create: true }),
      });
      try {
        const host = new h.HostProcessContext(os.getHostProcess());
        return await h.run(host, await h.install(host, 'p3-probe'), ['p3-probe', mode]);
      } finally {
        await os.dispose();
      }
    }, mode);
    expect(result).toMatchObject({
      exit: { kind: 'exited', code: 0 },
      stdout: output,
      stderr: '',
    });
  });

test('bundled external backend works in Host and native P3 Worker under CSP', async ({ page }) => {
  await page.goto('/tests/fixtures/production.html');
  await page.waitForFunction(() => Boolean((window as any).testHost));
  const result = await page.evaluate(async () => {
    const h = (window as any).testHost;
    const os = await h.Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('walos-v1', { create: true }),
      sockets: { module: new URL('/tests/fixtures/socket-backend.js', location.href).href },
    });
    try {
      const created = os.getHostProcess().wasi.sockets.types.udpSocket.create('ipv4');
      if (created.tag !== 'ok') throw new Error('Host backend unavailable');
      await created.val[Symbol.asyncDispose]();
      const host = new h.HostProcessContext(os.getHostProcess());
      return await h.run(host, await h.install(host, 'p3-probe'), ['p3-probe', 'sockets']);
    } finally {
      await os.dispose();
    }
  });
  expect(result).toMatchObject({
    exit: { kind: 'exited', code: 0 },
    stdout: 'p3-sockets-ok\n',
    stderr: '',
  });
});
