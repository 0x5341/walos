import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});
for (const name of ['env', 'p2-env'])
  test(`${name} receives a copied explicit env with last duplicate key winning`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (name) => {
      const { Walos, HostProcessContext, install, run } = await import(
        '/tests/fixtures/host-harness.ts'
      );
      const os = await Walos.create({ env: { HOST_ONLY: 'secret', PWD: '/host' } });
      try {
        const h = new HostProcessContext(os.getHostProcess());
        const exe = await install(h, name);
        return await run(
          h,
          exe,
          [name],
          [
            { key: 'PWD', value: '/' },
            { key: 'VALUE', value: 'first' },
            { key: 'VALUE', value: 'last' },
          ],
        );
      } finally {
        await os.dispose();
      }
    }, name);
    expect(result.stdout).toContain('VALUE=last');
    expect(result.stdout).not.toContain('first');
    expect(result.stdout).not.toContain('HOST_ONLY');
    expect(result.exit).toEqual({ kind: 'exited', code: 0 });
  });
test('P2 generated WIT bindings spawn P2/P1 children, move file/pipe streams, wait one-shot and request stop', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, readAll } = await import(
      '/tests/fixtures/host-harness.ts'
    );
    const os = await Walos.create();
    try {
      const h = new HostProcessContext(os.getHostProcess());
      const [[root]] = h.fs.getDirectories();
      await root.createDirectoryAt('bin');
      await root.createDirectoryAt('tmp');
      for (const name of ['p2-echo', 'cat', 'p2-hang']) await install(h, name, `bin/${name}`);
      // The parent keeps Null stderr so its children can omit it. Pipe inheritance is forbidden.
      const [r, w] = await h.io.createPipe();
      const reading = readAll(r);
      const child = await h.process.spawn(
        await install(h, 'p2-process-probe'),
        ['probe'],
        [{ key: 'PWD', value: '/' }],
        undefined,
        w,
      );
      const exit = await child.wait();
      await child[Symbol.asyncDispose]();
      return { exit, stdout: new TextDecoder().decode(await reading) };
    } finally {
      await os.dispose();
    }
  });
  expect(result.stdout).toContain('component-resource-lifetimes\n');
  expect(result.stdout).toContain('component-spawn-pipe\n');
  expect(result.exit).toEqual({ kind: 'exited', code: 0 });
});
