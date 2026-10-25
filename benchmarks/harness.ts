import { clearComponentCache } from '../packages/os/dist/internal/component.js';
import { PortStream } from '../packages/os/dist/internal/streams.js';
import type { FromProcess, Spec, StreamRef } from '../packages/os/dist/internal/protocol.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function prepare() {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('benchmark', { create: true });
  for (const format of ['p1', 'p2']) {
    try {
      await dir.getFileHandle(format);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
      const response = await fetch(`/${format}.wasm`);
      if (!response.ok) throw new Error(`Missing benchmark executable: ${format}`);
      const writer = await (await dir.getFileHandle(format, { create: true })).createWritable();
      await writer.write(await response.arrayBuffer());
      await writer.close();
    }
  }
}
let active:
  | {
      worker: Worker;
      input?: PortStream;
      output: PortStream;
      finish: () => Promise<unknown>;
    }
  | undefined;
async function launch(format: 'p1' | 'p2', mode: 'startup' | 'cpu' | 'hold') {
  if (active) throw new Error('Only one process measurement may run at a time');
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('benchmark');
  const out = new MessageChannel();
  const output = new PortStream({
    kind: 'pipe',
    direction: 'in',
    id: 2,
    port: out.port1,
    capacity: 65536,
  });
  const stdio: StreamRef[] = [
    { kind: 'null', id: 1, direction: 'in' },
    { kind: 'pipe', id: 2, direction: 'out', port: out.port2, capacity: 65536 },
    { kind: 'null', id: 3, direction: 'out' },
  ];
  let input: PortStream | undefined;
  const ports = [out.port2];
  if (mode === 'hold') {
    const channel = new MessageChannel();
    input = new PortStream({
      kind: 'pipe',
      direction: 'out',
      id: 1,
      port: channel.port1,
      capacity: 65536,
    });
    stdio[0] = { kind: 'pipe', direction: 'in', id: 1, port: channel.port2, capacity: 65536 };
    ports.push(channel.port2);
  }
  const spec: Spec = {
    file: await dir.getFileHandle(format),
    cwd: root,
    cwdPath: '/',
    argv: [format, mode],
    env: {},
    stdio,
  };
  const ready = deferred<unknown>();
  const exited = deferred<Extract<FromProcess, { type: 'exit' }>>();
  // A failure can arrive before the runner calls finish().
  void exited.promise.catch(() => {});
  const text = (async () => {
    let result = '';
    const decoder = new TextDecoder();
    for (;;) {
      const bytes = await output.read(16384);
      if (!bytes.length) return result + decoder.decode();
      result += decoder.decode(bytes, { stream: true });
    }
  })();
  const start = performance.now();
  const worker = new Worker(
    new URL('../packages/os/dist/internal/process.worker.js', import.meta.url),
    { type: 'module', name: 'walos-benchmark-process' },
  );
  const fail = (error: Error) => {
    ready.reject(error);
    exited.reject(error);
    output.gone();
  };
  const timeout = setTimeout(() => fail(new Error('Process benchmark timed out')), 60000);
  worker.onerror = (event) => fail(new Error(event.message));
  worker.onmessageerror = () => fail(new Error('Process message decode failed'));
  worker.onmessage = ({ data }: MessageEvent<FromProcess>) => {
    if (data.type === 'ready')
      ready.resolve({ startupMs: performance.now() - start, ...data.metrics });
    else if (data.type === 'exit') exited.resolve(data);
    else if (data.type === 'boot-error') fail(new Error(data.message));
    else fail(new Error(`Unexpected benchmark RPC: ${JSON.stringify(data)}`));
  };
  active = {
    worker,
    input,
    output,
    finish: async () => {
      try {
        if (input) await input.write(new Uint8Array([1]));
        const exit = await exited.promise;
        if (exit.exit.kind !== 'exited' || exit.exit.code !== 0)
          throw new Error(JSON.stringify(exit));
        return {
          runMs: exit.runMs,
          stdout: await text,
          ...(exit.component && { component: exit.component }),
        };
      } finally {
        clearTimeout(timeout);
        worker.terminate();
        input?.close();
        output.close();
        active = undefined;
      }
    },
  };
  worker.postMessage({ type: 'start', pid: 1, spec, measure: true }, ports);
  try {
    return await ready.promise;
  } catch (error) {
    clearTimeout(timeout);
    worker.terminate();
    input?.close();
    output.close();
    active = undefined;
    throw error;
  }
}
function ioWorker() {
  return new Worker(new URL('./io.worker.ts', import.meta.url), { type: 'module' });
}
function next(worker: Worker) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('I/O benchmark timed out')), 60000);
    worker.onmessage = ({ data }) => {
      clearTimeout(timer);
      data.error ? reject(new Error(data.error)) : resolve(data);
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(event.message));
    };
    worker.onmessageerror = () => {
      clearTimeout(timer);
      reject(new Error('I/O message decode failed'));
    };
  });
}
async function opfs(size: number) {
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('benchmark');
  const file = await dir.getFileHandle('io', { create: true });
  const worker = ioWorker();
  try {
    const result = next(worker);
    worker.postMessage({ op: 'opfs', file, size });
    return await result;
  } finally {
    worker.terminate();
  }
}
async function pipe(size: number) {
  const writer = ioWorker(),
    reader = ioWorker(),
    channel = new MessageChannel();
  try {
    const ready = [next(writer), next(reader)];
    writer.postMessage({ op: 'pipe', size, direction: 'out', port: channel.port1 }, [
      channel.port1,
    ]);
    reader.postMessage({ op: 'pipe', size, direction: 'in', port: channel.port2 }, [channel.port2]);
    await Promise.all(ready);
    const done = [next(writer), next(reader)];
    const start = performance.timeOrigin + performance.now();
    writer.postMessage({ op: 'go', start });
    reader.postMessage({ op: 'go', start });
    const [, result] = await Promise.all(done);
    return result;
  } finally {
    writer.terminate();
    reader.terminate();
  }
}
(window as any).bench = {
  prepare,
  clearCache: clearComponentCache,
  launch,
  finish: () => {
    if (!active) throw new Error('No active measurement');
    return active.finish();
  },
  opfs,
  pipe,
};
