import { test, expect, type Page } from '@playwright/test';

for (const cat of ['cat', 'p2-cat'])
  test(`upstream ${cat} keeps stderr separate from redirected stdout`, async ({ page }) => {
    await boot(page);
    await command(page, 'cd /home');
    const output = await command(page, `${cat} missing-audit-input > audit-output`);
    expect(output).toContain('missing-audit-input:');
    expect(await command(page, 'echo $?')).toContain('1\n');
    expect(
      await page.evaluate(async () => {
        const home = await (await navigator.storage.getDirectory()).getDirectoryHandle('home');
        return (await (await home.getFileHandle('audit-output')).getFile()).size;
      }),
    ).toBe(0);
    await command(page, 'echo audit-stdio > audit-input');
    expect(await command(page, `${cat} < audit-input`)).toContain('audit-stdio\n');
  });

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
    .poll(
      async () => {
        const text = (await log.textContent())!.slice(before);
        return text.includes(' $ ') ? text : '';
      },
      { timeout: 20000 },
    )
    .not.toBe('');
  return (await log.textContent())!.slice(before);
}

test('wasip2 commands receive argv, env, cwd and exit status', async ({ page }) => {
  await boot(page);
  await command(page, 'cd /home');
  expect(await command(page, 'p2-echo "hello component" こんにちは')).toContain(
    'hello component こんにちは\n',
  );
  await command(page, 'export P2_TEST=works');
  expect(await command(page, 'p2-env')).toContain('P2_TEST=works');
  expect(await command(page, 'p2-pwd')).toContain('/home\n');
  await command(page, 'p2-false');
  expect(await command(page, 'echo $?')).toContain('1\n');
});

test('Preview 1 and Preview 2 share pipelines, redirection and persistent OPFS files', async ({
  page,
}) => {
  await boot(page);
  await command(page, 'cd /home');
  expect(await command(page, 'p2-cat README.md | grep TODO | p2-sort')).toContain(
    'TODO apple\nTODO zebra\n',
  );
  await command(page, 'p2-echo first > p2.txt');
  await command(page, 'p2-echo second >> p2.txt');
  expect(await command(page, 'p2-cat < p2.txt')).toContain('first\nsecond\n');
  const expected = '0123456789abcdef'.repeat(65536);
  await page.evaluate(async (bytes) => {
    const home = await (await navigator.storage.getDirectory()).getDirectoryHandle('home');
    const writer = await (await home.getFileHandle('large-p2', { create: true })).createWritable();
    await writer.write(bytes);
    await writer.close();
  }, expected);
  await command(page, 'cat large-p2 | p2-cat | cat > copied-p2');
  expect(
    await page.evaluate(async () => {
      const home = await (await navigator.storage.getDirectory()).getDirectoryHandle('home');
      return (await (await home.getFileHandle('copied-p2')).getFile()).text();
    }),
  ).toBe(expected);
  await page.reload();
  await expect(page.getByLabel('Terminal input')).toBeEnabled();
  expect(await command(page, 'p2-cat /home/p2.txt')).toContain('first\nsecond\n');
});

test('wasip2 filesystem operations, traps and forced stops leave the shell responsive', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(async () => {
    const bin = await (await navigator.storage.getDirectory()).getDirectoryHandle('bin');
    const writer = await (
      await bin.getFileHandle('p2-fs-probe', { create: true })
    ).createWritable();
    await writer.write(await (await fetch('/bin/p2-fs-probe.wasm')).arrayBuffer());
    await writer.close();
  });
  expect(await command(page, 'p2-fs-probe')).toContain('filesystem probe passed\n');
  await command(page, 'p2-trap');
  expect(await command(page, 'echo $?')).toContain('125\n');
  await page.getByLabel('Terminal input').fill('p2-hang');
  await page.getByLabel('Terminal input').press('Enter');
  await expect(page.locator('#processes')).toContainText('running p2-hang');
  await page.getByRole('button', { name: 'Stop pipeline' }).click();
  await expect(page.getByRole('log')).toContainText('p2-hang\n/ $');
  expect(await command(page, 'echo recovered')).toContain('recovered\n');
});

test('a P2 parent uses generated walos WIT bindings to spawn P2/P1 children and transfer a pipe', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(async () => {
    const bin = await (await navigator.storage.getDirectory()).getDirectoryHandle('bin');
    const writer = await (
      await bin.getFileHandle('p2-process-probe', { create: true })
    ).createWritable();
    await writer.write(await (await fetch('/bin/p2-process-probe.wasm')).arrayBuffer());
    await writer.close();
  });
  const output = await command(page, 'p2-process-probe');
  expect(output).toContain('component-resource-lifetimes\n');
  expect(output).toContain('component-spawn-pipe\n');
  expect(await command(page, 'echo $?')).toContain('0\n');
});

test('persistent component cache works across Workers and regenerates corrupt artifacts', async ({
  page,
}) => {
  test.skip(
    (process.env.WALOS_COMPONENT_ENGINE || 'jsco') !== 'jco',
    'Jco-specific application cache; candidate cache coverage is in engines.spec.ts',
  );
  await boot(page);
  expect(await command(page, 'p2-echo cold')).toContain('cold\n');
  const converter = /\/jco(?:-[\w-]+)?\.js(?:\?.*)?$/;
  let blocked = 0;
  await page.route(converter, (route) => {
    blocked++;
    return route.abort();
  });
  expect(await command(page, 'p2-echo warm')).toContain('warm\n');
  expect(blocked).toBe(0);
  await page.unroute(converter);
  const entries = await page.evaluate(async () => {
    const cache = await (
      await navigator.storage.getDirectory()
    )
      .getDirectoryHandle('.walos-components')
      .then((dir) => dir.getDirectoryHandle('schema-2'))
      .then((dir) => dir.getDirectoryHandle('jco'));
    const names: string[] = [];
    for await (const [name] of cache.entries()) if (name.endsWith('.json')) names.push(name);
    const manifest = JSON.parse(
      await (await (await cache.getFileHandle(names[0])).getFile()).text(),
    );
    const dir = await cache.getDirectoryHandle(manifest.directory);
    const core = manifest.files.find((f: { name: string }) => f.name.endsWith('.wasm'));
    const writer = await (await dir.getFileHandle(core.name)).createWritable();
    await writer.write('interrupted or corrupt artifact');
    await writer.close();
    return names.length;
  });
  expect(entries).toBe(1);
  let conversions = 0;
  page.on('request', (request) => {
    if (converter.test(request.url())) conversions++;
  });
  expect(await command(page, 'p2-echo repaired')).toContain('repaired\n');
  expect(conversions).toBeGreaterThan(0);
});

test('component execution works with CSP allowing Blob modules and Wasm compilation', async ({
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy':
          "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' data: ws:; style-src 'self' 'unsafe-inline'",
      },
    });
  });
  await boot(page);
  expect(await command(page, 'p2-echo csp')).toContain('csp\n');
  expect(violations).toEqual([]);
});
