// Test-only control point. All loading, adapters, Wasm execution and transport
// use the production Process Worker. No replacement Worker or supervisor is used.
import { Rpc, RpcFailure } from '../../packages/os/dist/internal/protocol.js';
import '../../packages/os/dist/internal/process.worker.js';

const call = Rpc.prototype.call;
let releaseSpawn: ((abort: boolean) => void) | undefined;
Rpc.prototype.call = function (op, ports) {
  const pending = call.call(this, op, ports);
  if (op.op !== 'spawn') return pending;
  // Public spawn is blocking until READY. Interrupting this await lets actual C
  // code return normally (or trap) while its child still STARTS. This is fault
  // injection, not a new nonblocking spawn API or a synthetic parent EXIT.
  void pending.catch(() => {});
  return new Promise((resolve, reject) => {
    releaseSpawn = (abort) =>
      abort
        ? reject(new RpcFailure('internal', 'audit interrupted suspended spawn'))
        : void pending.then(resolve, reject);
  });
};
const scope = self as unknown as DedicatedWorkerGlobalScope;
const receive = scope.onmessage!;
scope.onmessage = (event) => {
  if (event.data.type === 'audit-release-parent') {
    if (!releaseSpawn) throw new Error('parent has not submitted spawn');
    releaseSpawn(event.data.abort);
    return;
  }
  if (event.data.type === 'audit-error') throw new Error('audit parent Worker error');
  if (event.data.type === 'audit-messageerror') {
    scope.dispatchEvent(new MessageEvent('messageerror'));
    return;
  }
  if (event.data.type === 'audit-rejection') {
    void Promise.reject(new Error('audit parent rejection'));
    return;
  }
  return receive.call(scope, event);
};
