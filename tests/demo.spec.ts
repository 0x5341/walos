import { test, expect } from '@playwright/test';

test('demo explicitly installs and runs Shell commands, mixed pipes, redirects and cd', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  const input = page.getByLabel('Terminal input');
  const log = page.getByRole('log');
  await expect(input).toBeEnabled({ timeout: 30000 });
  async function command(line: string, expected: string) {
    await input.fill(line);
    await input.press('Enter');
    await expect(log).toContainText(expected);
  }
  await command('echo hello-shell', 'hello-shell\n/ $');
  await command('cd /home', '/home $');
  await command('echo persisted > note.txt', 'note.txt\n/home $');
  await command('cat < note.txt | p2-cat | p2-sort', 'persisted\n/home $');
  await command('p2-pwd', '/home\n/home $');
  await page.reload();
  await expect(input).toBeEnabled();
  await command('cat /home/note.txt', 'persisted\n/ $');
});

test('jsco leaves preexisting component cache data untouched and removes the cache API', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const h = await import('/tests/fixtures/host-harness.ts');
    const api = await import('/packages/os/dist/index.js');
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('.walos-components', { create: true });
    const file = await dir.getFileHandle('user-sentinel', { create: true });
    const writer = await file.createWritable();
    await writer.write('preserved');
    await writer.close();
    const os = await h.Walos.create();
    const host = os.getHostProcess();
    const exe = await h.install(host, 'p2-true');
    const exits = [];
    for (let i = 0; i < 2; i++) exits.push((await h.run(host, exe, ['p2-true'])).exit);
    await exe[Symbol.asyncDispose]();
    await os.dispose();
    return {
      exits,
      cacheApi: 'clearComponentCache' in api,
      content: await (await file.getFile()).text(),
    };
  });
  expect(result).toEqual({
    exits: [
      { kind: 'exited', code: 0 },
      { kind: 'exited', code: 0 },
    ],
    cacheApi: false,
    content: 'preserved',
  });
});

for (const name of ['cwd-probe', 'p2-cwd-probe']) {
  test(`${name}: cwd use fails inside Wasm after successful spawn for absent/invalid PWD`, async ({
    page,
  }) => {
    await page.goto('/tests/fixtures/library.html');
    const results = await page.evaluate(async (name) => {
      const h = await import('/tests/fixtures/host-harness.ts');
      const os = await h.Walos.create();
      try {
        const host = os.getHostProcess();
        const exe = await h.install(host, name);
        const results = [];
        for (const pwd of [undefined, '/unknown-cwd', 'relative-unknown', '/']) {
          // h.run receives a ChildProcess only after READY, then collects wait.
          const result = await h.run(
            host,
            exe,
            [name],
            pwd === undefined ? [] : [{ key: 'PWD', value: pwd }],
          );
          results.push(result);
        }
        await exe[Symbol.asyncDispose]();
        return results;
      } finally {
        await os.dispose();
      }
    }, name);
    for (const result of results.slice(0, 3))
      expect(result.exit).toEqual({ kind: 'exited', code: name.startsWith('p2-') ? 1 : 126 });
    expect(results[3]).toMatchObject({ exit: { kind: 'exited', code: 0 }, stdout: '/\n' });
  });
}
