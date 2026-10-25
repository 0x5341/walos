import type { ComponentEngine } from './component-engine.js';
import { jcoEngine } from './component-jco.js';
import type { ComponentMetrics } from './component.js';

export type EngineId = 'jco' | 'polyengine' | 'jsco';
export const engineVersions = { jco: '1.15.1', polyengine: '0.6.7', jsco: '0.2.0-preview.0' };
declare const __WALOS_COMPONENT_ENGINE__: string | undefined;
export function defaultEngine(): EngineId {
  const id = typeof __WALOS_COMPONENT_ENGINE__ === 'undefined' ? 'jco' : __WALOS_COMPONENT_ENGINE__;
  if (id !== 'jco' && id !== 'polyengine' && id !== 'jsco')
    throw new Error(`Unknown engine: ${id}`);
  return id;
}
export async function selectEngine(
  id: EngineId,
  metrics?: ComponentMetrics,
): Promise<ComponentEngine<any>> {
  if (id === 'jco') return jcoEngine;
  const start = performance.now();
  const engine =
    id === 'polyengine'
      ? (await import('./component-polyengine.js')).polyengine
      : id === 'jsco'
        ? (await import('./component-jsco.js')).jsco
        : undefined;
  if (!engine) throw new Error(`Unknown engine: ${id}`);
  if (metrics) metrics.engineLoadMs = performance.now() - start;
  return engine;
}
