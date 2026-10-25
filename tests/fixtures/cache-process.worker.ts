// Fault injection at the OPFS boundary; loading, READY, execution and EXIT are
// all provided by the actual Process Worker, including its persistence join.
import '../../packages/os/dist/internal/process.worker.js';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const receive = scope.onmessage!;
let mode = '';
let release: (() => void) | undefined;
const directory = FileSystemDirectoryHandle.prototype.getDirectoryHandle;
FileSystemDirectoryHandle.prototype.getDirectoryHandle = function (name, options) {
  if (mode === 'unavailable' && name === '.walos-components')
    return Promise.reject(new DOMException('injected OPFS unavailable', 'SecurityError'));
  return directory.call(this, name, options);
};
const writable = FileSystemFileHandle.prototype.createWritable;
FileSystemFileHandle.prototype.createWritable = async function (options) {
  const artifact = this.name === 'command.js';
  const manifest = /^[a-f0-9]{64}\.json$/.test(this.name);
  if ((mode === 'fail-artifact' && artifact) || (mode === 'fail-manifest' && manifest))
    throw new DOMException('injected cache quota failure', 'QuotaExceededError');
  const writer = await writable.call(this, options);
  if (mode === 'corrupt-write' && artifact) {
    const write = writer.write.bind(writer);
    writer.write = () => write(new Uint8Array([0]));
  }
  if ((mode === 'hold-artifact' && artifact) || (mode === 'hold-manifest' && manifest)) {
    const close = writer.close.bind(writer);
    writer.close = async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
        scope.postMessage({ type: 'cache-write-blocked' });
      });
      await close();
    };
  }
  return writer;
};
scope.onmessage = (event) => {
  if (event.data.type === 'cache-release') return release?.();
  if (event.data.type === 'start') mode = event.data.cacheTest || '';
  return receive.call(scope, event);
};
