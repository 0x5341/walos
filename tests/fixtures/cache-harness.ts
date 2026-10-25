import { clearComponentCache } from '../../packages/os/dist/index.js';
import type { FromProcess } from '../../packages/os/dist/internal/protocol.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  // A worker failure can precede awaiting READY, the write gate or EXIT.
  void promise.catch(() => {});
  return { promise, resolve, reject };
}
export async function prepare() {
  await clearComponentCache();
  const root = await navigator.storage.getDirectory();
  const file = await root.getFileHandle('cache-test-true', { create: true });
  const writer = await file.createWritable();
  await writer.write(await (await fetch('/bin/p2-true.wasm')).arrayBuffer());
  await writer.close();
}
export async function launch(cacheTest = '', command = 'p2-true') {
  const root = await navigator.storage.getDirectory();
  const ready = deferred<Extract<FromProcess, { type: 'ready' }>>();
  const exit = deferred<Extract<FromProcess, { type: 'exit' }>>();
  const blocked = deferred<void>();
  const events: string[] = [];
  const worker = new Worker(new URL('./cache-process.worker.ts', import.meta.url), {
    type: 'module',
  });
  const fail = (error: Error) => {
    ready.reject(error);
    exit.reject(error);
    blocked.reject(error);
  };
  const timer = setTimeout(() => {
    fail(new Error('cache test Worker timeout'));
    worker.terminate();
  }, 20000);
  const terminate = () => {
    clearTimeout(timer);
    worker.terminate();
  };
  worker.onerror = (event) => fail(new Error(event.message));
  worker.onmessageerror = () => fail(new Error('cache Worker message error'));
  worker.onmessage = ({ data }) => {
    events.push(data.type);
    if (data.type === 'ready') ready.resolve(data);
    else if (data.type === 'cache-write-blocked') blocked.resolve();
    else if (data.type === 'exit') {
      exit.resolve(data);
      terminate();
    } else if (data.type === 'boot-error') fail(new Error(data.message));
    else fail(new Error(`Unexpected cache test message: ${JSON.stringify(data)}`));
  };
  worker.postMessage({
    type: 'start',
    pid: 1,
    measure: true,
    cacheTest,
    spec: {
      file: await root.getFileHandle('cache-test-true'),
      cwd: root,
      cwdPath: '/',
      argv: [command],
      env: {},
      stdio: ['in', 'out', 'out'].map((direction) => ({ kind: 'null', id: 0, direction })),
    },
  });
  return {
    ready: ready.promise,
    exit: exit.promise,
    blocked: blocked.promise,
    events,
    release: () => worker.postMessage({ type: 'cache-release' }),
    terminate,
  };
}
export async function entries() {
  const dir = await (
    await navigator.storage.getDirectory()
  ).getDirectoryHandle('.walos-components');
  const names: string[] = [];
  for await (const [name] of dir.entries()) names.push(name);
  return names;
}
export async function corrupt() {
  const cache = await (
    await navigator.storage.getDirectory()
  ).getDirectoryHandle('.walos-components');
  const name = (await entries()).find((n) => n.endsWith('.json'))!;
  const manifest = JSON.parse(await (await (await cache.getFileHandle(name)).getFile()).text());
  const stage = await cache.getDirectoryHandle(manifest.directory);
  const writer = await (await stage.getFileHandle('command.js')).createWritable();
  await writer.write('corrupt cached glue');
  await writer.close();
}

export async function stopWhilePublishing() {
  const { ProcessManager } = await import('../../packages/os/dist/internal/core.js');
  const root = await navigator.storage.getDirectory();
  const blocked = deferred<void>();
  const manager = new ProcessManager(
    () => {},
    () => {
      const worker = new Worker(new URL('./cache-process.worker.ts', import.meta.url), {
        type: 'module',
      });
      const post = worker.postMessage.bind(worker);
      worker.postMessage = (message, transfer: Transferable[] | StructuredSerializeOptions = []) =>
        post(
          message.type === 'start' ? { ...message, cacheTest: 'hold-manifest' } : message,
          Array.isArray(transfer) ? transfer : transfer.transfer || [],
        );
      worker.addEventListener('message', ({ data }) => {
        if (data.type === 'cache-write-blocked') blocked.resolve();
      });
      return worker;
    },
  );
  try {
    const pid = await manager.spawn(
      {
        file: await root.getFileHandle('cache-test-true'),
        cwd: root,
        cwdPath: '/',
        argv: ['p2-true'],
        env: {},
        stdio: ['in', 'out', 'out'].map((direction) => ({ kind: 'null', id: 0, direction })) as any,
      },
      null,
    );
    await blocked.promise;
    manager.requestStop(pid);
    return await manager.wait(pid);
  } finally {
    manager.dispose();
  }
}
