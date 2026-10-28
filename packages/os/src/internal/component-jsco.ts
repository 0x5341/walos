import { createComponent } from '@pavelsavara/jsco';
import { jscoImports } from './jsco-host.js';
import type { ComponentMetrics } from './component.js';
import { apiShape } from './wasi-shape.js';
import { nativeImports } from './p3-bindings.js';
import type { ProcessContext } from '../types.js';
import type { PendingDrops } from './runtime.js';

// A component header only distinguishes the container. The actual world decides
// the adapter; unknown or mixed generations must never fall back to Preview 2.
export async function prepareJsco(bytes: Uint8Array, metrics?: ComponentMetrics) {
  const start = performance.now();
  const component = await createComponent(bytes, { noJspi: false, validateTypes: true });
  if (metrics) metrics.prepareMs = performance.now() - start;
  const exports = component.exports();
  if (exports.length !== 1) throw new Error(`Unsupported CLI world exports: ${exports.join(', ')}`);
  const entry = exports[0];
  const format = /^wasi:cli\/run@0\.2\.\d+$/.test(entry)
    ? 'p2'
    : entry === 'wasi:cli/run@0.3.2'
      ? 'p3'
      : undefined;
  if (!format) throw new Error(`Unsupported CLI entrypoint/version: ${entry}`);
  const known = new Set(
    apiShape
      .filter((s) => !(s.package === 'wasi:cli' && s.interface === 'run'))
      .map((s) => `${s.package}/${s.interface}@0.3.2`),
  );
  for (const name of component.imports()) {
    if (
      format === 'p3'
        ? !known.has(name)
        : !(
            /^wasi:[\w-]+\/[\w-]+@0\.2\.\d+$/.test(name) ||
            /^walos:runtime-p2\/(process|ipc)@0\.3\.2$/.test(name)
          )
    )
      throw new Error(`Unsupported or mixed ${format} component import: ${name}`);
  }
  return { component, format, entry } as const;
}
export async function loadJsco(
  bytes: Uint8Array,
  imports: Record<string, unknown>,
  metrics?: ComponentMetrics,
  prepared?: Awaited<ReturnType<typeof prepareJsco>>,
) {
  prepared ??= await prepareJsco(bytes, metrics);
  if (prepared.format !== 'p2') throw new Error('Expected a Preview 2 CLI component');
  const instantiateStart = performance.now();
  try {
    const instance = await prepared.component.instantiate(
      jscoImports(imports, prepared.component.imports()),
    );
    const run = Object.entries(instance.exports).find(([name]) =>
      /^wasi:cli\/run@0\.2\.\d+$/.test(name),
    )?.[1]?.run;
    if (typeof run !== 'function') {
      instance.dispose();
      throw new Error('Missing jsco wasi:cli/run export');
    }
    return {
      dispose: () => instance.dispose(),
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

export async function loadP3(
  prepared: Awaited<ReturnType<typeof prepareJsco>>,
  context: ProcessContext,
  drops: PendingDrops,
  guard: () => void,
  fault: (error: unknown) => void,
  metrics?: ComponentMetrics,
) {
  if (prepared.format !== 'p3') throw new Error('Expected a WASI 0.3.2 CLI component');
  const start = performance.now();
  const bindings = nativeImports(context, prepared.component.imports(), drops, guard, fault);
  let instance;
  try {
    instance = await prepared.component.instantiate(bindings.imports);
  } catch (error) {
    bindings.dispose();
    throw error;
  }
  if (metrics) metrics.instantiateMs = performance.now() - start;
  const run = instance.exports[prepared.entry]?.run;
  if (typeof run !== 'function') {
    try {
      instance.dispose();
    } finally {
      bindings.dispose();
    }
    throw new Error('Missing native async CLI run');
  }
  return {
    run,
    requestStop: () => instance.abort(),
    dispose: () => {
      try {
        instance.dispose();
      } finally {
        bindings.dispose();
      }
    },
  };
}
