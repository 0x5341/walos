// The OS no longer starts a shell. Exercise equivalent command services through
// the explicit Host API; demo.spec.ts covers the explicit Shell consumer.
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});
for (const name of ['cat', 'p2-cat', 'p3-cat'])
  test(`${name} keeps stderr separate from explicitly redirected stdout`, async ({ page }) => {
    const result = await page.evaluate(async (name) => {
      const { Walos, HostProcessContext, install, run } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        return await run(
          new HostProcessContext(os.getHostProcess()),
          await install(new HostProcessContext(os.getHostProcess()), name),
          [name, '/missing-input'],
        );
      } finally {
        await os.dispose();
      }
    }, name);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('missing-input:');
    expect(result.exit).toEqual({ kind: 'exited', code: 1 });
  });
for (const name of ['fs-probe', 'p2-fs-probe'])
  test(`${name} uses Worker-local namespace operations`, async ({ page }) => {
    const result = await page.evaluate(async (name) => {
      const { Walos, HostProcessContext, install, run } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create();
      try {
        const h = new HostProcessContext(os.getHostProcess());
        const [[root]] = h.fs.getDirectories();
        await root.createDirectoryAt('tmp');
        return await run(h, await install(h, name), [name]);
      } finally {
        await os.dispose();
      }
    }, name);
    expect(result.stdout).toBe('filesystem probe passed\n');
    expect(result.exit).toEqual({ kind: 'exited', code: 0 });
  });
test('Host file writes persist across OS disposal and page reload, including tmp user data', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { Walos, HostProcessContext } = await import('/packages/os/dist/index.js');
    const os = await Walos.create();
    const h = new HostProcessContext(os.getHostProcess());
    const [[root]] = h.fs.getDirectories();
    await root.createDirectoryAt('tmp');
    const file = await root.openAt({}, 'tmp/user', { create: true }, { write: true });
    await file.write(new TextEncoder().encode('persistent'), 0n);
    await os.dispose();
  });
  await page.reload();
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext } = await import('/packages/os/dist/index.js');
    const os = await Walos.create();
    const [[root]] = new HostProcessContext(os.getHostProcess()).fs.getDirectories();
    const file = await root.openAt({}, 'tmp/user', {}, { read: true });
    const [bytes] = await file.read(100n, 0n);
    await os.dispose();
    return new TextDecoder().decode(bytes);
  });
  expect(result).toBe('persistent');
});
