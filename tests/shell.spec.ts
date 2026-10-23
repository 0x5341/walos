import { test, expect, type Page } from '@playwright/test';
async function boot(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('Terminal input')).toBeEnabled();
  await expect(page.getByRole('log')).toContainText('/ $');
}
async function command(page: Page, line: string) {
  const log = page.getByRole('log');
  const before = (await log.textContent())!.length;
  await page.getByLabel('Terminal input').fill(line);
  await page.getByLabel('Terminal input').press('Enter');
  await expect
    .poll(async () => {
      const text = (await log.textContent())!.slice(before);
      return text.includes(' $ ') ? text : '';
    })
    .not.toBe('');
  return (await log.textContent())!.slice(before);
}
test('WASI shell spawns a real pipeline and preserves OPFS files', async ({ page }) => {
  await boot(page);
  expect(await command(page, 'cd /home')).toContain('/home $');
  const output = await command(page, 'cat README.md | grep TODO | sort');
  expect(output).toContain('TODO apple\nTODO zebra\n');
  await command(page, 'echo persisted > note.txt');
  await command(page, 'echo appended >> note.txt');
  expect(await command(page, 'cat < note.txt')).toContain('persisted\nappended\n');
  await page.reload();
  await expect(page.getByLabel('Terminal input')).toBeEnabled();
  expect(await command(page, 'cat /home/note.txt')).toContain('persisted\nappended\n');
});
test('argv, env, cwd and exit status reach WASI commands', async ({ page }) => {
  await boot(page);
  await command(page, 'cd /home');
  expect(await command(page, 'echo "two words" tail')).toContain('two words tail\n');
  await command(page, 'export TEST_VALUE=works');
  expect(await command(page, 'env')).toContain('TEST_VALUE=works');
  expect(await command(page, 'pwd')).toContain('/home\n');
  await command(page, 'false');
  expect(await command(page, 'echo $?')).toContain('1\n');
});
test('trap and forced stop leave the shell responsive', async ({ page }) => {
  await boot(page);
  await command(page, 'trap');
  expect(await command(page, 'echo alive')).toContain('alive\n');
  await page.getByLabel('Terminal input').fill('hang');
  await page.getByLabel('Terminal input').press('Enter');
  await expect(page.locator('#processes')).toContainText('running hang');
  await page.getByRole('button', { name: 'Stop pipeline' }).click();
  await expect(page.getByRole('log')).toContainText('hang\n/ $');
  expect(await command(page, 'echo recovered')).toContain('recovered\n');
});
test('a 1 MiB pipeline crosses the pipe capacity and startup failure keeps redirection effects', async ({
  page,
}) => {
  await boot(page);
  await command(page, 'cd /home');
  const expected = '0123456789abcdef'.repeat(65536);
  await page.evaluate(async (bytes) => {
    const root = await navigator.storage.getDirectory(),
      home = await root.getDirectoryHandle('home');
    const file = await home.getFileHandle('large.txt', { create: true }),
      w = await file.createWritable();
    await w.write(bytes);
    await w.close();
  }, expected);
  const begin = Date.now();
  await command(page, 'cat large.txt | cat > copied.txt');
  const duration = Date.now() - begin;
  const actual = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(),
      home = await root.getDirectoryHandle('home');
    return (await (await home.getFileHandle('copied.txt')).getFile()).text();
  });
  expect(actual).toBe(expected);
  console.log(`1 MiB file → pipe → file: ${duration} ms`);
  await command(page, 'echo old > truncated.txt');
  await command(page, 'missing-command > truncated.txt');
  expect(
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      return (
        await (
          await (await root.getDirectoryHandle('home')).getFileHandle('truncated.txt')
        ).getFile()
      ).size;
    }),
  ).toBe(0);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(),
      bin = await root.getDirectoryHandle('bin'),
      file = await bin.getFileHandle('broken', { create: true }),
      w = await file.createWritable();
    await w.write(new Uint8Array([0, 1, 2]));
    await w.close();
  });
  expect(await command(page, 'cat large.txt | broken')).toContain('cannot start broken');
  expect(await command(page, 'echo after-failed-start')).toContain('after-failed-start\n');
  await command(page, 'echo ephemeral > /tmp/ephemeral');
  await page.reload();
  await expect(page.getByLabel('Terminal input')).toBeEnabled();
  expect(await command(page, 'cat /tmp/ephemeral')).toContain('No such file');
});
test('WASI filesystem namespace operations use OPFS directly in the Process Worker', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(async () => {
    const file = await (
      await (await navigator.storage.getDirectory()).getDirectoryHandle('bin')
    ).getFileHandle('fs-probe', { create: true });
    const w = await file.createWritable();
    await w.write(await (await fetch('/bin/fs-probe.wasm')).arrayBuffer());
    await w.close();
  });
  expect(await command(page, 'fs-probe')).toContain('filesystem probe passed\n');
});
