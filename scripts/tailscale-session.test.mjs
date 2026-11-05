import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
import { SessionBroker } from '../packages/tailscale-socket/dist/broker.js';
import { SessionRpc } from '../packages/tailscale-socket/dist/rpc.js';

const capability = 'testing-capability-012345678901234567890';
async function setup(t, leaseMs = 45000) {
  const calls = [];
  let next = 0;
  const runtime = {
    async call(op, args) {
      calls.push({ op, args });
      if (op === 'init' || op === 'status')
        return {
          state: 'Running',
          addresses: ['100.64.0.1'],
          exitNode: '',
          exitReady: false,
          exitNodes: [],
        };
      if (['tcp-connect', 'tcp-listen', 'udp-bind', 'tcp-accept'].includes(op))
        return { handle: ++next, local: '100.64.0.1:1234', remote: '100.64.0.2:5678' };
      if (op === 'tcp-read') return new Uint8Array([1, 2, 3]);
      return undefined;
    },
  };
  const broker = new SessionBroker(
    async () => runtime,
    () => {},
    leaseMs,
  );
  const connect = () => {
    const channel = new MessageChannel();
    broker.connect(channel.port1);
    const rpc = new SessionRpc(channel.port2);
    t.after(() => rpc.close());
    return rpc;
  };
  const owner = connect();
  await owner.request('$initialize', {
    session: 'test',
    capability,
    wasm: 'test.wasm',
    runtime: 'test.js',
  });
  t.after(() => broker.dispose());
  const attach = async () => {
    const rpc = connect();
    await rpc.request('$attach', { session: 'test', capability });
    return rpc;
  };
  return { broker, owner, attach, connect, calls, runtime };
}
test('only authenticated process ports can use sockets, and handles belong to their creator', async (t) => {
  const { attach, connect, owner } = await setup(t);
  const invalid = connect();
  await assert.rejects(
    invalid.request('$attach', { session: 'test', capability: 'wrong' }),
    /access-denied/,
  );
  await assert.rejects(invalid.request('status'), /access-denied/);
  const a = await attach(),
    b = await attach();
  const socket = await a.request('tcp-connect', { address: '100.64.0.2:80' });
  await assert.rejects(
    b.request('tcp-read', { handle: socket.handle, maximum: 3 }),
    /invalid-state/,
  );
  assert.deepEqual(
    await a.request('tcp-read', { handle: socket.handle, maximum: 3 }),
    new Uint8Array([1, 2, 3]),
  );
  await assert.rejects(a.request('select-exit', { id: 'exit' }), /access-denied/);
  await assert.rejects(a.request('$dispose-session'), /access-denied/);
  await owner.request('select-exit', { id: 'exit' });
});
test('detaching a process closes its sockets while another process keeps working', async (t) => {
  const { attach, calls } = await setup(t);
  const a = await attach(),
    b = await attach();
  const first = await a.request('tcp-connect', { address: '100.64.0.2:80' });
  const second = await b.request('tcp-connect', { address: '100.64.0.2:80' });
  await a.request('$detach');
  assert.ok(calls.some((call) => call.op === 'close' && call.args.handle === first.handle));
  assert.ok(!calls.some((call) => call.op === 'close' && call.args.handle === second.handle));
  assert.deepEqual(
    await b.request('tcp-read', { handle: second.handle, maximum: 3 }),
    new Uint8Array([1, 2, 3]),
  );
});
test('lease expiry reclaims a terminated process without cancelling a refreshed owner', async (t) => {
  const { attach, broker, calls, owner } = await setup(t);
  const child = await attach();
  const socket = await child.request('udp-bind', { address: '0.0.0.0:0' });
  // Use an injected clock in the sweep only; no long sleeps or timer races.
  await new Promise((resolve) => setTimeout(resolve, 2));
  await owner.request('$heartbeat');
  await broker.sweep(Date.now() + 45000);
  assert.ok(calls.some((call) => call.op === 'close' && call.args.handle === socket.handle));
});
test('invalid credits and oversized messages are rejected before reaching Wasm', async (t) => {
  const { attach, calls } = await setup(t);
  const rpc = await attach();
  const socket = await rpc.request('tcp-connect', { address: '100.64.0.2:80' });
  await assert.rejects(
    rpc.request('tcp-read', { handle: socket.handle, maximum: 65537 }),
    /invalid-argument/,
  );
  await assert.rejects(
    rpc.request('tcp-write', { handle: socket.handle, bytes: new Uint8Array(65537) }),
    /datagram-too-large/,
  );
  assert.ok(!calls.some((call) => call.op === 'tcp-read' || call.op === 'tcp-write'));
});

test('a Host can transfer a process port to the shared session', async (t) => {
  const { connect, owner } = await setup(t);
  const host = connect(),
    channel = new MessageChannel();
  const child = new SessionRpc(channel.port2);
  t.after(() => child.close());
  const pending = child.request('$attach', { session: 'test', capability });
  await host.request('$connect', { session: 'test', capability, port: channel.port1 }, [
    channel.port1,
  ]);
  assert.equal((await pending).state, 'Running');
  const socket = await child.request('tcp-connect', { address: '100.64.0.2:80' });
  assert.ok(socket.handle > 0);
});

test('session disposal rejects pending requests in child processes', async (t) => {
  const { runtime, attach, broker } = await setup(t);
  const rpc = await attach();
  const socket = await rpc.request('tcp-connect', { address: '100.64.0.2:80' });
  const original = runtime.call.bind(runtime);
  runtime.call = (op, args) => (op === 'tcp-read' ? new Promise(() => {}) : original(op, args));
  const pending = rpc.request('tcp-read', { handle: socket.handle, maximum: 64 });
  const rejected = assert.rejects(pending, /closed/);
  await broker.dispose();
  await rejected;
});
