import { RpcFailure, type StreamRef } from './protocol';
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
    } else if (m.type === 'close') this.eof = true;
    else if (m.type === 'broken') this.error = new IoError(64, 'broken pipe');
    else {
      this.fail('invalid pipe message');
      return;
    }
    this.wake();
  }
  private wake() {
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
  async read(n: number) {
    if (this.ref.direction !== 'in' || this.closed) throw new IoError(8, 'not readable');
    if (n === 0) return new Uint8Array();
    while (!this.available && !this.eof && !this.error && !this.closed) await this.changed();
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
    return bytes;
  }
  async write(b: Uint8Array) {
    if (this.ref.direction !== 'out' || this.closed) throw new IoError(8, 'not writable');
    if (!b.length) return 0;
    while (
      this.ref.kind === 'pipe' &&
      this.sent - this.ack >= this.ref.capacity &&
      !this.error &&
      !this.closed
    )
      await this.changed();
    if (this.error) throw this.error;
    if (this.closed) throw new IoError(8, 'closed stream');
    const n =
      this.ref.kind === 'tty'
        ? b.length
        : Math.min(b.length, this.ref.capacity - (this.sent - this.ack), 16384);
    const bytes = b.slice(0, n);
    this.sent += n;
    this.ref.port.postMessage({ type: 'data', bytes: bytes.buffer }, [bytes.buffer]);
    return n;
  }
  close() {
    if (this.closed) return;
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
  async read() {
    return new Uint8Array();
  }
  async write(b: Uint8Array) {
    return b.length;
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
  async open() {
    if (this.ref.direction === 'out') this.access = await this.ref.file.createSyncAccessHandle();
    return this;
  }
  async read(n: number) {
    if (this.closed || this.ref.direction !== 'in') throw new IoError(8, 'not readable');
    const f = await this.ref.file.getFile();
    const b = new Uint8Array(await f.slice(this.ref.position, this.ref.position + n).arrayBuffer());
    this.ref.position += b.length;
    return b;
  }
  async write(b: Uint8Array) {
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
    this.access?.flush();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.access?.flush();
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
export async function connect(ref: StreamRef): Promise<Stream> {
  return ref.kind === 'file'
    ? new FileStream(ref).open()
    : ref.kind === 'null'
      ? new NullStream(ref)
      : new PortStream(ref);
}
