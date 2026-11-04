import { Future, cancellable, cancelAsync, type Stream } from '../async.js';
import { ServiceError } from '../types.js';
import type { Result, WasiHttpClient, WasiHttpTypes as HTTP } from '../wasi-types.js';
import { HttpBody } from './http-body.js';
import { HttpFields } from './http-fields.js';
import { HttpRequest, HttpResponse } from './http-resources.js';

type Reply = Result<HTTP.Response, HTTP.ErrorCode>;
const ok = { tag: 'ok', val: undefined } as const;
function supportsUpload() {
  let duplex = false;
  try {
    const probe = new Request('https://example.invalid/', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      get duplex() {
        duplex = true;
        return 'half';
      },
    } as RequestInit);
    return duplex && !probe.headers.has('content-type');
  } catch {
    return false;
  }
}
const forbidden = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'host',
  'keep-alive',
  'origin',
  'permissions-policy',
  'referer',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
]);
const denied = (name: string, value: Uint8Array) => {
  name = name.toLowerCase();
  return (
    forbidden.has(name) ||
    /^(proxy-|sec-)/.test(name) ||
    (['x-http-method', 'x-http-method-override', 'x-method-override'].includes(name) &&
      /\b(CONNECT|TRACE|TRACK)\b/i.test(
        Array.from(value, (byte) => String.fromCharCode(byte)).join(''),
      ))
  );
};
function incoming(
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
  timeout: bigint | undefined,
  fail: (error: HTTP.ErrorCode) => Promise<void>,
): Stream<number> {
  let chunk: Uint8Array | undefined,
    ended = !reader,
    pending: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let received = false;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const cancel = async () => {
    ended = true;
    chunk = undefined;
    clear();
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  };
  const fetch = () => {
    if (chunk || ended) return Promise.resolve();
    return (pending ??= (async () => {
      if (timeout !== undefined && received) {
        const deadline = performance.now() + Number(timeout) / 1e6;
        const arm = () => {
          const left = deadline - performance.now();
          if (left <= 0) {
            void fail({ tag: 'connection-read-timeout' });
            return;
          }
          timer = setTimeout(arm, Math.min(Math.max(1, Math.ceil(left)), 2147483647));
        };
        arm();
      }
      try {
        const value = await reader!.read();
        if (ended) return;
        ended = value.done;
        if (value.done) reader!.releaseLock();
        if (!value.done && value.value.length) received = true;
        chunk = value.done ? undefined : value.value;
      } catch {
        await fail({ tag: 'HTTP-response-incomplete' });
      } finally {
        clear();
        pending = undefined;
      }
    })());
  };
  const read = async (maximum: number): Promise<Uint8Array | undefined> => {
    if (!Number.isSafeInteger(maximum) || maximum <= 0)
      throw new RangeError('Invalid HTTP read size');
    while (!chunk && !ended) await fetch();
    if (!chunk) return undefined;
    const out = chunk.slice(0, maximum);
    chunk = out.length === chunk.length ? undefined : chunk.slice(out.length);
    return out;
  };
  return {
    read,
    tryRead: async (maximum) => {
      if (chunk) return { tag: 'data', val: (await read(maximum))! };
      if (ended) return { tag: 'end' };
      void fetch();
      return { tag: 'pending' };
    },
    ready: () => !!chunk || ended,
    waitReady: fetch,
    cancel,
    [Symbol.asyncDispose]: cancel,
  };
}

export function createHttpClient(
  scope: {
    add<T extends AsyncDisposable>(value: T): T;
  },
  local?: (request: HttpRequest) => Promise<Reply | undefined>,
): WasiHttpClient.Interface {
  if (local) {
    const network = createHttpClient(scope);
    return {
      send(request) {
        if (!(request instanceof HttpRequest))
          throw new ServiceError('invalid-resource', 'Foreign HTTP request');
        const moved = scope.add(request.transfer());
        let cancelled = false;
        let pending = local(moved);
        const result = (async (): Promise<Reply> => {
          const reply = await pending;
          if (reply !== undefined) return reply;
          if (cancelled)
            return {
              tag: 'err',
              val: { tag: 'internal-error', val: 'HTTP send cancelled' },
            } as Reply;
          pending = network.send(moved);
          return (await pending)!;
        })();
        return cancellable(result, async () => {
          cancelled = true;
          await cancelAsync(pending);
          await moved.body.fail({ tag: 'internal-error', val: 'HTTP send cancelled' });
        });
      },
    };
  }
  return {
    send(request) {
      if (!(request instanceof HttpRequest))
        throw new ServiceError('invalid-resource', 'Foreign HTTP request');
      const methodValue = request.getMethod();
      const method = methodValue.tag === 'other' ? methodValue.val : methodValue.tag.toUpperCase();
      const schemeValue = request.getScheme();
      const scheme =
        schemeValue?.tag === 'other'
          ? schemeValue.val.toLowerCase()
          : (schemeValue?.tag.toLowerCase() ?? 'https');
      const authority = request.getAuthority();
      const path = request.getPathWithQuery() || '/';
      const entries = request.headers.copyAll();
      const timeout = request.options?.getBetweenBytesTimeout();
      request.move();
      const controller = new AbortController();
      request.body.onAbort(() => controller.abort());
      let responseBody: HttpBody | undefined;
      let failure: HTTP.ErrorCode | undefined;
      let sent: ((value: Result<void, HTTP.ErrorCode>) => void) | undefined;
      const fail = async (error: HTTP.ErrorCode) => {
        failure ??= error;
        sent?.({ tag: 'err', val: failure });
        controller.abort();
        await Promise.all([request.body.fail(error), responseBody?.fail(error)]);
      };
      const operation = (async (): Promise<Reply> => {
        const reject = async (error: HTTP.ErrorCode): Promise<Reply> => {
          await fail(error);
          return { tag: 'err', val: error };
        };
        if (!['http', 'https'].includes(scheme)) return reject({ tag: 'configuration-error' });
        if (
          !authority ||
          authority.includes('@') ||
          !path.startsWith('/') ||
          path.startsWith('//') ||
          path.includes('\\')
        )
          return reject({ tag: 'HTTP-request-URI-invalid' });
        let url: URL;
        try {
          url = new URL(`${scheme}://${authority}${path}`);
        } catch {
          return reject({ tag: 'HTTP-request-URI-invalid' });
        }
        if (['CONNECT', 'TRACE', 'TRACK'].includes(method.toUpperCase()))
          return reject({ tag: 'HTTP-request-method-invalid' });
        if (request.body.hasContents && ['GET', 'HEAD'].includes(method.toUpperCase()))
          return reject({ tag: 'HTTP-request-body-size', val: undefined });
        if (request.body.hasContents && !supportsUpload())
          return reject({ tag: 'configuration-error' });
        if (entries.some(([name, value]) => denied(name, value)))
          return reject({ tag: 'HTTP-request-denied' });
        try {
          const headers = new Headers();
          for (const [name, value] of entries) {
            let text = '';
            for (const byte of value) text += String.fromCharCode(byte);
            headers.append(name, text);
          }
          const source = request.body.consume(
            new Future(
              new Promise<Result<void, HTTP.ErrorCode>>((resolve) => {
                sent = resolve;
              }),
            ),
          );
          const finish = async () => {
            const trailers = await request.body.trailers;
            if (trailers.tag === 'err') throw trailers.val;
            if (trailers.val) {
              const nonempty = trailers.val.copyAll().length > 0;
              await trailers.val[Symbol.asyncDispose]();
              if (nonempty) throw { tag: 'configuration-error' } satisfies HTTP.ErrorCode;
            }
          };
          let body: ReadableStream<Uint8Array> | undefined;
          if (request.body.hasContents) {
            body = new ReadableStream<Uint8Array>({
              async pull(destination) {
                try {
                  const chunk = await source.read(65536);
                  if (chunk === undefined) {
                    await finish();
                    destination.close();
                  } else destination.enqueue(Uint8Array.from(chunk));
                } catch (error) {
                  await fail(
                    error && typeof error === 'object' && 'tag' in error
                      ? (error as HTTP.ErrorCode)
                      : { tag: 'internal-error', val: 'HTTP upload failed' },
                  );
                  destination.error(error);
                }
              },
              cancel: () => source.cancel(),
            });
          } else {
            await source.read(1);
            await finish();
          }
          const init: RequestInit & { duplex?: string } = {
            method,
            headers,
            body,
            signal: controller.signal,
            mode: 'cors',
            credentials: 'same-origin',
            redirect: 'error',
          };
          if (body) init.duplex = 'half';
          const response = await fetch(url, init);
          sent!(ok);
          const fields = scope.add(
            new HttpFields(
              Array.from(
                response.headers,
                ([name, value]) => [name, Uint8Array.from(value, (c) => c.charCodeAt(0))] as const,
              ),
              true,
            ),
          );
          const input = incoming(response.body?.getReader(), timeout, (error) => fail(error));
          responseBody = scope.add(new HttpBody(input, new Future(ok), () => controller.abort()));
          return {
            tag: 'ok',
            val: scope.add(new HttpResponse(fields, responseBody, response.status)),
          };
        } catch (error) {
          return reject(
            failure ??
              (error && typeof error === 'object' && 'tag' in error
                ? (error as HTTP.ErrorCode)
                : {
                    tag: 'internal-error',
                    val: 'Fetch failed; browser does not expose the network cause',
                  }),
          );
        }
      })();
      return cancellable(operation, () =>
        fail({ tag: 'internal-error', val: 'HTTP send cancelled' }),
      );
    },
  };
}
