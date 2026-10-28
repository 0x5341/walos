import { test, expect } from '@playwright/test';
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
      const os = await h.Walos.create();
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
      const os = await h.Walos.create();
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
