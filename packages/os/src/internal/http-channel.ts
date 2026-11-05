import { Future, cancellable, type Stream } from '../async.js';
import type { Result, WasiHttpTypes as HTTP } from '../wasi-types.js';
import { HttpBody } from './http-body.js';
import { HttpFields } from './http-fields.js';
import { HttpRequestOptions } from './http-options.js';
import { HttpRequest, HttpResponse } from './http-resources.js';

type Scope = { add<T extends AsyncDisposable>(value: T): T };
type Completion = Result<void, HTTP.ErrorCode>;
type Reply = Result<HTTP.Response, HTTP.ErrorCode>;
type Fields = readonly (readonly [string, Uint8Array])[];
type Metadata = {
  headers: Fields;
  contents: boolean;
  method?: HTTP.Method;
  scheme?: HTTP.Scheme;
  authority?: string;
  path?: string;
  timeout?: bigint;
  networkTimeouts?: { connect?: bigint; first?: bigint };
  status?: number;
};
type Name = 'request' | 'response';
type Wire =
  | { type: 'request'; value: Metadata }
  | { type: 'response'; value: Result<Metadata, HTTP.ErrorCode> }
  | { type: 'read'; name: Name; maximum: number }
  | { type: 'chunk'; name: Name; bytes?: Uint8Array }
  | { type: 'trailers'; name: Name; value: Result<Fields | undefined, HTTP.ErrorCode> }
  | { type: 'handled'; name: Name; value: Completion }
  | { type: 'cancel'; error: HTTP.ErrorCode };
const cancelled: HTTP.ErrorCode = { tag: 'internal-error', val: 'HTTP exchange cancelled' };

/** One exchange over a direct port. Each read grants at most 64 KiB of credit;
 * no body DATA or futures pass through the process supervisor. */
export class HttpChannel implements AsyncDisposable {
  private sources = new Map<Name, Stream<number>>();
  private handling = new Map<Name, (value: Completion) => void>();
  private reads = new Map<Name, (bytes?: Uint8Array) => void>();
  private endings = new Map<
    Name,
    (value: Result<HTTP.Fields | undefined, HTTP.ErrorCode>) => void
  >();
  private bodies = new Map<Name, HttpBody>();
  private completed = new Set<Name>();
  private remoteFailure = new Set<Name>();
  private owned = new Set<AsyncDisposable>();
  private closed = false;
  private reply!: (value: Reply) => void;
  private result = new Promise<Reply>((resolve) => {
    this.reply = resolve;
  });
  private finish!: () => void;
  readonly finished = new Promise<void>((resolve) => {
    this.finish = resolve;
  });
  constructor(
    private port: MessagePort,
    private scope: Scope,
    private onClose: (cancelled: boolean) => void,
    private handler?: (request: HTTP.Request) => Promise<Reply>,
  ) {
    port.onmessage = (event: MessageEvent<Wire>) => {
      void this.receive(event.data).catch(() =>
        this.cancel({ tag: 'internal-error', val: 'HTTP channel failed' }),
      );
    };
    port.onmessageerror = () =>
      this.cancel({ tag: 'internal-error', val: 'HTTP message decode failed' });
    port.start();
  }
  private post(value: Wire) {
    if (!this.closed) this.port.postMessage(value);
  }
  send(request: HttpRequest): Promise<Reply> {
    this.post({ type: 'request', value: this.pack(request, 'request') });
    return cancellable(this.result, () => this.cancel(), this.finished);
  }
  private watch(name: Name, body: HttpBody, incoming: boolean) {
    this.bodies.set(name, body);
    void Promise.resolve(body.completion).then((value) => {
      if (incoming) this.post({ type: 'handled', name, value });
      this.complete(name);
    });
  }
  private complete(name: Name) {
    this.completed.add(name);
    if (this.completed.size === 2) this.close(false);
  }
  private pack(message: HttpRequest | HttpResponse, name: Name): Metadata {
    const value: Metadata = {
      headers: message.headers.copyAll(),
      contents: message.body.hasContents,
    };
    if (message instanceof HttpRequest) {
      value.method = message.getMethod();
      value.scheme = message.getScheme();
      value.authority = message.getAuthority();
      value.path = message.getPathWithQuery();
      value.timeout = message.options?.getBetweenBytesTimeout();
      value.networkTimeouts = message.options?.copyNetworkTimeouts();
    } else value.status = message.getStatusCode();
    message.move();
    this.owned.add(message.headers);
    this.owned.add(message.body);
    if (message instanceof HttpRequest && message.options) this.owned.add(message.options);
    message.body.onAbort((error) => {
      if (!this.remoteFailure.has(name)) void this.cancel(error);
    });
    const handling = new Future<Completion>(
      new Promise((resolve) => this.handling.set(name, resolve)),
    );
    const source = message.body.consume(handling);
    this.sources.set(name, source);
    if (!value.contents) void source.read(1);
    this.watch(name, message.body, false);
    void Promise.resolve(message.body.trailers).then(async (result) => {
      const fields = result.tag === 'ok' ? result.val : undefined;
      this.post({
        type: 'trailers',
        name,
        value: result.tag === 'err' ? result : { tag: 'ok', val: fields?.copyAll() },
      });
      await fields?.[Symbol.asyncDispose]();
    });
    return value;
  }
  private unpack(value: Metadata, name: Name): HttpRequest | HttpResponse {
    const trailers = new Future<Result<HTTP.Fields | undefined, HTTP.ErrorCode>>(
      new Promise((resolve) => this.endings.set(name, resolve)),
      () => (name === 'request' ? Promise.resolve() : this.cancel()),
    );
    const read = (maximum: number): Promise<Uint8Array | undefined> => {
      if (this.closed) return Promise.resolve(undefined);
      return new Promise((resolve) => {
        this.reads.set(name, resolve);
        this.post({ type: 'read', name, maximum: Math.min(maximum, 65536) });
      });
    };
    const input: Stream<number> = {
      read,
      tryRead: async () => ({ tag: 'pending' }),
      ready: () => false,
      waitReady: async () => {},
      cancel: () => (name === 'request' ? Promise.resolve() : this.cancel()),
      [Symbol.asyncDispose]: () => (name === 'request' ? Promise.resolve() : this.cancel()),
    };
    const body = this.own(new HttpBody(value.contents ? input : undefined, trailers));
    this.watch(name, body, true);
    const headers = this.own(new HttpFields(value.headers));
    if (name === 'response') return this.own(new HttpResponse(headers, body, value.status));
    const request = this.own(
      new HttpRequest(
        headers,
        body,
        value.timeout === undefined && value.networkTimeouts === undefined
          ? undefined
          : this.own(new HttpRequestOptions(value.timeout, false, () => {}, value.networkTimeouts)),
      ),
    );
    request.setMethod(value.method!);
    request.setScheme(value.scheme);
    request.setAuthority(value.authority);
    request.setPathWithQuery(value.path);
    return request;
  }
  private async receive(message: Wire) {
    if (this.closed) return;
    switch (message.type) {
      case 'request': {
        if (!this.handler || this.bodies.has('request')) throw new Error('Unexpected HTTP request');
        const result = await this.handler(this.unpack(message.value, 'request') as HttpRequest);
        if (this.closed) {
          if (result.tag === 'ok') await result.val[Symbol.asyncDispose]();
          return;
        }
        if (result.tag === 'err') {
          this.post({ type: 'response', value: result });
          await this.failBody('request', result.val);
          this.complete('response');
        } else {
          if (!(result.val instanceof HttpResponse)) throw new Error('Foreign HTTP response');
          this.post({
            type: 'response',
            value: { tag: 'ok', val: this.pack(result.val, 'response') },
          });
        }
        break;
      }
      case 'response':
        if (message.value.tag === 'err') {
          this.reply(message.value);
          await this.failBody('request', message.value.val);
          this.complete('response');
        } else
          this.reply({
            tag: 'ok',
            val: this.unpack(message.value.val, 'response') as HttpResponse,
          });
        break;
      case 'read': {
        if (!Number.isInteger(message.maximum) || message.maximum < 1 || message.maximum > 65536)
          throw new Error('Invalid HTTP read credit');
        const source = this.sources.get(message.name);
        if (!source) throw new Error('Unknown HTTP body');
        const bytes = await source.read(message.maximum);
        this.post({
          type: 'chunk',
          name: message.name,
          bytes: bytes === undefined ? undefined : Uint8Array.from(bytes),
        });
        break;
      }
      case 'chunk': {
        const resolve = this.reads.get(message.name);
        if (!resolve) throw new Error('Unsolicited HTTP chunk');
        this.reads.delete(message.name);
        resolve(message.bytes);
        break;
      }
      case 'trailers': {
        const result = message.value;
        this.endings.get(message.name)?.(
          result.tag === 'err'
            ? result
            : {
                tag: 'ok',
                val:
                  result.val === undefined ? undefined : this.scope.add(new HttpFields(result.val)),
              },
        );
        this.endings.delete(message.name);
        break;
      }
      case 'handled':
        if (message.value.tag === 'err') await this.failBody(message.name, message.value.val);
        this.handling.get(message.name)?.(message.value);
        this.handling.delete(message.name);
        break;
      case 'cancel':
        await this.cancel(message.error, false);
    }
  }
  private async failBody(name: Name, error: HTTP.ErrorCode) {
    this.remoteFailure.add(name);
    try {
      await this.bodies.get(name)?.fail(error);
    } finally {
      this.remoteFailure.delete(name);
    }
  }
  async cancel(error: HTTP.ErrorCode = cancelled, notify = true): Promise<void> {
    if (this.closed) return;
    if (notify) this.post({ type: 'cancel', error });
    this.close(true);
    this.reply({ tag: 'err', val: error });
    for (const resolve of this.reads.values()) resolve(undefined);
    for (const resolve of this.endings.values()) resolve({ tag: 'err', val: error });
    for (const resolve of this.handling.values()) resolve({ tag: 'err', val: error });
    this.reads.clear();
    this.endings.clear();
    this.handling.clear();
    await Promise.allSettled([...this.bodies.values()].map((body) => body.fail(error)));
    this.release();
  }
  private close(cancel: boolean) {
    if (this.closed) return;
    this.closed = true;
    this.port.close();
    this.onClose(cancel);
    this.finish();
    if (!cancel) this.release();
  }
  private release() {
    // Message handles have moved or been consumed by this point. Previously
    // obtained header/option views are independent resources and remain valid.
    void Promise.allSettled([...this.owned].map((value) => value[Symbol.asyncDispose]()));
    this.owned.clear();
    this.sources.clear();
    this.bodies.clear();
  }
  private own<T extends AsyncDisposable>(value: T): T {
    this.owned.add(value);
    return this.scope.add(value);
  }
  [Symbol.asyncDispose]() {
    return this.cancel();
  }
}
