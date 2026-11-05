import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { connect } from 'node:net';
import { once } from 'node:events';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHttpTypes } from '../packages/os/dist/internal/http.js';
import { createStream, Future } from '../packages/os/dist/async.js';
import { createSocketHttpBackend } from '../packages/http-transport/dist/index.js';
import { loadHttpRuntime } from '../packages/http-transport/dist/runtime.js';
const ok = (val) => ({ tag: 'ok', val });
let runtime, plain, secure, directory, ca;
const compiler = process.env.WALOS_HTTP_COMPILER === 'tinygo' ? 'tinygo' : 'go';
const handler = async (req, res) => {
  if (req.url === '/http.wasm') {
    res.end(
      readFileSync(
        compiler === 'tinygo'
          ? 'work/network-evaluation/http-tinygo.wasm'
          : 'packages/http-transport/dist/http.wasm',
      ),
    );
    return;
  }
  if (req.url === '/stall') {
    res.writeHead(200);
    res.write('start');
    return;
  }
  if (req.url === '/pending') return;
  const parts = [];
  for await (const part of req) parts.push(part);
  res.writeHead(201, { 'x-seen': req.headers['x-test'] ?? '', trailer: 'X-End' });
  res.write(
    req.url === '/echo'
      ? Buffer.concat(parts)
      : req.url === '/upload-trailers'
        ? JSON.stringify(req.trailers)
        : 'socket-http',
  );
  res.addTrailers({ 'X-End': 'finished' });
  res.end();
};
before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'walos-socket-http-'));
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
  ca = readFileSync(join(directory, 'cert.pem'), 'utf8');
  plain = createServer(handler);
  plain.listen(0, '127.0.0.1');
  await once(plain, 'listening');
  secure = createTlsServer({ key: readFileSync(join(directory, 'key.pem')), cert: ca }, handler);
  secure.listen(0, '127.0.0.1');
  await once(secure, 'listening');
  runtime = await loadHttpRuntime(
    `http://127.0.0.1:${plain.address().port}/http.wasm`,
    pathToFileURL(
      join(
        process.cwd(),
        compiler === 'tinygo'
          ? 'work/network-evaluation/wasm_exec-tinygo.js'
          : 'packages/http-transport/dist/wasm_exec.js',
      ),
    ).href,
  );
});
after(() => {
  plain?.closeAllConnections();
  plain?.close();
  secure?.closeAllConnections();
  secure?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});
function backend() {
  const sockets = new Set();
  return {
    sockets,
    ipNameLookup: { resolveAddresses: async () => ok([{ tag: 'ipv4', val: [127, 0, 0, 1] }]) },
    types: {
      tcpSocket: {
        create: () => {
          let socket;
          const input = createStream(65536);
          let complete;
          const ending = new Promise((resolve) => {
            complete = resolve;
          });
          const resource = {
            async connect(peer) {
              socket = connect(peer.val.port, '127.0.0.1');
              sockets.add(socket);
              socket.on('error', () => {});
              socket.on('close', () => {
                sockets.delete(socket);
              });
              try {
                await once(socket, 'connect');
              } catch {
                return { tag: 'err', val: { tag: 'connection-refused' } };
              }
              void (async () => {
                try {
                  for await (const chunk of socket) await input.writable.write(chunk);
                  input.writable.close();
                  complete(ok(undefined));
                } catch {
                  input.writable.close();
                  complete({ tag: 'err', val: { tag: 'connection-reset' } });
                }
              })();
              return ok(undefined);
            },
            send(source) {
              return new Future(
                (async () => {
                  try {
                    for (;;) {
                      const chunk = await source.read(65536);
                      if (chunk === undefined) break;
                      if (!socket.write(Uint8Array.from(chunk))) await once(socket, 'drain');
                    }
                    socket.end();
                    return ok(undefined);
                  } catch {
                    return { tag: 'err', val: { tag: 'connection-reset' } };
                  }
                })(),
                () => source.cancel(),
              );
            },
            receive: () => [input.readable, new Future(ending, () => input.readable.cancel())],
            async [Symbol.asyncDispose]() {
              socket?.destroy();
              await input.readable.cancel();
            },
          };
          return ok(resource);
        },
      },
    },
  };
}
async function setup(t, config = {}) {
  const resources = new Set();
  const http = createHttpTypes(
    {
      add(value) {
        resources.add(value);
        return value;
      },
    },
    true,
  );
  const sockets = backend();
  const transport = createSocketHttpBackend(
    { pid: 1, ppid: null, signal: new AbortController().signal, http, sockets },
    runtime,
    { firstByteTimeoutMs: 1000, ...config },
  );
  t.after(async () => {
    await transport[Symbol.asyncDispose]();
    await Promise.allSettled([...resources].map((r) => r[Symbol.asyncDispose]()));
  });
  return { http, sockets, transport };
}
function request(http, scheme, host, port, path = '/', body) {
  const headers = http.fields.new();
  headers.append('x-test', new TextEncoder().encode('from-sockets'));
  const [req, sent] = http.request.new(headers, body, new Future(ok(undefined)), undefined);
  req.setScheme({ tag: scheme });
  req.setAuthority(`${host}:${port}`);
  req.setPathWithQuery(path);
  if (body) req.setMethod({ tag: 'post' });
  return { req, sent };
}
async function read(http, reply) {
  assert.equal(reply.tag, 'ok', JSON.stringify(reply));
  const [stream, ending] = http.response.consumeBody(reply.val, new Future(ok(undefined)));
  const data = [];
  for (;;) {
    const chunk = await stream.read(65536);
    if (chunk === undefined) break;
    data.push(Buffer.from(chunk));
  }
  const trailers = await ending;
  assert.equal(trailers.tag, 'ok');
  const fields = trailers.val?.copyAll();
  await trailers.val?.[Symbol.asyncDispose]();
  return { body: Buffer.concat(data), trailers: fields };
}
test('Go/Wasm streams HTTP over the selected TCP backend and preserves trailers', async (t) => {
  const { http, transport } = await setup(t);
  const { req, sent } = request(http, 'HTTP', 'example.invalid', plain.address().port);
  const reply = await transport.send(req);
  assert.equal(reply.tag, 'ok', JSON.stringify(reply));
  assert.equal(reply.val.getStatusCode(), 201);
  const result = await read(http, reply);
  assert.equal(result.body.toString(), 'socket-http');
  assert.equal(
    new TextDecoder().decode(result.trailers.find(([key]) => key.toLowerCase() === 'x-end')[1]),
    'finished',
  );
  assert.equal((await sent).tag, 'ok');
});
test('HTTPS validates a supplied CA and rejects untrusted and mismatched certificates', async (t) => {
  const { http, transport } = await setup(t, { additionalCa: ca });
  const trusted = request(http, 'HTTPS', 'localhost', secure.address().port);
  assert.equal(
    (await read(http, await transport.send(trusted.req))).body.toString(),
    'socket-http',
  );
  const mismatch = request(http, 'HTTPS', 'other.invalid', secure.address().port);
  assert.equal((await transport.send(mismatch.req)).val.tag, 'TLS-certificate-error');
  const untrusted = await setup(t);
  const req = request(untrusted.http, 'HTTPS', 'localhost', secure.address().port);
  assert.equal((await untrusted.transport.send(req.req)).val.tag, 'TLS-certificate-error');
});
test('upload remains bounded while streaming a body larger than queue capacity', async (t) => {
  const { http, transport } = await setup(t);
  const body = createStream(64);
  const data = new Uint8Array(256 * 1024).fill(65);
  const upload = (async () => {
    await body.writable.write(data);
    body.writable.close();
  })();
  void upload.catch(() => {});
  const { req, sent } = request(
    http,
    'HTTP',
    'example.invalid',
    plain.address().port,
    '/echo',
    body.readable,
  );
  const result = await read(http, await transport.send(req));
  assert.deepEqual(result.body, Buffer.from(data));
  await upload;
  assert.equal((await sent).tag, 'ok');
});
test('cancelling a pending socket HTTP exchange settles the request', async (t) => {
  const { http, transport } = await setup(t);
  const { req, sent } = request(http, 'HTTP', 'example.invalid', plain.address().port, '/pending');
  const pending = transport.send(req);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await pending.cancel();
  assert.equal((await pending).tag, 'err');
  // Upload already completed before response cancellation.
  assert.equal((await sent).tag, 'ok');
});

test('connect timeout cancels a DNS lookup instead of falling back to OS networking', async (t) => {
  const { http } = await setup(t);
  const sockets = {
    types: {
      tcpSocket: {
        create() {
          throw new Error('must not dial');
        },
      },
    },
    ipNameLookup: {
      resolveAddresses() {
        return new Promise(() => {});
      },
    },
  };
  const transport = createSocketHttpBackend(
    { pid: 1, ppid: null, signal: new AbortController().signal, http, sockets },
    runtime,
    { connectTimeoutMs: 20 },
  );
  t.after(() => transport[Symbol.asyncDispose]());
  const { req } = request(http, 'HTTP', 'example.invalid', 80);
  const reply = await transport.send(req);
  assert.equal(reply.tag, 'err');
  assert.equal(reply.val.tag, 'connection-timeout');
});

test('the OS cancellation helper reaches a module transport', async (t) => {
  const { HttpTransportServices } = await import('../packages/os/dist/internal/http-transport.js');
  const { cancelAsync } = await import('../packages/os/dist/async.js');
  const transport = new HttpTransportServices();
  const { http, sockets } = await setup(t);
  await transport.init(
    {
      transport: 'sockets',
      module: pathToFileURL(join(process.cwd(), 'packages/http-transport/dist/index.js')).href,
    },
    { pid: 1, ppid: null },
    { http, sockets },
  );
  t.after(() => transport[Symbol.asyncDispose]());
  const { req } = request(http, 'HTTP', 'example.invalid', plain.address().port, '/pending');
  const pending = transport.send(req);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await cancelAsync(pending);
  assert.equal((await pending).tag, 'err');
});

test('socket request options apply first-byte and between-byte timeouts', async (t) => {
  const { http, transport } = await setup(t);
  const options = http.requestOptions.new();
  assert.equal(options.setFirstByteTimeout(20_000_000n).tag, 'ok');
  const [req] = http.request.new(http.fields.new(), undefined, new Future(ok(undefined)), options);
  req.setScheme({ tag: 'HTTP' });
  req.setAuthority(`example.invalid:${plain.address().port}`);
  req.setPathWithQuery('/pending');
  const reply = await transport.send(req);
  assert.equal(reply.tag, 'err');
  assert.equal(reply.val.tag, 'HTTP-response-timeout');
  const between = http.requestOptions.new();
  between.setBetweenBytesTimeout(20_000_000n);
  const [stall] = http.request.new(
    http.fields.new(),
    undefined,
    new Future(ok(undefined)),
    between,
  );
  stall.setScheme({ tag: 'HTTP' });
  stall.setAuthority(`example.invalid:${plain.address().port}`);
  stall.setPathWithQuery('/stall');
  const response = await transport.send(stall);
  assert.equal(response.tag, 'ok');
  const [body, ending] = http.response.consumeBody(response.val, new Future(ok(undefined)));
  assert.equal(new TextDecoder().decode(await body.read(64)), 'start');
  await body.read(64);
  const trailers = await ending;
  assert.equal(trailers.tag, 'err');
  assert.equal(trailers.val.tag, 'connection-read-timeout');
});
test('socket transport sends declared request trailers after streaming upload EOF', async (t) => {
  const { http, transport } = await setup(t);
  const headers = http.fields.new();
  headers.append('Trailer', new TextEncoder().encode('X-End'));
  const trailers = http.fields.new();
  trailers.append('X-End', new TextEncoder().encode('upload-complete'));
  const channel = createStream(64);
  const [req, sent] = http.request.new(
    headers,
    channel.readable,
    new Future(ok(trailers)),
    undefined,
  );
  req.setScheme({ tag: 'HTTP' });
  req.setMethod({ tag: 'post' });
  req.setAuthority(`example.invalid:${plain.address().port}`);
  req.setPathWithQuery('/upload-trailers');
  await channel.writable.write(new TextEncoder().encode('payload'));
  channel.writable.close();
  const response = await read(http, await transport.send(req));
  assert.deepEqual(JSON.parse(response.body.toString()), { 'x-end': 'upload-complete' });
  assert.equal((await sent).tag, 'ok');
});
