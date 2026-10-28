import { ServiceError } from '../types.js';

export function errno(error: unknown): number {
  if (error instanceof ServiceError)
    return (
      (
        {
          access: 2,
          'invalid-resource': 8,
          'already-consumed': 8,
          busy: 10,
          exist: 20,
          invalid: 28,
          io: 29,
          'is-directory': 31,
          'no-entry': 44,
          quota: 51,
          unsupported: 52,
          'not-directory': 54,
          'not-empty': 55,
          'broken-pipe': 64,
          'not-permitted': 76,
          overflow: 61,
        } as Record<string, number>
      )[error.code] ?? 29
    );
  if (error && typeof error === 'object' && 'errno' in error) return Number(error.errno);
  return 29;
}
