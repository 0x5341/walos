import { ProcessManager } from './core.js';
const scope = self as unknown as DedicatedWorkerGlobalScope;
let disposed = false;
const manager = new ProcessManager((e, ports = []) => scope.postMessage(e, ports));
scope.onmessage = async (e) => {
  const m = e.data;
  if (disposed) return;
  if (m.type === 'boot')
    try {
      const pid = await manager.spawn(m.spec, null);
      if (disposed) return;
      manager.focus(pid);
      scope.postMessage({ type: 'booted', pid });
    } catch (e) {
      if (!disposed) scope.postMessage({ type: 'error', message: String(e) });
    }
  if (m.type === 'interrupt') manager.interrupt();
  if (m.type === 'dispose') {
    disposed = true;
    manager.dispose();
    scope.postMessage({ type: 'disposed' });
    scope.close();
  }
};
