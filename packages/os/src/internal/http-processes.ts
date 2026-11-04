import { cancellable, cancelAsync } from '../async.js';
import { ServiceError } from '../types.js';
import type { Result, WasiHttpTypes as HTTP } from '../wasi-types.js';
import { HttpRequest } from './http-resources.js';
import { HttpChannel } from './http-channel.js';
import { Rpc, RpcFailure } from './protocol.js';

type Reply = Result<HTTP.Response, HTTP.ErrorCode>;
/** Process-local HTTP endpoints; the supervisor owns routing and liveness. */
export class HttpProcesses implements AsyncDisposable {
  private resources = new Set<AsyncDisposable>();
  private channels = new Map<number, HttpChannel>();
  private closing = false;
  constructor(
    private rpc: Rpc,
    private check: () => void,
  ) {}
  add<T extends AsyncDisposable>(value: T): T {
    if (this.closing) void value[Symbol.asyncDispose]();
    else if (!this.resources.has(value)) {
      this.resources.add(value);
      const dispose = value[Symbol.asyncDispose].bind(value);
      Object.defineProperty(value, Symbol.asyncDispose, {
        configurable: true,
        value: async () => {
          await dispose();
          this.resources.delete(value);
        },
      });
      const moved = value as T & { move?: (...args: unknown[]) => unknown };
      if (typeof moved.move === 'function') {
        const move = moved.move.bind(value);
        moved.move = (...args) => {
          const result = move(...args);
          this.resources.delete(value);
          return result;
        };
      }
    }
    return value;
  }
  send(request: HttpRequest, pid?: number, direct = false): Promise<Reply | undefined> {
    this.check();
    const scheme = request.getScheme();
    const protocol =
      scheme?.tag === 'other' ? scheme.val.toLowerCase() : (scheme?.tag.toLowerCase() ?? 'https');
    if (pid === undefined && protocol !== 'http') return Promise.resolve(undefined);
    const authority = request.getAuthority();
    const path = request.getPathWithQuery() || '/';
    let url: URL;
    try {
      if (
        !authority ||
        authority.includes('@') ||
        !path.startsWith('/') ||
        path.startsWith('//') ||
        path.includes('\\')
      )
        throw new Error('Invalid HTTP URI');
      url = new URL(`${protocol}://${authority}${path}`);
    } catch {
      const error: HTTP.ErrorCode = { tag: 'HTTP-request-URI-invalid' };
      return request.body.fail(error).then(() => ({ tag: 'err', val: error }));
    }
    if (pid === undefined && (url.protocol !== 'http:' || url.hostname !== 'localhost'))
      return Promise.resolve(undefined);
    let cancelled = false;
    let pending: Promise<Reply> | undefined;
    let connected = false;
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const operation = (async (): Promise<Reply | undefined> => {
      try {
        const endpoint: { connection: number; port: MessagePort } | undefined = await this.rpc.call(
          pid === undefined ? { op: 'http-connect', url: url.href } : { op: 'http-connect', pid },
        );
        if (!endpoint) return undefined;
        const channel = this.channel(endpoint.connection, endpoint.port);
        connected = true;
        void channel.finished.then(finish);
        if (cancelled || this.closing) {
          await channel.cancel();
          return { tag: 'err', val: { tag: 'internal-error', val: 'HTTP send cancelled' } };
        }
        pending = channel.send(request);
        return await pending;
      } catch (error) {
        const failure: HTTP.ErrorCode = { tag: 'internal-error', val: String(error) };
        await request.body.fail(failure);
        if (direct && error instanceof RpcFailure && error.kind === 'busy')
          throw new ServiceError('busy', error.message);
        return { tag: 'err', val: failure };
      }
    })();
    void operation
      .finally(() => {
        if (!connected) finish();
      })
      .catch(() => {});
    return Object.assign(
      cancellable(
        operation,
        async () => {
          cancelled = true;
          if (pending) await cancelAsync(pending);
          await request.body.fail({ tag: 'internal-error', val: 'HTTP send cancelled' });
        },
        finished,
      ),
      { finished },
    );
  }
  private channel(
    connection: number,
    port: MessagePort,
    handler?: (request: HTTP.Request) => Promise<Reply>,
  ) {
    const channel = new HttpChannel(
      port,
      this,
      (cancel) => {
        this.channels.delete(connection);
        void this.rpc.call({ op: 'http-close', connection, cancel }).catch(() => {});
      },
      handler,
    );
    this.channels.set(connection, channel);
    return channel;
  }
  accept(
    connection: number,
    port: MessagePort,
    handler: (request: HTTP.Request) => Promise<Reply>,
  ) {
    if (this.closing) {
      port.close();
      return;
    }
    this.channel(connection, port, handler);
  }
  disconnected(connection: number) {
    void this.channels.get(connection)?.cancel({ tag: 'internal-error', val: 'HTTP peer exited' });
  }
  async [Symbol.asyncDispose]() {
    this.closing = true;
    await Promise.allSettled([...this.channels.values()].map((channel) => channel.cancel()));
    await Promise.allSettled([...this.resources].map((value) => value[Symbol.asyncDispose]()));
    this.resources.clear();
  }
}
