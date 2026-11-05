import {
  Future,
  createStream,
  type HttpServerInit,
  type HttpExposeOptions,
  type HttpExposure,
  type Result,
  type WasiHttpTypes as HTTP,
  type WasiSocketsTypes as S,
  type Stream,
} from '@walos/os';
import { loadHttpRuntime, type ByteConnection } from './runtime.js';
import type { SocketHttpConfig } from './index.js';
const ok = { tag: 'ok', val: undefined } as const;
const text = (value: Uint8Array) => Array.from(value, (n) => String.fromCharCode(n)).join('');
const bytes = (value: string) => Uint8Array.from(value, (c) => c.charCodeAt(0));
function unwrap<T>(value: Result<T, unknown>): T {
  if (value.tag === 'err') throw value.val;
  return value.val;
}
function connection(socket: S.TcpSocket): ByteConnection {
  const output = createStream<number>(65536);
  const sending = socket.send(output.readable);
  const [input, received] = socket.receive();
  let closing: Promise<void> | undefined;
  const conn: ByteConnection = {
    async read(maximum) {
      const value = await input.read(maximum);
      if (value === undefined) {
        unwrap(await received);
        return null;
      }
      return Uint8Array.from(value);
    },
    write: (bytes) => output.writable.write(bytes),
    abort() {
      void Promise.allSettled([
        input.cancel(),
        output.writable.cancel(),
        sending.cancel(),
        received.cancel(),
        socket[Symbol.asyncDispose](),
      ]);
    },
    close() {
      return (closing ??= (async () => {
        output.writable.close();
        try {
          await sending;
        } finally {
          await Promise.allSettled([
            input.cancel(),
            received.cancel(),
            socket[Symbol.asyncDispose](),
          ]);
        }
      })());
    },
  };
  void Promise.resolve(sending).then(
    (result) => {
      if (result.tag === 'err') conn.close();
    },
    () => conn.close(),
  );
  return conn;
}
interface Incoming {
  method: string;
  scheme: string;
  authority: string;
  path: string;
  headers: [string, string][];
  body: {
    read(maximum: number): Promise<Uint8Array | null>;
    trailers(): [string, string][];
    cancel(): void;
  };
  onCancel(callback: () => void): void;
}
export async function createHttpServer(
  init: HttpServerInit,
  options: HttpExposeOptions,
): Promise<HttpExposure> {
  const config = (init.config ?? {}) as SocketHttpConfig;
  const limit = options.maxConnections ?? 32;
  for (const [name, value] of Object.entries({
    maxConnections: limit,
    maxHeaderBytes: options.maxHeaderBytes ?? 65536,
    headerTimeoutMs: options.headerTimeoutMs ?? 10000,
    idleTimeoutMs: options.idleTimeoutMs ?? 30000,
  })) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
      throw new RangeError(`Invalid ${name}`);
  }
  if (!init.sockets.listenTcp) throw new Error('Socket backend has no async TCP listener');
  const runtime = await loadHttpRuntime(
    config.wasm ?? new URL('./http.wasm', import.meta.url).href,
    config.runtime ?? new URL('./wasm_exec.js', import.meta.url).href,
  );
  const listener = unwrap(await init.sockets.listenTcp(options.address));
  const conns = new Set<ByteConnection>();
  const controllers = new Set<AbortController>();
  let closed = false;
  let wake: (() => void) | undefined;
  let server: { close(): Promise<void> } | undefined;
  let disposal: Promise<void> | undefined;
  const closeListener = () => {
    closed = true;
    wake?.();
    void listener[Symbol.asyncDispose]();
  };
  const dispose = () =>
    (disposal ??= (async () => {
      closeListener();
      init.signal.removeEventListener('abort', aborted);
      for (const controller of controllers) controller.abort();
      for (const conn of conns) {
        conn.abort?.();
        void conn.close();
      }
      await server?.close();
      await listener[Symbol.asyncDispose]();
    })());
  const aborted = () => {
    void dispose();
  };
  init.signal.addEventListener('abort', aborted, { once: true });
  try {
    server = await runtime.serve({
      address: JSON.stringify(listener.address),
      tls: options.tls ?? null,
      maxHeaderBytes: options.maxHeaderBytes ?? 65536,
      headerTimeoutMs: options.headerTimeoutMs ?? 10000,
      idleTimeoutMs: options.idleTimeoutMs ?? 30000,
      async accept() {
        while (conns.size >= limit && !closed)
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        if (closed) return null;
        const accepted = await listener.connections.read(1);
        if (!accepted?.length) return null;
        const raw = connection(accepted[0]);
        if (closed) {
          raw.close();
          return null;
        }
        const conn: ByteConnection = {
          ...raw,
          close() {
            // Closing connections still occupy a slot and must remain available
            // for abort when the exposure is disposed during a pending flush.
            return Promise.resolve(raw.close()).finally(() => {
              conns.delete(conn);
              wake?.();
            });
          },
        };
        conns.add(conn);
        return conn;
      },
      closeListener,
      onError() {
        void dispose();
      },
      async handle(incoming: Incoming) {
        const controller = new AbortController();
        controllers.add(controller);
        incoming.onCancel(() => controller.abort());
        let trailersDone!: (value: Result<HTTP.Fields | undefined, HTTP.ErrorCode>) => void;
        const trailers = new Future<Result<HTTP.Fields | undefined, HTTP.ErrorCode>>(
          new Promise((resolve) => {
            trailersDone = resolve;
          }),
        );
        let eof = false;
        let chunk: Uint8Array | undefined;
        let pulling: Promise<void> | undefined;
        const pull = () =>
          (pulling ??= (async () => {
            try {
              const value = await incoming.body.read(65536);
              if (value === null) {
                eof = true;
                const entries = incoming.body.trailers();
                trailersDone({
                  tag: 'ok',
                  val: entries.length
                    ? unwrap(init.http.fields.fromList(entries.map(([k, v]) => [k, bytes(v)])))
                    : undefined,
                });
              } else chunk = value;
            } catch (error) {
              eof = true;
              trailersDone({ tag: 'err', val: { tag: 'HTTP-protocol-error' } });
              throw error;
            } finally {
              pulling = undefined;
            }
          })());
        const cancelInput = async () => {
          if (eof) return;
          eof = true;
          chunk = undefined;
          incoming.body.cancel();
        };
        const source: Stream<number> = {
          async read(maximum) {
            while (!chunk && !eof) await pull();
            if (!chunk) return undefined;
            const value = chunk.slice(0, maximum);
            chunk = chunk.length === value.length ? undefined : chunk.slice(value.length);
            return value;
          },
          async tryRead(maximum) {
            if (chunk) return { tag: 'data', val: (await source.read(maximum))! };
            if (eof) return { tag: 'end' };
            void pull().catch(() => {});
            return { tag: 'pending' };
          },
          ready: () => !!chunk || eof,
          waitReady: async () => {
            if (!chunk && !eof) await pull();
          },
          cancel: cancelInput,
          [Symbol.asyncDispose]: cancelInput,
        };
        const fields = unwrap(
          init.http.fields.fromList(incoming.headers.map(([k, v]) => [k, bytes(v)])),
        );
        const [request] = init.http.request.new(fields, source, trailers, undefined);
        request.setMethod({ tag: 'other', val: incoming.method });
        request.setScheme({ tag: incoming.scheme === 'https' ? 'HTTPS' : 'HTTP' });
        request.setAuthority(incoming.authority);
        request.setPathWithQuery(incoming.path);
        let done = false;
        try {
          const reply = await init.handle(request, controller.signal);
          if (reply.tag === 'err') throw new Error('upstream error');
          const status = reply.val.getStatusCode();
          const fields = reply.val.getHeaders();
          const headers = fields.copyAll().map(([k, v]) => [k, text(v)]);
          await fields[Symbol.asyncDispose]();
          let complete!: (result: Result<void, HTTP.ErrorCode>) => void;
          const [body, ending] = init.http.response.consumeBody(
            reply.val,
            new Future<Result<void, HTTP.ErrorCode>>(
              new Promise((resolve) => {
                complete = resolve;
              }),
            ),
          );
          let bodyEof = false;
          return {
            status,
            headers,
            async read(maximum: number) {
              const value = await body.read(maximum);
              if (value === undefined) {
                bodyEof = true;
                return null;
              }
              return Uint8Array.from(value);
            },
            async trailers() {
              const fields = unwrap(await ending);
              let values: [string, string][] = [];
              if (fields) {
                values = fields.copyAll().map(([k, v]) => [k, text(v)]);
                await fields[Symbol.asyncDispose]();
              }
              done = bodyEof;
              return values;
            },
            cancel() {
              void cancelInput();
              if (done) complete(ok);
              else {
                controller.abort();
                complete({ tag: 'err', val: { tag: 'HTTP-response-incomplete' } });
                void body.cancel();
              }
              controllers.delete(controller);
            },
          };
        } catch (error) {
          controller.abort();
          controllers.delete(controller);
          await source.cancel();
          if (error && typeof error === 'object' && 'code' in error && error.code === 'busy')
            throw new Error('busy');
          throw error;
        }
      },
    });
    if (init.signal.aborted || closed) {
      await dispose();
      throw new Error('HTTP listener initialization cancelled');
    }
    return { address: listener.address, [Symbol.asyncDispose]: dispose };
  } catch (error) {
    await dispose().catch(() => {});
    throw error;
  }
}
