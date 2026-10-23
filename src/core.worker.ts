import { ProcessManager } from './core';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const manager = new ProcessManager((e, ports = []) => scope.postMessage(e, ports));
scope.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'boot')
    try {
      const pid = await manager.spawn(m.spec, null);
      manager.focus(pid);
    } catch (e) {
      scope.postMessage({ type: 'error', message: String(e) });
    }
  if (m.type === 'interrupt') manager.interrupt();
};
