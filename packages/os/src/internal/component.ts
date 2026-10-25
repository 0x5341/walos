import { componentOptions, converterVersion } from './component-options.js';
import type { Converted } from './jco.js';

const cacheDirectory = '.walos-components';
interface PreparedComponent {
  result: Converted;
  persist: () => Promise<PublicationMetrics>;
}
const memory = new Map<string, Promise<PreparedComponent>>();
const encoder = new TextEncoder();
const decoder = new TextDecoder();
/** Opt-in diagnostics for the benchmark harness; all durations are milliseconds. */
export interface ComponentMetrics {
  cache?: 'memory' | 'opfs' | 'miss';
  keyMs?: number;
  lookupMs?: number;
  converterLoadMs?: number;
  convertMs?: number;
  publishMs?: number;
  publishStatus?: 'pending' | 'saved' | 'failed' | 'unavailable';
  /** Worker performance.now() timestamps, separate from READY/load spans. */
  publishStartedAtMs?: number;
  publishCompletedAtMs?: number;
  publishError?: string;
  instantiateMs?: number;
}
type PublicationMetrics = Pick<
  ComponentMetrics,
  'publishMs' | 'publishStatus' | 'publishStartedAtMs' | 'publishCompletedAtMs' | 'publishError'
>;
const digest = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
export function executableFormat(bytes: Uint8Array): 'p1' | 'p2' {
  if (bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109)
    throw new Error('Expected a WebAssembly executable');
  if (bytes[4] === 1 && bytes[5] === 0 && bytes[6] === 0 && bytes[7] === 0) return 'p1';
  if (bytes[4] === 13 && bytes[5] === 0 && bytes[6] === 1 && bytes[7] === 0) return 'p2';
  throw new Error('Unsupported WebAssembly binary version');
}

interface Manifest {
  key: string;
  directory: string;
  files: { name: string; hash: string }[];
  imports: string[];
  exports: [string, string][];
}
const validName = (name: string) => /^command(?:\.core\d*)?\.(?:js|wasm)$/.test(name);
const write = async (dir: FileSystemDirectoryHandle, name: string, data: Uint8Array | string) => {
  const file = await dir.getFileHandle(name, { create: true });
  const writer = await file.createWritable();
  try {
    await writer.write(typeof data === 'string' ? data : (data as Uint8Array<ArrayBuffer>));
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  }
};
async function readCache(cache: FileSystemDirectoryHandle, key: string): Promise<Converted> {
  const manifest: Manifest = JSON.parse(
    await (await (await cache.getFileHandle(`${key}.json`)).getFile()).text(),
  );
  if (
    manifest.key !== key ||
    !/^stage-[a-f0-9-]+$/.test(manifest.directory) ||
    !Array.isArray(manifest.files) ||
    !manifest.files.some((f) => f.name === 'command.js') ||
    !Array.isArray(manifest.imports) ||
    manifest.imports.some((name) => typeof name !== 'string') ||
    !Array.isArray(manifest.exports) ||
    manifest.exports.some(
      (entry) =>
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        entry.some((value) => typeof value !== 'string'),
    )
  )
    throw new Error('Invalid component cache manifest');
  const dir = await cache.getDirectoryHandle(manifest.directory);
  const files: Converted['files'] = [];
  for (const { name, hash } of manifest.files) {
    if (!validName(name)) throw new Error('Invalid component cache filename');
    const bytes = new Uint8Array(
      await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer(),
    );
    if ((await digest(bytes)) !== hash) throw new Error('Incomplete component cache');
    files.push([name, bytes]);
  }
  return { files, imports: manifest.imports, exports: manifest.exports };
}
async function convertComponent(
  bytes: Uint8Array,
  key: string,
  metrics?: ComponentMetrics,
): Promise<PreparedComponent> {
  const lookupStart = performance.now();
  let cache: FileSystemDirectoryHandle | undefined;
  try {
    cache = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle(cacheDirectory, { create: true });
    const result = await readCache(cache, key);
    if (metrics) {
      metrics.cache = 'opfs';
      metrics.lookupMs = performance.now() - lookupStart;
    }
    return { result, persist: async () => ({}) };
  } catch {
    /* Missing/corrupt/unavailable caches are regenerated locally. */
  }
  if (metrics) {
    metrics.cache = 'miss';
    metrics.lookupMs = performance.now() - lookupStart;
  }
  const loadStart = performance.now();
  const { convert } = await import('./jco.js');
  const convertStart = performance.now();
  if (metrics) metrics.converterLoadMs = convertStart - loadStart;
  const result = await convert(bytes, componentOptions);
  if (metrics) {
    metrics.convertMs = performance.now() - convertStart;
    metrics.publishStatus = 'pending';
  }
  // Merely loading/instantiating must not start any artifact writes. The owner
  // explicitly starts persistence after READY and joins it before sending EXIT.
  let publication: Promise<PublicationMetrics> | undefined;
  const persist = () => (publication ??= publish(cache, key, result));
  return { result, persist };
}
async function publish(
  cache: FileSystemDirectoryHandle | undefined,
  key: string,
  result: Converted,
): Promise<PublicationMetrics> {
  const publishStartedAtMs = performance.now();
  let publishStatus: PublicationMetrics['publishStatus'] = 'unavailable';
  let publishError: string | undefined;
  if (cache) {
    let stage: string | undefined;
    try {
      stage = `stage-${crypto.randomUUID()}`;
      const dir = await cache.getDirectoryHandle(stage, { create: true });
      const files: Manifest['files'] = [];
      for (const [name, data] of result.files) {
        if (!validName(name)) throw new Error(`Unexpected Jco output: ${name}`);
        await write(dir, name, data);
        const hash = await digest(data);
        const stored = new Uint8Array(
          await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer(),
        );
        if ((await digest(stored)) !== hash) throw new Error('Incomplete component cache write');
        files.push({ name, hash });
      }
      // createWritable.close publishes the reference only after every artifact is complete.
      // Concurrent workers use different staging directories; either complete result is valid.
      await write(
        cache,
        `${key}.json`,
        JSON.stringify({
          key,
          directory: stage,
          files,
          imports: result.imports,
          exports: result.exports,
        } satisfies Manifest),
      );
      publishStatus = 'saved';
    } catch (error) {
      publishStatus = 'failed';
      publishError = String(error);
      console.debug('Component cache write skipped', error);
      if (stage) await cache.removeEntry(stage, { recursive: true }).catch(() => {});
    }
  } else {
    publishError = 'OPFS component cache unavailable';
    console.debug('Component cache write skipped', publishError);
  }
  const publishCompletedAtMs = performance.now();
  return {
    publishStatus,
    publishStartedAtMs,
    publishCompletedAtMs,
    publishMs: publishCompletedAtMs - publishStartedAtMs,
    ...(publishError && { publishError }),
  };
}
export async function loadComponent(
  bytes: Uint8Array,
  imports: Record<string, unknown>,
  metrics?: ComponentMetrics,
) {
  const keyStart = performance.now();
  const content = await digest(bytes);
  const key = await digest(
    encoder.encode(JSON.stringify({ content, converterVersion, componentOptions })),
  );
  if (metrics) metrics.keyMs = performance.now() - keyStart;
  let pending = memory.get(key);
  if (!pending) {
    pending = convertComponent(bytes, key, metrics);
    memory.set(key, pending);
  } else if (metrics) metrics.cache = 'memory';
  let prepared: PreparedComponent;
  try {
    prepared = await pending;
  } catch (error) {
    memory.delete(key);
    throw error;
  }
  const { result } = prepared;
  const instantiateStart = performance.now();
  for (const name of result.imports)
    if (!(name in imports)) throw new Error(`Unsupported component import: ${name}`);
  const files = new Map(result.files);
  const glue = files.get('command.js');
  if (!glue) throw new Error('Jco did not generate command.js');
  const url = URL.createObjectURL(new Blob([decoder.decode(glue)], { type: 'text/javascript' }));
  try {
    const { instantiate } = await import(/* @vite-ignore */ url);
    const component = await instantiate((name: string) => {
      const core = files.get(name);
      if (!core || !name.endsWith('.wasm')) throw new Error(`Missing component module: ${name}`);
      return WebAssembly.compile(core as Uint8Array<ArrayBuffer>);
    }, imports);
    return {
      component,
      // Idempotent even for overlapping loads sharing the in-memory conversion.
      persist: async () => {
        const publication = await prepared.persist();
        if (metrics) Object.assign(metrics, publication);
      },
    };
  } finally {
    URL.revokeObjectURL(url);
    if (metrics) metrics.instantiateMs = performance.now() - instantiateStart;
  }
}
/** Clear the shared persistent conversion cache. Call while OS sessions are stopped. */
export async function clearComponentCache(): Promise<void> {
  memory.clear();
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(cacheDirectory, { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
}
