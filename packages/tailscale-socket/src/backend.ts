import {
  Future,
  cancellable,
  type SocketBackend,
  type SocketBackendInit,
  type Result,
  type WasiSocketsTypes as S,
} from '@walos/os';
import { SessionRpc } from './rpc.js';
import { ipAddress, socketAddress, formatAddress } from './address.js';
import { remoteStream } from './stream.js';
import type { RemoteSocket, TailscaleSocketConfig } from './types.js';
const ok = <T>(val: T): Result<T, S.ErrorCode> => ({ tag: 'ok', val });
const err = (tag: S.ErrorCode['tag']): Result<never, S.ErrorCode> => ({
  tag: 'err',
  val: { tag } as S.ErrorCode,
});
export function socketError(error: unknown): S.ErrorCode {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  for (const tag of [
    'invalid-state',
    'not-supported',
    'access-denied',
    'invalid-argument',
    'out-of-memory',
    'datagram-too-large',
    'address-in-use',
    'connection-refused',
    'connection-reset',
    'connection-aborted',
  ] as const)
    if (message.includes(tag)) return { tag };
  if (/connection.*refused/.test(message)) return { tag: 'connection-refused' };
  if (/connection.*reset/.test(message)) return { tag: 'connection-reset' };
  if (/unreachable|no route/.test(message)) return { tag: 'remote-unreachable' };
  if (/already.*use|address.*in use/.test(message)) return { tag: 'address-in-use' };
  if (/deadline|timeout|timed out/.test(message)) return { tag: 'timeout' };
  if (/exit-node|network-down|closed|cancel/.test(message)) return { tag: 'connection-aborted' };
  if (/bind|address/.test(message)) return { tag: 'address-not-bindable' };
  return { tag: 'other', val: message };
}
const unsupported = () => err('not-supported');
const sameAddress = (a: S.IpSocketAddress, b: S.IpSocketAddress) =>
  formatAddress(a) === formatAddress(b);
export async function createSocketBackend(init: SocketBackendInit): Promise<SocketBackend> {
  if (typeof SharedWorker === 'undefined' && !init.connect)
    throw new Error('Tailscale requires a Host SharedWorker connection');
  const config = init.config as TailscaleSocketConfig;
  if (!config?.worker || !config.session || !config.capability)
    throw new TypeError('Invalid Tailscale socket config');
  let rpc: SessionRpc;
  if (typeof SharedWorker === 'undefined') rpc = new SessionRpc(await init.connect!());
  else {
    const worker = new SharedWorker(config.worker, {
      type: 'module',
      name: `walos-tailscale-${config.session}`,
    });
    rpc = new SessionRpc(worker.port);
    worker.onerror = () => rpc.close(new Error('Tailscale SharedWorker failed'));
  }
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let disposal: Promise<void> | undefined;
  const resources = new Set<AsyncDisposable>();
  const aborted = () => {
    void dispose();
  };
  const dispose = () =>
    (disposal ??= (async () => {
      closed = true;
      init.signal.removeEventListener('abort', aborted);
      if (heartbeat) clearInterval(heartbeat);
      await Promise.allSettled([...resources].map((value) => value[Symbol.asyncDispose]()));
      try {
        await rpc.request('$detach');
      } finally {
        rpc.close();
      }
    })());
  init.signal.addEventListener('abort', aborted, { once: true });
  const reservations: { address: S.IpSocketAddress; socket: RemoteSocket }[] = [];
  try {
    await rpc.request('$attach', {
      session: config.session,
      capability: config.capability,
      pid: init.pid,
      ppid: init.ppid,
    });
    const bindings =
      config.udpBindings ??
      ([
        { tag: 'ipv4', val: { address: [0, 0, 0, 0], port: 0 } },
        {
          tag: 'ipv6',
          val: { address: [0, 0, 0, 0, 0, 0, 0, 0], port: 0, flowInfo: 0, scopeId: 0 },
        },
      ] as readonly S.IpSocketAddress[]);
    for (const address of bindings) {
      try {
        reservations.push({
          address,
          socket: await rpc.request<RemoteSocket>('udp-bind', { address: formatAddress(address) }),
        });
      } catch (error) {
        if (config.udpBindings || socketError(error).tag !== 'address-not-bindable') throw error;
      }
    }
    if (init.signal.aborted || closed) throw new Error('Tailscale socket initialization cancelled');
    heartbeat = setInterval(() => {
      void rpc.request('$heartbeat').catch(aborted);
    }, 10000);
  } catch (error) {
    await dispose().catch(() => {});
    throw error;
  }
  function makeTcp(family: S.IpAddressFamily, connected?: RemoteSocket): S.TcpSocket {
    let remote = connected;
    let dead = false;
    let connecting: ReturnType<typeof rpc.request<RemoteSocket>> | undefined;
    let sending = false;
    let receiving = false;
    let received: (value: Result<void, S.ErrorCode>) => void = () => {};
    let source: Parameters<S.TcpSocket['send']>[0] | undefined;
    let stop!: () => void;
    const stopped = new Promise<void>((resolve) => {
      stop = resolve;
    });
    let closing: Promise<void> | undefined;
    const close = () =>
      (closing ??= (async () => {
        dead = true;
        stop();
        connecting?.cancel?.();
        received(err('connection-aborted'));
        const tasks: PromiseLike<unknown>[] = [];
        if (source) tasks.push(source.cancel());
        if (remote) tasks.push(rpc.request('close', { handle: remote.handle }));
        await Promise.allSettled(tasks);
        resources.delete(socket);
      })());
    const socket: S.TcpSocket = {
      bind: unsupported,
      connect(address) {
        if (dead || remote || connecting) return Promise.resolve(err('invalid-state'));
        const pending = (connecting = rpc.request<RemoteSocket>('tcp-connect', {
          address: formatAddress(address),
        }));
        const operation = pending
          .then(
            (value) => {
              remote = value;
              return ok(undefined);
            },
            (error) => ({ tag: 'err' as const, val: socketError(error) }),
          )
          .finally(() => {
            connecting = undefined;
          });
        return Object.assign(cancellable(operation, close), { cancel: close });
      },
      listen: unsupported,
      send(data) {
        if (dead || !remote || sending) return new Future(err('invalid-state'));
        sending = true;
        source = data;
        return new Future(
          (async (): Promise<Result<void, S.ErrorCode>> => {
            try {
              for (;;) {
                const chunk = await Promise.race([data.read(65536), stopped.then(() => undefined)]);
                if (dead) return err('connection-aborted');
                if (chunk === undefined) break;
                const bytes = Uint8Array.from(chunk);
                for (let offset = 0; offset < bytes.length; offset += 65536)
                  await rpc.request('tcp-write', {
                    handle: remote!.handle,
                    bytes: bytes.slice(offset, offset + 65536),
                  });
              }
              await rpc.request('tcp-half-close', { handle: remote!.handle });
              return ok(undefined);
            } catch (error) {
              return { tag: 'err', val: socketError(error) };
            }
          })(),
          close,
        );
      },
      receive() {
        let complete!: (value: Result<void, S.ErrorCode>) => void;
        const completion = new Future<Result<void, S.ErrorCode>>(
          new Promise((resolve) => {
            complete = resolve;
          }),
          close,
        );
        if (dead || !remote || receiving) {
          complete(err('invalid-state'));
          return [
            remoteStream<number>(
              async () => undefined,
              async () => {},
            ),
            completion,
          ];
        }
        receiving = true;
        received = complete;
        const stream = remoteStream<number>(
          async (maximum) => {
            const chunk = await rpc.request<Uint8Array | null>('tcp-read', {
              handle: remote!.handle,
              maximum,
            });
            if (chunk === null) {
              complete(ok(undefined));
              return undefined;
            }
            return chunk;
          },
          close,
          (error) => complete({ tag: 'err', val: socketError(error) }),
        );
        return [stream, completion];
      },
      getLocalAddress: () => (remote ? ok(socketAddress(remote.local)) : err('invalid-state')),
      getRemoteAddress: () =>
        remote?.remote ? ok(socketAddress(remote.remote)) : err('invalid-state'),
      getAddressFamily: () => family,
      getIsListening: () => false,
      setListenBacklogSize: unsupported,
      getKeepAliveEnabled: unsupported,
      setKeepAliveEnabled: unsupported,
      getKeepAliveIdleTime: unsupported,
      setKeepAliveIdleTime: unsupported,
      getKeepAliveInterval: unsupported,
      setKeepAliveInterval: unsupported,
      getKeepAliveCount: unsupported,
      setKeepAliveCount: unsupported,
      getHopLimit: unsupported,
      setHopLimit: unsupported,
      getReceiveBufferSize: unsupported,
      setReceiveBufferSize: unsupported,
      getSendBufferSize: unsupported,
      setSendBufferSize: unsupported,
      [Symbol.asyncDispose]: close,
    };
    resources.add(socket);
    return socket;
  }
  function makeUdp(family: S.IpAddressFamily): S.UdpSocket {
    let remote: S.IpSocketAddress | undefined;
    let bound: RemoteSocket | undefined;
    let dead = false;
    let closing: Promise<void> | undefined;
    const socket: S.UdpSocket = {
      bind(address) {
        if (dead || bound) return err('invalid-state');
        const index = reservations.findIndex(
          (value) =>
            value.address.tag === family &&
            value.address.val.address.join(':') === address.val.address.join(':') &&
            (address.val.port === 0 ||
              socketAddress(value.socket.local).val.port === address.val.port),
        );
        if (index < 0) return err('not-supported');
        bound = reservations.splice(index, 1)[0].socket;
        return ok(undefined);
      },
      connect(address) {
        if (dead) return err('invalid-state');
        if (!bound) {
          const result = socket.bind(
            family === 'ipv4'
              ? { tag: 'ipv4', val: { address: [0, 0, 0, 0], port: 0 } }
              : {
                  tag: 'ipv6',
                  val: { address: [0, 0, 0, 0, 0, 0, 0, 0], port: 0, flowInfo: 0, scopeId: 0 },
                },
          );
          if (result.tag === 'err') return result;
        }
        remote = structuredClone(address);
        return ok(undefined);
      },
      disconnect() {
        if (dead || !bound || !remote) return err('invalid-state');
        remote = undefined;
        return ok(undefined);
      },
      async send(bytes, address) {
        if (dead) return err('invalid-state');
        const peer = address ?? remote;
        if (!peer || (remote && !sameAddress(peer, remote))) return err('invalid-argument');
        if (bytes.length > 65507) return err('datagram-too-large');
        if (!bound) {
          const result = socket.bind(
            family === 'ipv4'
              ? { tag: 'ipv4', val: { address: [0, 0, 0, 0], port: 0 } }
              : {
                  tag: 'ipv6',
                  val: { address: [0, 0, 0, 0, 0, 0, 0, 0], port: 0, flowInfo: 0, scopeId: 0 },
                },
          );
          if (result.tag === 'err') return result;
        }
        try {
          await rpc.request('udp-send', {
            handle: bound!.handle,
            bytes,
            address: formatAddress(peer),
          });
          return ok(undefined);
        } catch (error) {
          return { tag: 'err', val: socketError(error) };
        }
      },
      async receive() {
        if (dead || !bound) return err('invalid-state');
        try {
          for (;;) {
            const packet = await rpc.request<{ bytes: Uint8Array; address: string }>(
              'udp-receive',
              { handle: bound.handle },
            );
            const address = socketAddress(packet.address);
            if (!remote || sameAddress(address, remote))
              return ok([packet.bytes, address] as const);
          }
        } catch (error) {
          return { tag: 'err', val: socketError(error) };
        }
      },
      getLocalAddress: () => (bound ? ok(socketAddress(bound.local)) : err('invalid-state')),
      getRemoteAddress: () => (remote ? ok(remote) : err('invalid-state')),
      getAddressFamily: () => family,
      getUnicastHopLimit: unsupported,
      setUnicastHopLimit: unsupported,
      getReceiveBufferSize: unsupported,
      setReceiveBufferSize: unsupported,
      getSendBufferSize: unsupported,
      setSendBufferSize: unsupported,
      [Symbol.asyncDispose]: () =>
        (closing ??= (async () => {
          dead = true;
          if (bound) await rpc.request('close', { handle: bound.handle }).catch(() => {});
          resources.delete(socket);
        })()),
    };
    resources.add(socket);
    return socket;
  }
  return {
    types: {
      tcpSocket: { create: (family) => (closed ? err('connection-aborted') : ok(makeTcp(family))) },
      udpSocket: { create: (family) => (closed ? err('connection-aborted') : ok(makeUdp(family))) },
    },
    ipNameLookup: {
      resolveAddresses(name) {
        const pending = rpc.request<string[]>('lookup', { name });
        const operation = pending.then(
          (values) => ({ tag: 'ok' as const, val: values.map(ipAddress) }),
          (error) => ({ tag: 'err' as const, val: { tag: 'name-unresolvable' as const } }),
        );
        return Object.assign(
          cancellable(operation, () => pending.cancel?.()),
          { cancel: () => pending.cancel?.() },
        );
      },
    },
    async listenTcp(address) {
      try {
        const listener = await rpc.request<RemoteSocket>('tcp-listen', {
          address: formatAddress(address),
        });
        let closing: Promise<void> | undefined;
        const close = () =>
          (closing ??= rpc.request<void>('close', { handle: listener.handle }).catch(() => {}));
        const connections = remoteStream<S.TcpSocket>(
          async () => {
            const socket = await rpc.request<RemoteSocket>('tcp-accept', {
              handle: listener.handle,
            });
            return [makeTcp(address.tag, socket)];
          },
          close,
          () => {},
          async (values) => {
            await Promise.allSettled(values.map((value) => value[Symbol.asyncDispose]()));
          },
        );
        const value = {
          address: socketAddress(listener.local),
          connections,
          async [Symbol.asyncDispose]() {
            await connections.cancel();
            await close();
            resources.delete(value);
          },
        };
        resources.add(value);
        return ok(value);
      } catch (error) {
        return { tag: 'err', val: socketError(error) };
      }
    },
    [Symbol.asyncDispose]: dispose,
  };
}

/** Window-only connection factory used by Walos to attach Dedicated Workers. */
export async function connectSocketBackend(
  init: SocketBackendInit,
  port: MessagePort,
): Promise<void> {
  const config = init.config as TailscaleSocketConfig;
  const worker = new SharedWorker(config.worker, {
    type: 'module',
    name: `walos-tailscale-${config.session}`,
  });
  const rpc = new SessionRpc(worker.port);
  worker.onerror = () => rpc.close(new Error('Tailscale SharedWorker failed'));
  const abort = () => rpc.close(new Error('Tailscale Host stopped'));
  init.signal.addEventListener('abort', abort, { once: true });
  try {
    await rpc.request(
      '$connect',
      { session: config.session, capability: config.capability, port },
      [port],
    );
  } finally {
    init.signal.removeEventListener('abort', abort);
    rpc.close();
  }
}
