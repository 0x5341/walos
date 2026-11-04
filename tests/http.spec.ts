import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { createSecureServer, type Http2SecureServer, type ServerHttp2Session } from 'node:http2';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
let secure: Http2SecureServer;
let secureAuthority: string;
let certificateDirectory: string;
let uploaded = 0;
let pendingRequests = 0;
const sessions = new Set<ServerHttp2Session>();
test.use({ ignoreHTTPSErrors: true });
let server: Server;
let authority: string;
test.beforeAll(async () => {
  certificateDirectory = mkdtempSync(join(tmpdir(), 'walos-http-'));
  const key = join(certificateDirectory, 'key.pem'),
    cert = join(certificateDirectory, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-subj',
      '/CN=localhost',
      '-days',
      '1',
    ],
    { stdio: 'ignore' },
  );
  secure = createSecureServer({ key: readFileSync(key), cert: readFileSync(cert) });
  secure.on('session', (session) => {
    sessions.add(session);
    session.on('close', () => sessions.delete(session));
  });
  secure.on('stream', (stream, headers) => {
    stream.on('error', () => {});
    if (headers[':method'] === 'OPTIONS') {
      stream.respond({
        ':status': 204,
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': '*',
      });
      stream.end();
      return;
    }
    let size = 0;
    stream.on('data', (chunk) => {
      size += chunk.length;
    });
    stream.on('end', () => {
      uploaded = size;
      stream.respond({ ':status': 200, 'access-control-allow-origin': '*' });
      stream.end('p3-http');
    });
  });
  await new Promise<void>((resolve) => secure.listen(0, '127.0.0.1', resolve));
  secureAuthority = `127.0.0.1:${(secure.address() as { port: number }).port}`;
  server = createServer((request, response) => {
    if (request.url === '/pending') {
      pendingRequests++;
      response.on('close', () => {
        pendingRequests--;
      });
      return;
    }
    if (request.url === '/nocors') {
      response.end('no');
      return;
    }
    if (request.url === '/stall') {
      response.writeHead(200, { 'access-control-allow-origin': '*' });
      response.write('A');
      return;
    }
    response.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' });
    response.write('p3-');
    setTimeout(() => response.end('http'), 10);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  authority = `127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(() => {
  server.closeAllConnections();
  server.close();
  for (const session of sessions) session.destroy();
  secure.close();
  rmSync(certificateDirectory, { recursive: true, force: true });
});
test('native P3 sends HTTP and consumes body/trailer futures', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async (authority) => {
    const { Walos, HostProcessContext, install, run } =
      await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('http-tests', { create: true }),
    });
    try {
      const host = new HostProcessContext(os.getHostProcess());
      return await run(host, await install(host, 'p3-probe'), ['p3-probe', 'http', authority]);
    } finally {
      await os.dispose();
    }
  }, authority);
  expect(result).toMatchObject({ exit: { kind: 'exited', code: 0 }, stdout: 'p3-http-ok\n' });
});

for (const scenario of ['cors', 'timeout', 'cancel', 'dispose'] as const) {
  test(`Host HTTP ${scenario} settles pending operations`, async ({ page }) => {
    await page.goto('/tests/fixtures/library.html');
    const result = await page.evaluate(
      async ({ authority, scenario }) => {
        const { Walos, Future } = await import('/packages/os/dist/index.js');
        const { cancelAsync } = await import('/packages/os/dist/async.js');
        const os = await Walos.create({
          storage: await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle('http-tests', { create: true }),
        });
        const http = os.getHostProcess().wasi.http;
        const options = http.types.requestOptions.new();
        options.setBetweenBytesTimeout(20_000_000n);
        const [request] = http.types.request.new(
          http.types.fields.new(),
          undefined,
          new Future({ tag: 'ok', val: undefined }),
          options,
        );
        request.setScheme({ tag: 'HTTP' });
        request.setAuthority(authority);
        request.setPathWithQuery(
          scenario === 'cors' ? '/nocors' : scenario === 'timeout' ? '/stall' : '/pending',
        );
        try {
          const sending = http.client.send(request);
          if (scenario === 'cancel') await cancelAsync(sending);
          if (scenario === 'dispose') await os.dispose();
          const reply = await sending;
          if (reply.tag === 'err') return reply.val.tag;
          const [body, ending] = http.types.response.consumeBody(
            reply.val,
            new Future({ tag: 'ok', val: undefined }),
          );
          const first = await body.read(1);
          await body.read(1);
          const result = await ending;
          return {
            first: Array.from(first ?? []),
            error: result.tag === 'err' ? result.val.tag : 'ok',
          };
        } finally {
          await os.dispose();
        }
      },
      { authority, scenario },
    );
    expect(result).toEqual(
      scenario === 'timeout' ? { first: [65], error: 'connection-read-timeout' } : 'internal-error',
    );
  });
}

test('native P3 streams a request body over HTTP/2', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async (authority) => {
    const { Walos, HostProcessContext, install, run } =
      await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('http-tests', { create: true }),
    });
    try {
      const host = new HostProcessContext(os.getHostProcess());
      return await run(host, await install(host, 'p3-probe'), ['p3-probe', 'http-post', authority]);
    } finally {
      await os.dispose();
    }
  }, secureAuthority);
  expect(result).toMatchObject({ exit: { kind: 'exited', code: 0 }, stdout: 'p3-http-ok\n' });
  expect(uploaded).toBe(131072);
});

test('stopping a native P3 process releases its pending HTTP connection', async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
  await page.evaluate(async (authority) => {
    const { Walos, HostProcessContext, install } = await import('/tests/fixtures/host-harness.ts');
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('http-tests', { create: true }),
    });
    const host = new HostProcessContext(os.getHostProcess());
    const child = await host.process.spawn(
      await install(host, 'p3-probe'),
      ['p3-probe', 'http-pending', authority],
      [],
    );
    (globalThis as any).httpPending = { os, child };
  }, authority);
  await expect.poll(() => pendingRequests).toBe(1);
  const exit = await page.evaluate(async () => {
    const { os, child } = (globalThis as any).httpPending;
    try {
      await child.requestStop();
      const result = await child.wait();
      await child[Symbol.asyncDispose]();
      return result;
    } finally {
      await os.dispose();
    }
  });
  expect(exit.kind).toBe('terminated');
  await expect.poll(() => pendingRequests).toBe(0);
});
