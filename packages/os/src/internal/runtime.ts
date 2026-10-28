import type { ProcessContext } from '../types.js';

/** An execution-format adapter which borrows its process's Context. */
export interface Runtime extends AsyncDisposable {
  initialize(executable: Uint8Array, context: ProcessContext): Promise<void>;
  run(): Promise<number>;
  requestStop(): void;
}

export class WasiExit {
  constructor(readonly code: number) {}
}

/** Canonical resource drops are synchronous; their release acknowledgements drain later. */
export class PendingDrops {
  private pending = new Set<Promise<unknown>>();
  private failures: unknown[] = [];
  add(completion: PromiseLike<unknown>) {
    const pending = Promise.resolve(completion);
    this.pending.add(pending);
    void pending.then(
      () => this.pending.delete(pending),
      (error) => {
        this.failures.push(error);
        this.pending.delete(pending);
      },
    );
  }
  async drain() {
    while (this.pending.size) await Promise.allSettled(this.pending);
    if (this.failures.length) throw new AggregateError(this.failures, 'Resource release failed');
  }
}
