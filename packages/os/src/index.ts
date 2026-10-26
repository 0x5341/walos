export { clearComponentCache } from './internal/component.js';
import { HostResources, serviceError } from './internal/host.js';
import { Rpc, RpcFailure, type CoreEvent } from './internal/protocol.js';
import {
  ServiceError,
  type ProcessContext,
  type ProcessInfo,
  type WalosEvent,
  type WalosOptions,
  type WalosState,
} from './types.js';
export * from './types.js';

/** A session with one logical Host process and no automatically started applications. */
export class Walos implements AsyncDisposable {
  private worker: Worker | null = null;
  private listeners = new Set<(event: WalosEvent) => void>();
  private currentState: WalosState = 'created';
  private currentProcesses: readonly ProcessInfo[] = [];
  private host?: HostResources;
  private disposal?: Promise<void>;
  private resolveBoot?: (pid: number) => void;
  private rejectBoot?: (error: Error) => void;
  private resolveDispose?: () => void;
  private rpc = new Rpc((request, ports) => {
    if (!this.worker) throw new RpcFailure('internal', 'Core is unavailable');
    this.worker.postMessage(request, ports);
  });
  private constructor() {}
  static async create(options: WalosOptions = {}): Promise<Walos> {
    const os = new Walos();
    // Copy before the first await. Only Host creation supplies a missing PWD.
    const env = { ...options.env };
    if (!Object.hasOwn(env, 'PWD')) env.PWD = '/';
    const argv = [...(options.argv ?? [])];
    try {
      os.currentState = 'booting';
      const root = await navigator.storage.getDirectory();
      const worker = (os.worker = new Worker(
        new URL('./internal/core.worker.js', import.meta.url),
        { type: 'module' },
      ));
      worker.onmessage = (e: MessageEvent<CoreEvent>) => os.receive(e.data);
      worker.onerror = (e) => {
        e.preventDefault();
        os.fail(new ServiceError('internal', e.message || 'Core Worker failed'));
      };
      worker.onmessageerror = () =>
        os.fail(new ServiceError('internal', 'Core message decode failed'));
      const pid = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new ServiceError('timeout', 'Core initialization timed out')),
          15000,
        );
        os.resolveBoot = (pid) => {
          clearTimeout(timer);
          resolve(pid);
        };
        os.rejectBoot = (error) => {
          clearTimeout(timer);
          reject(error);
        };
        worker.postMessage({ type: 'boot', argv, env });
      });
      os.host = new HostResources(root, pid, argv, env, os.rpc, () => os.check());
      await os.host.init();
      if (os.currentState !== 'booting')
        throw new ServiceError('internal', 'Core failed during initialization');
      os.currentState = 'running';
      return os;
    } catch (e) {
      os.rejectBoot?.(serviceError(e));
      os.worker?.terminate();
      os.worker = null;
      os.rpc.dispose();
      await os.host?.dispose().catch(() => {});
      throw serviceError(e);
    } finally {
      os.resolveBoot = undefined;
      os.rejectBoot = undefined;
    }
  }
  get state() {
    return this.currentState;
  }
  get processes() {
    return this.currentProcesses;
  }
  getHostProcess(): ProcessContext {
    this.check();
    return this.host!.context;
  }
  subscribe(listener: (event: WalosEvent) => void) {
    this.check();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private check() {
    if (this.currentState !== 'running')
      throw new ServiceError('invalid-resource', `OS is ${this.currentState}`);
  }
  private emit(event: WalosEvent) {
    for (const listener of this.listeners)
      try {
        listener(event);
      } catch (error) {
        console.error('Walos event listener failed', error);
      }
  }
  private fail(error: ServiceError) {
    if (this.currentState === 'disposed' || this.currentState === 'failed') return;
    this.rejectBoot?.(error);
    this.currentState = 'failed';
    this.rpc.dispose(new RpcFailure('internal', error.message));
    this.worker?.terminate();
    this.worker = null;
    void this.host?.dispose().catch(() => {});
    this.currentProcesses = [];
    this.emit({ type: 'state', state: 'failed' });
    this.emit({ type: 'error', error });
  }
  private receive(message: CoreEvent) {
    if (message.type === 'disposed') {
      this.resolveDispose?.();
      return;
    }
    if (message.type === 'reply') {
      this.rpc.receive(message);
      return;
    }
    if (message.type === 'booted') {
      this.resolveBoot?.(message.pid);
      return;
    }
    if (message.type === 'stream-gone') {
      this.host?.gone(message.id);
      return;
    }
    if (message.type === 'error') {
      this.fail(new ServiceError('internal', message.message));
      return;
    }
    if (this.currentState === 'disposed' || this.currentState === 'failed') return;
    if (message.type === 'processes')
      this.currentProcesses = Object.freeze(
        message.processes.map((p) => Object.freeze({ ...p, argv: Object.freeze([...p.argv]) })),
      );
    this.emit(
      message.type === 'processes'
        ? { type: 'processes', processes: this.currentProcesses }
        : message,
    );
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposal = Promise.resolve().then(() => this.shutdown());
    this.currentState = 'disposed';
    this.emit({ type: 'state', state: 'disposed' });
    return this.disposal;
  }
  [Symbol.asyncDispose]() {
    return this.dispose();
  }
  private async shutdown() {
    let failure: unknown;
    try {
      this.worker?.postMessage({ type: 'shutdown' });
    } catch (e) {
      failure = e;
    }
    try {
      await this.host?.dispose();
    } catch (e) {
      failure = e;
    }
    const worker = this.worker;
    if (worker) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          failure ??= new ServiceError('timeout', 'Core shutdown timed out');
          resolve();
        }, 1000);
        this.resolveDispose = () => {
          clearTimeout(timer);
          resolve();
        };
        try {
          worker.postMessage({ type: 'dispose' });
        } catch (e) {
          clearTimeout(timer);
          failure ??= e;
          resolve();
        }
      });
      worker.terminate();
      this.worker = null;
    }
    this.rpc.dispose();
    this.currentProcesses = [];
    this.listeners.clear();
    this.resolveDispose = undefined;
    if (failure) throw serviceError(failure);
  }
}
