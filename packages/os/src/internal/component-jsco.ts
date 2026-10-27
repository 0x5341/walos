import { createComponent } from '@pavelsavara/jsco';
import { jscoImports } from './jsco-host.js';
import { wasiCommandVersion, type WasiComponentVersion, type ComponentMetrics } from './component.js';

// Parse once, select the Host adapter from the actual command world, then
// instantiate. A component's Wasm header alone cannot distinguish P2 from P3.
export async function loadJsco(
  bytes: Uint8Array,
  createImports: (
    version: WasiComponentVersion,
    required: string[],
  ) => Promise<Record<string, unknown>>,
  metrics?: ComponentMetrics,
) {
  const start = performance.now();
  const prepared = await createComponent(bytes, { noJspi: false, validateTypes: true });
  if (metrics) metrics.prepareMs = performance.now() - start;
  const exported = prepared.exports();
  const version = wasiCommandVersion(exported);
  const runName = exported.find((name) =>
    /^wasi:cli\/run@0\.[23]\.[^/]+$/.test(name),
  )!;
  const required = prepared.imports();
  const providers = await createImports(version, required);
  const instantiateStart = performance.now();
  try {
    // Existing P2 resources need method/result lowering; the P3 host already
    // exposes the canonical native-async bindings supplied by jsco.
    const bound = version === 'p2' ? jscoImports(providers, required) : providers;
    const instance = await prepared.instantiate(
      bound as NonNullable<Parameters<typeof prepared.instantiate>[0]>,
    );
    const run = instance.exports[runName]?.run;
    if (typeof run !== 'function') throw new Error('Missing jsco ' + runName + ' export');
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
