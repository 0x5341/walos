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
