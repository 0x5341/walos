import type { Exit, ProcessInfo } from '../types.js';
import type { EngineId } from './component-engines.js';
import type { ComponentMetrics } from './component.js';
import { getTimeline, type DiagnosticConfig, type TimelineEvent } from './diagnostics.js';
export type { Exit } from '../types.js';
export type CoreEvent =
  | { type: 'diagnostics'; events: TimelineEvent[] }
  | { type: 'tty'; pid: number; direction: 'in' | 'out'; port: MessagePort }
  | { type: 'tty-close'; pid: number; abnormal: boolean }
  | { type: 'foreground'; input: number | null; pids: number[] }
  | { type: 'processes'; processes: ProcessInfo[] }
  | { type: 'exit'; pid: number; exit: Exit; durationMs: number }
  | { type: 'booted'; pid: number }
  | { type: 'disposed' }
  | { type: 'error'; message: string };

export type StreamRef =
  | { kind: 'null'; id: number; direction: 'in' | 'out' }
  | {
      kind: 'tty' | 'pipe';
      id: number;
      direction: 'in' | 'out';
      port: MessagePort;
      capacity: number;
      state?: {
        queue: Uint8Array[];
        sent: number;
        ack: number;
        consumed: number;
        eof: boolean;
        error?: { errno: number; message: string };
      };
    }
  | {
      kind: 'file';
      id: number;
      direction: 'in' | 'out';
      file: FileSystemFileHandle;
      position: number;
      append: boolean;
    };
export interface Spec {
  diagnostics?: DiagnosticConfig;
  file: FileSystemFileHandle;
  cwd: FileSystemDirectoryHandle;
  cwdPath: string;
  argv: string[];
  env: Record<string, string>;
  stdio: (StreamRef | null)[];
}
export type Operation =
  | { op: 'spawn'; spec: Spec }
  | { op: 'cancel-spawn'; requestId: number }
  | { op: 'wait'; pid: number }
  | { op: 'drop'; pid: number }
  | { op: 'stop'; pid: number }
  | { op: 'pipe' }
  | { op: 'stream-close'; streamId: number }
  | { op: 'foreground'; pids: number[]; input: number | null };
export type Request = Operation & { type: 'request'; id: number; commandId?: number };
export type RpcError = {
  kind: 'invalid-resource' | 'startup' | 'timeout' | 'cancelled' | 'internal';
  message: string;
};
export class RpcFailure extends Error {
  constructor(
    public kind: RpcError['kind'],
    message: string,
  ) {
    super(message);
  }
}
export type Reply = { type: 'reply'; id: number; value?: unknown; error?: RpcError };
export type FromProcess =
  | Request
  | { type: 'ready'; metrics?: ProcessMetrics; events?: TimelineEvent[] }
  | {
      type: 'exit';
      exit: Exit;
      runMs?: number;
      component?: ComponentMetrics;
      events?: TimelineEvent[];
    }
  | { type: 'boot-error'; message: string };
export interface ProcessMetrics {
  readMs: number;
  readyAtMs?: number;
  adapterMs?: number;
  loadMs?: number;
  compileMs?: number;
  instantiateMs?: number;
  linearMemoryBytes?: number;
  component?: ComponentMetrics;
}
export type ToProcess =
  | Reply
  | { type: 'start'; pid: number; spec: Spec; measure?: boolean; engine?: EngineId }
  | { type: 'stop' };
export const transferables = (refs: (StreamRef | null)[]) =>
  refs.flatMap((s) => (s && (s.kind === 'pipe' || s.kind === 'tty') ? [s.port] : []));
export class Rpc {
  private next = 1;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(private send: (r: Request, ports: Transferable[]) => void) {}
  call(op: Operation, ports: Transferable[] = []): Promise<any> {
    const id = this.next++;
    const trace = getTimeline();
    trace?.mark('rpc.send', { op: op.op, requestId: id });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          if (op.op === 'spawn')
            try {
              this.send(
                { type: 'request', id: this.next++, op: 'cancel-spawn', requestId: id },
                [],
              );
            } catch {}
          reject(new RpcFailure('timeout', `RPC timeout: ${op.op}`));
        },
        op.op === 'wait' ? 86_400_000 : 30_000,
      );
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send(
          {
            ...op,
            type: 'request',
            id,
            ...(trace && { commandId: trace.config.commandId }),
          } as Request,
          ports,
        );
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  receive(r: Reply) {
    getTimeline()?.mark('rpc.reply', { requestId: r.id });
    const p = this.pending.get(r.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(r.id);
    r.error ? p.reject(new RpcFailure(r.error.kind, r.error.message)) : p.resolve(r.value);
  }
}
