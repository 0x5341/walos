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

export type WalosState = 'created' | 'booting' | 'running' | 'stopped' | 'failed' | 'disposed';

export interface Foreground {
  readonly input: number | null;
  readonly pids: readonly number[];
}

export type WalosEvent =
  | { type: 'output'; pid: number; text: string }
  | { type: 'state'; state: WalosState }
  | ({ type: 'foreground' } & Foreground)
  | { type: 'processes'; processes: readonly ProcessInfo[] }
  | { type: 'exit'; pid: number; exit: Exit; durationMs: number }
  | { type: 'error'; error: Error };

export interface WalosOptions {
  /** Directory containing the bundled sh.wasm, cat.wasm, etc. Defaults to /bin/. */
  binUrl?: string | URL;
}
