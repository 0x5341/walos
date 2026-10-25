export function run(options: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./artifact.worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('artifact Worker timeout'));
    }, 10000);
    worker.onmessage = ({ data }) => {
      clearTimeout(timer);
      worker.terminate();
      data.ok ? resolve(data) : reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage(options);
  });
}
export async function cacheDirectory(engine = 'fixture') {
  return await (
    await (
      await (await navigator.storage.getDirectory()).getDirectoryHandle('.walos-components')
    ).getDirectoryHandle('schema-2')
  ).getDirectoryHandle(engine);
}
export async function manifest(engine = 'fixture') {
  const dir = await cacheDirectory(engine);
  const names: string[] = [];
  for await (const [name] of dir.entries()) if (name.endsWith('.json')) names.push(name);
  const file = await dir.getFileHandle(names[0]);
  return { dir, file, value: JSON.parse(await (await file.getFile()).text()) };
}
