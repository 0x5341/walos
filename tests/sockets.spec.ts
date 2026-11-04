import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/library.html');
});
test('per-process socket backend: TCP streams, accept, UDP and resolution', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos, createStream } = await import('/packages/os/dist/index.js');
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('socket-tests', { create: true }),
      sockets: { module: new URL('/tests/fixtures/socket-backend.ts', location.href).href },
    });
    const take = (r: any): any => {
      if (r.tag !== 'ok') throw new Error(JSON.stringify(r));
      return r.val;
    };
    try {
      const { types, ipNameLookup } = os.getHostProcess().wasi.sockets;
      const address = {
        tag: 'ipv4' as const,
        val: { address: [127, 0, 0, 1] as const, port: 1234 },
      };
      const tcp = take(types.tcpSocket.create('ipv4'));
      take(await tcp.connect(address));
      const input = createStream<number>(2);
      const sent = tcp.send(input.readable);
      const [received, done] = tcp.receive();
      const reading = (async () => {
        const out: number[] = [];
        for (;;) {
          const v = await received.read(2);
          if (!v) return out;
          out.push(...v);
        }
      })();
      await input.writable.write(new Uint8Array([1, 2, 3, 4, 5, 6]));
      input.writable.close();
      const bytes = await reading;
      take(await sent);
      take(await done);
      const twice = await tcp.send(createStream<number>().readable);
      const server = take(types.tcpSocket.create('ipv4'));
      take(server.bind(address));
      const accepts = take(server.listen());
      const accepted = (await accepts.read(1))[0];
      const peer = take(accepted.getRemoteAddress());
      const udp = take(types.udpSocket.create('ipv4'));
      take(udp.bind(address));
      take(udp.connect(address));
      take(await udp.send(new Uint8Array(), undefined));
      const packet = take(await udp.receive());
      const large = await udp.send(new Uint8Array(65), undefined);
      take(udp.disconnect());
      const dns = await ipNameLookup.resolveAddresses('example.test');
      const literal = await ipNameLookup.resolveAddresses('::1');
      const missing = await ipNameLookup.resolveAddresses('empty.test');
      take(tcp.setKeepAliveCount(3));
      const count = take(tcp.getKeepAliveCount());
      const invalid = tcp.setHopLimit(0);
      return {
        bytes,
        twice,
        peer,
        packet: [packet[0].length, packet[1]],
        large,
        dns,
        literal,
        missing,
        count,
        invalid,
      };
    } finally {
      await os.dispose();
    }
  });
  expect(result.bytes).toEqual([1, 2, 3, 4, 5, 6]);
  expect(result.twice).toMatchObject({ tag: 'err', val: { tag: 'invalid-state' } });
  expect(result.peer.val.port).toBe(1234);
  expect(result.packet[0]).toBe(0);
  expect(result.large).toMatchObject({ tag: 'err', val: { tag: 'datagram-too-large' } });
  expect(result.dns).toMatchObject({ tag: 'ok', val: [{ tag: 'ipv4' }, { tag: 'ipv6' }] });
  expect(result.literal).toMatchObject({ tag: 'ok', val: [{ tag: 'ipv6' }] });
  expect(result.missing).toMatchObject({ tag: 'err', val: { tag: 'name-unresolvable' } });
  expect(result.count).toBe(3);
  expect(result.invalid).toMatchObject({ tag: 'err', val: { tag: 'invalid-argument' } });
});
test('default denies networking; literal parsing stays local', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('socket-tests', { create: true }),
    });
    try {
      const s = os.getHostProcess().wasi.sockets;
      return [
        s.types.tcpSocket.create('ipv4'),
        s.types.udpSocket.create('ipv6'),
        await s.ipNameLookup.resolveAddresses('example.test'),
        await s.ipNameLookup.resolveAddresses('127.0.0.1'),
      ];
    } finally {
      await os.dispose();
    }
  });
  for (const value of result.slice(0, 3))
    expect(value).toEqual({ tag: 'err', val: { tag: 'access-denied' } });
  expect(result[3]).toEqual({ tag: 'ok', val: [{ tag: 'ipv4', val: [127, 0, 0, 1] }] });
});
test('invalid backend and uncloneable config reject creation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const errors: string[] = [];
    for (const config of [{ fail: true }, { callback: () => {} }]) {
      try {
        const os = await Walos.create({
          storage: await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle('socket-tests', { create: true }),
          sockets: {
            module: new URL('/tests/fixtures/socket-backend.ts', location.href).href,
            config,
          },
        });
        await os.dispose();
      } catch (e) {
        errors.push(String(e));
      }
    }
    return errors;
  });
  expect(result).toHaveLength(2);
  expect(result[0]).toContain('backend initialization failed');
});
for (const enabled of [false, true])
  test(`native P3 sockets with backend ${enabled}`, async ({ page }) => {
    const result = await page.evaluate(async (enabled) => {
      const { Walos, HostProcessContext, install, run } =
        await import('/tests/fixtures/host-harness.ts');
      const os = await Walos.create({
        storage: await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle('socket-tests', { create: true }),
        ...(enabled
          ? {
              sockets: { module: new URL('/tests/fixtures/socket-backend.ts', location.href).href },
            }
          : {}),
      });
      try {
        const host = new HostProcessContext(os.getHostProcess());
        return await run(host, await install(host, 'p3-probe'), [
          'p3-probe',
          enabled ? 'sockets' : 'socket',
        ]);
      } finally {
        await os.dispose();
      }
    }, enabled);
    expect(result).toMatchObject({
      exit: { kind: 'exited', code: 0 },
      stdout: enabled ? 'p3-sockets-ok\n' : 'p3-sockets-denied\n',
      stderr: '',
    });
  });

test('backend state, IPv6, failures, cancellation and process cleanup', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos, createStream } = await import('/packages/os/dist/index.js');
    const module = new URL('/tests/fixtures/socket-backend.ts', location.href).href;
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('socket-tests', { create: true }),
      sockets: { module },
    });
    const take = (r: any): any => {
      if (r.tag !== 'ok') throw new Error(JSON.stringify(r));
      return r.val;
    };
    const ip4 = (port: number) => ({
      tag: 'ipv4' as const,
      val: { port, address: [127, 0, 0, 1] as const },
    });
    const s = os.getHostProcess().wasi.sockets;
    const failed = take(s.types.tcpSocket.create('ipv4'));
    const refused = await failed.connect(ip4(1));
    const retried = await failed.connect(ip4(1234));
    const denied = take(s.types.udpSocket.create('ipv4')).bind(ip4(13));
    const reset = take(s.types.tcpSocket.create('ipv4'));
    take(await reset.connect(ip4(2)));
    const [read, status] = reset.receive();
    await read.read(1);
    const broken = await status;
    const ipv6 = take(s.types.udpSocket.create('ipv6'));
    const addr6 = {
      tag: 'ipv6' as const,
      val: { address: [0, 0, 0, 0, 0, 0, 0, 1] as const, port: 1234, scopeId: 0, flowInfo: 0 },
    };
    take(ipv6.connect(addr6));
    take(await ipv6.send(new Uint8Array([9]), undefined));
    const packet6 = take(await ipv6.receive());
    const mismatch = take(s.types.udpSocket.create('ipv6')).bind(ip4(1234));
    const canceled = take(s.types.tcpSocket.create('ipv4'));
    take(await canceled.connect(ip4(1234)));
    const data = createStream<number>(1);
    const sent = canceled.send(data.readable);
    await data.writable.write(new Uint8Array([1, 2, 3, 4, 5]));
    let blocked = true;
    const write = data.writable.write(new Uint8Array([6, 7, 8, 9, 10])).then(
      () => {
        blocked = false;
      },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 20));
    const pressure = blocked;
    await sent.cancel();
    await write;
    const canceledResult = await sent;
    const dns = await s.ipNameLookup.resolveAddresses('例え.テスト');
    const invalid = await s.ipNameLookup.resolveAddresses('bad/name');
    const dnsDenied = await s.ipNameLookup.resolveAddresses('denied.test');
    const pendingUdp = take(s.types.udpSocket.create('ipv4'));
    take(pendingUdp.connect(ip4(1234)));
    const pending = pendingUdp.receive();
    await os.dispose();
    const unblocked = await pending;
    await os.dispose();
    return {
      refused,
      retried,
      denied,
      broken,
      packet6: [Array.from(packet6[0]), packet6[1]],
      mismatch,
      pressure,
      canceledResult,
      dns,
      invalid,
      dnsDenied,
      unblocked,
    };
  });
  expect(result.refused).toMatchObject({ tag: 'err', val: { tag: 'connection-refused' } });
  expect(result.retried).toMatchObject({ tag: 'err', val: { tag: 'invalid-state' } });
  expect(result.denied).toMatchObject({ tag: 'err', val: { tag: 'access-denied' } });
  expect(result.broken).toMatchObject({ tag: 'err', val: { tag: 'connection-reset' } });
  expect(result.packet6).toMatchObject([[9], { tag: 'ipv6' }]);
  expect(result.mismatch).toMatchObject({ tag: 'err', val: { tag: 'invalid-argument' } });
  expect(result.pressure).toBe(true);
  expect(result.canceledResult).toMatchObject({ tag: 'err', val: { tag: 'connection-aborted' } });
  expect(result.dns).toEqual({ tag: 'ok', val: [{ tag: 'ipv4', val: [1, 2, 3, 4] }] });
  expect(result.invalid).toMatchObject({ tag: 'err', val: { tag: 'invalid-argument' } });
  expect(result.dnsDenied).toMatchObject({ tag: 'err', val: { tag: 'access-denied' } });
  expect(result.unblocked).toMatchObject({ tag: 'err', val: { tag: 'connection-aborted' } });
});

test('backend config is snapshotted and factory/disposal run separately in Host and Worker', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { Walos, HostProcessContext, install, run } =
      await import('/tests/fixtures/host-harness.ts');
    const name = `sockets-${crypto.randomUUID()}`;
    const audit = new BroadcastChannel(name),
      events: any[] = [];
    audit.onmessage = (e) => events.push(e.data);
    const config = { audit: name, token: 'original' };
    const creating = Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('socket-tests', { create: true }),
      sockets: { module: new URL('/tests/fixtures/socket-backend.ts', location.href).href, config },
    });
    config.token = 'mutated';
    const os = await creating;
    const hostPid = os.getHostProcess().pid;
    try {
      const host = new HostProcessContext(os.getHostProcess());
      await run(host, await install(host, 'p3-probe'), ['p3-probe', 'sockets']);
    } finally {
      await os.dispose();
    }
    for (let i = 0; i < 100 && events.filter((e) => e.type === 'dispose').length < 2; i++)
      await new Promise((r) => setTimeout(r, 10));
    audit.close();
    return { events, hostPid };
  });
  const init = result.events.filter((e) => e.type === 'init');
  expect(init).toHaveLength(2);
  expect(new Set(init.map((e) => e.pid)).size).toBe(2);
  expect(init.every((e) => e.config.token === 'original')).toBe(true);
  expect(init.find((e) => e.pid !== result.hostPid)?.ppid).toBe(result.hostPid);
  expect(result.events.filter((e) => e.type === 'dispose')).toHaveLength(2);
});

test('unsupported transport option stays a typed failure', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { Walos } = await import('/packages/os/dist/index.js');
    const os = await Walos.create({
      storage: await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('socket-tests', { create: true }),
      sockets: {
        module: new URL('/tests/fixtures/socket-backend.ts', location.href).href,
        config: { unsupportedMethod: 'setKeepAliveInterval' },
      },
    });
    try {
      const created = os.getHostProcess().wasi.sockets.types.tcpSocket.create('ipv4');
      if (created.tag !== 'ok') throw new Error('create');
      return created.val.setKeepAliveInterval(1n);
    } finally {
      await os.dispose();
    }
  });
  expect(result).toEqual({ tag: 'err', val: { tag: 'not-supported' } });
});
