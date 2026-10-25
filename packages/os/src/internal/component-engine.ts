import type { Artifact, Json } from './component-cache.js';
import type { ComponentMetrics } from './component.js';

export interface ComponentInstance {
  run: { run: () => Promise<unknown> };
}
/** An engine opts into persistence only when it has reusable artifacts. */
export interface ComponentEngine<T> {
  id: string;
  version: string;
  options: Json;
  cache: {
    encode: (prepared: T) => Artifact;
    restore: (artifact: Artifact) => T;
  } | null;
  prepare: (bytes: Uint8Array, metrics?: ComponentMetrics) => Promise<T>;
  instantiate: (prepared: T, imports: Record<string, unknown>) => Promise<ComponentInstance>;
}
