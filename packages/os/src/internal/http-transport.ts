import { cancellable } from '../async.js';
import type {
  HttpFetchBackend,
  HttpFetchInit,
  HttpTransportOptions,
  HttpSocketBackend,
  HttpSocketInit,
} from '../types.js';
import type { WasiHttpClient } from '../wasi-types.js';
import { createHttpClient } from './http-client.js';

/** Process-owned transport and response resources, independent of local routing. */
export class HttpTransportServices implements AsyncDisposable {
  private abort = new AbortController();
  private backend?: HttpFetchBackend | HttpSocketBackend;
  private resources = new Set<AsyncDisposable>();
  private closed = false;
  private disposal?: Promise<void>;
  private client = createHttpClient(this, undefined, (url, init) =>
    globalThis.fetch(url, this.requestInit(init)),
  );
  private requestInit(init: RequestInit): RequestInit {
    return {
      ...init,
      signal: AbortSignal.any([this.abort.signal, ...(init.signal ? [init.signal] : [])]),
    };
  }
  add<T extends AsyncDisposable>(value: T): T {
    if (this.closed) void value[Symbol.asyncDispose]();
    else {
      this.resources.add(value);
      const dispose = value[Symbol.asyncDispose].bind(value);
      Object.defineProperty(value, Symbol.asyncDispose, {
        configurable: true,
        value: async () => {
          try {
            await dispose();
          } finally {
            this.resources.delete(value);
          }
        },
      });
    }
    return value;
  }
  async init(
    options: HttpTransportOptions | undefined,
    identity: Pick<HttpFetchInit, 'pid' | 'ppid'>,
    socketInit?: Pick<HttpSocketInit, 'sockets' | 'http'>,
  ) {
    if (options?.transport !== undefined && !['fetch', 'sockets'].includes(options.transport))
      throw new TypeError('Unknown HTTP transport');
    if (!options?.module) {
      if (options?.transport === 'sockets')
        throw new TypeError('Socket HTTP transport module is required');
      return;
    }
    const module = await import(/* @vite-ignore */ options.module);
    if (options.transport === 'sockets') {
      if (!socketInit)
        throw new Error('Socket HTTP initialization requires sockets and HTTP types');
      if (typeof module.createHttpTransport !== 'function')
        throw new TypeError('Missing createHttpTransport export');
      const backend: HttpSocketBackend = await module.createHttpTransport({
        ...identity,
        ...socketInit,
        config: structuredClone(options.config),
        signal: this.abort.signal,
      });
      if (
        typeof backend?.send !== 'function' ||
        typeof backend[Symbol.asyncDispose] !== 'function'
      ) {
        await backend?.[Symbol.asyncDispose]?.();
        throw new TypeError('Invalid socket HTTP backend');
      }
      this.backend = backend;
      if (this.abort.signal.aborted) {
        await backend[Symbol.asyncDispose]();
        this.backend = undefined;
        throw new Error('HTTP transport initialization cancelled');
      }
      this.client = backend;
      return;
    }
    if (typeof module.createFetch !== 'function') throw new TypeError('Missing createFetch export');
    const backend = await module.createFetch({
      ...identity,
      config: structuredClone(options.config),
      signal: this.abort.signal,
    });
    if (
      typeof backend?.fetch !== 'function' ||
      typeof backend[Symbol.asyncDispose] !== 'function'
    ) {
      await backend?.[Symbol.asyncDispose]?.();
      throw new TypeError('Invalid HTTP fetch backend');
    }
    this.backend = backend;
    if (this.abort.signal.aborted) {
      await backend[Symbol.asyncDispose]();
      this.backend = undefined;
      throw new Error('HTTP transport initialization cancelled');
    }
    this.client = createHttpClient(this, undefined, (url, init) =>
      backend.fetch(url, this.requestInit(init)),
    );
  }
  readonly send: WasiHttpClient.Interface['send'] = (request) => {
    if (this.closed) throw new Error('HTTP transport is disposed');
    const operation = this.client.send(request);
    const cancel = (operation as Promise<unknown> & { cancel?: () => void | Promise<void> }).cancel;
    return cancel ? cancellable(operation, () => cancel.call(operation)) : operation;
  };
  stop() {
    this.abort.abort();
  }
  [Symbol.asyncDispose]() {
    return (this.disposal ??= this.close());
  }
  private async close() {
    this.closed = true;
    this.stop();
    const results = await Promise.allSettled(
      [...this.resources].map((r) => r[Symbol.asyncDispose]()),
    );
    try {
      await this.backend?.[Symbol.asyncDispose]();
    } finally {
      this.resources.clear();
    }
    const failed = results.find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
}
