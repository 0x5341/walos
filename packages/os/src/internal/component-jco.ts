import { componentOptions, converterVersion } from './component-options.js';
import type { Converted } from './jco.js';
import type { ComponentEngine } from './component-engine.js';

const decoder = new TextDecoder();
export const jcoEngine: ComponentEngine<Converted> = {
  id: 'jco',
  version: converterVersion,
  options: componentOptions,
  cache: {
    encode: ({ files, imports, exports }) => ({ files, metadata: { imports, exports } }),
    restore: ({ files, metadata }) => {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
        throw new Error('Invalid Jco metadata');
      const { imports, exports } = metadata;
      if (
        !Array.isArray(imports) ||
        imports.some((name) => typeof name !== 'string') ||
        !Array.isArray(exports) ||
        exports.some(
          (entry) =>
            !Array.isArray(entry) || entry.length !== 2 || entry.some((v) => typeof v !== 'string'),
        ) ||
        !files.some(([name]) => name === 'command.js') ||
        files.some(([name]) => !/^command(?:\.core\d*)?\.(?:js|wasm)$/.test(name))
      )
        throw new Error('Invalid Jco artifacts');
      return { files, imports: imports as string[], exports: exports as [string, string][] };
    },
  },
  async prepare(bytes, metrics) {
    const loadStart = performance.now();
    const { convert } = await import('./jco.js');
    const convertStart = performance.now();
    if (metrics) metrics.converterLoadMs = convertStart - loadStart;
    const result = await convert(bytes, componentOptions);
    if (metrics) metrics.convertMs = performance.now() - convertStart;
    return result;
  },
  async instantiate(result, imports) {
    for (const name of result.imports)
      if (!(name in imports)) throw new Error(`Unsupported component import: ${name}`);
    const files = new Map(result.files);
    const glue = files.get('command.js');
    if (!glue) throw new Error('Jco did not generate command.js');
    const url = URL.createObjectURL(new Blob([decoder.decode(glue)], { type: 'text/javascript' }));
    try {
      const { instantiate } = await import(/* @vite-ignore */ url);
      return await instantiate((name: string) => {
        const core = files.get(name);
        if (!core || !name.endsWith('.wasm')) throw new Error(`Missing component module: ${name}`);
        return WebAssembly.compile(core as Uint8Array<ArrayBuffer>);
      }, imports);
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};
