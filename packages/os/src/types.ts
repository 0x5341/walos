/** Stable failures shared by Host services and translated by WASI adapters. */
export type ErrorCode =
  | 'invalid-resource'
  | 'already-consumed'
  | 'closed'
  | 'broken-pipe'
  | 'access'
  | 'busy'
  | 'exist'
  | 'loop'
  | 'cross-device'
  | 'invalid'
  | 'io'
  | 'no-entry'
  | 'quota'
  | 'unsupported'
  | 'not-directory'
  | 'is-directory'
  | 'not-empty'
  | 'not-permitted'
  | 'overflow'
  | 'startup'
  | 'timeout'
  | 'cancelled'
  | 'internal';
export class ServiceError extends Error {
  override readonly name = 'ServiceError';
  constructor(
    readonly code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export type Exit =
  | { kind: 'exited'; code: number }
  | { kind: 'trap'; message: string }
  | { kind: 'terminated'; message: string };
export interface ProcessInfo {
  readonly pid: number;
  readonly parent: number | null;
  readonly state: 'STARTING' | 'RUNNING' | 'EXITED';
  readonly argv: readonly string[];
}
export type WalosState = 'created' | 'booting' | 'running' | 'failed' | 'disposed';
export type WalosEvent =
  | { type: 'state'; state: WalosState }
  | { type: 'processes'; processes: readonly ProcessInfo[] }
  | { type: 'exit'; pid: number; exit: Exit; durationMs: number }
  | { type: 'error'; error: ServiceError };
/** Configuration copied into every process; config must be structured-cloneable. */
export interface SocketBackendOptions {
  readonly module: string;
  readonly config?: unknown;
}
/** Pending resolver operations expose cancel to interrupt a dropped async import. */
export type SocketOperation<T> = Promise<T> & { cancel?: () => void | PromiseLike<void> };
export interface SocketListener extends AsyncDisposable {
  readonly address: import('./wasi-types.js').WasiSocketsTypes.IpSocketAddress;
  readonly connections: import('./async.js').Stream<
    import('./wasi-types.js').WasiSocketsTypes.TcpSocket
  >;
}
export interface SocketBackend extends AsyncDisposable {
  /** Async Host ingress; the synchronous WASI bind/listen contract is unchanged. */
  listenTcp?(
    address: import('./wasi-types.js').WasiSocketsTypes.IpSocketAddress,
  ): SocketOperation<
    import('./wasi-types.js').Result<
      SocketListener,
      import('./wasi-types.js').WasiSocketsTypes.ErrorCode
    >
  >;
  readonly types: import('./wasi-types.js').WasiSocketsTypes.Interface;
  readonly ipNameLookup: {
    resolveAddresses(
      name: string,
    ): SocketOperation<
      import('./wasi-types.js').Result<
        readonly import('./wasi-types.js').WasiSocketsTypes.IpAddress[],
        import('./wasi-types.js').WasiSocketsIpNameLookup.ErrorCode
      >
    >;
  };
}
export interface SocketBackendInit {
  /** Worker-only request for a Host-created transport port. */
  readonly connect?: () => Promise<MessagePort>;
  readonly config: unknown;
  readonly pid: number;
  readonly ppid: number | null;
  readonly signal: AbortSignal;
}
export type SocketBackendFactory = (
  init: SocketBackendInit,
) => SocketBackend | Promise<SocketBackend>;
/** Fetch-compatible transport loaded independently in each process. */
export interface HttpFetchOptions {
  readonly transport?: 'fetch';
  readonly module?: string;
  readonly config?: unknown;
}
export interface HttpSocketsOptions {
  readonly transport: 'sockets';
  /** Module exporting createHttpTransport, such as @walos/http-transport. */
  readonly module: string;
  readonly config?: unknown;
}
export type HttpTransportOptions = HttpFetchOptions | HttpSocketsOptions;
export interface HttpSocketInit extends HttpFetchInit {
  readonly sockets: Pick<SocketBackend, 'types' | 'ipNameLookup'>;
  readonly http: import('./wasi-types.js').WasiHttpTypes.Interface;
}
export interface HttpSocketBackend extends AsyncDisposable {
  send(
    request: import('./wasi-types.js').WasiHttpTypes.Request,
  ): SocketOperation<
    import('./wasi-types.js').Result<
      import('./wasi-types.js').WasiHttpTypes.Response,
      import('./wasi-types.js').WasiHttpTypes.ErrorCode
    >
  >;
}
export interface HttpExposeOptions {
  readonly address: import('./wasi-types.js').WasiSocketsTypes.IpSocketAddress;
  /** Defaults to the configured sockets HTTP module. */
  readonly module?: string;
  readonly config?: unknown;
  readonly tls?: { readonly certificate: string; readonly key: string };
  readonly maxConnections?: number;
  readonly maxHeaderBytes?: number;
  readonly headerTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
}
export interface HttpExposure extends AsyncDisposable {
  readonly address: import('./wasi-types.js').WasiSocketsTypes.IpSocketAddress;
}
export interface HttpServerInit extends HttpFetchInit {
  readonly http: import('./wasi-types.js').WasiHttpTypes.Interface;
  readonly sockets: Pick<SocketBackend, 'types' | 'ipNameLookup' | 'listenTcp'>;
  handle(
    request: import('./wasi-types.js').WasiHttpTypes.Request,
    signal: AbortSignal,
  ): Promise<
    import('./wasi-types.js').Result<
      import('./wasi-types.js').WasiHttpTypes.Response,
      import('./wasi-types.js').WasiHttpTypes.ErrorCode
    >
  >;
}
export type HttpFetch = (input: URL, init: RequestInit) => Promise<Response>;
export interface HttpFetchBackend extends AsyncDisposable {
  readonly fetch: HttpFetch;
}
export interface HttpFetchInit {
  readonly config: unknown;
  readonly pid: number;
  readonly ppid: number | null;
  readonly signal: AbortSignal;
}
export type HttpFetchFactory = (
  init: HttpFetchInit,
) => HttpFetchBackend | Promise<HttpFetchBackend>;
export interface WalosOptions {
  /** Dedicated empty directory or an existing walos filesystem. */
  readonly storage: FileSystemDirectoryHandle;
  readonly sockets?: SocketBackendOptions;
  readonly http?: HttpTransportOptions;
  readonly env?: Readonly<Record<string, string>>;
  readonly argv?: readonly string[];
}

export * from './wasi-types.js';
export {
  Future,
  createStream,
  cancellable,
  cancelAsync,
  type Stream,
  type StreamRead,
  type StreamWriter,
} from './async.js';
import type { WasiImports, WalosImports } from './wasi-types.js';

export interface ProcessContext {
  readonly pid: number;
  readonly ppid: number | null;
  readonly wasi: WasiImports;
  readonly walos: WalosImports['runtime'];
}

/** Common control signal from wasi:cli/exit, observed identically by every caller. */
export class ProcessExit {
  constructor(readonly code: number) {}
}
export class UnimplementedWasiError extends Error {
  override readonly name = 'UnimplementedWasiError';
  constructor(readonly operation: string) {
    super(`Unimplemented WASI operation: ${operation}`);
  }
}
