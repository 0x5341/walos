import { bootstrap } from './internal/bootstrap.js';
import type { CoreEvent } from './internal/protocol.js';
import type { Foreground, ProcessInfo, WalosEvent, WalosOptions, WalosState } from './types.js';
export type {
  Exit,
  Foreground,
  ProcessInfo,
  WalosEvent,
  WalosOptions,
  WalosState,
} from './types.js';

/** One browser OS session. No DOM elements or UI framework are required. */
export class Walos {
  private worker: Worker | null = null;
  private listeners = new Set<(event: WalosEvent) => void>();
  private inputs = new Map<number, MessagePort>();
  private outputs = new Map<number, Map<MessagePort, TextDecoder>>();
  private encoder = new TextEncoder();
  private shellPid: number | null = null;
  private commandPending = false;
  private pendingInterrupt = false;
  private drainingGroup: readonly number[] = [];
  private shellOutput = '';
  private abort = new AbortController();
  private resolveBoot?: () => void;
  private rejectBoot?: (error: Error) => void;
  private resolveDispose?: () => void;
  private disposal?: Promise<void>;
  private stopping?: Promise<void>;
  private bootTask?: Promise<void>;
  private currentState: WalosState = 'created';
  private currentForeground: Foreground = { input: null, pids: [] };
  private currentProcesses: readonly ProcessInfo[] = [];

  constructor(private options: WalosOptions = {}) {}

  get state(): WalosState {
    return this.currentState;
  }
  get foreground(): Foreground {
    return this.currentForeground;
  }
  get processes(): readonly ProcessInfo[] {
    return this.currentProcesses;
  }

  subscribe(listener: (event: WalosEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Install bundled commands, reset /tmp, preserve /home, and start the shell. Single use. */
  boot(): Promise<void> {
    if (this.state !== 'created')
      return Promise.reject(new Error(`Cannot boot an OS in state ${this.state}`));
    this.bootTask = this.start();
    return this.bootTask;
  }

  private async start(): Promise<void> {
    this.setState('booting');
    try {
      const spec = await bootstrap(this.options.binUrl ?? '/bin/', this.abort.signal);
      this.abort.signal.throwIfAborted();
      const worker = (this.worker = new Worker(
        new URL('./internal/core.worker.js', import.meta.url),
        {
          type: 'module',
        },
      ));
      worker.onmessage = (event: MessageEvent<CoreEvent>) => this.receive(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        this.fail(new Error(event.message || 'Core worker failed'));
      };
      worker.onmessageerror = () => this.fail(new Error('Core worker message error'));
      await new Promise<void>((resolve, reject) => {
        this.resolveBoot = resolve;
        this.rejectBoot = reject;
        worker.postMessage({ type: 'boot', spec });
      });
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.fail(error);
      throw error;
    }
  }

  /** Send raw terminal text to the foreground input owner. Returns false if none exists. */
  writeInput(text: string): boolean {
    if (this.state !== 'running') return false;
    const pid = this.foreground.input;
    const port = pid === null ? undefined : this.inputs.get(pid);
    if (!port) return false;
    if (pid === this.shellPid) this.commandPending = true;
    const bytes = this.encoder.encode(text);
    port.postMessage({ type: 'data', bytes: bytes.buffer }, [bytes.buffer]);
    return true;
  }

  interrupt(): void {
    if (this.state !== 'running') return;
    // Input and supervisor control use separate ports. Remember an interrupt
    // that arrives before the shell's spawn/foreground messages.
    this.pendingInterrupt = this.commandPending;
    this.worker?.postMessage({ type: 'interrupt' });
  }

  /** Stop the supervisor and its processes and release terminal ports. Idempotent. */
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.abort.abort(new Error('OS disposed'));
    this.rejectBoot?.(new Error('OS disposed'));
    this.clearBoot();
    this.setState('disposed');
    this.closePorts();
    this.currentForeground = { input: null, pids: [] };
    this.currentProcesses = [];
    this.disposal = Promise.all([this.stopWorker(), this.bootTask?.catch(() => {})]).then(() => {});
    this.listeners.clear();
    return this.disposal;
  }

  private emit(event: WalosEvent): void {
    for (const listener of this.listeners) listener(event);
  }
  private setState(state: WalosState): void {
    this.currentState = state;
    this.emit({ type: 'state', state });
  }
  private clearBoot(): void {
    this.resolveBoot = undefined;
    this.rejectBoot = undefined;
  }
  private fail(error: Error): void {
    if (this.state === 'disposed' || this.state === 'failed') return;
    this.rejectBoot?.(error);
    this.clearBoot();
    this.setState('failed');
    this.currentForeground = { input: null, pids: [] };
    this.closePorts();
    void this.stopWorker();
    this.emit({ type: 'error', error });
  }
  private stopWorker(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = this.shutdown();
    return this.stopping;
  }
  private async shutdown(): Promise<void> {
    const worker = this.worker;
    if (!worker) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      this.resolveDispose = () => {
        clearTimeout(timer);
        resolve();
      };
      worker.postMessage({ type: 'dispose' });
    });
    worker.terminate();
    this.worker = null;
    this.resolveDispose = undefined;
  }
  private closePorts(): void {
    for (const port of this.inputs.values()) port.close();
    for (const group of this.outputs.values()) for (const port of group.keys()) port.close();
    this.inputs.clear();
    this.outputs.clear();
    this.shellOutput = '';
    this.drainingGroup = [];
    this.commandPending = false;
    this.pendingInterrupt = false;
  }
  private output(pid: number, text: string): void {
    if (text) this.emit({ type: 'output', pid, text });
  }
  private processOutput(pid: number, text: string): void {
    if (
      pid === this.shellPid &&
      (this.commandPending || this.drainingGroup.some((id) => this.outputs.has(id)))
    )
      this.shellOutput += text;
    else this.output(pid, text);
  }
  // Process exits and TTY CLOSE messages travel on different channels. Keep
  // the shell prompt behind all output from the foreground pipeline.
  private flushShell(): void {
    if (this.commandPending || this.drainingGroup.some((pid) => this.outputs.has(pid))) return;
    this.drainingGroup = [];
    if (this.shellPid !== null) this.output(this.shellPid, this.shellOutput);
    this.shellOutput = '';
  }
  private receive(message: CoreEvent): void {
    if (message.type === 'disposed') {
      this.resolveDispose?.();
      return;
    }
    if (this.state === 'disposed' || this.state === 'failed') return;
    switch (message.type) {
      case 'booted':
        this.shellPid = message.pid;
        this.setState('running');
        this.resolveBoot?.();
        this.clearBoot();
        break;
      case 'tty': {
        if (this.shellPid === null) this.shellPid = message.pid;
        if (message.direction === 'in') {
          this.inputs.set(message.pid, message.port);
          break;
        }
        const decoder = new TextDecoder();
        const group = this.outputs.get(message.pid) ?? new Map<MessagePort, TextDecoder>();
        group.set(message.port, decoder);
        this.outputs.set(message.pid, group);
        message.port.onmessage = (event: MessageEvent) => {
          if (this.state === 'disposed' || this.state === 'failed') return;
          if (event.data.type === 'data')
            this.processOutput(message.pid, decoder.decode(event.data.bytes, { stream: true }));
          else if (event.data.type === 'close') {
            this.processOutput(message.pid, decoder.decode());
            message.port.close();
            group.delete(message.port);
            if (!group.size) this.outputs.delete(message.pid);
            this.flushShell();
          }
        };
        message.port.start();
        break;
      }
      case 'foreground':
        if (message.input === this.shellPid && this.commandPending) {
          this.drainingGroup = this.foreground.pids;
          this.commandPending = false;
          this.pendingInterrupt = false;
        }
        this.currentForeground = { input: message.input, pids: message.pids };
        if (this.pendingInterrupt) this.worker?.postMessage({ type: 'interrupt' });
        this.flushShell();
        this.emit(message);
        break;
      case 'processes':
        this.currentProcesses = message.processes;
        if (this.pendingInterrupt) this.worker?.postMessage({ type: 'interrupt' });
        this.emit(message);
        break;
      case 'tty-close':
        this.inputs.get(message.pid)?.close();
        this.inputs.delete(message.pid);
        if (message.abnormal) {
          for (const [port, decoder] of this.outputs.get(message.pid) ?? []) {
            this.processOutput(message.pid, decoder.decode());
            port.close();
          }
          this.outputs.delete(message.pid);
          this.flushShell();
        }
        break;
      case 'exit':
        if (message.pid === this.shellPid && this.state === 'running') this.setState('stopped');
        this.emit(message);
        break;
      case 'error':
        this.fail(new Error(message.message));
        break;
    }
  }
}
