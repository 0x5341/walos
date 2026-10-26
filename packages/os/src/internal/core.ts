import type { CoreEvent, Exit, FromProcess, Request, Spec, StreamRef } from './protocol.js';
import { transferables, RpcFailure } from './protocol.js';
interface RecordEntry {
  pid: number;
  parent: number | null;
  worker: Worker | null;
  spec: Pick<Spec, 'argv' | 'env' | 'stdio'>;
  state: 'STARTING' | 'RUNNING' | 'EXITED';
  exit?: Exit;
  ready: Promise<number>;
  resolve: (n: number) => void;
  reject: (e: Error) => void;
  waiter?: (e: Exit) => void;
  claimed: boolean;
  handles: Set<number>;
  timer: ReturnType<typeof setTimeout>;
  started: number;
  transferred: boolean;
  spawnRequest?: number;
  hostSend?: (message: unknown, ports?: Transferable[]) => void;
  retained: boolean;
}
export interface CoreEvents {
  (event: CoreEvent, ports?: Transferable[]): void;
}
// Only control traffic reaches this manager. File bytes never enter the Core.
export class ProcessManager {
  private nextPid = 1;
  private nextStream = 1;
  private records = new Map<number, RecordEntry>();
  private owners = new Map<
    number,
    { pid: number; peer?: number; gone?: boolean; state: 'preparing' | 'connected' }
  >();
  constructor(
    private emit: CoreEvents,
    private makeWorker = () =>
      new Worker(new URL('./process.worker.js', import.meta.url), { type: 'module' }),
    private timeout = 15_000,
  ) {}
  registerHost(
    argv: string[],
    env: Record<string, string>,
    send: (message: unknown, ports?: Transferable[]) => void,
  ) {
    if ([...this.records.values()].some((r) => r.hostSend))
      throw new RpcFailure('invalid-resource', 'Host already registered');
    const pid = this.nextPid++;
    const r: RecordEntry = {
      pid,
      parent: null,
      worker: null,
      spec: {
        argv: [...argv],
        env: { ...env },
        stdio: [0, 1, 2].map((i) => ({ kind: 'null', id: 0, direction: i === 0 ? 'in' : 'out' })),
      },
      state: 'RUNNING',
      ready: Promise.resolve(pid),
      resolve: () => {},
      reject: () => {},
      claimed: false,
      handles: new Set(),
      started: performance.now(),
      transferred: true,
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
      hostSend: send,
      retained: false,
    };
    this.records.set(pid, r);
    this.publish();
    return pid;
  }
  hostRequest(pid: number, request: Request) {
    const r = this.records.get(pid);
    if (!r?.hostSend || r.state !== 'RUNNING')
      throw new RpcFailure('invalid-resource', 'Host is unavailable');
    void this.request(r, request);
  }
  spawn(spec: Spec, parent: number | null, spawnRequest?: number): Promise<number> {
    const pid = this.nextPid++;
    let resolve!: (n: number) => void;
    let reject!: (e: Error) => void;
    const ready = new Promise<number>((a, b) => {
      resolve = a;
      reject = b;
    });
    const r: RecordEntry = {
      pid,
      parent,
      worker: null,
      spec,
      state: 'STARTING',
      ready,
      resolve,
      reject,
      claimed: false,
      handles: new Set(),
      started: performance.now(),
      transferred: false,
      spawnRequest,
      retained: true,
      timer: setTimeout(
        () => this.finish(pid, { kind: 'terminated', message: 'startup timeout' }),
        this.timeout,
      ),
    };
    this.records.set(pid, r);
    if (parent !== null) this.records.get(parent)?.handles.add(pid);
    try {
      const worker = (r.worker = this.makeWorker());
      const p = parent === null ? undefined : this.records.get(parent);
      spec.stdio = spec.stdio.map((s, i) => {
        if (s) {
          if (s.id) {
            const owner = this.owners.get(s.id);
            if (!owner || owner.pid !== parent) throw new Error('invalid stream owner');
            if (p)
              for (let j = 0; j < p.spec.stdio.length; j++)
                if (p.spec.stdio[j]?.id === s.id) p.spec.stdio[j] = null;
            owner.pid = pid;
            owner.state = 'preparing';
          }
          if (!s.id) {
            s.id = this.nextStream++;
            this.owners.set(s.id, { pid, state: 'preparing' });
          }
          return s;
        }
        const inherited = p?.spec.stdio[i];
        if (!p || inherited?.kind === 'null') {
          const id = this.nextStream++;
          this.owners.set(id, { pid, state: 'preparing' });
          return { kind: 'null', id, direction: i === 0 ? 'in' : 'out' };
        }
        throw new RpcFailure('invalid-resource', 'only Null stdio can be inherited');
      });
      worker.onmessage = (e) => this.message(r, e.data as FromProcess);
      worker.onerror = (e) => {
        e.preventDefault();
        this.finish(pid, { kind: 'trap', message: `worker error: ${e.message}` });
      };
      worker.onmessageerror = () =>
        this.finish(pid, { kind: 'trap', message: 'worker message error' });
      worker.postMessage({ type: 'start', pid, spec }, transferables(spec.stdio));
      r.transferred = true;
      this.publish();
    } catch (e) {
      for (const ref of spec.stdio) {
        if (!ref) continue;
        const owner = this.owners.get(ref.id);
        if (owner?.pid === parent) owner.pid = pid;
      }
      this.finish(pid, { kind: 'trap', message: String(e) });
    }
    return ready;
  }
  private message(r: RecordEntry, m: FromProcess) {
    if (r.state === 'EXITED') return;
    if (m.type === 'ready') {
      if (r.state !== 'STARTING') return;
      clearTimeout(r.timer);
      for (const s of r.spec.stdio)
        if (s?.id && this.owners.has(s.id)) this.owners.get(s.id)!.state = 'connected';
      for (const [id, owner] of this.owners)
        if (owner.pid === r.pid && owner.gone)
          if (!this.send(r, { type: 'stream-gone', id })) return;
      r.state = 'RUNNING';
      r.resolve(r.pid);
      this.publish();
    } else if (m.type === 'exit') this.finish(r.pid, m.exit);
    else if (m.type === 'boot-error') this.finish(r.pid, { kind: 'trap', message: m.message });
    else if (m.type === 'request') void this.request(r, m);
  }
  private async request(r: RecordEntry, m: Request) {
    let value: unknown;
    let ports: Transferable[] = [];
    try {
      switch (m.op) {
        case 'spawn':
          value = await this.spawn(m.spec, r.pid, m.id);
          break;
        case 'cancel-spawn':
          this.cancelSpawn(r.pid, m.requestId);
          break;
        case 'wait':
          this.owned(r, m.pid);
          if (m.release) r.handles.delete(m.pid);
          value = await this.wait(m.pid);
          break;
        case 'drop':
          this.owned(r, m.pid);
          r.handles.delete(m.pid);
          {
            const child = this.records.get(m.pid);
            if (child) child.retained = false;
          }
          this.reap(m.pid);
          break;
        case 'stop':
          this.owned(r, m.pid);
          this.requestStop(m.pid);
          break;
        case 'stream-close': {
          const s = this.owners.get(m.streamId);
          if (!s || s.pid !== r.pid) throw new Error('invalid stream owner');
          this.owners.delete(m.streamId);
          for (let i = 0; i < r.spec.stdio.length; i++)
            if (r.spec.stdio[i]?.id === m.streamId) r.spec.stdio[i] = null;
          break;
        }
        case 'pipe': {
          const c = new MessageChannel();
          const a = this.nextStream++,
            b = this.nextStream++;
          this.owners.set(a, { pid: r.pid, peer: b, state: 'connected' });
          this.owners.set(b, { pid: r.pid, peer: a, state: 'connected' });
          const refs: StreamRef[] = [
            { kind: 'pipe', id: a, direction: 'in', port: c.port1, capacity: 65536 },
            { kind: 'pipe', id: b, direction: 'out', port: c.port2, capacity: 65536 },
          ];
          value = refs;
          ports = transferables(refs);
          break;
        }
      }
      this.send(r, { type: 'reply', id: m.id, value }, ports);
    } catch (e) {
      if (r.state !== 'EXITED')
        this.send(r, {
          type: 'reply',
          id: m.id,
          error: { kind: e instanceof RpcFailure ? e.kind : 'internal', message: String(e) },
        });
    }
  }
  private send(r: RecordEntry, message: unknown, ports: Transferable[] = []): boolean {
    if (r.state === 'EXITED') return false;
    try {
      if (r.hostSend) r.hostSend(message, ports);
      else r.worker!.postMessage(message, ports);
      return true;
    } catch (error) {
      // A failed transfer leaves these endpoints in the Core.
      for (const port of ports) if (port instanceof MessagePort) port.close();
      this.finish(r.pid, { kind: 'trap', message: `worker control send failed: ${String(error)}` });
      return false;
    }
  }
  private owned(r: RecordEntry, pid: number) {
    if (!r.handles.has(pid)) throw new RpcFailure('invalid-resource', 'invalid process resource');
  }
  wait(pid: number): Promise<Exit> {
    const r = this.records.get(pid);
    if (!r || r.claimed)
      return Promise.reject(new RpcFailure('already-consumed', 'exit already consumed'));
    r.claimed = true;
    if (r.exit) {
      const exit = r.exit;
      this.reap(pid);
      return Promise.resolve(exit);
    }
    return new Promise((resolve) => {
      r.waiter = (exit) => {
        resolve(exit);
        this.reap(pid);
      };
    });
  }
  cancelSpawn(parent: number, requestId: number) {
    for (const r of this.records.values())
      if (r.parent === parent && r.spawnRequest === requestId && r.state === 'STARTING')
        this.finish(r.pid, { kind: 'terminated', message: 'spawn cancelled' });
  }
  requestStop(pid: number) {
    const r = this.records.get(pid);
    if (!r || r.state === 'EXITED') return;
    if (!this.send(r, { type: 'stop' })) return;
    setTimeout(() => {
      if (r.state !== 'EXITED')
        this.finish(pid, { kind: 'terminated', message: 'stop grace period expired' });
    }, 150);
  }
  terminate(pid: number) {
    this.finish(pid, { kind: 'terminated', message: 'supervisor terminate' });
  }
  shutdownChildren() {
    for (const r of [...this.records.values()]) if (!r.hostSend) this.terminate(r.pid);
  }
  dispose() {
    this.shutdownChildren();
    this.records.clear();
    this.owners.clear();
    this.publish();
  }
  private finish(pid: number, exit: Exit) {
    const r = this.records.get(pid);
    if (!r || r.state === 'EXITED') return;
    const starting = r.state === 'STARTING';
    r.state = 'EXITED';
    r.exit = exit;
    clearTimeout(r.timer);
    r.worker?.terminate();
    r.worker = null;
    if (!r.transferred)
      for (const s of r.spec.stdio)
        if (s && (s.kind === 'pipe' || s.kind === 'tty')) {
          try {
            s.port.postMessage({ type: s.direction === 'in' ? 'broken' : 'close' });
            s.port.close();
          } catch {}
        }
    if (starting)
      r.reject(
        new RpcFailure(
          exit.kind === 'terminated'
            ? exit.message.includes('timeout')
              ? 'timeout'
              : 'cancelled'
            : 'startup',
          exit.kind === 'exited' ? `exit before READY (${exit.code})` : exit.message,
        ),
      );
    // Remove ownership before notifying peers: a failed notification may recursively
    // finish another Worker. No recursive cleanup can see these resources twice.
    const released = [...this.owners].filter(([, owner]) => owner.pid === pid);
    for (const [id] of released) this.owners.delete(id);
    for (const [, owner] of released) {
      const peer = owner.peer === undefined ? undefined : this.owners.get(owner.peer);
      if (!peer || exit.kind === 'exited') continue;
      peer.gone = true;
      const target = this.records.get(peer.pid);
      // Initialization is asynchronous. Deliver only after READY so the adapter
      // has connected every stream; keep the flag when the endpoint moves again.
      if (target?.state === 'RUNNING') this.send(target, { type: 'stream-gone', id: owner.peer });
    }
    r.handles.clear();
    this.emit({ type: 'exit', pid, exit, durationMs: performance.now() - r.started });
    for (const child of this.records.values())
      if (child.parent === pid) {
        child.parent = null;
        child.retained = false;
        if (child.state === 'EXITED') this.reap(child.pid);
        if (child.state === 'STARTING' && exit.kind !== 'exited')
          this.finish(child.pid, {
            kind: 'terminated',
            message: 'parent abnormal exit before READY',
          });
      }
    r.waiter?.(exit);
    if (starting) {
      r.retained = false;
      if (r.parent !== null) this.records.get(r.parent)?.handles.delete(pid);
    }
    if (!r.retained || r.claimed) this.reap(pid);
    this.publish();
  }
  private reap(pid: number) {
    const r = this.records.get(pid);
    if (r?.state === 'EXITED') {
      this.records.delete(pid);
      this.publish();
    }
  }
  private publish() {
    this.emit({
      type: 'processes',
      processes: [...this.records.values()].map((r) => ({
        pid: r.pid,
        parent: r.parent,
        state: r.state,
        argv: r.spec.argv,
      })),
    });
  }
}
