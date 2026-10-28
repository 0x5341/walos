import { ProcessExit, type ProcessContext } from '../types.js';
import { prepareComponent, type PreparedComponent } from './component.js';
import { PendingDrops, RuntimeStopped, type Runtime } from './runtime.js';
import type { ProcessMetrics } from './protocol.js';

/** Native WASI 0.3.2 Component Model adapter. The Context remains borrowed. */
export class Wasi3 implements Runtime {
  private component?: Awaited<ReturnType<(typeof import('./component-jsco.js'))['loadP3']>>;
  private stopping = false;
  private fault: unknown;
  private started = false;
  private disposal?: Promise<void>;
  private drops = new PendingDrops();
  constructor(
    private metrics?: ProcessMetrics,
    private prepared?: PreparedComponent,
  ) {}
  async initialize(bytes: Uint8Array, context: ProcessContext) {
    if (this.metrics) this.metrics.component ??= {};
    const start = performance.now();
    const prepared = this.prepared ?? (await prepareComponent(bytes, this.metrics?.component));
    this.component = await (
      await import('./component-jsco.js')
    ).loadP3(
      prepared,
      context,
      this.drops,
      () => {
        if (this.stopping) throw new RuntimeStopped();
      },
      (error) => {
        this.fault ??= error;
      },
      this.metrics?.component,
    );
    if (this.metrics) this.metrics.loadMs = performance.now() - start;
  }
  requestStop() {
    this.stopping = true;
    if (this.component) {
      this.fault ??= new RuntimeStopped();
      this.component.requestStop();
    }
  }
  async run() {
    if (!this.component || this.started) throw new Error('Runtime is uninitialized or already run');
    this.started = true;
    try {
      if (this.stopping) throw new RuntimeStopped();
      const result = await this.component.run();
      if (this.fault) throw this.fault;
      if (result?.tag === 'ok') return 0;
      if (result?.tag === 'err') return 1;
      throw new Error('Invalid native async CLI result');
    } catch (error) {
      error = this.fault ?? error;
      if (error instanceof ProcessExit) return error.code;
      throw error;
    }
  }
  [Symbol.asyncDispose]() {
    return (this.disposal ??= this.close());
  }
  private async close() {
    try {
      this.component?.dispose();
    } finally {
      await this.drops.drain();
    }
  }
}
