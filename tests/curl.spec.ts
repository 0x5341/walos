import { test, expect } from '@playwright/test';

test('native curl streams an upload and response concurrently and prints status/headers', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, run } =
      await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('curl-tests', { create: true }),
    });
    try {
      const host = new HostProcessContext(os.getHostProcess());
      await host.http.start(await install(host, 'p3-http-service'), { listen: { port: 3000 } });
      return await run(host, await install(host, 'curl'), [
        'curl',
        '-i',
        '-X',
        'PUT',
        '-d',
        'body'.repeat(65536),
        'http://localhost:3000/echo?q=1#fragment',
      ]);
    } finally {
      await os.dispose();
    }
  });
  expect(result.exit).toEqual({ kind: 'exited', code: 0 });
  expect(result.stderr).toBe('');
  expect(result.stdout).toContain('HTTP 200\r\n');
  expect(result.stdout).toMatch(/X-Path: \/echo\?q=1\r\n/i);
  expect(result.stdout.split('\r\n\r\n')[1]).toBe('body'.repeat(65536));
});

test('native curl reports help and argument errors', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const results = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, run } =
      await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('curl-tests', { create: true }),
    });
    try {
      const host = new HostProcessContext(os.getHostProcess());
      const executable = await install(host, 'curl');
      const results = [];
      for (const args of [
        ['--help'],
        [],
        ['ftp://example.com'],
        ['-X'],
        ['http://user@example.com'],
      ])
        results.push(await run(host, executable, ['curl', ...args]));
      return results;
    } finally {
      await os.dispose();
    }
  });
  expect(results[0]).toMatchObject({ exit: { kind: 'exited', code: 0 }, stderr: '' });
  expect(results[0].stdout).toContain('Usage: curl');
  for (const result of results.slice(1)) {
    expect(result.exit).toEqual({ kind: 'exited', code: 1 });
    expect(result.stderr).toContain('curl:');
  }
});
