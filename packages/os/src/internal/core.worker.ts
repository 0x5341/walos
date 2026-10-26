import { ProcessManager } from './core.js';
const scope = self as unknown as DedicatedWorkerGlobalScope;
let disposed = false;
let host: number | undefined;
const manager = new ProcessManager((e, ports = []) => scope.postMessage(e, ports));
scope.onmessage = async (e) => {
  const m = e.data;
  if (disposed) return;
  try {
    if (m.type === 'boot') {
      if (host !== undefined) throw new Error('Host already registered');
      host = manager.registerHost(m.argv, m.env, (reply, ports = []) =>
        scope.postMessage(reply, ports),
      );
      scope.postMessage({ type: 'booted', pid: host });
    } else if (m.type === 'request') {
      if (host === undefined) throw new Error('Host not initialized');
      manager.hostRequest(host, m);
    } else if (m.type === 'shutdown') {
      manager.shutdownChildren();
    } else if (m.type === 'dispose') {
      disposed = true;
      manager.dispose();
      // Let wait continuations publish terminated results before the final ACK.
      await Promise.resolve();
      await Promise.resolve();
      scope.postMessage({ type: 'disposed' });
      scope.close();
    }
  } catch (e) {
    scope.postMessage({ type: 'error', message: String(e) });
  }
};
