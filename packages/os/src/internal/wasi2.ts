import { ServiceError, type ProcessContext } from '../types.js';
import { createAbiView, AbiOutput } from './abi-view.js';
import { loadComponent, type PreparedComponent } from './component.js';
import { WasiExit, RuntimeStopped, PendingDrops, type Runtime } from './runtime.js';
import { errno } from './abi-errors.js';
import type { ProcessMetrics } from './protocol.js';

/** Component resource wrappers contain ABI handles only, never OS implementations. */
export class Wasi2 implements Runtime {
  private context!: ReturnType<typeof createAbiView>;
  private component?: Awaited<ReturnType<typeof loadComponent>>;
  private stopping = false;
  private started = false;
  private disposal?: Promise<void>;
  private drops = new PendingDrops();
  constructor(
    private metrics?: ProcessMetrics,
    private prepared?: PreparedComponent,
  ) {}
  async initialize(bytes: Uint8Array, context: ProcessContext) {
    this.context = createAbiView(context);
    const start = performance.now();
    if (this.metrics) this.metrics.component ??= {};
    this.component = await loadComponent(
      bytes,
      this.imports(),
      this.metrics?.component,
      this.prepared,
    );
    if (this.metrics) this.metrics.loadMs = performance.now() - start;
  }
  requestStop() {
    this.stopping = true;
  }
  async run() {
    if (!this.component || this.started) throw new Error('Runtime is uninitialized or already run');
    this.started = true;
    try {
      if (this.stopping) throw new RuntimeStopped();
      await this.component.run.run();
      return 0;
    } catch (error) {
      if (error instanceof WasiExit) return error.code;
      if (
        error instanceof Error &&
        Object.hasOwn(error, 'payload') &&
        (error as any).payload === undefined
      )
        return 1;
      throw error;
    }
  }
  private drop(value: AsyncDisposable) {
    this.drops.add(value instanceof AbiOutput ? value.finish() : value[Symbol.asyncDispose]());
  }
  imports(): Record<string, any> {
    const context = this.context,
      adapter = this;
    const fail = (error: unknown, kind: string): never => {
      if (!(error instanceof ServiceError)) throw error;
      if (kind === 'fs') {
        if (
          error.cause &&
          typeof error.cause === 'object' &&
          'tag' in error.cause &&
          error.cause.tag === 'read-only'
        )
          throw 'read-only';
        throw error.code === 'invalid-resource'
          ? 'bad-descriptor'
          : error.code === 'broken-pipe'
            ? 'pipe'
            : error.code;
      }
      if (kind === 'stream')
        throw error.code === 'closed'
          ? { tag: 'closed' }
          : {
              tag: 'last-operation-failed',
              val: new StreamFailure(error.message, String(errno(error))),
            };
      if (kind === 'process')
        throw {
          tag:
            error.code === 'already-consumed'
              ? 'already-consumed'
              : error.code === 'timeout'
                ? 'timeout'
                : error.code === 'cancelled'
                  ? 'cancelled'
                  : error.code === 'invalid-resource'
                    ? /descriptor|executable/i.test(error.message)
                      ? 'invalid-descriptor'
                      : 'invalid-stream'
                    : 'initialization',
          ...(error.code !== 'invalid-resource' &&
          error.code !== 'already-consumed' &&
          error.code !== 'timeout' &&
          error.code !== 'cancelled'
            ? { val: error.message }
            : {}),
        };
      throw error;
    };
    const call = (fn: () => any, kind: string, lift: (value: any) => any = (x) => x) => {
      if (this.stopping) throw new RuntimeStopped();
      try {
        const result = fn();
        return result instanceof Promise
          ? result.then(lift, (error) => fail(error, kind))
          : lift(result);
      } catch (error) {
        return fail(error, kind);
      }
    };
    class Resource {
      constructor(readonly value: any) {}
      [Symbol.dispose]() {
        adapter.drop(this.value);
      }
    }
    class Pollable extends Resource {
      ready() {
        return this.value.ready();
      }
      block() {
        return this.value.block();
      }
    }
    class InputStream extends Resource {
      read(length: bigint) {
        return call(() => this.value.read(length), 'stream');
      }
      blockingRead(length: bigint) {
        return call(() => this.value.blockingRead(length), 'stream');
      }
      skip(length: bigint) {
        return call(() => this.value.skip(length), 'stream');
      }
      blockingSkip(length: bigint) {
        return call(() => this.value.blockingSkip(length), 'stream');
      }
      subscribe() {
        return new Pollable(this.value.subscribe());
      }
    }
    class OutputStream extends Resource {
      checkWrite() {
        return call(() => this.value.checkWrite(), 'stream');
      }
      write(bytes: Uint8Array) {
        return call(() => this.value.enqueue(bytes), 'stream');
      }
      flush() {
        return call(() => this.value.startFlush(), 'stream');
      }
      blockingFlush() {
        return call(() => this.value.blockingFlush(), 'stream');
      }
      subscribe() {
        return new Pollable(this.value.subscribe());
      }
      async blockingWriteAndFlush(bytes: Uint8Array) {
        if (bytes.length > 4096) throw new Error('blocking-write-and-flush exceeds 4096 bytes');
        let offset = 0;
        while (offset < bytes.length) {
          const p = this.subscribe();
          try {
            await p.block();
          } finally {
            p[Symbol.dispose]();
          }
          const count = Math.min(Number(this.checkWrite()), bytes.length - offset);
          await this.write(bytes.subarray(offset, offset + count));
          offset += count;
        }
        await this.blockingFlush();
      }
      writeZeroes(length: bigint) {
        return call(() => this.value.enqueueZeroes(length), 'stream');
      }
      blockingWriteZeroesAndFlush(length: bigint) {
        if (length > 4096n) throw new Error('blocking-write-zeroes-and-flush exceeds 4096 bytes');
        return this.blockingWriteAndFlush(new Uint8Array(Number(length)));
      }
      async splice(input: InputStream, length: bigint) {
        const permit = this.checkWrite();
        const bytes = await input.read(length < permit ? length : permit);
        await this.write(bytes);
        return BigInt(bytes.length);
      }
      async blockingSplice(input: InputStream, length: bigint) {
        const p = this.subscribe(),
          q = input.subscribe();
        try {
          await Promise.all([p.block(), q.block()]);
          return await this.splice(input, length);
        } finally {
          p[Symbol.dispose]();
          q[Symbol.dispose]();
        }
      }
    }
    class DirectoryEntryStream extends Resource {
      readDirectoryEntry() {
        return call(() => this.value.readDirectoryEntry(), 'fs');
      }
    }
    class Descriptor extends Resource {}
    const descriptorMethods = [
      'getType',
      'getFlags',
      'advise',
      'syncData',
      'sync',
      'setSize',
      'setTimes',
      'setTimesAt',
      'linkAt',
      'readlinkAt',
      'symlinkAt',
      'read',
      'write',
      'createDirectoryAt',
      'stat',
      'statAt',
      'removeDirectoryAt',
      'unlinkFileAt',
      'renameAt',
      'isSameObject',
      'metadataHash',
      'metadataHashAt',
      'openAt',
      'readViaStream',
      'writeViaStream',
      'appendViaStream',
      'readDirectory',
    ];
    for (const name of descriptorMethods)
      Object.defineProperty(Descriptor.prototype, name, {
        value: function (this: Descriptor, ...args: any[]) {
          const unwrap = args.map((arg) => (arg instanceof Resource ? arg.value : arg));
          return call(
            () => this.value[name](...unwrap),
            'fs',
            (value) =>
              name === 'openAt'
                ? new Descriptor(value)
                : name === 'readViaStream'
                  ? new InputStream(value)
                  : name === 'writeViaStream' || name === 'appendViaStream'
                    ? new OutputStream(value)
                    : name === 'readDirectory'
                      ? new DirectoryEntryStream(value)
                      : value,
          );
        },
      });
    class ChildProcess extends Resource {
      pid() {
        return this.value.pid();
      }
      wait() {
        return call(
          () => this.value.wait(),
          'process',
          (exit) => ({ tag: exit.kind, val: exit.kind === 'exited' ? exit.code : exit.message }),
        );
      }
      requestStop() {
        return this.value.requestStop();
      }
    }
    class StreamFailure {
      constructor(
        readonly message: string,
        readonly code?: string,
      ) {}
      toDebugString() {
        return this.message;
      }
      [Symbol.dispose]() {}
    }
    class TerminalInput {
      [Symbol.dispose]() {}
    }
    class TerminalOutput {
      [Symbol.dispose]() {}
    }
    const terminal = (index: number) => {
      const resource =
        index === 0 ? context.io.stdin : index === 1 ? context.io.stdout : context.io.stderr;
      const connected = (resource as any).isTerminal;
      adapter.drop(resource);
      return connected ? (index === 0 ? new TerminalInput() : new TerminalOutput()) : undefined;
    };
    return {
      __unsupportedSocket: context.unsupportedSocket,
      'wasi:cli/environment': {
        getArguments: () => [...context.args],
        getEnvironment: () => context.env.entries().map(({ key, value }) => [key, value]),
        initialCwd: () => context.env.get('PWD'),
      },
      'wasi:cli/exit': {
        exit: (status: { tag: string }) => {
          throw new WasiExit(status.tag === 'ok' ? 0 : 1);
        },
      },
      'wasi:cli/stdin': { getStdin: () => new InputStream(context.io.stdin) },
      'wasi:cli/stdout': { getStdout: () => new OutputStream(context.io.stdout) },
      'wasi:cli/stderr': { getStderr: () => new OutputStream(context.io.stderr) },
      'wasi:cli/terminal-input': { TerminalInput },
      'wasi:cli/terminal-output': { TerminalOutput },
      'wasi:cli/terminal-stdin': { getTerminalStdin: () => terminal(0) },
      'wasi:cli/terminal-stdout': { getTerminalStdout: () => terminal(1) },
      'wasi:cli/terminal-stderr': { getTerminalStderr: () => terminal(2) },
      'wasi:io/error': { Error: StreamFailure },
      'wasi:io/streams': { InputStream, OutputStream },
      'wasi:io/poll': {
        Pollable,
        poll: async (list: Pollable[]) => {
          if (!list.length) throw new Error('poll requires at least one pollable');
          const ready = () => list.flatMap((p, i) => (p.ready() ? [i] : []));
          if (!ready().length) await Promise.race(list.map((p) => p.block()));
          return new Uint32Array(ready());
        },
      },
      'wasi:filesystem/types': {
        Descriptor,
        DirectoryEntryStream,
        filesystemErrorCode: (error: StreamFailure) =>
          (({ 8: 'bad-descriptor', 64: 'pipe', 29: 'io' }) as Record<number, string>)[
            Number(error.code)
          ],
      },
      'wasi:filesystem/preopens': {
        getDirectories: () =>
          context.fs.getDirectories().map(([d, path]) => [new Descriptor(d), path]),
      },
      'wasi:clocks/wall-clock': context.clock.wall,
      'wasi:clocks/monotonic-clock': {
        now: context.clock.monotonic.now,
        resolution: context.clock.monotonic.resolution,
        subscribeInstant: (instant: bigint) =>
          new Pollable(context.clock.monotonic.subscribeInstant(instant)),
        subscribeDuration: (duration: bigint) =>
          new Pollable(context.clock.monotonic.subscribeDuration(duration)),
      },
      'wasi:random/random': {
        getRandomBytes: context.random.getRandomBytes,
        getRandomU64: context.random.getRandomU64,
      },
      'wasi:random/insecure': {
        getInsecureRandomBytes: context.random.getInsecureRandomBytes,
        getInsecureRandomU64: context.random.getInsecureRandomU64,
      },
      'wasi:random/insecure-seed': { insecureSeed: context.random.insecureSeed },
      'walos:runtime-p2/process': {
        ChildProcess,
        spawn: (
          executable: Descriptor,
          argv: string[],
          env: any[],
          stdin?: InputStream,
          stdout?: OutputStream,
          stderr?: OutputStream,
        ) =>
          call(
            () =>
              context.process.spawn(
                executable.value,
                argv,
                env,
                stdin?.value,
                stdout?.value,
                stderr?.value,
              ),
            'process',
            (value) => new ChildProcess(value),
          ),
      },
      'walos:runtime-p2/ipc': {
        createPipe: () =>
          call(
            () => context.io.createPipe(),
            'stream',
            ([input, output]) => [new InputStream(input), new OutputStream(output)],
          ),
      },
    };
  }
  [Symbol.asyncDispose](): Promise<void> {
    return (this.disposal ??= this.close());
  }
  private async close() {
    try {
      this.component?.dispose();
    } finally {
      await this.drops.drain();
    }
  }
}
