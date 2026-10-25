import { hostRevision, openArtifactCache, type PublicationMetrics } from './component-cache.js';
import type { ComponentEngine } from './component-engine.js';
import { jcoEngine } from './component-jco.js';
export { clearComponentCache } from './component-cache.js';

/** Opt-in diagnostics; cacheless engines leave key/lookup/publication spans absent. */
export interface ComponentMetrics extends PublicationMetrics {
  cache?: 'opfs' | 'miss' | 'disabled';
  keyMs?: number;
  lookupMs?: number;
  converterLoadMs?: number;
  convertMs?: number;
  instantiateMs?: number;
}
export function executableFormat(bytes: Uint8Array): 'p1' | 'p2' {
  if (bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109)
    throw new Error('Expected a WebAssembly executable');
  if (bytes[4] === 1 && bytes[5] === 0 && bytes[6] === 0 && bytes[7] === 0) return 'p1';
  if (bytes[4] === 13 && bytes[5] === 0 && bytes[6] === 1 && bytes[7] === 0) return 'p2';
  throw new Error('Unsupported WebAssembly binary version');
}

/** No retained conversion map. Each load reads OPFS or prepares a fresh result. */
export function loadComponent(
  bytes: Uint8Array,
  imports: Record<string, unknown>,
  metrics?: ComponentMetrics,
) {
  return loadComponentWithEngine(bytes, imports, jcoEngine, metrics);
}

export async function loadComponentWithEngine<T>(
  bytes: Uint8Array,
  imports: Record<string, unknown>,
  engine: ComponentEngine<T>,
  metrics?: ComponentMetrics,
) {
  let result: T | undefined;
  let persist: () => Promise<PublicationMetrics> = async () => ({});
  if (engine.cache) {
    const keyStart = performance.now();
    const cache = await openArtifactCache(bytes, {
      engine: engine.id,
      version: engine.version,
      options: engine.options,
      hostRevision,
    });
    const lookupStart = performance.now();
    if (metrics) metrics.keyMs = lookupStart - keyStart;
    const artifact = await cache.read();
    if (artifact) {
      try {
        result = engine.cache.restore(artifact);
      } catch {
        /* Engine format changed/corrupt. */
      }
    }
    if (metrics) {
      metrics.lookupMs = performance.now() - lookupStart;
      metrics.cache = result === undefined ? 'miss' : 'opfs';
    }
    if (result === undefined) {
      result = await engine.prepare(bytes, metrics);
      if (metrics) metrics.publishStatus = 'pending';
      const prepared = result;
      const codec = engine.cache;
      let publication: Promise<PublicationMetrics> | undefined;
      // The Process Worker starts this after READY and joins it before EXIT.
      persist = () => (publication ??= cache.publish(() => codec.encode(prepared)));
    }
  } else {
    if (metrics) metrics.cache = 'disabled';
    result = await engine.prepare(bytes, metrics);
  }
  const instantiateStart = performance.now();
  try {
    return {
      component: await engine.instantiate(result, imports),
      persist: async () => {
        if (metrics) Object.assign(metrics, await persist());
        else await persist();
      },
    };
  } finally {
    if (metrics) metrics.instantiateMs = performance.now() - instantiateStart;
  }
}
