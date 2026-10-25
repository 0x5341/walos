/** Optional persistent artifact storage. Engine metadata is opaque to this layer. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Artifact {
  files: [string, Uint8Array][];
  metadata: Json;
}
export interface CacheIdentity {
  engine: string;
  version: string;
  options: Json;
  hostRevision: string;
}
export interface PublicationMetrics {
  publishMs?: number;
  publishStatus?: 'pending' | 'saved' | 'failed' | 'unavailable';
  publishStartedAtMs?: number;
  publishCompletedAtMs?: number;
  publishError?: string;
}
export const cacheDirectory = '.walos-components';
export const cacheSchema = 2;
export const hostRevision = 'walos-host-1';
const encoder = new TextEncoder();
const hashPattern = /^[a-f0-9]{64}$/;
export const digest = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
// Canonical object key ordering makes equivalent effective options share a key.
export function canonical(value: Json): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  throw new Error('Cache identity/metadata must be JSON');
}
/** Canonical relative paths only; reject aliases, traversal and platform separators. */
export function artifactPath(name: string): string[] {
  if (typeof name !== 'string' || name.length > 512) throw new Error('Invalid artifact path');
  const parts = name.split('/');
  if (parts.some((part) => part === '.' || part === '..' || !/^[A-Za-z0-9_.-]+$/.test(part)))
    throw new Error('Invalid artifact path');
  return parts;
}
function validateFiles(files: Artifact['files']) {
  const names = new Set<string>();
  for (const [name] of files) {
    artifactPath(name);
    if (names.has(name)) throw new Error('Duplicate artifact path');
    names.add(name);
  }
  for (const name of names) {
    const parts = name.split('/');
    while (parts.length > 1) {
      parts.pop();
      if (names.has(parts.join('/'))) throw new Error('Artifact file/directory collision');
    }
  }
}
async function fileAt(dir: FileSystemDirectoryHandle, name: string, create = false) {
  const parts = artifactPath(name);
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
  return await dir.getFileHandle(parts.at(-1)!, { create });
}
async function write(file: FileSystemFileHandle, data: Uint8Array | string) {
  const writer = await file.createWritable();
  try {
    await writer.write(typeof data === 'string' ? data : (data as Uint8Array<ArrayBuffer>));
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  }
}
interface Manifest {
  schema: number;
  identity: string;
  key: string;
  directory: string;
  files: { name: string; hash: string }[];
  metadata: Json;
}
/** Opening a cache is opt-in: cacheless engines never call this or compute keys. */
export async function openArtifactCache(bytes: Uint8Array, identity: CacheIdentity) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(identity.engine)) throw new Error('Invalid engine ID');
  const identityJson = canonical({ ...identity, schema: cacheSchema });
  const key = await digest(
    encoder.encode(canonical({ content: await digest(bytes), identity: identityJson })),
  );
  const namespace = `${cacheDirectory}/schema-${cacheSchema}/${identity.engine}`;
  let cache: FileSystemDirectoryHandle | undefined;
  let opened: Promise<void> | undefined;
  const open = () =>
    (opened ??= (async () => {
      try {
        let dir = await navigator.storage.getDirectory();
        for (const name of namespace.split('/'))
          dir = await dir.getDirectoryHandle(name, { create: true });
        cache = dir;
      } catch {
        /* Storage denied/unavailable; execution still proceeds. */
      }
    })());
  const lock = `${namespace}/${key}`;
  const stagePrefix = `${key}-stage-`;
  return {
    key,
    async read(): Promise<Artifact | undefined> {
      await open();
      if (!cache) return;
      try {
        return await navigator.locks.request(lock, { mode: 'shared' }, async () => {
          const manifest: Manifest = JSON.parse(
            await (await (await cache!.getFileHandle(`${key}.json`)).getFile()).text(),
          );
          if (
            !manifest ||
            manifest.schema !== cacheSchema ||
            manifest.identity !== identityJson ||
            manifest.key !== key ||
            typeof manifest.directory !== 'string' ||
            !manifest.directory.startsWith(stagePrefix) ||
            !/^[a-f0-9-]+$/.test(manifest.directory.slice(stagePrefix.length)) ||
            !Array.isArray(manifest.files) ||
            !Object.hasOwn(manifest, 'metadata')
          )
            throw new Error('Invalid artifact manifest');
          const files: Artifact['files'] = [];
          // Validate every path before reading anything from the artifact directory.
          for (const file of manifest.files) {
            if (
              !file ||
              typeof file.name !== 'string' ||
              typeof file.hash !== 'string' ||
              !hashPattern.test(file.hash)
            )
              throw new Error('Invalid artifact manifest file');
            files.push([file.name, new Uint8Array()]);
          }
          validateFiles(files);
          const dir = await cache!.getDirectoryHandle(manifest.directory);
          for (let i = 0; i < files.length; i++) {
            const bytes = new Uint8Array(
              await (await (await fileAt(dir, files[i][0])).getFile()).arrayBuffer(),
            );
            if ((await digest(bytes)) !== manifest.files[i].hash)
              throw new Error('Incomplete artifact cache');
            files[i][1] = bytes;
          }
          return { files, metadata: manifest.metadata };
        });
      } catch {
        // Unavailable, incomplete and corrupt entries all regenerate locally.
        return undefined;
      }
    },
    async publish(artifact: () => Artifact): Promise<PublicationMetrics> {
      const publishStartedAtMs = performance.now();
      let publishStatus: PublicationMetrics['publishStatus'] = 'unavailable';
      let publishError: string | undefined;
      await open();
      if (cache) {
        try {
          await navigator.locks.request(lock, async () => {
            const stage = `${stagePrefix}${crypto.randomUUID()}`;
            try {
              const result = artifact();
              validateFiles(result.files);
              canonical(result.metadata);
              const dir = await cache!.getDirectoryHandle(stage, { create: true });
              const files: Manifest['files'] = [];
              for (const [name, data] of result.files) {
                const file = await fileAt(dir, name, true);
                await write(file, data);
                const hash = await digest(data);
                if (
                  (await digest(new Uint8Array(await (await file.getFile()).arrayBuffer()))) !==
                  hash
                )
                  throw new Error('Incomplete artifact cache write');
                files.push({ name, hash });
              }
              await write(
                await cache!.getFileHandle(`${key}.json`, { create: true }),
                JSON.stringify({
                  schema: cacheSchema,
                  identity: identityJson,
                  key,
                  directory: stage,
                  files,
                  metadata: result.metadata,
                } satisfies Manifest),
              );
            } catch (error) {
              await cache!.removeEntry(stage, { recursive: true }).catch(() => {});
              throw error;
            }
            // Only this key, only after publication, under the reader/writer lock.
            // This reclaims terminated publishers and superseded complete entries;
            // no scan/GC/LRU occurs on the startup path.
            try {
              for await (const [name] of cache!.entries())
                if (name.startsWith(stagePrefix) && name !== stage)
                  await cache!.removeEntry(name, { recursive: true });
            } catch {
              /* Cleanup failure cannot invalidate a complete publication. */
            }
          });
          publishStatus = 'saved';
        } catch (error) {
          publishStatus = 'failed';
          publishError = String(error);
        }
      } else publishError = 'OPFS component cache unavailable';
      if (publishError) console.debug('Component cache write skipped', publishError);
      const publishCompletedAtMs = performance.now();
      return {
        publishStatus,
        publishStartedAtMs,
        publishCompletedAtMs,
        publishMs: publishCompletedAtMs - publishStartedAtMs,
        ...(publishError && { publishError }),
      };
    },
  };
}
/** Remove every engine/schema, including the legacy Jco cache. Stop OS sessions first. */
export async function clearComponentCache(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(cacheDirectory, { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
}
