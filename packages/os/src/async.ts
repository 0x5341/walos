/** A one-shot WASI future. Consume once; repeated await/then is not guaranteed. */
export class Future<T> implements PromiseLike<T>, AsyncDisposable {
  private promise: Promise<T>;
  private state: { tag: 'pending' } | { tag: 'ready'; val: T } | { tag: 'failed'; error: unknown } =
    { tag: 'pending' };
  private cancellation?: Promise<void>;
  constructor(
    value: T | PromiseLike<T>,
    private cancelOperation: () => void | PromiseLike<void> = () => {},
  ) {
    if (
      value === null ||
      !['object', 'function'].includes(typeof value) ||
      typeof (value as any).then !== 'function'
    )
      this.state = { tag: 'ready', val: value as T };
    this.promise = Promise.resolve(value);
    void this.promise.then(
      (val) => {
        this.state = { tag: 'ready', val };
      },
      (error) => {
        this.state = { tag: 'failed', error };
      },
    );
  }
  then<A = T, B = never>(
    onfulfilled?: ((value: T) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.promise.then(onfulfilled, onrejected);
  }
  /** Polling pending state does not consume. A ready value is consumed once, as with then. */
  poll() {
    return this.state;
  }
  /** Observe readiness without consuming the future's value. */
  waitReady(): Promise<void> {
    return this.promise.then(
      () => {},
      () => {},
    );
  }
  cancel(): Promise<void> {
    if (this.cancellation) return this.cancellation;
    try {
      return (this.cancellation = Promise.resolve(this.cancelOperation()));
    } catch (error) {
      return (this.cancellation = Promise.reject(error));
    }
  }
  [Symbol.asyncDispose](): Promise<void> {
    return this.cancel();
  }
}

export type StreamRead<T> =
  | { tag: 'data'; val: ArrayLike<T> }
  | { tag: 'pending' }
  | { tag: 'end' };

/** Owned readable end of a Component Model stream. No implicit iterator or Web Stream. */
export interface Stream<T> extends AsyncDisposable {
  read(maximum: number): Promise<ArrayLike<T> | undefined>;
  tryRead(maximum: number): Promise<StreamRead<T>>;
  ready(): boolean;
  waitReady(): Promise<void>;
  cancel(): Promise<void>;
}
export interface StreamWriter<T> extends AsyncDisposable {
  readonly capacity: number;
  write(values: ArrayLike<T>): Promise<void>;
  waitReady(): Promise<void>;
  drained(): Promise<void>;
  close(): void;
  cancel(): Promise<void>;
}

/** Bounded local channel for Host and ABI conversion; it carries no Core messages. */
export function createStream<T>(capacity = 65536): {
  readable: Stream<T>;
  writable: StreamWriter<T>;
} {
  if (!Number.isSafeInteger(capacity) || capacity <= 0)
    throw new RangeError('Invalid stream capacity');
  const queue: (T[] | Uint8Array)[] = [];
  let buffered = 0,
    ended = false,
    cancelled = false;
  const listeners = new Set<() => void>();
  const wake = () => {
    for (const listener of [...listeners]) listener();
  };
  const wait = (ready: () => boolean) =>
    ready()
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const check = () => {
            if (ready()) {
              listeners.delete(check);
              resolve();
            }
          };
          listeners.add(check);
          check();
        });
  const take = (maximum: number): StreamRead<T> => {
    if (cancelled) return { tag: 'end' };
    const chunk = queue.shift();
    if (!chunk) return { tag: ended ? 'end' : 'pending' };
    const count = Math.min(Math.max(1, maximum), chunk.length);
    const value = chunk.slice(0, count);
    if (count < chunk.length) queue.unshift(chunk.slice(count));
    buffered -= count;
    wake();
    return { tag: 'data', val: value as ArrayLike<T> };
  };
  const cancel = () => {
    cancelled = true;
    ended = true;
    queue.length = 0;
    buffered = 0;
    wake();
    return Promise.resolve();
  };
  const readable: Stream<T> = {
    async read(maximum) {
      for (;;) {
        const result = take(maximum);
        if (result.tag === 'data') return result.val;
        if (result.tag === 'end') return undefined;
        await wait(() => queue.length > 0 || ended || cancelled);
      }
    },
    tryRead: async (maximum) => take(maximum),
    ready: () => queue.length > 0 || ended || cancelled,
    waitReady: () => wait(() => queue.length > 0 || ended || cancelled),
    cancel,
    [Symbol.asyncDispose]: cancel,
  };
  const writable: StreamWriter<T> = {
    get capacity() {
      return cancelled || ended ? 0 : capacity - buffered;
    },
    async write(values) {
      let offset = 0;
      while (offset < values.length) {
        await wait(() => buffered < capacity || ended || cancelled);
        if (ended || cancelled) throw new Error('Stream write end is closed');
        const count = Math.min(capacity - buffered, values.length - offset);
        const chunk =
          values instanceof Uint8Array
            ? values.slice(offset, offset + count)
            : Array.from({ length: count }, (_, index) => values[offset + index]);
        queue.push(chunk);
        buffered += count;
        offset += count;
        wake();
      }
    },
    waitReady: () => wait(() => buffered < capacity || ended || cancelled),
    drained: () => wait(() => buffered === 0 || cancelled),
    close() {
      ended = true;
      wake();
    },
    cancel,
    [Symbol.asyncDispose]() {
      this.close();
      return Promise.resolve();
    },
  };
  return { readable, writable };
}

// Cancellation of an async WIT operation is separate from consuming a future.
const operationCancellations = new WeakMap<PromiseLike<unknown>, () => void | PromiseLike<void>>();
export function cancellable<T>(
  operation: Promise<T>,
  cancel: () => void | PromiseLike<void>,
): Promise<T> {
  operationCancellations.set(operation, cancel);
  const done = () => operationCancellations.delete(operation);
  void operation.then(done, done);
  return operation;
}
export function cancelAsync(operation: PromiseLike<unknown>): Promise<void> {
  return Promise.resolve(operationCancellations.get(operation)?.());
}
