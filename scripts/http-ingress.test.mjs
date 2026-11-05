import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createTcpServer, connect } from 'node:net';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { once } from 'node:events';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHttpServer as createBridge } from '../packages/http-transport/dist/server.js';
import { createHttpTypes } from '../packages/os/dist/internal/http.js';
import { Future, createStream } from '../packages/os/dist/async.js';
const ok = (val) => ({ tag: 'ok', val });
let assets, wasm, runtime, directory, certificate, key;
before(async () => {
  assets = createServer((req, res) =>
    res.end(readFileSync('packages/http-transport/dist/http.wasm')),
  );
  assets.listen(0, '127.0.0.1');
  await once(assets, 'listening');
  wasm = `http://127.0.0.1:${assets.address().port}/http.wasm`;
  runtime = pathToFileURL(join(process.cwd(), 'packages/http-transport/dist/wasm_exec.js')).href;
  directory = mkdtempSync(join(tmpdir(), 'walos-ingress-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(directory, 'key.pem'),
      '-out',
      join(directory, 'cert.pem'),
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
      '-days',
      '1',
    ],
    { stdio: 'ignore' },
  );
  certificate = readFileSync(join(directory, 'cert.pem'), 'utf8');
  key = readFileSync(join(directory, 'key.pem'), 'utf8');
});
after(() => {
  assets?.closeAllConnections();
  assets?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});
function tcpSocket(socket) {
  const input = createStream(65536);
  let complete;
  const ending = new Promise((resolve) => {
    complete = resolve;
  });
  socket.on('error', () => {});
  void (async () => {
    try {
      for await (const bytes of socket) await input.writable.write(bytes);
      input.writable.close();
      complete(ok(undefined));
    } catch {
      input.writable.close();
      complete({ tag: 'err', val: { tag: 'connection-reset' } });
    }
  })();
  return {
    send(source) {
      return new Future(
        (async () => {
          try {
            for (;;) {
              const bytes = await source.read(65536);
              if (bytes === undefined) break;
              await new Promise((resolve, reject) => {
                socket.write(Uint8Array.from(bytes), (error) =>
                  error ? reject(error) : resolve(),
                );
              });
            }
            socket.end();
            return ok(undefined);
          } catch {
            return { tag: 'err', val: { tag: 'connection-reset' } };
          }
        })(),
        async () => {
          socket.destroy();
          await source.cancel();
        },
      );
    },
    receive: () => [input.readable, new Future(ending, () => input.readable.cancel())],
    async [Symbol.asyncDispose]() {
      socket.destroy();
      await input.readable.cancel();
    },
  };
}
async function bridge(t, handle, options = {}) {
  const resources = new Set();
  const http = createHttpTypes({
    add(value) {
      resources.add(value);
      return value;
    },
  });
  const sockets = {
    async listenTcp() {
      const queue = createStream(1);
      const live = new Set();
      const server = createTcpServer((socket) => {
        live.add(socket);
        socket.on('close', () => live.delete(socket));
        void queue.writable.write([tcpSocket(socket)]).catch(() => socket.destroy());
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      return ok({
        address: { tag: 'ipv4', val: { address: [127, 0, 0, 1], port: server.address().port } },
        connections: queue.readable,
        async [Symbol.asyncDispose]() {
          await queue.readable.cancel();
          for (const socket of live) socket.destroy();
          await new Promise((resolve) => server.close(resolve));
        },
      });
    },
  };
  const exposed = await createBridge(
    {
      pid: 1,
      ppid: null,
      signal: new AbortController().signal,
      http,
      sockets,
      config: { wasm, runtime },
      handle: (req, signal) => handle(http, req, signal),
    },
    { address: { tag: 'ipv4', val: { address: [127, 0, 0, 1], port: 0 } }, ...options },
  );
  t.after(async () => {
    await exposed[Symbol.asyncDispose]();
    await Promise.allSettled([...resources].map((r) => r[Symbol.asyncDispose]()));
  });
  return exposed;
}
function send(exposed, tls = false) {
  return new Promise((resolve, reject) => {
    const req = (tls ? httpsRequest : httpRequest)(
      {
        host: '127.0.0.1',
        port: exposed.address.val.port,
        path: '/echo',
        method: 'POST',
        ...(tls ? { ca: certificate, servername: 'localhost' } : {}),
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString(),
            trailers: res.trailers,
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end('incoming-body');
  });
}
async function echo(http, req) {
  const [body, trailers] = http.request.consumeBody(req, new Future(ok(undefined)));
  const [reply] = http.response.new(http.fields.new(), body, trailers);
  reply.setStatusCode(202);
  return ok(reply);
}
test('Go/Wasm HTTP ingress streams requests into an HTTP service and responses back', async (t) => {
  const exposed = await bridge(t, echo);
  assert.deepEqual(await send(exposed), { status: 202, body: 'incoming-body', trailers: {} });
});
test('Go/Wasm HTTPS ingress terminates caller-supplied TLS with verified client trust', async (t) => {
  const exposed = await bridge(t, echo, { tls: { certificate, key } });
  assert.equal((await send(exposed, true)).body, 'incoming-body');
});
test('busy services yield 503 and failed services yield 502', async (t) => {
  const busy = await bridge(t, async () => {
    throw new Error('busy');
  });
  assert.equal((await send(busy)).status, 503);
  const failure = await bridge(t, async () => ({
    tag: 'err',
    val: { tag: 'internal-error', val: 'failed' },
  }));
  assert.equal((await send(failure)).status, 502);
});

test('ingress rejects ambiguous wire framing before invoking the service', async (t) => {
  let calls = 0;
  const exposed = await bridge(t, async () => {
    calls++;
    throw new Error('must not run');
  });
  const { connect } = await import('node:net');
  const socket = connect(exposed.address.val.port, '127.0.0.1');
  const chunks = [];
  socket.on('data', (chunk) => chunks.push(chunk));
  socket.on('error', () => {});
  await once(socket, 'connect');
  socket.write(
    'POST / HTTP/1.1\r\nHost: local\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n',
  );
  await once(socket, 'close');
  assert.match(Buffer.concat(chunks).toString(), /^HTTP\/1\.1 400 /);
  assert.equal(calls, 0);
});
test('disposing ingress cancels an active service exchange', async (t) => {
  let began;
  const started = new Promise((resolve) => {
    began = resolve;
  });
  const exposed = await bridge(t, async (_http, _req, signal) => {
    began();
    return new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
    );
  });
  const pending = send(exposed).catch((error) => error);
  await started;
  await exposed[Symbol.asyncDispose]();
  const result = await pending;
  assert.ok(result instanceof Error);
});

async function wire(t, exposed, message) {
  const socket = connect(exposed.address.val.port, '127.0.0.1');
  t.after(() => socket.destroy());
  const chunks = [];
  socket.on('data', (chunk) => chunks.push(chunk));
  socket.on('error', () => {});
  const ended = new Promise((resolve) =>
    socket.on('close', () => resolve(Buffer.concat(chunks).toString())),
  );
  await once(socket, 'connect');
  socket.write(message);
  return { socket, ended };
}

for (const kind of ['header-limit', 'header-timeout']) {
  test(`ingress enforces ${kind} before invoking the service`, { timeout: 5000 }, async (t) => {
    let calls = 0;
    const exposed = await bridge(
      t,
      async () => {
        calls++;
        throw new Error('must not run');
      },
      kind === 'header-limit' ? { maxHeaderBytes: 128 } : { headerTimeoutMs: 40 },
    );
    const { ended } = await wire(
      t,
      exposed,
      kind === 'header-limit'
        ? `GET / HTTP/1.1\r\nHost: local\r\nX-Large: ${'a'.repeat(1024)}\r\n\r\n`
        : 'GET / HTTP/1.1\r\nHost:',
    );
    await ended;
    assert.equal(calls, 0);
  });
}

test(
  'ingress connection limit queues acceptance until the active connection closes',
  { timeout: 5000 },
  async (t) => {
    let calls = 0;
    const exposed = await bridge(
      t,
      async (...args) => {
        calls++;
        return echo(...args);
      },
      { maxConnections: 1 },
    );
    const first = await wire(t, exposed, 'GET / HTTP/1.1\r\nHost:');
    const second = await wire(t, exposed, 'GET / HTTP/1.1\r\nHost: local\r\n\r\n');
    // A second complete request cannot enter the service while the first occupies
    // the one connection slot, even though its TCP handshake has completed.
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(calls, 0);
    first.socket.destroy();
    assert.match(await second.ended, /^HTTP\/1\.1 202 /);
    assert.equal(calls, 1);
  },
);

test(
  'a response failure after headers aborts the connection instead of sending 502',
  { timeout: 5000 },
  async (t) => {
    let reads = 0,
      cancelled = false;
    const exposed = await bridge(t, async (http, _request, signal) => {
      signal.addEventListener('abort', () => {
        cancelled = true;
      });
      const body = {
        async read() {
          if (reads++ === 0) return new TextEncoder().encode('partial');
          throw new Error('upstream body failed');
        },
        async cancel() {},
        async [Symbol.asyncDispose]() {},
      };
      const [reply] = http.response.new(http.fields.new(), body, new Future(ok(undefined)));
      return ok(reply);
    });
    const { ended } = await wire(t, exposed, 'GET / HTTP/1.1\r\nHost: local\r\n\r\n');
    const response = await ended;
    assert.match(response, /^HTTP\/1\.1 200 /);
    assert.match(response, /partial/);
    assert.doesNotMatch(response, /502 Bad Gateway/);
    assert.equal(cancelled, true);
  },
);
