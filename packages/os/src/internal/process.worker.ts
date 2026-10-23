import { Rpc, type ToProcess } from './protocol.js';
import { Wasi, WasiExit } from './wasi.js';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const rpc = new Rpc((r, ports) => scope.postMessage(r, ports));
let wasi: Wasi | undefined;
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
  try {
    if (typeof WebAssembly.Suspending !== 'function')
      throw new Error('This slice requires Chromium with JSPI support');
    wasi = new Wasi(m.spec, rpc);
    await wasi.init();
    const module = await WebAssembly.compile(await (await m.spec.file.getFile()).arrayBuffer());
    const instance = await WebAssembly.instantiate(
      module,
      wasi.imports() as unknown as WebAssembly.Imports,
    );
    wasi.memory = instance.exports.memory as WebAssembly.Memory;
    if (!wasi.memory || typeof instance.exports._start !== 'function')
      throw new Error('Expected a WASI Preview 1 command with memory and _start exports');
    scope.postMessage({ type: 'ready' });
    ready = true;
    try {
      await WebAssembly.promising(instance.exports._start)();
      await wasi.close();
      scope.postMessage({ type: 'exit', exit: { kind: 'exited', code: 0 } });
    } catch (e) {
      await wasi.close();
      scope.postMessage({
        type: 'exit',
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
        ? { type: 'exit', exit: { kind: 'trap', message: String(e) } }
        : { type: 'boot-error', message: String(e) },
    );
  }
};
