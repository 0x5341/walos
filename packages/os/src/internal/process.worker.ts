import { Rpc, type ToProcess, type ProcessMetrics } from './protocol.js';
import { Wasi, WasiExit } from './wasi.js';
import { Wasi2 } from './wasi2.js';
import { executableFormat, loadComponent } from './component.js';
import { configureTimeline } from './diagnostics.js';
const moduleInitializedAt = performance.timeOrigin + performance.now();
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
  const trace = m.spec.diagnostics ? configureTimeline(m.spec.diagnostics, m.pid) : undefined;
  trace?.mark('process.module.initialized');
  if (trace?.events.length) trace.events.at(-1)!.at = moduleInitializedAt;
  trace?.mark('process.start.receive');
  let ready = false;
  let publication: Promise<void> | undefined;
  let metrics: ProcessMetrics | undefined;
  try {
    if (typeof WebAssembly.Suspending !== 'function')
      throw new Error('This slice requires Chromium with JSPI support');
    const readStart = performance.now();
    trace?.mark('process.read.start');
    const bytes = new Uint8Array(await (await m.spec.file.getFile()).arrayBuffer());
    metrics = m.measure ? { readMs: performance.now() - readStart } : undefined;
    trace?.mark('process.read.end', { bytes: bytes.length });
    const adapterStart = performance.now();
    trace?.mark('process.adapter.start');
    let run: () => Promise<unknown>;
    let persist: (() => Promise<void>) | undefined;
    if (executableFormat(bytes) === 'p2') {
      const adapter = new Wasi2(m.spec, rpc);
      wasi = adapter;
      await adapter.init();
      trace?.mark('process.adapter.end');
      const loadStart = performance.now();
      trace?.mark('process.load.start');
      if (metrics) {
        metrics.adapterMs = loadStart - adapterStart;
        metrics.component = {};
      }
      const loaded = await loadComponent(bytes, adapter.imports(), metrics?.component, m.engine);
      const { component } = loaded;
      trace?.mark('process.load.end');
      persist = loaded.persist;
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
      trace?.mark('process.adapter.end');
      const compileStart = performance.now();
      trace?.mark('process.compile.start');
      if (metrics) metrics.adapterMs = compileStart - adapterStart;
      const module = await WebAssembly.compile(bytes);
      const instantiateStart = performance.now();
      trace?.mark('process.compile.end');
      trace?.mark('process.instantiate.start');
      if (metrics) metrics.compileMs = instantiateStart - compileStart;
      const instance = await WebAssembly.instantiate(
        module,
        adapter.imports() as unknown as WebAssembly.Imports,
      );
      if (metrics) metrics.instantiateMs = performance.now() - instantiateStart;
      trace?.mark('process.instantiate.end');
      adapter.memory = instance.exports.memory as WebAssembly.Memory;
      if (!adapter.memory || typeof instance.exports._start !== 'function')
        throw new Error('Expected a WASI Preview 1 command with memory and _start exports');
      if (metrics) metrics.linearMemoryBytes = adapter.memory.buffer.byteLength;
      run = WebAssembly.promising(instance.exports._start);
    }
    if (metrics) metrics.readyAtMs = performance.now();
    trace?.mark('process.ready.send', { metrics });
    scope.postMessage({
      type: 'ready',
      ...(metrics && { metrics }),
      ...(trace && { events: trace.drain() }),
    });
    ready = true;
    publication = persist?.();
    const runStart = performance.now();
    trace?.mark('process.run.start');
    try {
      await run();
      const runMs = performance.now() - runStart;
      trace?.mark('process.run.end');
      trace?.mark('process.close.start');
      await wasi.close();
      trace?.mark('process.close.end');
      // Core terminates this Worker on EXIT. Even an immediate command must
      // finish its deferred atomic publication before reporting normal exit.
      await publication;
      trace?.mark('process.exit.send', { runMs, component: metrics?.component });
      scope.postMessage({
        type: 'exit',
        ...(trace && { events: trace.drain() }),
        exit: { kind: 'exited', code: 0 },
        ...(metrics && { runMs, component: metrics.component }),
      });
    } catch (e) {
      const runMs = performance.now() - runStart;
      trace?.mark('process.run.end');
      trace?.mark('process.close.start');
      await wasi.close();
      trace?.mark('process.close.end');
      await publication;
      trace?.mark('process.exit.send', { runMs, component: metrics?.component });
      scope.postMessage({
        type: 'exit',
        ...(trace && { events: trace.drain() }),
        ...(metrics && { runMs, component: metrics.component }),
        exit:
          e instanceof WasiExit
            ? { kind: 'exited', code: e.code }
            : { kind: 'trap', message: String(e) },
      });
    }
  } catch (e) {
    await wasi?.close();
    await publication;
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
