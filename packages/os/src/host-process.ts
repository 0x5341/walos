import type { ProcessContext } from './types.js';
import {
  createAbiView,
  type AbiDescriptor,
  type AbiInput,
  type AbiOutput,
  type AbiChild,
} from './internal/abi-view.js';
import { createStream, type Future, type Stream } from './async.js';

export type HostDescriptor = AbiDescriptor;
export type HostInput = AbiInput;
export type HostOutput = AbiOutput;
export type HostChildProcess = AbiChild;

/** Explicit convenience wrapper. It borrows Context and owns only its created views. */
export class HostProcessContext implements AsyncDisposable {
  private resources = new Set<AsyncDisposable>();
  private pending = new Set<Promise<unknown>>();
  private closing = false;
  private disposal?: Promise<void>;
  readonly pid: number;
  readonly ppid: number | null;
  readonly args: ReturnType<typeof createAbiView>['args'];
  readonly env: ReturnType<typeof createAbiView>['env'];
  readonly fs: ReturnType<typeof createAbiView>['fs'];
  readonly io: ReturnType<typeof createAbiView>['io'];
  readonly process: ReturnType<typeof createAbiView>['process'];
  readonly clock: ReturnType<typeof createAbiView>['clock'];
  readonly random: ReturnType<typeof createAbiView>['random'];
  constructor(readonly context: ProcessContext) {
    const view = createAbiView(context, (value) => this.own(value));
    this.pid = view.pid;
    this.ppid = view.ppid;
    this.args = view.args;
    this.env = view.env;
    this.fs = this.methods(view.fs);
    this.io = this.methods(view.io);
    this.process = this.methods(view.process);
    this.clock = view.clock;
    this.random = view.random;
  }
  private track<T>(value: Promise<T>): Promise<T> {
    this.pending.add(value);
    const done = () => this.pending.delete(value);
    void value.then(done, done);
    return value;
  }
  private methods<T extends object>(value: T): T {
    const result = Object.create(Object.getPrototypeOf(value));
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptor of Object.values(descriptors))
      if (typeof descriptor.value === 'function') {
        const fn = descriptor.value;
        descriptor.value = (...args: unknown[]) => {
          const result = fn.apply(value, args);
          return result instanceof Promise ? this.track(result) : result;
        };
      }
    Object.defineProperties(result, descriptors);
    return Object.freeze(result);
  }
  private own<T extends AsyncDisposable>(value: T): T {
    this.resources.add(value);
    const dispose = value[Symbol.asyncDispose].bind(value);
    let completion: Promise<void> | undefined;
    Object.defineProperty(value, Symbol.asyncDispose, {
      configurable: true,
      value: () =>
        (completion ??= Promise.resolve(dispose()).finally(() => this.resources.delete(value))),
    });
    // Track operations started through this wrapper, including late-created resources.
    const names = new Set<string>();
    for (
      let proto = Object.getPrototypeOf(value);
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)
    )
      for (const key of Object.getOwnPropertyNames(proto)) names.add(key);
    for (const key of names) {
      if (key === 'constructor' || key === 'wait') continue;
      let descriptor: PropertyDescriptor | undefined;
      for (
        let proto = Object.getPrototypeOf(value);
        proto && !descriptor;
        proto = Object.getPrototypeOf(proto)
      )
        descriptor = Object.getOwnPropertyDescriptor(proto, key);
      const fn = descriptor?.value;
      if (typeof fn !== 'function') continue;
      Object.defineProperty(value, key, {
        configurable: true,
        value: (...args: unknown[]) => {
          const result = fn.apply(value, args);
          if (key === 'moved') this.resources.delete(value);
          return result instanceof Promise ? this.track(result) : result;
        },
      });
    }
    if (this.closing)
      queueMicrotask(() => {
        void value[Symbol.asyncDispose]();
      });
    return value;
  }
  toPromise<T>(future: Future<T>): Promise<T> {
    return Promise.resolve(future);
  }
  createStream<T>(capacity?: number) {
    const stream = createStream<T>(capacity);
    this.own(stream.readable);
    this.own(stream.writable);
    return stream;
  }
  toReadableStream(stream: Stream<number>): ReadableStream<Uint8Array> {
    return new ReadableStream({
      async pull(controller) {
        const values = await stream.read(65536);
        if (values === undefined) controller.close();
        else controller.enqueue(Uint8Array.from(values));
      },
      cancel: () => stream.cancel(),
    });
  }
  [Symbol.asyncDispose](): Promise<void> {
    return (this.disposal ??= this.close());
  }
  private async close() {
    this.closing = true;
    const results: PromiseSettledResult<unknown>[] = [];
    do {
      results.push(
        ...(await Promise.allSettled(
          [...this.resources].map((value) => value[Symbol.asyncDispose]()),
        )),
      );
      await Promise.allSettled(this.pending);
    } while (this.resources.size || this.pending.size);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
}
