import { Rpc, type ToProcess, type ProcessMetrics } from './protocol.js';
import { Wasi } from './wasi.js';
import { Wasi2 } from './wasi2.js';
import { executableFormat } from './component.js';
import { ProcessServices } from './process-context.js';
import { browserPlatform } from './platform.js';
import type { Runtime } from './runtime.js';
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
  if (message.type === 'stop') {
    stopping = true;
    runtime?.requestStop();
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
    const format = executableFormat(bytes);
    const adapterStart = performance.now();
    services = new ProcessServices(
      {
        ...message.spec,
        root: await browserPlatform.root(),
        pid: message.pid,
        ppid: message.ppid ?? null,
      },
      rpc,
      () => {
        if (finished) throw new Error('Process is finished');
      },
    );
    await services.init();
    runtime = format === 'p2' ? new Wasi2(metrics) : new Wasi(metrics);
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
      exit = { kind: 'exited', code: await runtime.run() };
      runMs = performance.now() - runStart;
    }
  } catch (error) {
    if (runStart !== undefined) runMs = performance.now() - runStart;
    exit = { kind: 'trap', message: String(error) };
  } finally {
    // Failure of the borrower must never prevent cleanup of its owner.
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
