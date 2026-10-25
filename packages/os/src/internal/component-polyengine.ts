import {
  artifactsFromEnvelope,
  instantiate,
  requiredImports,
  type ComponentArtifacts,
} from '@polyengine/runtime/embedder';
import { defaultTranslator } from '@polyengine/translator';
import { ComponentException, isComponentException, suspending } from '@polyengine/protocol';
import type { ComponentEngine } from './component-engine.js';
import { polyengineImports } from './engine-host.js';

const encoder = new TextEncoder(),
  decoder = new TextDecoder();
interface Prepared {
  bytes: Uint8Array;
  envelope: string;
  artifacts: ComponentArtifacts;
}
export const polyengine: ComponentEngine<Prepared> = {
  id: 'polyengine',
  version: '0.6.7/walos-1',
  options: { jspi: true },
  cache: {
    encode: ({ envelope }) => ({
      files: [['plan/envelope.json', encoder.encode(envelope)]],
      metadata: null,
    }),
    restore: ({ files }, bytes) => restorePolyengine(files, bytes),
  },
  async prepare(bytes, metrics) {
    const start = performance.now();
    const translator = await defaultTranslator();
    if (metrics) metrics.engineLoadMs = (metrics.engineLoadMs ?? 0) + performance.now() - start;
    const transform = performance.now();
    const result = translator.translate(bytes);
    if (metrics) metrics.transformMs = performance.now() - transform;
    return {
      bytes,
      envelope: result.envelopeJson,
      artifacts: { ...result, componentBytes: bytes },
    };
  },
  async instantiate(prepared, imports) {
    // A host-driven WASI exit is a process control signal, not a WIT err.
    // Polyengine wraps unbranded host throws as traps; retain the original signal.
    let exitSignal: unknown;
    const cliExit = imports['wasi:cli/exit'] as { exit: (...args: unknown[]) => never };
    const providers = polyengineImports(
      {
        ...imports,
        'wasi:cli/exit': {
          exit: (...args: unknown[]) => {
            try {
              return cliExit.exit(...args);
            } catch (error) {
              exitSignal = error;
              throw error;
            }
          },
        },
      },
      suspending,
      ComponentException,
    );
    for (const leaf of requiredImports(prepared.artifacts)) {
      const base = leaf.interfaceId.split('@')[0];
      const version = `${base}@${base.startsWith('walos:') ? '0.1.0' : '0.2.0'}`;
      if (providers[version]) providers[leaf.interfaceId] = providers[version];
      else {
        if (!base.startsWith('wasi:sockets/'))
          throw new Error(`Unsupported component import: ${leaf.interfaceId}`);
        const provider = (providers[leaf.interfaceId] ??= {});
        const trap = () => {
          throw new Error(`Unsupported host import: ${leaf.interfaceId}/${leaf.leaf}`);
        };
        if (leaf.kind === 'resource' || leaf.jsClass) {
          const name = leaf.jsClass ?? leaf.jsName;
          const cls = (provider[name] ??= class {
            constructor() {
              trap();
            }
          });
          if (leaf.member.form === 'method') cls.prototype[leaf.jsName] = trap;
          else if (leaf.member.form === 'static') cls[leaf.jsName] = trap;
        } else provider[leaf.jsName] = trap;
      }
    }
    const instance = await instantiate(prepared.artifacts, providers, { jspi: true });
    const run = Object.entries(instance.exports).find(([name]) =>
      /^wasi:cli\/run@0\.2\.\d+$/.test(name),
    )?.[1]?.run;
    if (typeof run !== 'function') throw new Error('Missing polyengine wasi:cli/run export');
    return {
      run: {
        run: async () => {
          try {
            await run();
          } catch (error) {
            if (exitSignal !== undefined) throw exitSignal;
            if (isComponentException(error) && error.payload === undefined)
              throw Object.assign(new Error('Command failed'), { payload: undefined });
            throw error;
          }
        },
      },
    };
  },
};
// Restore needs the original component, which deliberately is not duplicated in OPFS.
export function restorePolyengine(files: [string, Uint8Array][], bytes: Uint8Array): Prepared {
  if (files.length !== 1 || files[0][0] !== 'plan/envelope.json')
    throw new Error('Invalid polyengine artifacts');
  const envelope = decoder.decode(files[0][1]);
  return { bytes, envelope, artifacts: artifactsFromEnvelope(envelope, bytes) };
}
