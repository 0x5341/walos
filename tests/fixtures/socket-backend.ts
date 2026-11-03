import {
  createStream,
  Future,
  type SocketBackend,
  type SocketBackendInit,
  type WasiSocketsTypes as S,
} from '../../packages/os/dist/index.js';
const ok = <T>(val: T) => ({ tag: 'ok' as const, val });
const error = (tag: S.ErrorCode['tag']) => ({ tag: 'err' as const, val: { tag } });
export function createSocketBackend({
  config,
  pid,
  ppid,
  signal,
}: SocketBackendInit): SocketBackend {
  if ((config as any)?.fail) throw new Error('backend initialization failed');
  const audit = (config as any)?.audit ? new BroadcastChannel((config as any).audit) : undefined;
  audit?.postMessage({ type: 'init', pid, ppid, config });
  const sockets = new Set<AsyncDisposable>();
  const address = (family: S.IpAddressFamily, port = 40000): S.IpSocketAddress =>
    family === 'ipv4'
      ? { tag: family, val: { address: [127, 0, 0, 1], port } }
      : { tag: family, val: { address: [0, 0, 0, 0, 0, 0, 0, 1], port, flowInfo: 0, scopeId: 0 } };
  const make = (family: S.IpAddressFamily, tcp: boolean) => {
    let local = address(family),
      remote: S.IpSocketAddress | undefined;
    const bytes = createStream<number>(4);
    let complete!: (r: any) => void;
    const completion = new Promise<any>((resolve) => {
      complete = resolve;
    });
    const incoming = {
      ...bytes.readable,
      async read(max: number) {
        const v = await bytes.readable.read(max);
        if (v === undefined) complete(ok(undefined));
        return v;
      },
      async cancel() {
        await bytes.readable.cancel();
        complete(ok(undefined));
      },
      async [Symbol.asyncDispose]() {
        await incoming.cancel();
      },
    };
    const packets = createStream<readonly [Uint8Array, S.IpSocketAddress]>(2);
    const accepted = createStream<S.TcpSocket>(1);
    let queued: S.TcpSocket | undefined;
    const options: Record<string, any> = {
      KeepAliveEnabled: false,
      KeepAliveIdleTime: 1n,
      KeepAliveInterval: 1n,
      KeepAliveCount: 1,
      HopLimit: 64,
      UnicastHopLimit: 64,
      ReceiveBufferSize: 4n,
      SendBufferSize: 4n,
    };
    let listening = false,
      disposed: Promise<void> | undefined;
    const socket = new Proxy(
      {
        bind(a: S.IpSocketAddress) {
          if (a.val.port === 13) return error('access-denied');
          local = a.val.port ? a : address(family);
          return ok(undefined);
        },
        connect(a: S.IpSocketAddress) {
          const r = a.val.port === 1 ? error('connection-refused') : ok(undefined);
          if (r.tag === 'ok') remote = a;
          return tcp ? Promise.resolve(r) : r;
        },
        disconnect() {
          remote = undefined;
          return ok(undefined);
        },
        listen() {
          listening = true;
          const child = make(family, true) as S.TcpSocket;
          queued = child;
          void child.connect(address(family, 1234));
          void accepted.writable.write([child]);
          return ok({
            ...accepted.readable,
            async read(max: number) {
              const v = await accepted.readable.read(max);
              if (v) queued = undefined;
              return v;
            },
            async tryRead(max: number) {
              const v = await accepted.readable.tryRead(max);
              if (v.tag === 'data') queued = undefined;
              return v;
            },
            async cancel() {
              await accepted.readable.cancel();
              await queued?.[Symbol.asyncDispose]();
              queued = undefined;
            },
            async [Symbol.asyncDispose]() {
              await this.cancel();
            },
          });
        },
        send(data: any, destination?: S.IpSocketAddress) {
          if (!tcp) {
            const peer = destination ?? remote;
            if (!peer) return Promise.resolve(error('invalid-argument'));
            if (remote && JSON.stringify(peer) !== JSON.stringify(remote))
              return Promise.resolve(error('invalid-argument'));
            if (data.length > 64) return Promise.resolve(error('datagram-too-large'));
            return packets.writable.write([[data.slice(), peer]]).then(() => ok(undefined));
          }
          return new Future(
            (async () => {
              try {
                for (;;) {
                  const chunk = await data.read(4);
                  if (chunk === undefined) break;
                  await bytes.writable.write(chunk);
                }
                bytes.writable.close();
                return ok(undefined);
              } catch {
                return error('connection-aborted');
              }
            })(),
            async () => {
              await data.cancel();
              await bytes.writable.cancel();
            },
          );
        },
        receive() {
          if (!tcp)
            return packets.readable
              .read(1)
              .then((v) => (v ? ok(v[0]) : error('connection-aborted')));
          if (remote?.val.port === 2) {
            bytes.writable.close();
            complete(error('connection-reset'));
          }
          return [incoming, new Future(completion, () => incoming.cancel())];
        },
        getAddressFamily: () => family,
        getLocalAddress: () => ok(local),
        getRemoteAddress: () => (remote ? ok(remote) : error('invalid-state')),
        getIsListening: () => listening,
        setListenBacklogSize: () => ok(undefined),
        [Symbol.asyncDispose]() {
          return (disposed ??= (async () => {
            sockets.delete(socket);
            complete(ok(undefined));
            await Promise.all([
              bytes.readable.cancel(),
              packets.readable.cancel(),
              accepted.readable.cancel(),
            ]);
          })());
        },
      },
      {
        get(target, key) {
          if (key in target) return Reflect.get(target, key);
          const name = String(key);
          if (name === (config as any)?.unsupportedMethod) return () => error('not-supported');
          if (name.startsWith('get'))
            return () =>
              name.slice(3) in options ? ok(options[name.slice(3)]) : error('not-supported');
          if (name.startsWith('set'))
            return (value: any) => {
              if (!(name.slice(3) in options)) return error('not-supported');
              options[name.slice(3)] = value;
              return ok(undefined);
            };
        },
      },
    ) as unknown as S.TcpSocket | S.UdpSocket;
    sockets.add(socket);
    return socket;
  };
  let disposal: Promise<void> | undefined;
  const dispose = () =>
    (disposal ??= (async () => {
      await Promise.all([...sockets].map((s) => s[Symbol.asyncDispose]()));
      audit?.postMessage({ type: 'dispose', pid });
      audit?.close();
    })());
  signal.addEventListener(
    'abort',
    () => {
      void dispose();
    },
    { once: true },
  );
  return {
    types: {
      tcpSocket: { create: (family) => ok(make(family, true) as S.TcpSocket) },
      udpSocket: { create: (family) => ok(make(family, false) as S.UdpSocket) },
    },
    ipNameLookup: {
      resolveAddresses: async (name) => {
        if (name === 'denied.test') return { tag: 'err', val: { tag: 'access-denied' } };
        if (name === 'missing.test') return { tag: 'err', val: { tag: 'name-unresolvable' } };
        if (name === 'empty.test') return ok([]);
        if (name === 'xn--r8jz45g.xn--zckzah') return ok([{ tag: 'ipv4', val: [1, 2, 3, 4] }]);
        return ok([
          { tag: 'ipv4', val: [127, 0, 0, 1] },
          { tag: 'ipv6', val: [0, 0, 0, 0, 0, 0, 0, 1] },
        ]);
      },
    },
    [Symbol.asyncDispose]: dispose,
  };
}
