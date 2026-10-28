import { ServiceError } from '../types.js';
import type { Environment, RandomService } from './service-model.js';
import { Pollable } from './p2-io.js';

export const environment = (values: Readonly<Record<string, string>>): Environment => {
  const entries = Object.freeze(
    Object.entries(values).map(([key, value]) => Object.freeze({ key, value })),
  );
  const map = new Map(entries.map(({ key, value }) => [key, value]));
  return Object.freeze({
    get: (key: string) => map.get(key),
    has: (key: string) => map.has(key),
    entries: () => entries,
  });
};
export const monotonicNow = () => BigInt(Math.floor(performance.now() * 1e6));
export const wallClock = Object.freeze({
  now: () => {
    const ms = Date.now();
    return { seconds: BigInt(Math.floor(ms / 1000)), nanoseconds: (ms % 1000) * 1000000 };
  },
  resolution: () => ({ seconds: 0n, nanoseconds: 1000000 }),
});
export const timer = (instant: bigint) =>
  new Pollable(
    () => monotonicNow() >= instant,
    (wake) => {
      let id: ReturnType<typeof setTimeout>;
      const schedule = () => {
        id = setTimeout(
          () => {
            if (monotonicNow() >= instant) wake();
            else schedule();
          },
          Math.min(2147483647, Math.max(0, Number((instant - monotonicNow()) / 1000000n) + 1)),
        );
      };
      schedule();
      return () => clearTimeout(id);
    },
  );
export const monotonicClock = Object.freeze({
  now: monotonicNow,
  resolution: () => 1000000n,
  subscribeInstant: timer,
  subscribeDuration: (duration: bigint) => {
    if (duration < 0n) throw new ServiceError('invalid', 'Negative timer duration');
    return timer(monotonicNow() + duration);
  },
});
export const randomLength = (length: bigint) => {
  if (length < 0n || length > 16777216n)
    throw new ServiceError('invalid', 'Random length must be between 0 and 16777216 bytes');
  return Number(length);
};
export const createRandom = (): RandomService => {
  // Insecure state is deliberately independent of Web Crypto and never used for secure random.
  let state = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const getRandomBytes = (length: bigint) => {
    const bytes = new Uint8Array(randomLength(length));
    try {
      for (let i = 0; i < bytes.length; i += 65536)
        crypto.getRandomValues(bytes.subarray(i, i + 65536));
    } catch (cause) {
      throw new ServiceError('io', 'Secure random failed', { cause });
    }
    return bytes;
  };
  const getInsecureRandomU64 = () => (BigInt(next()) << 32n) | BigInt(next());
  return Object.freeze({
    getRandomBytes,
    getRandomU64: () => new DataView(getRandomBytes(8n).buffer).getBigUint64(0, true),
    getInsecureRandomBytes: (length: bigint) => {
      const bytes = new Uint8Array(randomLength(length));
      for (let i = 0; i < bytes.length; i += 4) {
        const value = next();
        for (let j = 0; j < 4 && i + j < bytes.length; j++) bytes[i + j] = value >>> (j * 8);
      }
      return bytes;
    },
    getInsecureRandomU64,
    insecureSeed: () => [getInsecureRandomU64(), getInsecureRandomU64()] as const,
  });
};
