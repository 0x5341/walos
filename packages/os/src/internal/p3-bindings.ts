import { Future, cancelAsync, type Stream } from '../async.js';
import type { ProcessContext } from '../types.js';
import type { PendingDrops } from './runtime.js';
import { apiShape } from './wasi-shape.js';

const camel = (name: string) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** Native canonical ABI conversion only. No service implementation lives here. */
export function nativeImports(
  context: ProcessContext,
  required: string[],
  drops: PendingDrops,
  guard: () => void,
  fault: (error: unknown) => void,
) {
  const live = new Set<AsyncDisposable>();
  let closing = false;
  const track = <T extends AsyncDisposable>(value: T): T => {
    if (closing) drop(value);
    else live.add(value);
    return value;
  };
  const drop = (value: AsyncDisposable) => {
    live.delete(value);
    try {
      drops.add(value[Symbol.asyncDispose]());
    } catch (error) {
      drops.add(Promise.reject(error));
    }
  };
  const lift = (value: any): any => {
    if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return value;
    if (value instanceof Future || value instanceof Promise) {
      // A Future is consumed once; readiness and cancellation are separate.
      let cancelled = false;
      const promise = Promise.resolve(value).then(lift, (error) => {
        if (!cancelled) fault(error);
        throw error;
      });
      const owned =
        value instanceof Future
          ? value
          : {
              async [Symbol.asyncDispose]() {
                await cancelAsync(value);
                await promise.catch(() => {});
              },
            };
      track(owned);
      const done = () => {
        live.delete(owned);
      };
      void promise.then(done, done);
      return Object.assign(promise, {
        cancel: () => {
          cancelled = true;
          drop(owned);
        },
      });
    }
    if (typeof value.read === 'function' && typeof value.cancel === 'function') {
      const stream = track(value as Stream<any>);
      const iterator: AsyncIterableIterator<any> = {
        [Symbol.asyncIterator]() {
          return this;
        },
        next: async () => ({ done: true, value: undefined }),
        async return() {
          drop(stream);
          return { done: true, value: undefined };
        },
      };
      // Non-byte streams must not lose the rest of a batch.
      let rest: any[] = [];
      iterator.next = async () => {
        try {
          if (rest.length) return { done: false, value: lift(rest.shift()) };
          guard();
          const chunk = await stream.read(16384);
          if (chunk === undefined) {
            live.delete(stream);
            return { done: true, value: undefined };
          }
          if (chunk instanceof Uint8Array) return { done: false, value: chunk };
          rest = Array.from(chunk);
          return { done: false, value: lift(rest.shift()) };
        } catch (error) {
          fault(error);
          throw error;
        }
      };
      return Object.assign(iterator, { onReadableDrop: () => drop(stream) });
    }
    if (typeof value[Symbol.asyncDispose] === 'function') {
      track(value);
      if (!Object.hasOwn(value, 'drop'))
        Object.defineProperty(value, 'drop', { value: () => drop(value), configurable: true });
      return value;
    }
    if (Array.isArray(value)) return value.map(lift);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, lift(v)]));
  };
  const lower = (value: any): any => {
    if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return value;
    if (typeof value[Symbol.asyncIterator] === 'function') {
      const iterator = value[Symbol.asyncIterator]();
      let closed = false;
      let ended = false,
        pending: Promise<void> | undefined,
        chunk: any[] | Uint8Array | undefined;
      const fetch = () =>
        (pending ??= Promise.resolve(iterator.next())
          .then((result: IteratorResult<any>) => {
            if (closed) return;
            ended = !!result.done;
            if (!ended) chunk = result.value instanceof Uint8Array ? result.value : [result.value];
          })
          .finally(() => {
            pending = undefined;
          }));
      const cancel = async () => {
        closed = ended = true;
        chunk = undefined;
        live.delete(stream);
        // Explicit .return interrupts a blocked canonical read (an async generator cannot).
        await iterator.return?.();
      };
      const stream: Stream<any> = {
        async read(maximum) {
          while (!chunk && !ended) await fetch();
          if (!chunk) {
            live.delete(stream);
            return undefined;
          }
          const out = chunk.slice(0, maximum);
          chunk = out.length === chunk.length ? undefined : chunk.slice(out.length);
          return out;
        },
        async tryRead(maximum) {
          if (chunk) return { tag: 'data', val: (await stream.read(maximum))! };
          if (ended) return { tag: 'end' };
          void fetch().catch(() => {});
          return { tag: 'pending' };
        },
        ready: () => !!chunk || ended,
        waitReady: () => (chunk || ended ? Promise.resolve() : fetch()),
        cancel,
        [Symbol.asyncDispose]: cancel,
      };
      return track(stream);
    }
    if (typeof value.then === 'function')
      return track(new Future(Promise.resolve(value), () => value.cancel?.()));
    // Canonical resource identity must survive borrow and own argument lowering.
    if (typeof value[Symbol.asyncDispose] === 'function' || typeof value.drop === 'function')
      return value;
    if (Array.isArray(value)) return value.map(lower);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, lower(v)]));
  };
  const imports: Record<string, any> = {};
  for (const versioned of required) {
    const shape = apiShape.find((s) => `${s.package}/${s.interface}@0.3.2` === versioned);
    if (!shape) throw new Error(`Unsupported P3 interface: ${versioned}`);
    const provider =
      shape.package === 'walos:runtime'
        ? (context.walos as any)[camel(shape.interface)]
        : (context.wasi as any)[shape.package.split(':')[1]][camel(shape.interface)];
    const iface: Record<string, Function> = {};
    for (const op of shape.operations) {
      const resource = camel(op.wit.replace(/^\[[^\]]+\]/, '').split('.')[0]);
      iface[op.wit] = (...args: any[]) => {
        try {
          guard();
          args = args.map(lower);
          const kind = op.kind;
          const value =
            typeof kind === 'object' && ('method' in kind || 'async-method' in kind)
              ? args[0][op.ts](...args.slice(1))
              : typeof kind === 'object'
                ? provider[resource][op.ts](...args)
                : provider[op.ts](...args);
          return lift(value);
        } catch (error) {
          fault(error);
          throw error;
        }
      };
    }
    imports[versioned] = iface;
  }
  return {
    imports,
    dispose() {
      closing = true;
      for (const value of [...live]) drop(value);
    },
  };
}
