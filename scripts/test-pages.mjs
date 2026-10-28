import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium, expect } from '@playwright/test';

// Match Pages project hosting: no SPA fallback and no COOP/COEP headers.
const prefix = '/walos/';
const root = resolve('dist');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
};
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(root, path.slice(prefix.length) || 'index.html');
  if (!path.startsWith(prefix) || !file.startsWith(root + sep)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});

let browser;
try {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  assert.equal(await page.evaluate(() => crossOriginIsolated), false);
  await expect(page.getByRole('log')).toContainText('walos · WASI Preview 1', { timeout: 30000 });
  await expect(page.locator('#processes')).toContainText('Host');
  const input = page.getByLabel('Terminal input'),
    log = page.getByRole('log');
  await expect(input).toBeEnabled();
  async function command(line) {
    const offset = (await log.textContent()).length;
    await input.fill(line);
    await input.press('Enter');
    await expect
      .poll(async () => (await log.textContent()).slice(offset).endsWith('\n/ $ '))
      .toBe(true);
    return (await log.textContent()).slice(offset);
  }
  await command('echo pages-p3-file > /home/pages-p3-file');
  assert.match(await command('p3-cat /home/pages-p3-file'), /\npages-p3-file\n/);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const writer = await (
      await root.getFileHandle('pages-user-file', { create: true })
    ).createWritable();
    await writer.write('preserved');
    await writer.close();
  });
  await page.reload();
  await expect(page.getByRole('log')).toContainText('walos · WASI Preview 1');
  assert.equal(
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      return (await (await root.getFileHandle('pages-user-file')).getFile()).text();
    }),
    'preserved',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Pages smoke test passed: subpath assets, explicit Shell installation, P3 file operands, reload persistence.',
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
