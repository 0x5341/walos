// Real Process Worker with test-only injections for observable control failures.
import '../../packages/os/dist/internal/process.worker.js';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const receive = scope.onmessage!;
scope.onmessage = (event) => {
  if (event.data.type === 'inject-messageerror') {
    scope.dispatchEvent(new MessageEvent('messageerror'));
    return;
  }
  if (event.data.type === 'inject-rejection') {
    void Promise.reject(new Error('injected unhandled rejection'));
    return;
  }
  if (event.data.type === 'inject-error') throw new Error('injected Worker disappearance');
  return receive.call(scope, event);
};
