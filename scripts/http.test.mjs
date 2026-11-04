import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpTypes } from '../packages/os/dist/internal/http.js';
import { createHttpClient } from '../packages/os/dist/internal/http-client.js';
import { Future, createStream, cancelAsync } from '../packages/os/dist/async.js';
import { createServer } from 'node:http';

const ok = (val) => ({ tag: 'ok', val });
function setup(t) {
  const resources = new Set();
  const scope = {
    add(value) {
      resources.add(value);
      return value;
    },
  };
  t.after(async () => {
    await Promise.allSettled([...resources].map((r) => r[Symbol.asyncDispose]()));
  });
  return { types: createHttpTypes(scope), client: createHttpClient(scope) };
}
test('fields preserve duplicates, casing, bytes, order and independent copies', async (t) => {
  const { types } = setup(t);
  const bytes = Uint8Array.of(255, 65);
  const fields = types.fields.fromList([
    ['X-Test', bytes],
    ['x-test', Uint8Array.of(66)],
  ]).val;
  bytes[0] = 0;
  assert.deepEqual(fields.get('X-TEST'), [Uint8Array.of(255, 65), Uint8Array.of(66)]);
  assert.deepEqual(
    fields.copyAll().map(([name]) => name),
    ['X-Test', 'x-test'],
  );
  const clone = fields.clone();
  assert.equal(fields.append('bad name', bytes).val.tag, 'invalid-syntax');
  assert.equal(fields.set('X-Test', [Uint8Array.of(13)]).tag, 'err');
  assert.equal(fields.getAndDelete('x-test').val.length, 2);
  assert.equal(fields.has('x-test'), false);
  assert.equal(clone.has('x-test'), true);
});
test('request owns fields/options and enforces immutable child options', async (t) => {
  const { types } = setup(t);
  const headers = types.fields.new(),
    options = types.requestOptions.new();
  assert.equal(options.setConnectTimeout(1n).val.tag, 'not-supported');
  assert.equal(options.setFirstByteTimeout(1n).val.tag, 'not-supported');
  assert.equal(options.setBetweenBytesTimeout(10n).tag, 'ok');
  const [request] = types.request.new(headers, undefined, new Future(ok(undefined)), options);
  assert.throws(() => headers.has('a'), /moved/);
  assert.throws(() => options.clone(), /moved/);
  const child = request.getOptions(),
    view = request.getHeaders();
  assert.equal(child.setBetweenBytesTimeout(undefined).val.tag, 'immutable');
  assert.equal(view.append('a', new Uint8Array()).val.tag, 'immutable');
  await assert.rejects(request[Symbol.asyncDispose](), /Drop/);
  await child[Symbol.asyncDispose]();
  await request[Symbol.asyncDispose]();
});
test('local body trailers and completion wait for EOF and handling', async (t) => {
  const { types } = setup(t),
    channel = createStream(8);
  const trailers = types.fields.new();
  trailers.append('X-End', Uint8Array.of(65));
  const [response, done] = types.response.new(
    types.fields.new(),
    channel.readable,
    new Future(ok(trailers)),
  );
  const [body, ending] = types.response.consumeBody(response, new Future(ok(undefined)));
  await channel.writable.write(Uint8Array.of(1, 2, 3));
  channel.writable.close();
  assert.deepEqual(await body.read(2), Uint8Array.of(1, 2));
  assert.equal(ending.poll().tag, 'pending');
  assert.deepEqual(await body.read(2), Uint8Array.of(3));
  assert.equal(await body.read(2), undefined);
  assert.equal((await ending).val.get('x-end')[0][0], 65);
  assert.equal((await done).tag, 'ok');
});
test('body cancellation interrupts blocked read and resolves failure futures', async (t) => {
  const { types } = setup(t),
    channel = createStream(8);
  const [response, done] = types.response.new(
    types.fields.new(),
    channel.readable,
    new Future(new Promise(() => {})),
  );
  const [body, ending] = types.response.consumeBody(response, new Future(new Promise(() => {})));
  const read = body.read(8);
  await body.cancel();
  assert.equal(await read, undefined);
  assert.equal((await done).tag, 'err');
  assert.equal((await ending).tag, 'err');
});
test('Fetch returns HTTP errors as responses and streams uploaded/downloaded bytes', async (t) => {
  const { types, client } = setup(t);
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.writeHead(418, { 'x-test': 'yes' });
    res.end(Buffer.concat(chunks));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const channel = createStream(8);
  const [request, sent] = types.request.new(
    types.fields.new(),
    channel.readable,
    new Future(ok(undefined)),
    undefined,
  );
  request.setMethod({ tag: 'post' });
  request.setScheme({ tag: 'HTTP' });
  request.setAuthority(`127.0.0.1:${server.address().port}`);
  const sending = client.send(request);
  await channel.writable.write(Uint8Array.of(1, 2, 3));
  channel.writable.close();
  const reply = await sending;
  assert.equal(reply.tag, 'ok');
  assert.equal(reply.val.getStatusCode(), 418);
  const [body, ending] = types.response.consumeBody(reply.val, new Future(ok(undefined)));
  assert.deepEqual(await body.read(10), Uint8Array.of(1, 2, 3));
  assert.equal(await body.read(10), undefined);
  assert.equal((await ending).tag, 'ok');
  assert.equal((await sent).tag, 'ok');
});
test('invalid destinations settle send and producer completion with typed errors', async (t) => {
  const { types, client } = setup(t);
  const [request, done] = types.request.new(
    types.fields.new(),
    undefined,
    new Future(ok(undefined)),
    undefined,
  );
  assert.equal((await client.send(request)).val.tag, 'HTTP-request-URI-invalid');
  assert.equal((await done).val.tag, 'HTTP-request-URI-invalid');
});

test('consuming a request preserves its acquired header/options views', async (t) => {
  const { types } = setup(t);
  const [request, done] = types.request.new(
    types.fields.new(),
    undefined,
    new Future(ok(undefined)),
    types.requestOptions.new(),
  );
  const headers = request.getHeaders(),
    options = request.getOptions();
  const [body, trailers] = types.request.consumeBody(request, new Future(ok(undefined)));
  await request[Symbol.asyncDispose]();
  assert.equal(headers.has('x'), false);
  assert.equal(options.getBetweenBytesTimeout(), undefined);
  assert.equal(await body.read(1), undefined);
  assert.equal((await trailers).tag, 'ok');
  await trailers.cancel();
  await body.cancel();
  assert.equal((await done).tag, 'ok');
  await options[Symbol.asyncDispose]();
});

test('transport rejects nonempty trailers and forbidden headers with producer errors', async (t) => {
  const { types, client } = setup(t);
  for (const scenario of ['trailers', 'headers']) {
    const headers = types.fields.new(),
      trailers = types.fields.new();
    if (scenario === 'headers') headers.append('Host', Uint8Array.of(65));
    else trailers.append('X-End', Uint8Array.of(65));
    const [request, done] = types.request.new(
      headers,
      undefined,
      new Future(ok(trailers)),
      undefined,
    );
    request.setAuthority('example.invalid');
    const expected = scenario === 'headers' ? 'HTTP-request-denied' : 'configuration-error';
    assert.equal((await client.send(request)).val.tag, expected);
    assert.equal((await done).val.tag, expected);
  }
});

test('consumer error propagates to producer and cancels a blocked input', async (t) => {
  const { types } = setup(t),
    channel = createStream(4);
  const [response, done] = types.response.new(
    types.fields.new(),
    channel.readable,
    new Future(ok(undefined)),
  );
  const error = { tag: 'HTTP-protocol-error' };
  const [body, trailers] = types.response.consumeBody(
    response,
    new Future({ tag: 'err', val: error }),
  );
  assert.equal(await body.read(1), undefined);
  assert.deepEqual(await done, { tag: 'err', val: error });
  assert.deepEqual(await trailers, { tag: 'err', val: error });
  await assert.rejects(channel.writable.write(Uint8Array.of(1)), /closed/);
});

test('request setters reject malformed URI components without changing existing values', (t) => {
  const { types } = setup(t);
  const [request] = types.request.new(
    types.fields.new(),
    undefined,
    new Future(ok(undefined)),
    undefined,
  );
  assert.equal(request.setAuthority('[::1]:443').tag, 'ok');
  for (const authority of ['host/path', 'host\\path', 'host:abc', 'host%zz', 'host\u0000'])
    assert.equal(request.setAuthority(authority).tag, 'err');
  assert.equal(request.getAuthority(), '[::1]:443');
  assert.equal(request.setPathWithQuery('/path?key=value%20here').tag, 'ok');
  for (const path of ['/bad\u0000', '/bad#fragment', '/bad%zz', '/bad\\path'])
    assert.equal(request.setPathWithQuery(path).tag, 'err');
  assert.equal(request.getPathWithQuery(), '/path?key=value%20here');
});
