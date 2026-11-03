/** Stable failures shared by Host services and translated by WASI adapters. */
export type ErrorCode =
  | 'invalid-resource'
  | 'already-consumed'
  | 'closed'
  | 'broken-pipe'
  | 'access'
  | 'busy'
  | 'exist'
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
export interface SocketBackend extends AsyncDisposable {
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
  readonly config: unknown;
  readonly pid: number;
  readonly ppid: number | null;
  readonly signal: AbortSignal;
}
export type SocketBackendFactory = (
  init: SocketBackendInit,
) => SocketBackend | Promise<SocketBackend>;
export interface WalosOptions {
  readonly sockets?: SocketBackendOptions;
  readonly env?: Readonly<Record<string, string>>;
  readonly argv?: readonly string[];
}

export * from './wasi-types.js';
export { Future, createStream, type Stream, type StreamRead, type StreamWriter } from './async.js';
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
