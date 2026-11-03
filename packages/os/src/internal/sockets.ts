import { Future, cancellable, cancelAsync, type Stream } from '../async.js';
import type { SocketBackend, SocketBackendInit, SocketBackendOptions } from '../types.js';
import type { Result, WasiSocketsTypes as S } from '../wasi-types.js';

const err = (tag: S.ErrorCode['tag']): Result<never, S.ErrorCode> => ({
  tag: 'err',
  val: { tag } as S.ErrorCode,
});
const validAddress = (a: S.IpSocketAddress, family: S.IpAddressFamily, remote: boolean) => {
  if (!a || a.tag !== family || !a.val) return false;
  const { port, address } = a.val;
  return (
    Number.isInteger(port) &&
    port >= (remote ? 1 : 0) &&
    port <= 65535 &&
    Array.isArray(address) &&
    address.length === (family === 'ipv4' ? 4 : 8) &&
    address.every((n) => Number.isInteger(n) && n >= 0 && n <= (family === 'ipv4' ? 255 : 65535)) &&
    !(family === 'ipv6' && address.slice(0, 5).every((n) => n === 0) && address[5] === 65535) &&
    !(remote && address.every((n) => n === 0)) &&
    !(
      family === 'ipv4' &&
      ((address[0] >= 224 && address[0] <= 239) || address.every((n) => n === 255))
    ) &&
    !(family === 'ipv6' && (address[0] & 0xff00) === 0xff00) &&
    (a.tag !== 'ipv6' ||
      [a.val.scopeId, a.val.flowInfo].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295,
      ))
  );
};

/** Per-process ownership boundary. Transport and authorization remain backend responsibilities. */
export class SocketServices implements AsyncDisposable {
  private backend?: SocketBackend;
  private abort = new AbortController();
  private live = new Set<AsyncDisposable>();
  private closed = false;
  private disposal?: Promise<void>;
  constructor(private check: () => void) {}
  async init(
    options: SocketBackendOptions | undefined,
    identity: Pick<SocketBackendInit, 'pid' | 'ppid'>,
  ) {
    if (!options) return;
    const module = await import(/* @vite-ignore */ options.module);
    if (typeof module.createSocketBackend !== 'function')
      throw new Error('Missing createSocketBackend export');
    const backend = await module.createSocketBackend({
      ...identity,
      config: structuredClone(options.config),
      signal: this.abort.signal,
    });
    if (
      typeof backend?.types?.tcpSocket?.create !== 'function' ||
      typeof backend.types.udpSocket?.create !== 'function' ||
      typeof backend.ipNameLookup?.resolveAddresses !== 'function' ||
      typeof backend[Symbol.asyncDispose] !== 'function'
    ) {
      await backend?.[Symbol.asyncDispose]?.();
      throw new Error('Invalid socket backend');
    }
    this.backend = backend;
    if (this.abort.signal.aborted) {
      await backend[Symbol.asyncDispose]();
      throw new Error('Socket backend initialization cancelled');
    }
  }
  stop() {
    this.abort.abort();
  }
  private assert() {
    this.check();
    if (this.closed) throw new Error('Sockets service is disposed');
  }
  readonly types: S.Interface = {
    tcpSocket: {
      create: (family) => this.create('tcpSocket', family) as Result<S.TcpSocket, S.ErrorCode>,
    },
    udpSocket: {
      create: (family) => this.create('udpSocket', family) as Result<S.UdpSocket, S.ErrorCode>,
    },
  };
  readonly ipNameLookup: SocketBackend['ipNameLookup'] = {
    resolveAddresses: (name) => {
      let operation: ReturnType<SocketBackend['ipNameLookup']['resolveAddresses']> | undefined;
      const lookup = async (): Promise<
        Awaited<ReturnType<SocketBackend['ipNameLookup']['resolveAddresses']>>
      > => {
        this.assert();
        if (!name || /[\s\x00/@?#\\%\[\]]/u.test(name))
          return { tag: 'err', val: { tag: 'invalid-argument' } };
        const literal = parseIp(name);
        if (literal) return { tag: 'ok', val: [literal] };
        if (name.includes(':') || /^\d+(\.\d+){3}$/.test(name))
          return { tag: 'err', val: { tag: 'invalid-argument' } };
        if (!this.backend) return { tag: 'err', val: { tag: 'access-denied' } };
        let normalized: string;
        try {
          normalized = new URL(`http://${name}`).hostname;
          const labels = normalized.replace(/\.$/, '').split('.');
          if (
            normalized.length > 254 ||
            labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
          )
            return { tag: 'err', val: { tag: 'invalid-argument' } };
        } catch {
          return { tag: 'err', val: { tag: 'invalid-argument' } };
        }
        operation = this.backend.ipNameLookup.resolveAddresses(normalized);
        const result = await operation;
        if (result.tag === 'err') return result;
        const addresses = result.val.filter((a) =>
          validAddress(
            {
              tag: a.tag,
              val: { address: a.val, port: 1, scopeId: 0, flowInfo: 0 },
            } as S.IpSocketAddress,
            a.tag,
            false,
          ),
        );
        return addresses.length
          ? { tag: 'ok' as const, val: addresses }
          : { tag: 'err' as const, val: { tag: 'name-unresolvable' as const } };
      };
      return cancellable(lookup(), async () => {
        if (operation) {
          await cancelAsync(operation);
          await operation.cancel?.();
        }
      });
    },
  };
  private create(kind: 'tcpSocket' | 'udpSocket', family: S.IpAddressFamily) {
    this.assert();
    if (family !== 'ipv4' && family !== 'ipv6') return err('invalid-argument');
    if (!this.backend) return err('access-denied');
    const result = this.backend.types[kind].create(family);
    return result.tag === 'err'
      ? result
      : { tag: 'ok' as const, val: this.wrap(result.val, kind === 'tcpSocket', family) };
  }
  private wrap(
    socket: S.TcpSocket | S.UdpSocket,
    tcp: boolean,
    family: S.IpAddressFamily,
    connected = false,
  ): S.TcpSocket | S.UdpSocket {
    let closed = false,
      bound = connected,
      listening = false,
      sending = false,
      receiving = false,
      connecting = false,
      connectionFailed = false;
    let disposal: Promise<void> | undefined;
    const owned = new Set<AsyncDisposable>();
    const track = <T extends AsyncDisposable>(v: T): T => {
      owned.add(v);
      return v;
    };
    const dispose = () =>
      (disposal ??= (async () => {
        closed = true;
        try {
          const results = await Promise.allSettled([
            Promise.resolve().then(() => socket[Symbol.asyncDispose]()),
            ...[...owned].map((v) => Promise.resolve().then(() => v[Symbol.asyncDispose]())),
          ]);
          for (const r of results) if (r.status === 'rejected') throw r.reason;
        } finally {
          this.live.delete(proxy);
        }
      })());
    const proxy = new Proxy({} as typeof socket, {
      get: (target, key) => {
        if (key === Symbol.asyncDispose) return dispose;
        if (Reflect.has(target, key)) return Reflect.get(target, key);
        const fn = Reflect.get(socket, key);
        if (typeof fn !== 'function') return fn;
        return (...args: any[]) => {
          this.assert();
          if (closed) throw new Error('Socket is disposed');
          const op = String(key);
          const fail = () => {
            if (tcp && op === 'send') return new Future(err('invalid-state'));
            if (tcp && op === 'receive') return [emptyStream(), new Future(err('invalid-state'))];
            return tcp && op === 'connect'
              ? Promise.resolve(err('invalid-state'))
              : err('invalid-state');
          };
          if (
            (connectionFailed && op !== 'getAddressFamily' && op !== 'getIsListening') ||
            (op === 'bind' && (bound || connecting)) ||
            (tcp && op === 'connect' && (connected || connecting || listening)) ||
            (tcp && op === 'listen' && (!bound || listening || connected)) ||
            (tcp && op === 'send' && (!connected || sending)) ||
            (tcp && op === 'receive' && (!connected || receiving))
          )
            return fail();
          if (op === 'bind' || op === 'connect') {
            if (!validAddress(args[0], family, op === 'connect'))
              return tcp && op === 'connect'
                ? Promise.resolve(err('invalid-argument'))
                : err('invalid-argument');
          }
          if (op.startsWith('set') && op !== 'setKeepAliveEnabled') {
            const n = args[0];
            if (
              (typeof n !== 'number' && typeof n !== 'bigint') ||
              n <= 0 ||
              (typeof n === 'number' && !Number.isInteger(n)) ||
              (op.includes('HopLimit') && n > 255) ||
              (op === 'setKeepAliveCount' && n > 4294967295) ||
              (typeof n === 'bigint' && n > 18446744073709551615n)
            )
              return err('invalid-argument');
          }
          if (!tcp && op === 'send') {
            if (
              !(args[0] instanceof Uint8Array) ||
              (args[1] !== undefined && !validAddress(args[1], family, true))
            )
              return Promise.resolve(err('invalid-argument'));
          }
          const value = fn.apply(socket, args);
          const update = (r: any) => {
            if (r?.tag === 'ok') {
              if (op === 'bind') bound = true;
              if (op === 'connect') {
                connected = bound = true;
              }
              if (op === 'disconnect') connected = false;
              if (op === 'listen') {
                listening = true;
                const stream = r.val as Stream<S.TcpSocket>;
                const map = async (items: ArrayLike<S.TcpSocket> | undefined) => {
                  if (items === undefined) return undefined;
                  if (closed || this.closed) {
                    await Promise.all(Array.from(items, (s) => s[Symbol.asyncDispose]()));
                    return undefined;
                  }
                  return Array.from(items, (s) => this.wrap(s, true, family, true) as S.TcpSocket);
                };
                r = {
                  tag: 'ok',
                  val: track({
                    read: async (max: number) => map(await stream.read(max)),
                    tryRead: async (max: number) => {
                      const v = await stream.tryRead(max);
                      return v.tag === 'data'
                        ? { tag: 'data' as const, val: (await map(v.val)) ?? [] }
                        : v;
                    },
                    ready: () => stream.ready(),
                    waitReady: () => stream.waitReady(),
                    cancel: () => stream.cancel(),
                    [Symbol.asyncDispose]: () => stream[Symbol.asyncDispose](),
                  }),
                };
              }
            }
            return r;
          };
          if (tcp && op === 'send') {
            sending = true;
            track(args[0]);
            return track(new Future(Promise.resolve(value), () => value.cancel()));
          }
          if (tcp && op === 'receive') {
            receiving = true;
            track(value[0]);
            return [
              value[0],
              track(new Future(Promise.resolve(value[1]), () => value[1].cancel())),
            ];
          }
          if (value instanceof Promise) {
            if (op === 'connect') connecting = true;
            const task = value
              .then((r) => {
                if (tcp && op === 'connect' && r.tag === 'err') connectionFailed = true;
                return update(r);
              })
              .finally(() => {
                if (op === 'connect') connecting = false;
              });
            return cancellable(task, async () => {
              await cancelAsync(value);
              await (value as Promise<unknown> & { cancel?: () => Promise<void> }).cancel?.();
              await dispose();
            });
          }
          return update(value);
        };
      },
    });
    this.live.add(proxy);
    return proxy;
  }
  [Symbol.asyncDispose]() {
    return (this.disposal ??= (async () => {
      this.closed = true;
      this.abort.abort();
      const results = await Promise.allSettled([...this.live].map((v) => v[Symbol.asyncDispose]()));
      await this.backend?.[Symbol.asyncDispose]();
      for (const r of results) if (r.status === 'rejected') throw r.reason;
    })());
  }
}
function emptyStream(): Stream<number> {
  return {
    read: async () => undefined,
    tryRead: async () => ({ tag: 'end' }),
    ready: () => true,
    waitReady: async () => {},
    cancel: async () => {},
    [Symbol.asyncDispose]: async () => {},
  };
}
export function parseIp(name: string): S.IpAddress | undefined {
  if (/^\d+(\.\d+){3}$/.test(name)) {
    const nums = name.split('.').map(Number);
    if (nums.every((n) => n <= 255)) return { tag: 'ipv4', val: nums as unknown as S.Ipv4Address };
    return;
  }
  if (!name.includes(':')) return;
  try {
    const host = new URL(`http://[${name}]`).hostname.slice(1, -1);
    const [left, right] = host.split('::');
    const a = left ? left.split(':').map((n) => parseInt(n, 16)) : [];
    const b = right ? right.split(':').map((n) => parseInt(n, 16)) : [];
    const words = right === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill(0), ...b];
    if (words.length !== 8 || (words.slice(0, 5).every((n) => n === 0) && words[5] === 65535))
      return;
    return { tag: 'ipv6', val: words as unknown as S.Ipv6Address };
  } catch {
    return;
  }
}
