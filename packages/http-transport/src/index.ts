import {
  Future,
  createStream,
  cancelAsync,
  cancellable,
  type HttpSocketBackend,
  type HttpSocketInit,
  type Result,
  type WasiHttpTypes as HTTP,
  type WasiSocketsTypes as S,
} from '@walos/os';
import {
  loadHttpRuntime,
  type ByteConnection,
  type GoHttpOptions,
  type GoHttpRuntime,
} from './runtime.js';

export interface SocketHttpConfig {
  readonly wasm?: string;
  readonly runtime?: string;
  readonly additionalCa?: string;
  readonly connectTimeoutMs?: number;
  readonly firstByteTimeoutMs?: number;
}
const ok = { tag: 'ok', val: undefined } as const;
function unwrap<T>(result: Result<T, unknown>): T {
  if (result.tag === 'err') throw result.val;
  return result.val;
}
const text = (value: Uint8Array) => Array.from(value, (b) => String.fromCharCode(b)).join('');
const bytes = (value: string) => Uint8Array.from(value, (c) => c.charCodeAt(0));
const failure = (error: unknown): HTTP.ErrorCode => {
  if (error && typeof error === 'object' && ('tag' in error || 'networkTag' in error)) {
    const tag = String('networkTag' in error ? error.networkTag : error.tag);
    if (tag === 'name-unresolvable')
      return { tag: 'DNS-error', val: { rcode: undefined, infoCode: undefined } };
    if (tag === 'connection-refused') return { tag: 'connection-refused' };
    if (['connection-aborted', 'connection-reset', 'connection-broken'].includes(tag))
      return { tag: 'connection-terminated' };
    if (tag === 'remote-unreachable') return { tag: 'destination-IP-unroutable' };
    if (tag === 'access-denied') return { tag: 'HTTP-request-denied' };
    if (tag === 'timeout') return { tag: 'connection-timeout' };
    if (
      [
        'configuration-error',
        'HTTP-request-URI-invalid',
        'HTTP-request-method-invalid',
        'HTTP-request-body-size',
        'HTTP-request-denied',
        'connection-timeout',
        'HTTP-response-timeout',
      ].includes(tag)
    )
      return error as HTTP.ErrorCode;
  }
  const message = String(error);
  if (/HTTP framing:/i.test(message)) return { tag: 'HTTP-protocol-error' };
  if (/certificate|x509:/i.test(message)) return { tag: 'TLS-certificate-error' };
  if (/timeout awaiting response headers/i.test(message)) return { tag: 'HTTP-response-timeout' };
  if (/tls:/i.test(message)) return { tag: 'TLS-protocol-error' };
  return { tag: 'internal-error', val: message };
};

export async function createHttpTransport(init: HttpSocketInit): Promise<HttpSocketBackend> {
  const config = (init.config ?? {}) as SocketHttpConfig;
  const runtime = await loadHttpRuntime(
    config.wasm ?? new URL('./http.wasm', import.meta.url).href,
    config.runtime ?? new URL('./wasm_exec.js', import.meta.url).href,
  );
  return createSocketHttpBackend(init, runtime, config);
}
/** Runtime injection also permits deterministic adapter tests without a network. */
export function createSocketHttpBackend(
  init: HttpSocketInit,
  runtime: GoHttpRuntime,
  config: SocketHttpConfig = {},
): HttpSocketBackend {
  const active = new Set<() => Promise<void>>();
  let closed = false;
  const abort = () => {
    void Promise.allSettled([...active].map((cancel) => cancel()));
  };
  init.signal.addEventListener('abort', abort, { once: true });
  return {
    send(request) {
      if (closed || init.signal.aborted) throw new Error('HTTP transport disposed');
      const methodValue = request.getMethod();
      const method = methodValue.tag === 'other' ? methodValue.val : methodValue.tag.toUpperCase();
      const schemeValue = request.getScheme();
      const scheme =
        schemeValue?.tag === 'other'
          ? schemeValue.val.toLowerCase()
          : (schemeValue?.tag.toLowerCase() ?? 'https');
      const authority = request.getAuthority();
      const path = request.getPathWithQuery() || '/';
      const fields = request.getHeaders();
      const headers: [string, string][] = fields.copyAll().map(([k, v]) => [k, text(v)]);
      void fields[Symbol.asyncDispose]();
      const options = request.getOptions();
      const between = options?.getBetweenBytesTimeout();
      const connectTimeout = options?.getConnectTimeout();
      const firstTimeout = options?.getFirstByteTimeout();
      void options?.[Symbol.asyncDispose]();
      let sent!: (result: Result<void, HTTP.ErrorCode>) => void;
      const sentFuture = new Future<Result<void, HTTP.ErrorCode>>(
        new Promise((resolve) => {
          sent = resolve;
        }),
      );
      const [source, trailers] = init.http.request.consumeBody(request, sentFuture);
      const controller = new AbortController();
      const connections = new Set<ByteConnection>();
      let reply: Awaited<ReturnType<GoHttpRuntime['request']>> | undefined;
      let goCancel: (() => void) | null = null;
      const cancelGo = () => goCancel?.();
      let completion!: (result: Result<HTTP.Fields | undefined, HTTP.ErrorCode>) => void;
      const ending = new Future<Result<HTTP.Fields | undefined, HTTP.ErrorCode>>(
        new Promise((resolve) => {
          completion = resolve;
        }),
      );
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        reply?.close();
        for (const conn of connections) conn.close();
        active.delete(cancel);
      };
      const cancel = async (
        error: HTTP.ErrorCode = { tag: 'internal-error', val: 'HTTP send cancelled' },
      ) => {
        controller.abort();
        cancelGo();
        sent({ tag: 'err', val: error });
        completion({ tag: 'err', val: error });
        release();
        await Promise.allSettled([source.cancel(), trailers.cancel()]);
      };
      active.add(cancel);
      const pending = (async (): Promise<Result<HTTP.Response, HTTP.ErrorCode>> => {
        try {
          if (connectTimeout === 0n) throw { tag: 'connection-timeout' };
          if (firstTimeout === 0n) throw { tag: 'HTTP-response-timeout' };
          if (!['http', 'https'].includes(scheme)) throw { tag: 'configuration-error' };
          if (
            !authority ||
            authority.includes('@') ||
            !path.startsWith('/') ||
            path.startsWith('//') ||
            path.includes('\\')
          )
            throw { tag: 'HTTP-request-URI-invalid' };
          const url = new URL(`${scheme}://${authority}${path}`);
          if (['CONNECT', 'TRACE', 'TRACK'].includes(method.toUpperCase()))
            throw { tag: 'HTTP-request-method-invalid' };
          const lengths = headers.filter(([k]) => k.toLowerCase() === 'content-length');
          if (
            lengths.length > 1 ||
            (lengths.length && headers.some(([k]) => k.toLowerCase() === 'transfer-encoding'))
          )
            throw { tag: 'HTTP-request-denied' };
          const body: GoHttpOptions['body'] = {
            async read(max) {
              const value = await source.read(max);
              return value === undefined ? null : Uint8Array.from(value);
            },
            cancel: () => source.cancel(),
            async trailers() {
              const value = unwrap(await trailers);
              if (!value) return [];
              try {
                return value.copyAll().map(([k, v]) => [k, text(v)]);
              } finally {
                await value[Symbol.asyncDispose]();
              }
            },
          };
          if (['GET', 'HEAD'].includes(method.toUpperCase())) {
            if ((await source.read(1)) !== undefined)
              throw { tag: 'HTTP-request-body-size', val: undefined };
            if ((await body.trailers()).length) throw { tag: 'configuration-error' };
          }
          reply = await runtime.request({
            url: url.href,
            method,
            headers,
            ca: config.additionalCa ?? '',
            connectTimeoutMs:
              connectTimeout === undefined
                ? (config.connectTimeoutMs ?? 15000)
                : Math.max(1, Number(connectTimeout) / 1e6),
            firstByteTimeoutMs:
              firstTimeout === undefined
                ? (config.firstByteTimeoutMs ?? 30000)
                : Math.max(1, Number(firstTimeout) / 1e6),
            body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? null : body,
            async dial(address, timeoutMs) {
              const dialAbort = new AbortController();
              const signal = AbortSignal.any([controller.signal, dialAbort.signal]);
              const timer =
                timeoutMs > 0
                  ? setTimeout(() => dialAbort.abort(), Math.min(timeoutMs, 2147483647))
                  : undefined;
              const interrupted = () => ({
                tag:
                  signal.aborted && !controller.signal.aborted ? 'timeout' : 'connection-aborted',
              });
              const wait = <T>(operation: Promise<T>, close?: () => void): Promise<T> =>
                new Promise((resolve, reject) => {
                  const stop = () => {
                    close?.();
                    void cancelAsync(operation);
                    reject(interrupted());
                  };
                  signal.addEventListener('abort', stop, { once: true });
                  if (signal.aborted) stop();
                  void operation
                    .then(resolve, reject)
                    .finally(() => signal.removeEventListener('abort', stop))
                    .catch(() => {});
                });
              try {
                if (controller.signal.aborted) throw new Error('HTTP send cancelled');
                const parsed = new URL(`http://${address}`);
                const ips = unwrap(
                  await wait(
                    init.sockets.ipNameLookup.resolveAddresses(
                      parsed.hostname.replace(/^\[|\]$/g, ''),
                    ),
                  ),
                );
                let last: unknown = { tag: 'name-unresolvable' };
                for (const ip of ips) {
                  if (controller.signal.aborted) throw new Error('HTTP send cancelled');
                  const tcp = unwrap(init.sockets.types.tcpSocket.create(ip.tag));
                  const stop = () => {
                    void tcp[Symbol.asyncDispose]();
                  };
                  controller.signal.addEventListener('abort', stop, { once: true });
                  try {
                    const peer = {
                      tag: ip.tag,
                      val: {
                        address: ip.val,
                        port: Number(parsed.port || 80),
                        flowInfo: 0,
                        scopeId: 0,
                      },
                    } as S.IpSocketAddress;
                    unwrap(await wait(tcp.connect(peer), stop));
                    const outgoing = createStream<number>(65536);
                    const sending = tcp.send(outgoing.readable);
                    const [incoming, received] = tcp.receive();
                    let closing = false;
                    const conn: ByteConnection = {
                      async read(max) {
                        const value = await incoming.read(max);
                        if (value !== undefined) return Uint8Array.from(value);
                        unwrap(await received);
                        return null;
                      },
                      async write(data) {
                        await outgoing.writable.write(data);
                      },
                      close() {
                        if (closing) return;
                        closing = true;
                        controller.signal.removeEventListener('abort', stop);
                        connections.delete(conn);
                        void Promise.allSettled([
                          outgoing.writable.cancel(),
                          incoming.cancel(),
                          sending.cancel(),
                          received.cancel(),
                          tcp[Symbol.asyncDispose](),
                        ]);
                      },
                    };
                    connections.add(conn);
                    void Promise.resolve(sending).then((result) => {
                      if (result.tag === 'err') conn.close();
                    });
                    return conn;
                  } catch (error) {
                    last = error;
                    controller.signal.removeEventListener('abort', stop);
                    await tcp[Symbol.asyncDispose]();
                  }
                }
                throw last;
              } finally {
                if (timer !== undefined) clearTimeout(timer);
              }
            },
            onCancel(callback) {
              goCancel = callback;
              if (callback && controller.signal.aborted) callback();
            },
            onSent(error) {
              sent(error ? { tag: 'err', val: failure(error) } : ok);
            },
          });
          if (controller.signal.aborted) {
            reply.close();
            throw new Error('HTTP send cancelled');
          }
          const responseFields = unwrap(
            init.http.fields.fromList(reply.headers.map(([k, v]) => [k, bytes(v)])),
          );
          let eof = false;
          let chunk: Uint8Array | undefined;
          let pulling: Promise<void> | undefined;
          const pull = () =>
            (pulling ??= (async () => {
              try {
                let timer: ReturnType<typeof setTimeout> | undefined;
                if (between !== undefined)
                  timer = setTimeout(
                    () => {
                      void cancel({ tag: 'connection-read-timeout' });
                    },
                    Math.min(2147483647, Math.max(1, Number(between) / 1e6)),
                  );
                let value: Uint8Array | null;
                try {
                  value = await reply!.read(65536);
                } finally {
                  if (timer !== undefined) clearTimeout(timer);
                }
                if (value === null) {
                  eof = true;
                  const entries = reply!.trailers();
                  const fields = entries.length
                    ? unwrap(init.http.fields.fromList(entries.map(([k, v]) => [k, bytes(v)])))
                    : undefined;
                  completion({ tag: 'ok', val: fields });
                  release();
                } else chunk = value;
              } catch (error) {
                eof = true;
                completion({ tag: 'err', val: failure(error) });
                release();
                throw error;
              } finally {
                pulling = undefined;
              }
            })());
          const stream = {
            async read(max: number): Promise<Uint8Array | undefined> {
              if (!Number.isSafeInteger(max) || max <= 0)
                throw new RangeError('Invalid read credit');
              while (!chunk && !eof) await pull();
              if (!chunk) return undefined;
              const value = chunk.slice(0, max);
              chunk = chunk.length === value.length ? undefined : chunk.slice(value.length);
              return value;
            },
            async tryRead(max: number) {
              if (chunk) return { tag: 'data' as const, val: (await this.read(max))! };
              if (eof) return { tag: 'end' as const };
              void pull().catch(() => {});
              return { tag: 'pending' as const };
            },
            ready: () => !!chunk || eof,
            waitReady: pull,
            cancel,
            [Symbol.asyncDispose]: cancel,
          };
          const [response] = init.http.response.new(responseFields, stream, ending);
          response.setStatusCode(reply.status);
          return { tag: 'ok', val: response };
        } catch (error) {
          const code = failure(error);
          sent({ tag: 'err', val: code });
          completion({ tag: 'err', val: code });
          controller.abort();
          cancelGo();
          release();
          await source.cancel();
          return { tag: 'err', val: code };
        }
      })();
      return Object.assign(cancellable(pending, cancel), { cancel });
    },
    async [Symbol.asyncDispose]() {
      if (closed) return;
      closed = true;
      init.signal.removeEventListener('abort', abort);
      await Promise.allSettled([...active].map((cancel) => cancel()));
    },
  };
}

export { createHttpServer } from './server.js';
