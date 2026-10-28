import { createStream, cancelAsync, type Future, type Stream } from '../async.js';
import { ServiceError, type ProcessContext, type Exit } from '../types.js';
import type {
  Result,
  WasiFilesystemTypes as FS,
  WalosRuntimeIo as IO,
  WalosRuntimeProcess as Process,
} from '../wasi-types.js';

export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.tag === 'ok') return result.val;
  const value = result.val as any;
  const tag = typeof value === 'string' ? value : value?.tag;
  const code =
    (
      {
        'bad-descriptor': 'invalid-resource',
        pipe: 'broken-pipe',
        'read-only': 'access',
      } as Record<string, string>
    )[tag] ?? tag;
  throw new ServiceError(
    (code ?? 'io') as any,
    tag === 'other' ? (value.val ?? 'I/O failure') : String(tag),
    { cause: value },
  );
}
type OwnView = <T extends AsyncDisposable>(value: T) => T;
const identity: OwnView = (value) => value;
class View<T extends AsyncDisposable> implements AsyncDisposable {
  protected live = true;
  protected disposal?: Promise<void>;
  constructor(
    readonly resource: T,
    protected own: OwnView = identity,
    readonly namespace?: ProcessContext,
  ) {
    own(this);
  }
  protected assert() {
    if (!this.live) throw new ServiceError('invalid-resource', 'Resource is disposed or moved');
  }
  moved() {
    this.live = false;
  }
  [Symbol.asyncDispose]() {
    if (this.disposal) return this.disposal;
    this.live = false;
    return (this.disposal = Promise.resolve(this.resource[Symbol.asyncDispose]()));
  }
}
export class AbiPollable implements AsyncDisposable {
  private live = true;
  constructor(
    private isReady: () => boolean,
    private wait: () => Promise<void>,
    private cancel: () => void | PromiseLike<void> = () => {},
  ) {}
  ready() {
    if (!this.live) throw new ServiceError('invalid-resource', 'Pollable was disposed');
    return this.isReady();
  }
  block() {
    if (!this.live)
      return Promise.reject(new ServiceError('invalid-resource', 'Pollable was disposed'));
    return this.wait();
  }
  [Symbol.asyncDispose]() {
    this.live = false;
    return Promise.resolve(this.cancel());
  }
}
export class AbiInput extends View<IO.InputEndpoint> {
  private stream?: Stream<number>;
  private status?: Promise<Result<void, 'io' | 'pipe' | 'illegal-byte-sequence'>>;
  constructor(
    value: IO.InputEndpoint,
    readonly isTerminal = false,
    own: OwnView = identity,
    namespace?: ProcessContext,
  ) {
    super(value, own, namespace);
  }
  private source() {
    this.assert();
    if (!this.stream) {
      const [stream, future] = this.resource.readViaStream();
      this.stream = stream;
      this.status = Promise.resolve(future);
      void this.status.catch(() => {});
    }
    return this.stream;
  }
  private async receive(length: bigint, blocking: boolean) {
    this.assert();
    if (length < 0n) throw new ServiceError('invalid', 'Negative byte length');
    if (length === 0n) return new Uint8Array();
    const source = this.source();
    const maximum = Number(length > 65536n ? 65536n : length);
    const result = blocking ? await source.read(maximum) : await source.tryRead(maximum);
    this.assert();
    if (!blocking && result && 'tag' in result) {
      if (result.tag === 'pending') return new Uint8Array();
      if (result.tag === 'data') return Uint8Array.from(result.val);
    } else if (blocking && result !== undefined)
      return Uint8Array.from(result as ArrayLike<number>);
    unwrap(await this.status!);
    throw new ServiceError('closed', 'End of stream');
  }
  read(length: bigint) {
    return this.receive(length, false);
  }
  blockingRead(length: bigint) {
    return this.receive(length, true);
  }
  async skip(length: bigint) {
    return BigInt((await this.read(length)).length);
  }
  async blockingSkip(length: bigint) {
    return BigInt((await this.blockingRead(length)).length);
  }
  subscribe() {
    const stream = this.source();
    return this.own(
      new AbiPollable(
        () => !this.live || stream.ready(),
        () => stream.waitReady(),
      ),
    );
  }
  override moved() {
    super.moved();
    void this.stream?.cancel();
  }
  override [Symbol.asyncDispose]() {
    if (this.disposal) return this.disposal;
    this.live = false;
    const closed = this.resource[Symbol.asyncDispose]();
    return (this.disposal = Promise.all([this.stream?.cancel(), closed]).then(() => {}));
  }
}

type OutputState = {
  permit: number;
  bytes: number;
  tail: Promise<void>;
  flushing: boolean;
  listeners: Set<() => void>;
};
const outputState = (): OutputState => ({
  permit: 0,
  bytes: 0,
  tail: Promise.resolve(),
  flushing: false,
  listeners: new Set(),
});
const standardOutputs = new WeakMap<ProcessContext, readonly [OutputState, OutputState]>();

/** P2's bounded write permits over native P3 stream/future operations. */
export class AbiOutput extends View<IO.OutputEndpoint> {
  private get permit() {
    return this.state.permit;
  }
  private set permit(value: number) {
    this.state.permit = value;
  }
  private get bytes() {
    return this.state.bytes;
  }
  private set bytes(value: number) {
    this.state.bytes = value;
  }
  private get tail() {
    return this.state.tail;
  }
  private set tail(value: Promise<void>) {
    this.state.tail = value;
  }
  private active = new Set<Future<unknown>>();
  private failure: unknown;
  private get flushing() {
    return this.state.flushing;
  }
  private set flushing(value: boolean) {
    this.state.flushing = value;
  }
  private availability?: {
    minimum: number;
    future: Future<Result<bigint, 'io' | 'pipe' | 'illegal-byte-sequence'>>;
  };
  private capacity(): number {
    const minimum = this.bytes + 1;
    if (this.availability && this.availability.minimum !== minimum) {
      void this.availability.future.cancel();
      this.availability = undefined;
    }
    if (!this.availability) {
      const future = this.resource.whenWritable(BigInt(minimum));
      this.availability = { minimum, future };
      if (future.poll().tag === 'pending') void future.waitReady().then(() => this.wake());
    }
    const state = this.availability.future.poll();
    if (state.tag === 'pending') return 0;
    this.availability = undefined;
    if (state.tag === 'failed') throw state.error;
    return Math.max(0, Math.min(65536 - this.bytes, Number(unwrap(state.val)) - this.bytes));
  }
  private get listeners() {
    return this.state.listeners;
  }
  constructor(
    value: IO.OutputEndpoint,
    readonly isTerminal = false,
    own: OwnView = identity,
    namespace?: ProcessContext,
    private state: OutputState = outputState(),
  ) {
    super(value, own, namespace);
  }
  private wake() {
    for (const listener of [...this.listeners]) listener();
  }
  checkWrite() {
    this.assert();
    if (this.failure) throw this.failure;
    return BigInt((this.permit = this.flushing ? 0 : this.capacity()));
  }
  subscribe() {
    this.assert();
    return this.own(
      new AbiPollable(
        () => !this.live || !!this.failure || (!this.flushing && this.capacity() > 0),
        () =>
          new Promise<void>((resolve, reject) => {
            const check = () => {
              try {
                if (!this.live) {
                  this.listeners.delete(check);
                  reject(new ServiceError('invalid-resource', 'Output was disposed'));
                } else if (this.failure) {
                  this.listeners.delete(check);
                  reject(this.failure);
                } else if (!this.flushing && this.capacity() > 0) {
                  this.listeners.delete(check);
                  resolve();
                }
              } catch (error) {
                this.listeners.delete(check);
                reject(error);
              }
            };
            this.listeners.add(check);
            check();
          }),
      ),
    );
  }
  enqueue(bytes: Uint8Array) {
    this.assert();
    if (this.failure) throw this.failure;
    if (bytes.length > this.permit)
      throw new ServiceError('invalid', 'Write exceeds checkWrite permit');
    this.permit = 0;
    const channel = createStream<number>();
    const previous = this.tail.catch(() => {});
    let available = false;
    void previous.then(
      () => {
        available = true;
      },
      () => {
        available = true;
      },
    );
    const input: Stream<number> = {
      read: async (count) => {
        await previous;
        return channel.readable.read(count);
      },
      tryRead: async (count) => (available ? channel.readable.tryRead(count) : { tag: 'pending' }),
      ready: () => available && channel.readable.ready(),
      waitReady: async () => {
        await previous;
        await channel.readable.waitReady();
      },
      cancel: () => channel.readable.cancel(),
      [Symbol.asyncDispose]: () => channel.readable.cancel(),
    };
    const future = this.resource.writeViaStream(input);
    this.active.add(future);
    this.bytes += bytes.length;
    const producer = channel.writable.write(bytes.slice()).then(() => channel.writable.close());
    const status = Promise.resolve(future);
    this.tail = Promise.all([producer, status])
      .then(([, result]) => {
        unwrap(result);
      })
      .catch((error) => {
        this.failure = error;
        throw error;
      })
      .finally(() => {
        this.active.delete(future);
        this.bytes -= bytes.length;
        this.wake();
      });
    void this.tail.catch(() => {});
  }
  enqueueZeroes(length: bigint) {
    this.assert();
    if (length < 0n || length > BigInt(this.permit))
      throw new ServiceError('invalid', 'Write exceeds checkWrite permit');
    this.enqueue(new Uint8Array(Number(length)));
  }
  async write(bytes: Uint8Array) {
    this.enqueue(bytes);
    await this.tail;
    this.assert();
  }
  startFlush() {
    this.assert();
    this.permit = 0;
    this.flushing = true;
    void this.tail
      .finally(() => {
        this.flushing = false;
        this.wake();
      })
      .catch(() => {});
  }
  async flush() {
    this.startFlush();
    await this.tail;
    this.assert();
  }
  blockingFlush() {
    return this.flush();
  }
  finish(): Promise<void> {
    if (this.disposal) return this.disposal;
    if (!this.active.size) return this[Symbol.asyncDispose]();
    this.live = false;
    this.wake();
    return (this.disposal = this.tail.finally(() => this.resource[Symbol.asyncDispose]()));
  }
  override moved() {
    super.moved();
    void this.availability?.future.cancel();
    for (const future of this.active) void future.cancel();
    this.wake();
  }
  override [Symbol.asyncDispose]() {
    if (this.disposal) return this.disposal;
    this.live = false;
    void this.availability?.future.cancel();
    const cancel = [...this.active].map((value) => value.cancel());
    const release = this.resource[Symbol.asyncDispose]();
    this.wake();
    return (this.disposal = Promise.all([...cancel, release]).then(() => {}));
  }
}

export class AbiDescriptor extends View<FS.Descriptor> {
  constructor(
    value: FS.Descriptor,
    private context: ProcessContext,
    own: OwnView = identity,
  ) {
    super(value, own, context);
  }
  async getType() {
    this.assert();
    const type = unwrap(await this.resource.getType());
    return type.tag as 'directory' | 'regular-file';
  }
  async getFlags() {
    this.assert();
    return unwrap(await this.resource.getFlags());
  }
  async openAt(pf: FS.PathFlags, path: string, of: FS.OpenFlags, flags: FS.DescriptorFlags) {
    this.assert();
    return new AbiDescriptor(
      unwrap(await this.resource.openAt(pf, path, of, flags)),
      this.context,
      this.own,
    );
  }
  async stat() {
    this.assert();
    const value = unwrap(await this.resource.stat());
    return { ...value, type: value.type.tag as 'directory' | 'regular-file' };
  }
  async statAt(pf: FS.PathFlags, path: string) {
    this.assert();
    const value = unwrap(await this.resource.statAt(pf, path));
    return { ...value, type: value.type.tag as 'directory' | 'regular-file' };
  }
  async readViaStream(offset: bigint) {
    this.assert();
    return new AbiInput(
      unwrap(await this.context.walos.io.readViaDescriptor(this.resource, offset)),
      false,
      this.own,
      this.context,
    );
  }
  async writeViaStream(offset: bigint) {
    this.assert();
    return new AbiOutput(
      unwrap(await this.context.walos.io.writeViaDescriptor(this.resource, offset, false)),
      false,
      this.own,
      this.context,
    );
  }
  async appendViaStream() {
    this.assert();
    return new AbiOutput(
      unwrap(await this.context.walos.io.writeViaDescriptor(this.resource, 0n, true)),
      false,
      this.own,
      this.context,
    );
  }
  async read(length: bigint, offset: bigint) {
    this.assert();
    if (length < 0n) throw new ServiceError('invalid', 'Negative byte length');
    const input = await this.readViaStream(offset);
    let bytes: Uint8Array;
    try {
      try {
        bytes = await input.blockingRead(length);
      } catch (error) {
        if (!(error instanceof ServiceError) || error.code !== 'closed') throw error;
        bytes = new Uint8Array();
      }
    } finally {
      await input[Symbol.asyncDispose]();
    }
    return [bytes, offset + BigInt(bytes.length) >= (await this.stat()).size] as const;
  }
  async write(bytes: Uint8Array, offset: bigint) {
    this.assert();
    const output = await this.writeViaStream(offset);
    let position = 0;
    try {
      while (position < bytes.length) {
        const p = output.subscribe();
        try {
          await p.block();
        } finally {
          await p[Symbol.asyncDispose]();
        }
        const count = Math.min(Number(output.checkWrite()), bytes.length - position);
        await output.write(bytes.subarray(position, position + count));
        position += count;
      }
      await output.flush();
      return BigInt(position);
    } finally {
      await output[Symbol.asyncDispose]();
    }
  }
  async setSize(value: bigint) {
    this.assert();
    unwrap(await this.resource.setSize(value));
  }
  async sync() {
    this.assert();
    unwrap(await this.resource.sync());
  }
  async syncData() {
    this.assert();
    unwrap(await this.resource.syncData());
  }
  async advise(offset: bigint, length: bigint, advice: FS.Advice) {
    this.assert();
    unwrap(await this.resource.advise(offset, length, advice));
  }
  async setTimes(a: FS.NewTimestamp, m: FS.NewTimestamp) {
    this.assert();
    unwrap(await this.resource.setTimes(a, m));
  }
  async setTimesAt(pf: FS.PathFlags, path: string, a: FS.NewTimestamp, m: FS.NewTimestamp) {
    this.assert();
    unwrap(await this.resource.setTimesAt(pf, path, a, m));
  }
  async linkAt(pf: FS.PathFlags, path: string, to: AbiDescriptor, np: string) {
    this.assert();
    unwrap(await this.resource.linkAt(pf, path, to.resource, np));
  }
  async readlinkAt(path: string) {
    this.assert();
    return unwrap(await this.resource.readlinkAt(path));
  }
  async symlinkAt(old: string, path: string) {
    this.assert();
    unwrap(await this.resource.symlinkAt(old, path));
  }
  async createDirectoryAt(path: string) {
    this.assert();
    unwrap(await this.resource.createDirectoryAt(path));
  }
  async removeDirectoryAt(path: string) {
    this.assert();
    unwrap(await this.resource.removeDirectoryAt(path));
  }
  async unlinkFileAt(path: string) {
    this.assert();
    unwrap(await this.resource.unlinkFileAt(path));
  }
  async renameAt(old: string, to: AbiDescriptor, path: string) {
    this.assert();
    unwrap(await this.resource.renameAt(old, to.resource, path));
  }
  async isSameObject(other: AbiDescriptor) {
    this.assert();
    return this.resource.isSameObject(other.resource);
  }
  async metadataHash() {
    this.assert();
    return unwrap(await this.resource.metadataHash());
  }
  async metadataHashAt(pf: FS.PathFlags, path: string) {
    this.assert();
    return unwrap(await this.resource.metadataHashAt(pf, path));
  }
  async readDirectory() {
    this.assert();
    const [stream, future] = this.resource.readDirectory();
    const status = Promise.resolve(future);
    let live = true;
    void status.catch(() => {});
    return this.own({
      async readDirectoryEntry() {
        if (!live) throw new ServiceError('invalid-resource', 'Directory stream was disposed');
        const entries = await stream.read(1);
        if (!entries) {
          unwrap(await status);
          return undefined;
        }
        const item = entries[0];
        return { ...item, type: item.type.tag as 'directory' | 'regular-file' };
      },
      [Symbol.asyncDispose]() {
        live = false;
        return stream.cancel();
      },
    });
  }
}
export class AbiChild extends View<Process.ChildProcess> {
  pid() {
    this.assert();
    return this.resource.pid();
  }
  async wait(): Promise<Exit> {
    this.assert();
    const exit = unwrap(await this.resource.wait());
    return exit.tag === 'exited'
      ? { kind: 'exited', code: exit.val }
      : { kind: exit.tag, message: exit.val };
  }
  requestStop() {
    this.assert();
    return this.resource.requestStop();
  }
}

/** Representation conversion only; it owns no Context, backend or OS services. */
export function createAbiView(context: ProcessContext, own: OwnView = identity) {
  const environment = context.wasi.cli.environment;
  let shared = standardOutputs.get(context);
  if (!shared) {
    shared = [outputState(), outputState()];
    standardOutputs.set(context, shared);
  }
  const entries = Object.freeze(
    environment.getEnvironment().map(([key, value]) => Object.freeze({ key, value })),
  );
  const terminal = (index: number) => {
    const value =
      index === 0
        ? context.wasi.cli.terminalStdin.getTerminalStdin()
        : index === 1
          ? context.wasi.cli.terminalStdout.getTerminalStdout()
          : context.wasi.cli.terminalStderr.getTerminalStderr();
    void value?.[Symbol.asyncDispose]();
    return !!value;
  };
  const timer = (operation: Promise<void>) => {
    let ready = false;
    const promise = operation.then(() => {
      ready = true;
    });
    void promise.catch(() => {});
    return own(
      new AbiPollable(
        () => ready,
        () => promise,
        () => cancelAsync(operation),
      ),
    );
  };
  return {
    pid: context.pid,
    ppid: context.ppid,
    args: environment.getArguments(),
    env: {
      get: (key: string) => {
        environment.getEnvironment();
        return entries.find((e) => e.key === key)?.value;
      },
      has: (key: string) => {
        environment.getEnvironment();
        return entries.some((e) => e.key === key);
      },
      entries: () => {
        environment.getEnvironment();
        return entries;
      },
    },
    fs: {
      getDirectories: () =>
        context.wasi.filesystem.preopens
          .getDirectories()
          .map(([d, path]) => [new AbiDescriptor(d, context, own), path] as const),
    },
    io: {
      get stdin() {
        return new AbiInput(context.walos.io.getStdin(), terminal(0), own, context);
      },
      get stdout() {
        return new AbiOutput(context.walos.io.getStdout(), terminal(1), own, context, shared![0]);
      },
      get stderr() {
        return new AbiOutput(context.walos.io.getStderr(), terminal(2), own, context, shared![1]);
      },
      createPipe: async () => {
        const [input, output] = await context.walos.io.createPipe();
        return [
          new AbiInput(input, false, own, context),
          new AbiOutput(output, false, own, context),
        ] as const;
      },
    },
    process: {
      spawn: (
        executable: AbiDescriptor,
        argv: readonly string[],
        env: readonly { key: string; value: string }[],
        stdin?: AbiInput,
        stdout?: AbiOutput,
        stderr?: AbiOutput,
      ) => {
        const pending = context.walos.process.spawn(
          executable?.resource ?? executable,
          argv,
          env.map(({ key, value }) => [key, value] as const),
          stdin ? (stdin.resource ?? (stdin as any)) : undefined,
          stdout ? (stdout.resource ?? (stdout as any)) : undefined,
          stderr ? (stderr.resource ?? (stderr as any)) : undefined,
        );
        for (const view of [stdin, stdout, stderr]) if (view?.namespace === context) view.moved();
        return pending.then((result) => {
          if (result.tag === 'err') {
            const error = result.val;
            throw new ServiceError(
              error.tag === 'invalid-descriptor' || error.tag === 'invalid-stream'
                ? 'invalid-resource'
                : error.tag === 'initialization'
                  ? 'startup'
                  : error.tag,
              error.tag === 'initialization' || error.tag === 'internal' ? error.val : error.tag,
            );
          }
          return new AbiChild(result.val, own);
        });
      },
    },
    clock: {
      wall: {
        now: context.wasi.clocks.systemClock.now,
        resolution: () => {
          const value = context.wasi.clocks.systemClock.getResolution();
          return { seconds: value / 1000000000n, nanoseconds: Number(value % 1000000000n) };
        },
      },
      monotonic: {
        now: context.wasi.clocks.monotonicClock.now,
        resolution: context.wasi.clocks.monotonicClock.getResolution,
        subscribeInstant: (when: bigint) =>
          timer(context.wasi.clocks.monotonicClock.waitUntil(when)),
        subscribeDuration: (duration: bigint) =>
          timer(context.wasi.clocks.monotonicClock.waitFor(duration)),
      },
    },
    random: {
      getRandomBytes: context.wasi.random.random.getRandomBytes,
      getRandomU64: context.wasi.random.random.getRandomU64,
      getInsecureRandomBytes: context.wasi.random.insecure.getInsecureRandomBytes,
      getInsecureRandomU64: context.wasi.random.insecure.getInsecureRandomU64,
      insecureSeed: context.wasi.random.insecureSeed.getInsecureSeed,
    },
    unsupportedSocket: (iface: string, _operation: string, args: unknown[]) => {
      const family = args.find((value) => value === 'ipv4' || value === 'ipv6') as
        | 'ipv4'
        | 'ipv6'
        | undefined;
      if (iface.includes('udp'))
        return context.wasi.sockets.types.udpSocket.create(family ?? 'ipv4');
      if (iface.includes('ip-name-lookup'))
        return context.wasi.sockets.ipNameLookup.resolveAddresses(String(args.at(-1) ?? ''));
      return context.wasi.sockets.types.tcpSocket.create(family ?? 'ipv4');
    },
    exit: (code: number) => context.wasi.cli.exit.exitWithCode(code),
  };
}
