import { RpcFailure, type StreamRef } from './protocol.js';
import { getTimeline, traceOperation } from './diagnostics.js';
export class IoError extends Error {
  constructor(
    public errno: number,
    message: string,
  ) {
    super(message);
  }
}
export const ioError = (e: unknown): IoError =>
  e instanceof IoError
    ? e
    : new IoError(
        e instanceof DOMException
          ? ({
              NotFoundError: 44,
              NotAllowedError: 2,
              NoModificationAllowedError: 10,
              InvalidModificationError: 29,
              QuotaExceededError: 51,
              TypeMismatchError: 54,
            }[e.name] ?? 29)
          : e instanceof RpcFailure
            ? { 'invalid-resource': 8, startup: 29, timeout: 73, cancelled: 11, internal: 29 }[
                e.kind
              ]
            : 29,
        String(e),
      );
export interface Stream {
  ref: StreamRef;
  read(n: number): Promise<Uint8Array>;
  write(b: Uint8Array): Promise<number>;
  close(): void;
  detach(): StreamRef;
  gone(): void;
  readNow(n: number): Uint8Array | undefined;
  writeNow(b: Uint8Array): number;
  readable(): boolean;
  writable(): number;
  onReady(listener: () => void): () => void;
}
export class PortStream implements Stream {
  private queue: Uint8Array[] = [];
  private available = 0;
  private sent = 0;
  private ack = 0;
  private consumed = 0;
  private eof = false;
  private closed = false;
  private error?: IoError;
  private waiters = new Set<() => void>();
  private listeners = new Set<() => void>();
  constructor(public ref: Extract<StreamRef, { kind: 'tty' | 'pipe' }>) {
    if (ref.state) {
      const s = ref.state;
      this.queue = s.queue;
      this.available = s.queue.reduce((n, b) => n + b.length, 0);
      this.sent = s.sent;
      this.ack = s.ack;
      this.consumed = s.consumed;
      this.eof = s.eof;
      if (s.error) this.error = new IoError(s.error.errno, s.error.message);
      delete ref.state;
    }
    ref.port.onmessage = (e) => this.message(e.data);
    ref.port.onmessageerror = () => this.fail('message decode failure');
    ref.port.start();
  }
  private message(m: any) {
    if (this.closed) return;
    if (m.type === 'data') {
      if (this.ref.direction !== 'in' || !(m.bytes instanceof ArrayBuffer) || this.eof) {
        this.fail('invalid DATA');
        return;
      }
      const b = new Uint8Array(m.bytes);
      if (m.commandId !== undefined && getTimeline()) {
        getTimeline()!.config.commandId = m.commandId;
        getTimeline()!.mark('shell.input.port');
      }
      this.available += b.length;
      if (this.ref.kind === 'pipe' && this.available > this.ref.capacity) {
        this.fail('pipe capacity exceeded');
        return;
      }
      this.queue.push(b);
    } else if (m.type === 'ack') {
      if (
        this.ref.direction !== 'out' ||
        !Number.isSafeInteger(m.consumed) ||
        m.consumed < this.ack ||
        m.consumed > this.sent
      ) {
        this.fail('invalid cumulative ACK');
        return;
      }
      this.ack = m.consumed;
    } else if (m.type === 'close') {
      getTimeline()?.mark('stream.eof', { streamId: this.ref.id, kind: this.ref.kind });
      this.eof = true;
    } else if (m.type === 'broken') this.error = new IoError(64, 'broken pipe');
    else {
      this.fail('invalid pipe message');
      return;
    }
    this.wake();
  }
  onReady(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private wake() {
    for (const listener of this.listeners) listener();
    for (const w of this.waiters) w();
    this.waiters.clear();
  }
  private changed() {
    return new Promise<void>((resolve) => this.waiters.add(resolve));
  }
  private fail(message: string) {
    this.error = new IoError(29, message);
    this.ref.port.postMessage({ type: 'broken' });
    this.wake();
  }
  gone() {
    if (this.ref.direction === 'in') this.eof = true;
    else this.error = new IoError(64, 'broken pipe');
    this.wake();
  }
  readable() {
    return this.closed || !!this.available || this.eof || !!this.error;
  }
  writable() {
    if (this.closed) throw new IoError(8, 'closed stream');
    if (this.error) throw this.error;
    return this.ref.kind === 'tty'
      ? 65536
      : Math.min(16384, this.ref.capacity - (this.sent - this.ack));
  }
  async read(n: number) {
    for (;;) {
      const bytes = this.readNow(n);
      if (bytes !== undefined) return bytes;
      await this.changed();
    }
  }
  readNow(n: number) {
    if (this.ref.direction !== 'in' || this.closed) throw new IoError(8, 'not readable');
    if (n === 0) return new Uint8Array();
    if (!this.readable()) return undefined;
    if (this.error) throw this.error;
    const bytes = new Uint8Array(Math.min(n, this.available));
    let offset = 0;
    while (offset < bytes.length) {
      const head = this.queue[0],
        count = Math.min(head.length, bytes.length - offset);
      bytes.set(head.subarray(0, count), offset);
      offset += count;
      count === head.length ? this.queue.shift() : (this.queue[0] = head.subarray(count));
    }
    this.available -= bytes.length;
    this.consumed += bytes.length;
    // Every completed read ACKs promptly; this also releases a writer after small reads.
    if (bytes.length && this.ref.kind === 'pipe')
      this.ref.port.postMessage({ type: 'ack', consumed: this.consumed });
    getTimeline()?.mark('stream.read', {
      streamId: this.ref.id,
      kind: this.ref.kind,
      bytes: bytes.length,
    });
    return bytes;
  }
  async write(b: Uint8Array) {
    while (!this.writable() && b.length) await this.changed();
    return this.writeNow(b);
  }
  writeNow(b: Uint8Array) {
    if (this.ref.direction !== 'out') throw new IoError(8, 'not writable');
    const n = Math.min(b.length, this.writable());
    const bytes = b.slice(0, n);
    this.sent += n;
    this.ref.port.postMessage({ type: 'data', bytes: bytes.buffer }, [bytes.buffer]);
    getTimeline()?.mark('stream.write', { streamId: this.ref.id, kind: this.ref.kind, bytes: n });
    return n;
  }
  close() {
    if (this.closed) return;
    getTimeline()?.mark('stream.close', { streamId: this.ref.id, kind: this.ref.kind });
    this.ref.port.postMessage({ type: this.ref.direction === 'in' ? 'broken' : 'close' });
    this.closed = true;
    this.wake();
    this.ref.port.close();
  }
  detach() {
    if (this.closed) throw new IoError(8, 'closed endpoint');
    this.ref.state = {
      queue: this.queue,
      sent: this.sent,
      ack: this.ack,
      consumed: this.consumed,
      eof: this.eof,
      error: this.error ? { errno: this.error.errno, message: this.error.message } : undefined,
    };
    this.ref.port.onmessage = null;
    this.closed = true;
    this.wake();
    return this.ref;
  }
}
class NullStream implements Stream {
  constructor(public ref: Extract<StreamRef, { kind: 'null' }>) {}
  readNow() {
    return new Uint8Array();
  }
  writeNow(b: Uint8Array) {
    return b.length;
  }
  readable() {
    return true;
  }
  writable() {
    return 65536;
  }
  onReady(_listener: () => void) {
    return () => {};
  }
  async read() {
    return this.readNow();
  }
  async write(b: Uint8Array) {
    return this.writeNow(b);
  }
  close() {}
  gone() {}
  detach() {
    return this.ref;
  }
}
export class FileStream implements Stream {
  private access?: FileSystemSyncAccessHandle;
  private closed = false;
  constructor(public ref: Extract<StreamRef, { kind: 'file' }>) {}
  async open(syncRead = false) {
    if (syncRead && this.ref.direction === 'in')
      this.access = await this.ref.file.createSyncAccessHandle({ mode: 'read-only' });
    if (this.ref.direction === 'out') this.access = await this.ref.file.createSyncAccessHandle();
    return this;
  }
  onReady(_listener: () => void) {
    return () => {};
  }
  readable() {
    return true;
  }
  writable() {
    if (this.closed) throw new IoError(8, 'closed stream');
    return 65536;
  }
  readNow(n: number) {
    if (this.closed || this.ref.direction !== 'in' || !this.access)
      throw new IoError(8, 'not readable');
    const bytes = new Uint8Array(n);
    const count = this.access.read(bytes, { at: this.ref.position });
    this.ref.position += count;
    return bytes.subarray(0, count);
  }
  async read(n: number) {
    if (this.access && this.ref.direction === 'in') return this.readNow(n);
    if (this.closed || this.ref.direction !== 'in') throw new IoError(8, 'not readable');
    const f = await traceOperation('getFile', this.ref.file.name, () => this.ref.file.getFile());
    const b = new Uint8Array(
      await traceOperation('arrayBuffer', this.ref.file.name, () =>
        f.slice(this.ref.position, this.ref.position + n).arrayBuffer(),
      ),
    );
    this.ref.position += b.length;
    return b;
  }
  async write(b: Uint8Array) {
    return this.writeNow(b);
  }
  writeNow(b: Uint8Array) {
    if (this.closed || !this.access) throw new IoError(8, 'not writable');
    if (this.ref.append) this.ref.position = this.access.getSize();
    const n = this.access.write(b, { at: this.ref.position });
    this.ref.position += n;
    return n;
  }
  truncate(n: number) {
    if (!this.access) throw new IoError(8, 'not writable');
    this.access.truncate(n);
  }
  flush() {
    if (this.ref.direction === 'out') this.access?.flush();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.ref.direction === 'out') this.access?.flush();
    } finally {
      this.access?.close();
      this.access = undefined;
    }
  }
  gone() {
    this.close();
  }
  detach() {
    this.close();
    return this.ref;
  }
}
export async function connect(ref: StreamRef, syncRead = false): Promise<Stream> {
  return ref.kind === 'file'
    ? new FileStream(ref).open(syncRead)
    : ref.kind === 'null'
      ? new NullStream(ref)
      : new PortStream(ref);
}
