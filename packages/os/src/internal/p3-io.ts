import type { Stream } from './streams.js';

// Translate canonical WASI P3 byte streams to the existing Worker-local,
// flow-controlled streams. No bytes are relayed through the Core Worker.
export function p3Readable(stream: Stream, check: () => void = () => {}) {
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        check();
        const bytes = await stream.read(65536);
        check();
        if (bytes.length === 0) controller.close();
        else controller.enqueue(bytes);
      },
      // Cancelling one P3 reader must not dispose the process-owned stdio.
    },
    { highWaterMark: 1 },
  );
}

export function p3Writable(stream: Stream, check: () => void = () => {}) {
  return new WritableStream<Uint8Array>({
    async write(bytes) {
      // A PortStream permits no more than 16 KiB at once; a single canonical
      // stream chunk can be much larger. Preserve backpressure and byte order.
      let offset = 0;
      while (offset < bytes.length) {
        check();
        const written = await stream.write(bytes.subarray(offset));
        if (!Number.isSafeInteger(written) || written <= 0 || written > bytes.length - offset)
          throw new Error('Invalid WASI P3 stream write result');
        offset += written;
      }
    },
    // stdio ownership belongs to the process; Wasi3.close() signals EOF.
  });
}
