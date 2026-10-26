import { Rpc, type ToProcess, type ProcessMetrics } from './protocol.js';
import { Wasi, WasiExit } from './wasi.js';
import { Wasi2 } from './wasi2.js';
import { executableFormat, loadComponent } from './component.js';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const rpc = new Rpc((r, ports) => scope.postMessage(r, ports));
let wasi: Wasi | Wasi2 | undefined;
// Deserialization failures in this direction do not fire Worker.onmessageerror
// in the Core. Report them over the remaining control channel instead.
scope.onmessageerror = () => {
  scope.postMessage({ type: 'boot-error', message: 'worker incoming message error' });
};
scope.onunhandledrejection = (event) => {
  event.preventDefault();
  scope.postMessage({
    type: 'boot-error',
    message: `worker unhandled rejection: ${String(event.reason)}`,
  });
};
scope.onmessage = async (e) => {
  const m = e.data as ToProcess | { type: 'stream-gone'; id: number };
  if (m.type === 'reply') {
    rpc.receive(m);
    return;
  }
  if (m.type === 'stream-gone') {
    wasi?.gone(m.id);
    return;
  }
  if (m.type === 'stop') {
    if (wasi) wasi.stopping = true;
    return;
  }
  if (m.type !== 'start') return;
  let ready = false;
  let metrics: ProcessMetrics | undefined;
  try {
    if (typeof WebAssembly.Suspending !== 'function')
      throw new Error('This slice requires Chromium with JSPI support');
    const readStart = performance.now();
    const bytes = new Uint8Array(await (await m.spec.file.getFile()).arrayBuffer());
    metrics = m.measure ? { readMs: performance.now() - readStart } : undefined;
    const adapterStart = performance.now();
    let run: () => Promise<unknown>;
    if (executableFormat(bytes) === 'p2') {
      const adapter = new Wasi2(m.spec, rpc);
      wasi = adapter;
      await adapter.init();
      const loadStart = performance.now();
      if (metrics) {
        metrics.adapterMs = loadStart - adapterStart;
        metrics.component = {};
      }
      const component = await loadComponent(bytes, adapter.imports(), metrics?.component);
      if (metrics) metrics.loadMs = performance.now() - loadStart;
      if (typeof component.run?.run !== 'function')
        throw new Error('Expected a wasi:cli/run command component');
      run = async () => {
        try {
          await component.run.run();
        } catch (error) {
          // wasi:cli/run returns result<_, _>; Jco represents err(_) as a payload error.
          if (
            error instanceof Error &&
            Object.hasOwn(error, 'payload') &&
            (error as Error & { payload: unknown }).payload === undefined
          )
            throw new WasiExit(1);
          throw error;
        }
      };
    } else {
      const adapter = new Wasi(m.spec, rpc);
      wasi = adapter;
      await adapter.init();
      const compileStart = performance.now();
      if (metrics) metrics.adapterMs = compileStart - adapterStart;
      const module = await WebAssembly.compile(bytes);
      const instantiateStart = performance.now();
      if (metrics) metrics.compileMs = instantiateStart - compileStart;
      const instance = await WebAssembly.instantiate(
        module,
        adapter.imports() as unknown as WebAssembly.Imports,
      );
      if (metrics) metrics.instantiateMs = performance.now() - instantiateStart;
      adapter.memory = instance.exports.memory as WebAssembly.Memory;
      if (!adapter.memory || typeof instance.exports._start !== 'function')
        throw new Error('Expected a WASI Preview 1 command with memory and _start exports');
      if (metrics) metrics.linearMemoryBytes = adapter.memory.buffer.byteLength;
      run = WebAssembly.promising(instance.exports._start);
    }
    if (metrics) metrics.readyAtMs = performance.now();
    scope.postMessage({ type: 'ready', ...(metrics && { metrics }) });
    ready = true;
    const runStart = performance.now();
    try {
      await run();
      const runMs = performance.now() - runStart;
      await wasi.close();
      scope.postMessage({
        type: 'exit',
        exit: { kind: 'exited', code: 0 },
        ...(metrics && { runMs, component: metrics.component }),
      });
    } catch (e) {
      const runMs = performance.now() - runStart;
      await wasi.close();
      scope.postMessage({
        type: 'exit',
        ...(metrics && { runMs, component: metrics.component }),
        exit:
          e instanceof WasiExit
            ? { kind: 'exited', code: e.code }
            : { kind: 'trap', message: String(e) },
      });
    }
  } catch (e) {
    await wasi?.close();
    scope.postMessage(
      ready
        ? {
            type: 'exit',
            exit: { kind: 'trap', message: String(e) },
            ...(metrics?.component && { component: metrics.component }),
          }
        : { type: 'boot-error', message: String(e) },
    );
  }
};
