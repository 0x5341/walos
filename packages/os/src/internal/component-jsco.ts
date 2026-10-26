import { createComponent } from '@pavelsavara/jsco';
import { jscoImports } from './jsco-host.js';
import type { ComponentMetrics } from './component.js';
export async function loadJsco(
  bytes: Uint8Array,
  imports: Record<string, unknown>,
  metrics?: ComponentMetrics,
) {
  const start = performance.now();
  const prepared = await createComponent(bytes, { noJspi: false, validateTypes: true });
  if (metrics) metrics.prepareMs = performance.now() - start;
  const instantiateStart = performance.now();
  try {
    const instance = await prepared.instantiate(jscoImports(imports, prepared.imports()));
    const run = Object.entries(instance.exports).find(([name]) =>
      /^wasi:cli\/run@0\.2\.\d+$/.test(name),
    )?.[1]?.run;
    if (typeof run !== 'function') throw new Error('Missing jsco wasi:cli/run export');
    return {
      run: {
        run: async () => {
          const result = await run();
          if (result?.tag === 'err')
            throw Object.assign(new Error('Command failed'), { payload: undefined });
          if (result?.tag !== 'ok') throw new Error('Invalid jsco command result');
        },
      },
    };
  } finally {
    if (metrics) metrics.instantiateMs = performance.now() - instantiateStart;
  }
}
