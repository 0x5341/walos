import { Rpc, type ToProcess, type ProcessMetrics } from './protocol.js';
import { Wasi } from './wasi.js';
import { Wasi2 } from './wasi2.js';
import { executableKind, prepareComponent } from './component.js';
import { Wasi3 } from './wasi3.js';
import { ProcessServices } from './process-context.js';
import { RuntimeStopped, type Runtime } from './runtime.js';
import type { Exit } from '../types.js';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const rpc = new Rpc((request, ports) => scope.postMessage(request, ports));
let services: ProcessServices | undefined;
let runtime: Runtime | undefined;
let started = false;
let ready = false;
let finished = false;
let stopping = false;
let fatal: unknown;
let metrics: ProcessMetrics | undefined;
let stop!: () => void;
const stopped = new Promise<void>((resolve) => {
  stop = resolve;
});

// Every completion path shares one notification and cleanup scope.
function notify(exit: Exit) {
  if (finished) return;
  finished = true;
  scope.postMessage(
    ready
      ? { type: 'exit', exit, ...(metrics && { component: metrics.component }) }
      : {
          type: 'boot-error',
          message:
            exit.kind === 'exited' ? `Process exited before READY: ${exit.code}` : exit.message,
        },
  );
}
function fail(error: unknown) {
  fatal ??= error;
  runtime?.requestStop();
  // External worker faults can interrupt a blocked import; Core terminates the
  // Worker and reclaims transferred endpoints when it receives this result.
  notify({ kind: 'trap', message: String(error) });
}
scope.onmessageerror = () => fail(new Error('worker incoming message error'));
scope.onunhandledrejection = (event) => {
  event.preventDefault();
  fail(new Error(`worker unhandled rejection: ${String(event.reason)}`));
};
scope.onmessage = async (event) => {
  const message = event.data as ToProcess | { type: 'stream-gone'; id: number };
  if (message.type === 'reply') {
    rpc.receive(message);
    return;
  }
  if (message.type === 'stream-gone') {
    services?.gone(message.id);
    return;
  }
  if (message.type === 'http-disconnected') {
    services?.http.disconnected(message.connection);
    return;
  }
  if (message.type === 'http-incoming') {
    if (!ready || !(runtime instanceof Wasi3) || !services) {
      message.port.close();
      return;
    }
    const adapter = runtime;
    services.http.accept(message.connection, message.port, async (request) => {
      try {
        return await adapter.handle(request);
      } catch (error) {
        if (!stopping) fail(error);
        throw error;
      }
    });
    return;
  }
  if (message.type === 'stop') {
    stopping = true;
    services?.cancelSockets();
    runtime?.requestStop();
    stop();
    return;
  }
  if (message.type !== 'start' || started) return;
  started = true;
  let exit: Exit | undefined;
  let runStart: number | undefined;
  let runMs: number | undefined;
  try {
    if (typeof WebAssembly.Suspending !== 'function')
      throw new Error('This slice requires Chromium with JSPI support');
    const readStart = performance.now();
    const bytes = new Uint8Array(await (await message.spec.file.getFile()).arrayBuffer());
    metrics = message.measure ? { readMs: performance.now() - readStart } : undefined;
    if (metrics) metrics.component = {};
    const prepared =
      executableKind(bytes) === 'component'
        ? await prepareComponent(bytes, metrics?.component)
        : undefined;
    const format = prepared?.format ?? 'p1';
    if (message.spec.http ? prepared?.world !== 'http' : prepared?.world === 'http')
      throw new Error(
        'HTTP components require the dedicated HTTP start API; CLI components require spawn',
      );
    if (
      message.spec.http &&
      prepared?.component.imports().includes('wasi:http/handler@0.3.2') &&
      message.spec.http.next === undefined
    )
      throw new Error('HTTP middleware requires a next service');
    const adapterStart = performance.now();
    services = new ProcessServices(
      {
        ...message.spec,
        root: message.spec.root,
        pid: message.pid,
        ppid: message.ppid ?? null,
      },
      rpc,
      () => {
        if (finished) throw new Error('Process is finished');
      },
    );
    await services.init();
    runtime =
      format === 'p3'
        ? new Wasi3(metrics, prepared)
        : format === 'p2'
          ? new Wasi2(metrics, prepared)
          : new Wasi(metrics);
    if (stopping) runtime.requestStop();
    if (metrics) metrics.adapterMs = performance.now() - adapterStart;
    await runtime.initialize(bytes, services.context);
    if (fatal) throw fatal;
    if (stopping) {
      exit = { kind: 'terminated', message: 'stopped before READY' };
    } else {
      if (metrics) metrics.readyAtMs = performance.now();
      scope.postMessage({ type: 'ready', ...(metrics && { metrics }) });
      ready = true;
      runStart = performance.now();
      if (message.spec.http) {
        await stopped;
        exit = { kind: 'terminated', message: 'HTTP service stopped' };
      } else exit = { kind: 'exited', code: await runtime.run() };
      runMs = performance.now() - runStart;
    }
  } catch (error) {
    if (runStart !== undefined) runMs = performance.now() - runStart;
    exit =
      error instanceof RuntimeStopped
        ? { kind: 'terminated', message: error.message }
        : { kind: 'trap', message: String(error) };
  } finally {
    // Failure of the borrower must never prevent cleanup of its owner.
    services?.cancelSockets();
    const failures: unknown[] = [];
    try {
      await runtime?.[Symbol.asyncDispose]();
    } catch (error) {
      failures.push(error);
    }
    try {
      await services?.dispose();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length)
      exit = {
        kind: 'trap',
        message: `${exit?.kind === 'trap' ? exit.message + '; ' : ''}cleanup failed: ${failures.map(String).join('; ')}`,
      };
    if (!finished) {
      finished = true;
      const result = exit ?? {
        kind: 'trap' as const,
        message: 'Process did not produce an exit result',
      };
      scope.postMessage(
        ready
          ? {
              type: 'exit',
              exit: result,
              ...(metrics && {
                runMs,
                component: metrics.component,
              }),
            }
          : {
              type: 'boot-error',
              message:
                result.kind === 'exited'
                  ? `Process exited before READY: ${result.code}`
                  : result.message,
            },
      );
    }
  }
};
