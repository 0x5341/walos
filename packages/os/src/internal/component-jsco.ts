import { createComponent } from '@pavelsavara/jsco';
import type { ComponentEngine } from './component-engine.js';
import { jscoImports } from './engine-host.js';

type Prepared = Awaited<ReturnType<typeof createComponent>>;
export const jsco: ComponentEngine<Prepared> = {
  id: 'jsco',
  version: '0.2.0-preview.0/walos-1',
  options: { noJspi: false, validateTypes: true },
  // jsco parses/compiles directly; it has no serializable conversion artifact.
  cache: null,
  async prepare(bytes, metrics) {
    const start = performance.now();
    const result = await createComponent(bytes, { noJspi: false, validateTypes: true });
    if (metrics) metrics.prepareMs = performance.now() - start;
    return result;
  },
  async instantiate(prepared, imports) {
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
  },
};
