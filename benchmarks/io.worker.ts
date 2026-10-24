import { FileStream, PortStream } from '../packages/os/dist/internal/streams.js';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const pattern = (i: number) => (i * 31 + 7) & 255;
let stream: PortStream | undefined;
let direction: 'in' | 'out';
let size: number;
let bytes: Uint8Array;
function verify(data: Uint8Array) {
  for (let i = 0; i < data.length; i++)
    if (data[i] !== pattern(i)) throw new Error(`Data mismatch at ${i}`);
}
scope.onmessage = async ({ data }) => {
  try {
    if (data.op === 'pipe') {
      size = data.size;
      direction = data.direction;
      bytes = new Uint8Array(size);
      if (direction === 'out') for (let i = 0; i < size; i++) bytes[i] = pattern(i);
      stream = new PortStream({ kind: 'pipe', id: 1, direction, port: data.port, capacity: 65536 });
      scope.postMessage({ ready: true });
    } else if (data.op === 'go') {
      if (!stream) throw new Error('Pipe not initialized');
      let offset = 0;
      let firstByteMs: number | undefined;
      if (direction === 'out') {
        while (offset < size) offset += await stream.write(bytes.subarray(offset, offset + 16384));
        stream.close();
        scope.postMessage({ written: offset });
      } else {
        for (;;) {
          const chunk = await stream.read(16384);
          if (!chunk.length) break;
          firstByteMs ??= performance.timeOrigin + performance.now() - data.start;
          if (offset + chunk.length > size) throw new Error('Excess pipe data');
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const elapsedMs = performance.timeOrigin + performance.now() - data.start;
        stream.close();
        if (offset !== size) throw new Error('Truncated pipe data');
        verify(bytes);
        scope.postMessage({ elapsedMs, firstByteMs, bytes: offset });
      }
    } else if (data.op === 'opfs') {
      size = data.size;
      bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) bytes[i] = pattern(i);
      const writer = new FileStream({
        kind: 'file',
        id: 1,
        direction: 'out',
        file: data.file,
        position: 0,
        append: false,
      });
      const writeStart = performance.now();
      try {
        await writer.open();
        writer.truncate(0);
        let offset = 0;
        while (offset < size) {
          const n = await writer.write(bytes.subarray(offset, offset + 16384));
          if (!n) throw new Error('Zero-length OPFS write');
          offset += n;
        }
      } finally {
        writer.close();
      }
      const writeMs = performance.now() - writeStart;
      const reader = new FileStream({
        kind: 'file',
        id: 1,
        direction: 'in',
        file: data.file,
        position: 0,
        append: false,
      });
      const received = new Uint8Array(size);
      let offset = 0;
      const readStart = performance.now();
      try {
        await reader.open(true);
        for (;;) {
          const chunk = await reader.read(16384);
          if (!chunk.length) break;
          if (offset + chunk.length > size) throw new Error('Excess OPFS data');
          received.set(chunk, offset);
          offset += chunk.length;
        }
      } finally {
        reader.close();
      }
      const readMs = performance.now() - readStart;
      if (offset !== size) throw new Error('Truncated OPFS data');
      verify(received);
      scope.postMessage({ writeMs, readMs, bytes: offset });
    } else throw new Error(`Unknown I/O operation: ${data.op}`);
  } catch (error) {
    scope.postMessage({ error: String(error) });
  }
};
