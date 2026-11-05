import type { Stream } from '@walos/os';
/** Pull at most one bounded remote chunk. Cancelling also reclaims prefetched items. */
export function remoteStream<T>(
  read: (maximum: number) => Promise<ArrayLike<T> | undefined>,
  stop: () => Promise<void>,
  failed: (error: unknown) => void = () => {},
  drop: (values: readonly T[]) => Promise<void> = async () => {},
): Stream<T> {
  let chunk: T[] | undefined;
  let ended = false;
  let pending: Promise<void> | undefined;
  let disposal: Promise<void> | undefined;
  const pull = () =>
    (pending ??= (async () => {
      try {
        const values = await read(65536);
        if (ended) {
          if (values) await drop(Array.from(values));
          return;
        }
        if (values === undefined) ended = true;
        else chunk = Array.from(values);
      } catch (error) {
        ended = true;
        failed(error);
      } finally {
        pending = undefined;
      }
    })());
  const cancel = () =>
    (disposal ??= (async () => {
      if (ended && !chunk) return;
      ended = true;
      const queued = chunk;
      chunk = undefined;
      await Promise.allSettled([stop(), queued ? drop(queued) : Promise.resolve()]);
    })());
  const stream: Stream<T> = {
    async read(maximum) {
      if (!Number.isSafeInteger(maximum) || maximum < 1)
        throw new RangeError('Invalid stream read credit');
      while (!chunk?.length && !ended) await pull();
      if (!chunk?.length) return undefined;
      const values = chunk.slice(0, maximum);
      chunk = chunk.length === values.length ? undefined : chunk.slice(values.length);
      return values;
    },
    async tryRead(maximum) {
      if (chunk?.length) return { tag: 'data', val: (await stream.read(maximum))! };
      if (ended) return { tag: 'end' };
      void pull();
      return { tag: 'pending' };
    },
    ready: () => !!chunk?.length || ended,
    waitReady: async () => {
      if (!chunk?.length && !ended) await pull();
    },
    cancel,
    [Symbol.asyncDispose]: cancel,
  };
  return stream;
}
