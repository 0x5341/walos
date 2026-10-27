import {
  ServiceError,
  type ErrorCode,
  type ProcessContext,
  type InputStream as PublicInput,
  type OutputStream as PublicOutput,
  type FileDescriptor,
  type EnvironmentEntry,
  type Exit,
  type ChildProcess as PublicChild,
  type DescriptorFlags,
  type OpenFlags,
  type PathFlags,
} from '../types.js';
import { Rpc, RpcFailure, transferables, type Spec, type StreamRef } from './protocol.js';
import { Filesystem } from './fs.js';
import { Descriptor, DirectoryEntryStream, P2Filesystem } from './p2-fs.js';
import { InputStream, OutputStream, Pollable, StreamResource, type SharedStream } from './p2-io.js';
import { connect, FileStream, ioError } from './streams.js';
import { createRandom, environment, monotonicClock, wallClock } from './services.js';

export const serviceError = (error: unknown): ServiceError => {
  if (error instanceof ServiceError) return error;
  if (error instanceof RpcFailure)
    return new ServiceError(error.kind, error.message, { cause: error });
  if (error && typeof error === 'object' && 'tag' in error) {
    const e = error as { tag: string; val?: { message: string; code?: string } };
    if (e.tag === 'closed') return new ServiceError('closed', 'Stream is closed', { cause: error });
    if (e.val)
      return serviceError(Object.assign(new Error(e.val.message), { errno: Number(e.val.code) }));
  }
  if (typeof error === 'string')
    return new ServiceError(
      error === 'bad-descriptor'
        ? 'invalid-resource'
        : error === 'read-only'
          ? 'access'
          : (error as ErrorCode),
      error,
    );
  const errno =
    error && typeof error === 'object' && 'errno' in error
      ? Number(error.errno)
      : ioError(error).errno;
  const code: ErrorCode =
    (
      {
        2: 'access',
        8: 'invalid-resource',
        10: 'busy',
        20: 'exist',
        28: 'invalid',
        31: 'is-directory',
        44: 'no-entry',
        51: 'quota',
        52: 'unsupported',
        54: 'not-directory',
        55: 'not-empty',
        64: 'broken-pipe',
        76: 'not-permitted',
      } as Record<number, ErrorCode>
    )[errno] ?? 'io';
  return new ServiceError(code, error instanceof Error ? error.message : String(error), {
    cause: error,
  });
};
const call = async <T>(fn: () => T | Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    throw serviceError(error);
  }
};
const size = (length: bigint) => {
  if (length < 0n) throw new ServiceError('invalid', 'Negative byte length');
  return Number(length > 65536n ? 65536n : length);
};
export class HostResources {
  private resources = new Set<Resource>();
  private closing = false;
  private pending = new Set<Promise<unknown>>();
  private failures: unknown[] = [];
  failed(error: unknown) {
    if (this.closing) this.failures.push(error);
  }
  track<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise);
    void promise.finally(() => this.pending.delete(promise)).catch(() => {});
    return promise;
  }
  private streams = new Set<StreamResource>();
  private releases = new Map<StreamResource, Promise<unknown>>();
  private streamViews = new WeakMap<object, StreamResource>();
  private descriptorViews = new WeakMap<object, Descriptor>();
  private fs: P2Filesystem;
  private standard: { stream: Awaited<ReturnType<typeof connect>>; shared: SharedStream }[] = [];
  readonly context: ProcessContext;
  constructor(
    root: FileSystemDirectoryHandle,
    pid: number,
    argv: readonly string[],
    env: Record<string, string>,
    private rpc: Rpc,
    readonly check: () => void,
  ) {
    this.fs = new P2Filesystem(
      new Filesystem(root, root, '/'),
      (s) => this.streams.add(s),
      (s, moved) => {
        this.streams.delete(s);
        if (s.stream.ref.id && !moved)
          this.releases.set(s, this.rpc.call({ op: 'stream-close', streamId: s.stream.ref.id }));
      },
    );
    const owner = this;
    const random = createRandom();
    const guarded = <T extends object>(object: T): T =>
      Object.freeze(
        Object.fromEntries(
          Object.entries(object).map(([key, fn]) => [
            key,
            (...args: unknown[]) => {
              check();
              return fn(...args);
            },
          ]),
        ),
      ) as T;
    this.context = Object.freeze({
      pid,
      ppid: null,
      args: Object.freeze([...argv]),
      env: guarded(environment(env)),
      fs: Object.freeze({
        getDirectories: () => {
          check();
          return Object.freeze(
            (
              [
                [
                  owner.fs.descriptor(owner.fs.fs.get(3), {
                    read: true,
                    write: true,
                    mutateDirectory: true,
                  }),
                  '/',
                ],
              ] as [Descriptor, string][]
            ).map(([d, path]) => Object.freeze([owner.descriptor(d), path] as const)),
          );
        },
      }),
      process: Object.freeze({ spawn: this.spawn.bind(this) }),
      io: Object.freeze({
        get stdin() {
          return owner.standardStream(0) as PublicInput;
        },
        get stdout() {
          return owner.standardStream(1) as PublicOutput;
        },
        get stderr() {
          return owner.standardStream(2) as PublicOutput;
        },
        createPipe: async () => {
          check();
          return this.track(
            call(async () => {
              const refs: StreamRef[] = await rpc.call({ op: 'pipe' });
              const input = new InputStream(await connect(refs[0]), this.release);
              const output = new OutputStream(await connect(refs[1]), this.release);
              this.streams.add(input);
              this.streams.add(output);
              return Object.freeze([this.input(input), this.output(output)] as const);
            }),
          );
        },
      }),
      clock: Object.freeze({
        wall: guarded(wallClock),
        monotonic: guarded({
          now: monotonicClock.now,
          resolution: monotonicClock.resolution,
          subscribeInstant: (instant: bigint) =>
            this.pollable(monotonicClock.subscribeInstant(instant)),
          subscribeDuration: (duration: bigint) =>
            this.pollable(monotonicClock.subscribeDuration(duration)),
        }),
      }),
      random: guarded(random),
    });
  }
  private release = (s: StreamResource, moved: boolean) => {
    this.streams.delete(s);
    if (s.stream.ref.id && !moved)
      this.releases.set(s, this.rpc.call({ op: 'stream-close', streamId: s.stream.ref.id }));
  };
  async init() {
    for (let i = 0; i < 3; i++)
      this.standard.push({
        stream: await connect({ kind: 'null', id: 0, direction: i === 0 ? 'in' : 'out' }),
        shared: { resources: new Set(), moved: false },
      });
  }
  add(r: Resource) {
    this.resources.add(r);
    if (this.closing)
      queueMicrotask(() => {
        void r.dispose().catch(() => {});
      });
  }
  remove(r: Resource) {
    this.resources.delete(r);
  }
  private standardStream(index: number) {
    this.check();
    const { stream, shared } = this.standard[index];
    const resource =
      index === 0
        ? new InputStream(stream, this.release, shared)
        : new OutputStream(stream, this.release, shared);
    this.streams.add(resource);
    return resource instanceof InputStream ? this.input(resource) : this.output(resource);
  }
  pollable(p: Pollable) {
    const r = new Resource(this, () => p[Symbol.dispose]());
    const pending = new Set<(error: ServiceError) => void>();
    r.onDrop = () => {
      for (const reject of pending)
        reject(new ServiceError('invalid-resource', 'Pollable was disposed'));
      pending.clear();
    };
    return Object.freeze({
      ready: () => r.run(() => p.ready()),
      block: () => {
        r.assert();
        return new Promise<void>((resolve, reject) => {
          pending.add(reject);
          call(() => p.block())
            .then(resolve, reject)
            .finally(() => pending.delete(reject));
        });
      },
      [Symbol.asyncDispose]: () => r.dispose(),
    });
  }
  private streamResource(s: StreamResource) {
    return new Resource(
      this,
      async () => {
        let failure: unknown;
        try {
          if (s.stream instanceof FileStream) await s.stream.finish();
        } catch (e) {
          failure = e;
        }
        s[Symbol.dispose]();
        await this.releases.get(s);
        this.releases.delete(s);
        if (failure) throw failure;
      },
      s.stream instanceof FileStream,
    );
  }
  private input(s: InputStream): PublicInput {
    const r = this.streamResource(s);
    const read = (length: bigint, blocking = false) =>
      r.async(async () => {
        size(length);
        if (s.stream instanceof FileStream) {
          const bytes = await s.stream.read(size(length));
          if (!bytes.length && length !== 0n) throw new ServiceError('closed', 'End of stream');
          return bytes;
        }
        return blocking ? s.blockingRead(length) : s.read(length);
      });
    const view = Object.freeze({
      read,
      blockingRead: (n: bigint) => read(n, true),
      skip: async (n: bigint) => BigInt((await read(n)).length),
      blockingSkip: async (n: bigint) => BigInt((await read(n, true)).length),
      subscribe: () => r.run(() => this.pollable(s.subscribe())),
      [Symbol.asyncDispose]: () => r.dispose(),
    });
    this.streamViews.set(view, s);
    // Moving the endpoint invalidates this public resource immediately.
    r.moved = () => s.take();
    this.moves.set(view, r);
    return view;
  }
  private output(s: OutputStream): PublicOutput {
    const r = this.streamResource(s);
    let permit = 0;
    const flush = () => {
      permit = 0;
      return r.async(() => (s.stream instanceof FileStream ? s.stream.flushAsync() : s.flush()));
    };
    const view = Object.freeze({
      checkWrite: () =>
        r.run(() => {
          permit = Number(s.checkWrite());
          return BigInt(permit);
        }),
      write: (bytes: Uint8Array) =>
        r.async(async () => {
          if (bytes.length > permit)
            throw new ServiceError('invalid', 'Write exceeds checkWrite permit');
          permit = 0;
          if (s.stream instanceof FileStream) await s.stream.write(bytes.slice());
          else s.write(bytes);
        }),
      flush,
      blockingFlush: flush,
      subscribe: () => r.run(() => this.pollable(s.subscribe())),
      [Symbol.asyncDispose]: () => r.dispose(),
    });
    this.streamViews.set(view, s);
    r.moved = () => s.take();
    this.moves.set(view, r);
    return view;
  }
  private preparations: Promise<void>[] = [];
  private moves = new WeakMap<object, Resource>();
  private descriptor(d: Descriptor): FileDescriptor {
    const r = new Resource(this, () => d[Symbol.dispose]());
    const view: FileDescriptor = Object.freeze({
      getType: () => r.run(() => d.getType() as 'directory' | 'regular-file'),
      getFlags: () => r.run(() => Object.freeze(d.getFlags())),
      openAt: (pf: PathFlags, p: string, of: OpenFlags, f: DescriptorFlags) =>
        r.async(async () => this.descriptor(await d.openAt(pf, p, of, f))),
      stat: () => r.async(() => d.stat()),
      statAt: (pf: PathFlags, p: string) => r.async(() => d.statAt(pf, p)),
      readViaStream: (offset: bigint) =>
        r.async(async () => this.input(await d.readViaStream(offset))),
      writeViaStream: (offset: bigint) =>
        r.async(async () => this.output(await d.writeViaStream(offset))),
      appendViaStream: () => r.async(async () => this.output(await d.appendViaStream())),
      read: (len: bigint, offset: bigint) =>
        r.async(async () => {
          size(len);
          return (await d.read(len, offset)) as [Uint8Array, boolean];
        }),
      write: (bytes: Uint8Array, offset: bigint) => r.async(() => d.write(bytes.slice(), offset)),
      setSize: (n: bigint) => r.async(() => d.setSize(n)),
      sync: () => r.async(() => d.sync()),
      readDirectory: () => r.async(async () => this.directory(await d.readDirectory())),
      createDirectoryAt: (p: string) => r.async(() => d.createDirectoryAt(p)),
      removeDirectoryAt: (p: string) => r.async(() => d.removeDirectoryAt(p)),
      unlinkFileAt: (p: string) => r.async(() => d.unlinkFileAt(p)),
      renameAt: (p: string, to: FileDescriptor, np: string) =>
        r.async(() => {
          const target = this.descriptorViews.get(to);
          if (!target) throw new ServiceError('invalid-resource', 'Foreign descriptor');
          return d.renameAt(p, target, np);
        }),
      isSameObject: (other: FileDescriptor) =>
        r.async(() => {
          const target = this.descriptorViews.get(other);
          if (!target) throw new ServiceError('invalid-resource', 'Foreign descriptor');
          return d.isSameObject(target);
        }),
      [Symbol.asyncDispose]: () => r.dispose(),
    });
    this.descriptorViews.set(view, d);
    return view;
  }
  private directory(d: DirectoryEntryStream) {
    const r = new Resource(this, () => d.closeAsync());
    return Object.freeze({
      readDirectoryEntry: () =>
        r.async(
          async () =>
            (await d.readDirectoryEntry()) as
              | { name: string; type: 'directory' | 'regular-file' }
              | undefined,
        ),
      [Symbol.asyncDispose]: () => r.dispose(),
    });
  }
  private spawn(
    executable: FileDescriptor,
    argv: readonly string[],
    env: readonly EnvironmentEntry[],
    stdin?: PublicInput,
    stdout?: PublicOutput,
    stderr?: PublicOutput,
  ): Promise<PublicChild> {
    // All explicit endpoints move synchronously, including when another argument is invalid.
    const refs: (StreamRef | null)[] = [];
    let failure: unknown;
    for (const stream of [stdin, stdout, stderr]) {
      try {
        if (!stream) {
          refs.push(null);
          continue;
        }
        const r = this.moves.get(stream);
        if (!r) throw new ServiceError('invalid-resource', 'Foreign stream');
        const source = this.streamViews.get(stream)!;
        refs.push(r.take());
        if (source.stream instanceof FileStream) this.preparations.push(source.stream.finish());
      } catch (e) {
        refs.push(null);
        failure ??= e;
      }
    }
    const preparations = this.preparations.splice(0);
    let spec: Spec;
    try {
      this.check();
      if (failure) throw failure;
      if (refs.some((ref, i) => ref && ref.direction !== (i === 0 ? 'in' : 'out')))
        throw new ServiceError('invalid-resource', 'Stream direction mismatch');
      const d = this.descriptorViews.get(executable);
      if (!d) throw new ServiceError('invalid-resource', 'Foreign executable descriptor');
      d.check();
      if (!d.data.file || !d.getFlags().read)
        throw new ServiceError('invalid-resource', 'Executable must be a readable file');
      spec = {
        file: d.data.file,
        argv: [...argv],
        env: Object.fromEntries(env.map(({ key, value }) => [key, value])),
        stdio: refs,
      };
    } catch (e) {
      return call(async () => {
        await Promise.allSettled(preparations);
        await this.releaseRefs(refs);
        throw e;
      });
    }
    return this.track(
      call(async () => {
        let pid: number;
        try {
          await Promise.all(preparations);
          pid = await this.rpc.call({ op: 'spawn', spec }, transferables(refs));
        } catch (e) {
          await this.releaseRefs(refs);
          throw e;
        }
        const r = new Resource(this, () => this.rpc.call({ op: 'drop', pid }));
        let consumed = false;
        return Object.freeze({
          pid: () => r.run(() => pid),
          wait: () => {
            try {
              r.assert();
              if (consumed) throw new ServiceError('already-consumed', 'wait already consumed');
              consumed = true;
              return call(() => this.rpc.call({ op: 'wait', pid }) as Promise<Exit>);
            } catch (e) {
              return Promise.reject(serviceError(e));
            }
          },
          requestStop: () => r.async(() => this.rpc.call({ op: 'stop', pid })),
          [Symbol.asyncDispose]: () => r.dispose(),
        });
      }),
    );
  }
  private async releaseRefs(refs: (StreamRef | null)[]) {
    await Promise.all(
      refs.map(async (ref) => {
        if (!ref) return;
        if (ref.kind === 'pipe' || ref.kind === 'tty')
          try {
            ref.port.postMessage({ type: ref.direction === 'in' ? 'broken' : 'close' });
            ref.port.close();
          } catch {}
        if (ref.id) await this.rpc.call({ op: 'stream-close', streamId: ref.id }).catch(() => {});
      }),
    );
  }
  gone(id: number) {
    for (const s of this.streams) if (s.stream.ref.id === id) s.stream.gone();
  }
  async dispose() {
    this.closing = true;
    const results = await Promise.allSettled([...this.resources].map((r) => r.dispose()));
    await Promise.allSettled([...this.pending]);
    results.push(...(await Promise.allSettled([...this.resources].map((r) => r.dispose()))));
    this.fs.close();
    const failed = results.find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    if (this.failures.length) throw this.failures[0];
  }
}
class Resource {
  private live = true;
  private disposal?: Promise<void>;
  private pending = new Set<Promise<unknown>>();
  moved?: () => StreamRef;
  onDrop?: () => void;
  constructor(
    private owner: HostResources,
    private drop: () => unknown,
    private drainFirst = true,
  ) {
    owner.add(this);
  }
  assert() {
    this.owner.check();
    if (!this.live) throw new ServiceError('invalid-resource', 'Resource is disposed or moved');
  }
  run<T>(fn: () => T): T {
    this.assert();
    try {
      return fn();
    } catch (e) {
      throw serviceError(e);
    }
  }
  async<T>(fn: () => T | Promise<T>): Promise<T> {
    const pending = call(() => {
      this.assert();
      return fn();
    });
    this.pending.add(pending);
    void pending.finally(() => this.pending.delete(pending)).catch(() => {});
    return this.owner.track(pending);
  }
  take() {
    this.assert();
    if (this.pending.size) {
      void this.dispose().catch(() => {});
      throw new ServiceError('busy', 'Cannot move a stream with pending I/O');
    }
    this.live = false;
    this.owner.remove(this);
    return this.moved!();
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    if (!this.live) return Promise.resolve();
    this.live = false;
    this.onDrop?.();
    this.disposal = call(async () => {
      try {
        if (this.drainFirst) await Promise.allSettled([...this.pending]);
        await this.drop();
        if (!this.drainFirst) await Promise.allSettled([...this.pending]);
      } catch (error) {
        this.owner.failed(error);
        throw error;
      } finally {
        this.owner.remove(this);
      }
    });
    return this.disposal;
  }
}
