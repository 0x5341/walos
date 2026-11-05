import { test, expect } from '@playwright/test';

test('shared session isolates credentials and serves TCP, UDP and DNS to process backends', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { createTailscaleSession } = await import('/packages/tailscale-socket/dist/index.js');
    const { Walos, Future, createStream } = await import('/packages/os/dist/index.js');
    const events: any[] = [];
    const session = await createTailscaleSession({
      worker: new URL('/tests/fixtures/tailscale-session.worker.ts', location.href).href,
      authKey: 'test-secret',
      onEvent: (event) => events.push(event),
    });
    await session.login();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const before = await session.status();
    const selected = await session.selectExitNode('exit-1');
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('tailscale-test', { create: true }),
      sockets: session.socketOptions(
        new URL('/packages/tailscale-socket/dist/index.js', location.href).href,
      ),
    });
    const sockets = os.getHostProcess().wasi.sockets;
    const created = sockets.types.tcpSocket.create('ipv4');
    if (created.tag === 'err') throw created.val;
    const tcp = created.val;
    const connected = await tcp.connect({
      tag: 'ipv4',
      val: { address: [100, 64, 0, 20], port: 80 },
    });
    const channel = createStream<number>(4);
    const sending = tcp.send(channel.readable);
    const [incoming, received] = tcp.receive();
    const upload = channel.writable.write(new Uint8Array([1, 2, 3, 4, 5]));
    const got: number[] = [];
    while (got.length < 5) {
      const bytes = await incoming.read(4);
      if (bytes) got.push(...bytes);
    }
    await upload;
    channel.writable.close();
    await sending;
    await incoming.read(4);
    const receiveDone = await received;
    const udpResult = sockets.types.udpSocket.create('ipv4');
    if (udpResult.tag === 'err') throw udpResult.val;
    const udp = udpResult.val;
    const bound = udp.bind({ tag: 'ipv4', val: { address: [0, 0, 0, 0], port: 0 } });
    const peer = { tag: 'ipv4' as const, val: { address: [100, 64, 0, 20] as const, port: 53 } };
    udp.connect(peer);
    const sent = await udp.send(new Uint8Array(), undefined);
    const datagram = await udp.receive();
    const lookup = await sockets.ipNameLookup.resolveAddresses('peer.example');
    await os.dispose();
    await session[Symbol.asyncDispose]();
    return {
      events,
      before,
      selected,
      config: session.config,
      connected,
      got,
      receiveDone,
      bound,
      sent,
      empty: datagram.tag === 'ok' && datagram.val[0].length === 0,
      lookup,
    };
  });
  expect(result.events.some((e) => e.type === 'auth-url')).toBe(true);
  expect(JSON.stringify(result.config)).not.toContain('test-secret');
  expect(result.before.exitReady).toBe(false);
  expect(result.selected.exitReady).toBe(true);
  expect(result.connected.tag).toBe('ok');
  expect(result.got).toEqual([1, 2, 3, 4, 5]);
  expect(result.receiveDone.tag).toBe('ok');
  expect(result.bound.tag).toBe('ok');
  expect(result.sent.tag).toBe('ok');
  expect(result.empty).toBe(true);
  expect(result.lookup.tag).toBe('ok');
});

test('standard Go/Wasm Tailscale entry point initializes in a real SharedWorker', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/library.html');
  const result = await page.evaluate(async () => {
    const { createTailscaleSession } = await import('/packages/tailscale-socket/dist/index.js');
    const session = await createTailscaleSession({
      controlURL: 'http://127.0.0.1:1',
      hostname: 'walos-browser-test',
    });
    try {
      return { status: await session.status(), hasAuthKey: 'authKey' in session.config };
    } finally {
      await session[Symbol.asyncDispose]();
    }
  });
  expect(result.status.exitReady).toBe(false);
  expect(result.hasAuthKey).toBe(false);
});
