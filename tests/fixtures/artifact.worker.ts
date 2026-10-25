import {
  loadComponentWithEngine,
  type ComponentMetrics,
} from '../../packages/os/dist/internal/component.js';
import { clearComponentCache } from '../../packages/os/dist/internal/component-cache.js';
import type { ComponentEngine } from '../../packages/os/dist/internal/component-engine.js';

self.onmessage = async ({ data }) => {
  try {
    if (data.clear) await clearComponentCache();
    let prepares = 0;
    let storageCalls = 0;
    let hashCalls = 0;
    const engine: ComponentEngine<string> = {
      id: data.engine || 'fixture',
      version: data.version || '1',
      options: data.options || { mode: 'native' },
      cache: data.cacheless
        ? null
        : {
            encode: (text) => ({
              files: [['native/runtime.cwasm', new TextEncoder().encode(text)]],
              metadata: { entry: 'native/runtime.cwasm', abi: 7 },
            }),
            restore: ({ files, metadata }) => {
              if (
                !metadata ||
                Array.isArray(metadata) ||
                typeof metadata !== 'object' ||
                metadata.abi !== 7
              )
                throw new Error('Invalid fixture metadata');
              return new TextDecoder().decode(files.find(([name]) => name === metadata.entry)![1]);
            },
          },
      async prepare(bytes) {
        prepares++;
        return `prepared:${bytes.join(',')}`;
      },
      async instantiate(text) {
        return { run: { run: async () => text } };
      },
    };
    if (data.cacheless) {
      navigator.storage.getDirectory = async () => {
        storageCalls++;
        throw new Error('Unexpected cache I/O');
      };
      crypto.subtle.digest = async () => {
        hashCalls++;
        throw new Error('Unexpected cache hashing');
      };
    }
    const results = [];
    for (let i = 0; i < (data.loads || 1); i++) {
      const metrics: ComponentMetrics = {};
      const loaded = await loadComponentWithEngine(
        new Uint8Array(data.bytes || [1, 2]),
        {},
        engine,
        metrics,
      );
      const output = await loaded.component.run.run();
      if (!data.noPersist) await Promise.all([loaded.persist(), loaded.persist()]);
      results.push({ metrics, output });
    }
    self.postMessage({ ok: true, prepares, storageCalls, hashCalls, results });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) });
  }
};
