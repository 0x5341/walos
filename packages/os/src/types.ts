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
export interface WalosOptions {
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
