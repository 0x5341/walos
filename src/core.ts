import type { Exit, FromProcess, Request, Spec, StreamRef } from './protocol';
import { transferables, RpcFailure } from './protocol';
interface RecordEntry {
  pid: number;
  parent: number | null;
  worker: Worker | null;
  spec: Spec;
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
}
export interface CoreEvents {
  (event: unknown, ports?: Transferable[]): void;
}
// Only control traffic reaches this manager. File bytes never enter the Core.
export class ProcessManager {
  private nextPid = 1;
  private nextStream = 1;
  private records = new Map<number, RecordEntry>();
  private owners = new Map<
    number,
    { pid: number; peer?: number; state: 'preparing' | 'connected' }
  >();
  private foreground: number[] = [];
  private inputOwner: number | null = null;
  private controller: number | null = null;
  focus(pid: number | null) {
    if (this.controller === null && pid !== null) this.controller = pid;
    this.inputOwner = pid;
    this.emit({ type: 'foreground', input: pid, pids: [...this.foreground] });
  }
  constructor(
    private emit: CoreEvents,
    private makeWorker = () =>
      new Worker(new URL('./process.worker.ts', import.meta.url), { type: 'module' }),
    private timeout = 15_000,
  ) {}
  private tty(pid: number, direction: 'in' | 'out'): StreamRef {
    const c = new MessageChannel();
    const id = this.nextStream++;
    this.emit({ type: 'tty', pid, direction, port: c.port1 }, [c.port1]);
    this.owners.set(id, { pid, state: 'preparing' });
    return { kind: 'tty', id, direction, port: c.port2, capacity: 0 };
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
      timer: setTimeout(
        () => this.finish(pid, { kind: 'terminated', message: 'startup timeout' }),
        this.timeout,
      ),
    };
    this.records.set(pid, r);
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
        if (!p || inherited?.kind === 'tty') return this.tty(pid, i === 0 ? 'in' : 'out');
        if (inherited?.kind === 'null') {
          const id = this.nextStream++;
          this.owners.set(id, { pid, state: 'preparing' });
          return { kind: 'null', id, direction: i === 0 ? 'in' : 'out' };
        }
        throw new Error('only TTY and Null can be inherited');
      });
      worker.onmessage = (e) => this.message(r, e.data as FromProcess);
      worker.onerror = (e) => {
        e.preventDefault();
        this.finish(pid, { kind: 'trap', message: e.message });
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
      r.state = 'RUNNING';
      clearTimeout(r.timer);
      for (const s of r.spec.stdio)
        if (s?.id && this.owners.has(s.id)) this.owners.get(s.id)!.state = 'connected';
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
          r.handles.add(value as number);
          break;
        case 'cancel-spawn':
          this.cancelSpawn(r.pid, m.requestId);
          break;
        case 'wait':
          this.owned(r, m.pid);
          value = await this.wait(m.pid);
          r.handles.delete(m.pid);
          break;
        case 'drop':
          this.owned(r, m.pid);
          r.handles.delete(m.pid);
          {
            const child = this.records.get(m.pid);
            if (child) child.parent = null;
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
        case 'foreground':
          for (const pid of m.pids) this.owned(r, pid);
          if (m.input !== null && m.input !== 0 && m.input !== r.pid && !m.pids.includes(m.input))
            throw new Error('invalid input owner');
          this.foreground = m.pids;
          this.controller = r.pid;
          this.focus(m.input === 0 ? r.pid : m.input);
          break;
      }
      if (r.state !== 'EXITED') r.worker?.postMessage({ type: 'reply', id: m.id, value }, ports);
    } catch (e) {
      if (r.state !== 'EXITED')
        r.worker?.postMessage({
          type: 'reply',
          id: m.id,
          error: { kind: e instanceof RpcFailure ? e.kind : 'internal', message: String(e) },
        });
    }
  }
  private owned(r: RecordEntry, pid: number) {
    if (!r.handles.has(pid)) throw new RpcFailure('invalid-resource', 'invalid process resource');
  }
  wait(pid: number): Promise<Exit> {
    const r = this.records.get(pid);
    if (!r || r.claimed) return Promise.reject(new Error('exit already consumed'));
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
    r.worker?.postMessage({ type: 'stop' });
    setTimeout(() => {
      if (r.state !== 'EXITED')
        this.finish(pid, { kind: 'terminated', message: 'stop grace period expired' });
    }, 150);
  }
  interrupt() {
    for (const r of this.records.values())
      if (r.parent === this.controller && r.state === 'STARTING')
        this.finish(r.pid, { kind: 'terminated', message: 'spawn cancelled by terminal' });
    for (const pid of this.foreground) this.requestStop(pid);
  }
  terminate(pid: number) {
    this.finish(pid, { kind: 'terminated', message: 'supervisor terminate' });
  }
  private finish(pid: number, exit: Exit) {
    const r = this.records.get(pid);
    if (!r || r.state === 'EXITED') return;
    const starting = r.state === 'STARTING';
    r.state = 'EXITED';
    r.exit = exit;
    clearTimeout(r.timer);
    r.worker?.terminate();
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
    for (const [id, s] of this.owners) {
      if (s.pid !== pid) continue;
      const peer = s.peer === undefined ? undefined : this.owners.get(s.peer);
      if (peer && exit.kind !== 'exited') {
        const target = this.records.get(peer.pid);
        if (target?.state !== 'EXITED')
          target?.worker?.postMessage({ type: 'stream-gone', id: s.peer });
      }
      this.owners.delete(id);
    }
    this.emit({ type: 'tty-close', pid, abnormal: exit.kind !== 'exited' });
    this.emit({ type: 'exit', pid, exit, durationMs: performance.now() - r.started });
    if (this.inputOwner === pid || this.controller === pid) this.focus(null);
    for (const child of this.records.values())
      if (child.parent === pid) {
        child.parent = null;
        if (child.state === 'EXITED') this.reap(child.pid);
        if (child.state === 'STARTING' && exit.kind !== 'exited')
          this.finish(child.pid, {
            kind: 'terminated',
            message: 'parent abnormal exit before READY',
          });
      }
    r.waiter?.(exit);
    if (r.parent === null || starting) this.reap(pid);
    this.publish();
  }
  private reap(pid: number) {
    const r = this.records.get(pid);
    if (r?.state === 'EXITED') this.records.delete(pid);
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
