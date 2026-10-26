import { FileStream, ioError, type Stream } from './streams.js';
import type { StreamRef } from './protocol.js';

export class StreamFailure {
  constructor(
    public message: string,
    public code?: string,
  ) {}
  toDebugString() {
    return this.message;
  }
  [Symbol.dispose]() {}
}
export const streamError = (error: unknown) => ({
  tag: 'last-operation-failed',
  val: new StreamFailure(String(error), String(ioError(error).errno)),
});
const closed = () => ({ tag: 'closed' });
const length = (n: bigint) => Number(n > 65536n ? 65536n : n);

/** A level-triggered view of one source. Polling never installs extra ports. */
export class Pollable {
  private dropped = false;
  private watchers = new Map<() => void, () => void>();
  constructor(
    private isReady: () => boolean = () => true,
    private listen: (wake: () => void) => () => void = () => () => {},
  ) {}
  ready() {
    if (this.dropped) throw new Error('pollable was dropped');
    return this.isReady();
  }
  watch(wake: () => void) {
    if (this.dropped) {
      wake();
      return () => {};
    }
    const notify = () => wake();
    const remove = this.listen(notify);
    this.watchers.set(notify, remove);
    return () => {
      remove();
      this.watchers.delete(notify);
    };
  }
  block() {
    return poll([this]).then(() => {});
  }
  [Symbol.dispose]() {
    this.dropped = true;
    for (const [wake, remove] of [...this.watchers]) {
      remove();
      wake();
    }
    this.watchers.clear();
  }
}
export async function poll(list: Pollable[]): Promise<Uint32Array> {
  if (!list.length) throw new Error('poll requires at least one pollable');
  const ready = () => list.flatMap((p, i) => (p.ready() ? [i] : []));
  let indices = ready();
  if (indices.length) return new Uint32Array(indices);
  await new Promise<void>((resolve, reject) => {
    const removers: (() => void)[] = [];
    const check = () => {
      try {
        indices = ready();
      } catch (error) {
        for (const remove of removers) remove();
        reject(error);
        return;
      }
      if (!indices.length) return;
      for (const remove of removers) remove();
      resolve();
    };
    for (const p of list) removers.push(p.watch(check));
    check();
  });
  return new Uint32Array(ready());
}

export interface SharedStream {
  resources: Set<StreamResource>;
  moved: boolean;
  permit?: number;
}
export abstract class StreamResource {
  protected live = true;
  constructor(
    public stream: Stream,
    private release: (s: StreamResource, moved: boolean) => void = () => {},
    protected shared?: SharedStream,
  ) {
    shared?.resources.add(this);
  }
  protected check() {
    if (!this.live || this.shared?.moved) throw closed();
  }
  protected operation<T>(fn: () => T): T {
    this.check();
    try {
      return fn();
    } catch (error) {
      throw streamError(error);
    }
  }
  subscribe() {
    this.check();
    return new Pollable(
      () => !this.live || this.ready(),
      (wake) => this.stream.onReady(wake),
    );
  }
  protected abstract ready(): boolean;
  take(): StreamRef {
    this.check();
    if (this.shared && this.shared.resources.size > 1) {
      this[Symbol.dispose]();
      throw new Error('Cannot transfer stdio while another local resource owns it');
    }
    if (this.shared) {
      this.shared.moved = true;
      this.shared.resources.delete(this);
    }
    this.live = false;
    this.release(this, true);
    return this.stream.detach();
  }
  [Symbol.dispose]() {
    if (!this.live) return;
    this.live = false;
    if (this.shared) {
      this.shared.resources.delete(this);
      // Ambient stdio survives an individual getter resource's drop.
      this.release(this, true);
      return;
    }
    try {
      this.stream.close();
    } finally {
      this.release(this, false);
    }
  }
}
export class InputStream extends StreamResource {
  protected ready() {
    return this.stream.readable();
  }
  read(len: bigint) {
    const bytes = this.operation(() => this.stream.readNow(length(len)));
    if (bytes?.length === 0 && len !== 0n) throw closed();
    return bytes ?? new Uint8Array();
  }
  async blockingRead(len: bigint) {
    this.check();
    if (len !== 0n) {
      const p = this.subscribe();
      try {
        await p.block();
      } finally {
        p[Symbol.dispose]();
      }
    }
    return this.read(len);
  }
  skip(len: bigint) {
    return BigInt(this.read(len).length);
  }
  async blockingSkip(len: bigint) {
    return BigInt((await this.blockingRead(len)).length);
  }
}
export class OutputStream extends StreamResource {
  private localPermit = 0;
  private get permit() {
    return this.shared ? (this.shared.permit ?? 0) : this.localPermit;
  }
  private set permit(value: number) {
    if (this.shared) this.shared.permit = value;
    else this.localPermit = value;
  }
  protected ready() {
    try {
      return this.stream.writable() > 0;
    } catch {
      return true;
    }
  }
  checkWrite() {
    this.permit = this.operation(() => this.stream.writable());
    return BigInt(this.permit);
  }
  write(bytes: Uint8Array) {
    this.check();
    if (bytes.length > this.permit) throw new Error('write exceeds check-write permit');
    this.permit = 0;
    this.operation(() => {
      if (this.stream.writeNow(bytes) !== bytes.length) throw new Error('short nonblocking write');
    });
  }
  flush() {
    this.permit = 0;
    this.operation(() => {
      if (this.stream instanceof FileStream) this.stream.flush();
    });
  }
  async blockingFlush() {
    this.flush();
  }
  async blockingWriteAndFlush(bytes: Uint8Array) {
    if (bytes.length > 4096) throw new Error('blocking-write-and-flush exceeds 4096 bytes');
    let offset = 0;
    while (offset < bytes.length) {
      await this.subscribe().block();
      const count = Math.min(Number(this.checkWrite()), bytes.length - offset);
      this.write(bytes.subarray(offset, offset + count));
      offset += count;
    }
    this.flush();
  }
  writeZeroes(len: bigint) {
    if (len > BigInt(this.permit)) throw new Error('write-zeroes exceeds check-write permit');
    this.write(new Uint8Array(Number(len)));
  }
  async blockingWriteZeroesAndFlush(len: bigint) {
    if (len > 4096n) throw new Error('blocking-write-zeroes-and-flush exceeds 4096 bytes');
    await this.blockingWriteAndFlush(new Uint8Array(Number(len)));
  }
  splice(input: InputStream, len: bigint) {
    const count = len < this.checkWrite() ? len : BigInt(this.permit);
    const bytes = input.read(count);
    this.write(bytes);
    return BigInt(bytes.length);
  }
  async blockingSplice(input: InputStream, len: bigint) {
    await this.subscribe().block();
    await input.subscribe().block();
    return this.splice(input, len);
  }
}
