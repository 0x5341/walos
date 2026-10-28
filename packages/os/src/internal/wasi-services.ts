import { Future, cancellable, type Stream, type StreamRead } from '../async.js';
import {
  ServiceError,
  ProcessExit,
  UnimplementedWasiError,
  type ProcessContext,
} from '../types.js';
import type {
  Result,
  WasiImports,
  WalosRuntimeIo as IO,
  WalosRuntimeProcess as Process,
  WasiFilesystemTypes as FS,
} from '../wasi-types.js';
import type * as Model from './service-model.js';
import { apiShape } from './wasi-shape.js';

const ok = <T>(val: T): Result<T, never> => ({ tag: 'ok', val });
const trap = (operation: string): never => {
  throw new UnimplementedWasiError(operation);
};
const fsError = (error: ServiceError): FS.ErrorCode => {
  if (error.code === 'access' && error.cause === 'read-only') return { tag: 'read-only' };
  const tag =
    (
      {
        'invalid-resource': 'bad-descriptor',
        closed: 'bad-descriptor',
        'broken-pipe': 'pipe',
      } as Record<string, string>
    )[error.code] ?? error.code;
  return {
    tag: ['startup', 'timeout', 'cancelled', 'internal', 'already-consumed'].includes(tag)
      ? 'io'
      : tag,
  } as FS.ErrorCode;
};
const ioError = (error: ServiceError) =>
  error.code === 'broken-pipe' ? ('pipe' as const) : ('io' as const);
const fsCall = async <T>(fn: () => T | PromiseLike<T>): Promise<Result<T, FS.ErrorCode>> => {
  try {
    return ok(await fn());
  } catch (error) {
    if (error instanceof ServiceError) return { tag: 'err', val: fsError(error) };
    throw error;
  }
};
class Scope {
  private resources = new Set<AsyncDisposable>();
  private pending = new Set<Promise<unknown>>();
  private closing = false;
  add<T extends AsyncDisposable>(value: T): T {
    this.resources.add(value);
    if (this.closing) void Promise.resolve(value[Symbol.asyncDispose]()).catch(() => {});
    return value;
  }
  remove(value: AsyncDisposable) {
    this.resources.delete(value);
  }
  future<T>(task: Promise<T>, cancel: () => void | PromiseLike<void>): Future<T> {
    const future = this.add(new Future(task, cancel));
    this.pending.add(task);
    const done = () => {
      this.pending.delete(task);
      this.remove(future);
    };
    void task.then(done, done);
    return future;
  }
  async dispose() {
    this.closing = true;
    const results = await Promise.allSettled(
      [...this.resources].map((value) => value[Symbol.asyncDispose]()),
    );
    await Promise.allSettled(this.pending);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
}

function sourceStream<T, R extends AsyncDisposable, E>(
  scope: Scope,
  resource: R | Promise<R>,
  read: (value: R, maximum: number, blocking: boolean) => Promise<ArrayLike<T> | undefined>,
  poll: (value: R) => Model.Pollable | undefined,
  errorCode: (error: ServiceError) => E,
): readonly [Stream<T>, Future<Result<void, E>>] {
  let value: R | undefined = resource instanceof Promise ? undefined : resource,
    readiness: Model.Pollable | undefined,
    ended = false;
  let result: Result<void, E> | undefined;
  let resolve!: (value: Result<void, E>) => void, reject!: (error: unknown) => void;
  const task = new Promise<Result<void, E>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  let cleanup: Promise<void> | undefined;
  const finish = (status: Result<void, E> = ok(undefined)): Promise<void> => {
    ended = true;
    result ??= status;
    return (cleanup ??= (async () => {
      try {
        await readiness?.[Symbol.asyncDispose]();
        const item = value ?? (await resource);
        await item[Symbol.asyncDispose]();
        resolve(result!);
      } catch (error) {
        if (error instanceof ServiceError) resolve({ tag: 'err', val: errorCode(error) });
        else reject(error);
      } finally {
        scope.remove(stream);
      }
    })());
  };
  if (value) readiness = poll(value);
  const initialized = Promise.resolve(resource).then(
    (item) => {
      value = item;
      if (!ended && !readiness) readiness = poll(item);
    },
    async (error) => {
      ended = true;
      scope.remove(stream);
      if (error instanceof ServiceError) {
        result = { tag: 'err', val: errorCode(error) };
        resolve(result);
      } else reject(error);
    },
  );
  const perform = async (maximum: number, blocking: boolean): Promise<StreamRead<T>> => {
    if (!value) await initialized;
    if (ended) return { tag: 'end' };
    if (!blocking && readiness && !readiness.ready()) return { tag: 'pending' };
    try {
      const bytes = await read(value!, maximum, blocking);
      if (bytes === undefined) {
        await finish();
        return { tag: 'end' };
      }
      return { tag: 'data', val: bytes };
    } catch (error) {
      if (error instanceof ServiceError) {
        await finish(
          error.code === 'closed' ? ok(undefined) : { tag: 'err', val: errorCode(error) },
        );
        return { tag: 'end' };
      }
      ended = true;
      reject(error);
      throw error;
    }
  };
  const stream: Stream<T> = scope.add({
    async read(maximum) {
      for (;;) {
        const value = await perform(maximum, true);
        if (value.tag === 'end') return undefined;
        if (value.tag === 'data') return value.val;
      }
    },
    tryRead: (maximum) => perform(maximum, false),
    ready: () => ended || (!!value && (!readiness || readiness.ready())),
    async waitReady() {
      await initialized;
      if (!ended) await readiness?.block();
    },
    cancel: () => finish(),
    [Symbol.asyncDispose]: () => finish(),
  });
  return [stream, scope.future(task, () => stream.cancel())];
}

function byteSource<E>(
  scope: Scope,
  resource: Model.InputStream | Promise<Model.InputStream>,
  errorCode: (error: ServiceError) => E,
) {
  return sourceStream<number, Model.InputStream, E>(
    scope,
    resource,
    (input, length, blocking) =>
      blocking ? input.blockingRead(BigInt(length)) : input.read(BigInt(length)),
    (input) => input.subscribe(),
    errorCode,
  );
}
function writeStream<E>(
  scope: Scope,
  input: Stream<number>,
  resource: Model.OutputStream | Promise<Model.OutputStream>,
  errorCode: (error: ServiceError) => E,
  disposeOutput: boolean,
): Future<Result<void, E>> {
  let output: Model.OutputStream | undefined,
    pollable: Model.Pollable | undefined,
    cancelled = false;
  const task = (async (): Promise<Result<void, E>> => {
    try {
      output = resource instanceof Promise ? await resource : resource;
      for (;;) {
        const data = await input.read(65536);
        if (data === undefined || cancelled) break;
        const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
        let offset = 0;
        while (offset < bytes.length) {
          pollable = output.subscribe();
          try {
            await pollable.block();
          } finally {
            await pollable[Symbol.asyncDispose]();
            pollable = undefined;
          }
          if (cancelled) break;
          const count = Math.min(Number(output.checkWrite()), bytes.length - offset);
          await output.write(bytes.subarray(offset, offset + count));
          offset += count;
        }
        if (!cancelled) await output.blockingFlush();
      }
      return ok(undefined);
    } catch (error) {
      if (error instanceof ServiceError) return { tag: 'err', val: errorCode(error) };
      throw error;
    } finally {
      await input.cancel();
      if (disposeOutput) await output?.[Symbol.asyncDispose]();
    }
  })();
  const future = scope.future(task, async () => {
    cancelled = true;
    await pollable?.[Symbol.asyncDispose]();
    await input.cancel();
    if (disposeOutput) {
      const item = output ?? (await Promise.resolve(resource).catch(() => undefined));
      await item?.[Symbol.asyncDispose]();
    }
  });
  if (!disposeOutput && !(resource instanceof Promise))
    (resource as any).trackOperation?.(task, () => {
      void future.cancel();
    });
  return future;
}

export function createProcessApi(model: Model.ServiceModel): {
  context: ProcessContext;
  dispose: () => Promise<void>;
} {
  const scope = new Scope();
  const descriptorValues = new WeakMap<FS.Descriptor, Model.FileDescriptor>();
  const inputs = new WeakMap<IO.InputEndpoint, Model.InputStream>();
  const outputs = new WeakMap<IO.OutputEndpoint, Model.OutputStream>();
  const dValue = (value: FS.Descriptor) =>
    descriptorValues.get(value) ?? ({} as Model.FileDescriptor);
  const stat = (value: Model.DescriptorStat): FS.DescriptorStat => ({
    ...value,
    type: { tag: value.type },
    dataAccessTimestamp: undefined,
    statusChangeTimestamp: undefined,
    dataModificationTimestamp: value.dataModificationTimestamp,
  });
  class Descriptor implements FS.Descriptor {
    constructor(private value: Model.FileDescriptor) {
      descriptorValues.set(this, value);
    }
    readViaStream(offset: bigint) {
      return byteSource(scope, this.value.readViaStream(offset), fsError);
    }
    writeViaStream(data: Stream<number>, offset: bigint) {
      return writeStream(scope, data, this.value.writeViaStream(offset), fsError, true);
    }
    appendViaStream(data: Stream<number>) {
      return writeStream(scope, data, this.value.appendViaStream(), fsError, true);
    }
    advise(_offset: bigint, _length: bigint, _advice: FS.Advice) {
      return fsCall(() => (this.value as any).advise());
    }
    syncData() {
      return fsCall(() => (this.value as any).syncData());
    }
    getFlags() {
      return fsCall(() => this.value.getFlags());
    }
    getType() {
      return fsCall(() => ({ tag: this.value.getType() }) as FS.DescriptorType);
    }
    setSize(size: bigint) {
      return fsCall(() => this.value.setSize(size));
    }
    setTimes(_a: FS.NewTimestamp, _m: FS.NewTimestamp): Promise<Result<void, FS.ErrorCode>> {
      return trap('wasi:filesystem/types@0.3.2/[method]descriptor.set-times');
    }
    readDirectory() {
      return sourceStream<FS.DirectoryEntry, Model.DirectoryEntryStream, FS.ErrorCode>(
        scope,
        this.value.readDirectory(),
        async (value) => {
          const entry = await value.readDirectoryEntry();
          return entry ? [{ ...entry, type: { tag: entry.type } }] : undefined;
        },
        () => undefined,
        fsError,
      );
    }
    sync() {
      return fsCall(() => this.value.sync());
    }
    createDirectoryAt(path: string) {
      return fsCall(() => this.value.createDirectoryAt(path));
    }
    stat() {
      return fsCall(async () => stat(await this.value.stat()));
    }
    statAt(flags: FS.PathFlags, path: string) {
      return fsCall(async () => stat(await this.value.statAt(flags, path)));
    }
    setTimesAt(
      _flags: FS.PathFlags,
      _path: string,
      _a: FS.NewTimestamp,
      _m: FS.NewTimestamp,
    ): Promise<Result<void, FS.ErrorCode>> {
      return trap('wasi:filesystem/types@0.3.2/[method]descriptor.set-times-at');
    }
    linkAt(
      _flags: FS.PathFlags,
      _old: string,
      _to: FS.Descriptor,
      _path: string,
    ): Promise<Result<void, FS.ErrorCode>> {
      return trap('wasi:filesystem/types@0.3.2/[method]descriptor.link-at');
    }
    openAt(pf: FS.PathFlags, path: string, of: FS.OpenFlags, flags: FS.DescriptorFlags) {
      return fsCall(async () => new Descriptor(await this.value.openAt(pf, path, of, flags)));
    }
    readlinkAt(_path: string): Promise<Result<string, FS.ErrorCode>> {
      return trap('wasi:filesystem/types@0.3.2/[method]descriptor.readlink-at');
    }
    removeDirectoryAt(path: string) {
      return fsCall(() => this.value.removeDirectoryAt(path));
    }
    renameAt(old: string, to: FS.Descriptor, path: string) {
      return fsCall(() => this.value.renameAt(old, dValue(to), path));
    }
    symlinkAt(_old: string, _path: string): Promise<Result<void, FS.ErrorCode>> {
      return trap('wasi:filesystem/types@0.3.2/[method]descriptor.symlink-at');
    }
    unlinkFileAt(path: string) {
      return fsCall(() => this.value.unlinkFileAt(path));
    }
    isSameObject(other: FS.Descriptor) {
      return this.value.isSameObject(dValue(other));
    }
    metadataHash() {
      return fsCall(() => (this.value as any).metadataHash() as Promise<FS.MetadataHashValue>);
    }
    metadataHashAt(flags: FS.PathFlags, path: string) {
      return fsCall(
        () => (this.value as any).metadataHashAt(flags, path) as Promise<FS.MetadataHashValue>,
      );
    }
    [Symbol.asyncDispose]() {
      return this.value[Symbol.asyncDispose]();
    }
  }
  class InputEndpoint implements IO.InputEndpoint {
    constructor(private value: Model.InputStream) {
      inputs.set(this, value);
    }
    readViaStream() {
      return byteSource(scope, this.value, ioError);
    }
    [Symbol.asyncDispose]() {
      return this.value[Symbol.asyncDispose]();
    }
  }
  class OutputEndpoint implements IO.OutputEndpoint {
    constructor(private value: Model.OutputStream) {
      outputs.set(this, value);
    }
    whenWritable(minimum: bigint): Future<Result<bigint, 'io' | 'pipe' | 'illegal-byte-sequence'>> {
      let capacity: bigint;
      try {
        capacity = this.value.checkWrite();
      } catch (error) {
        if (
          !(error instanceof ServiceError) ||
          error.code === 'invalid-resource' ||
          error.code === 'closed'
        )
          throw error;
        return new Future({ tag: 'err' as const, val: ioError(error) });
      }
      if (capacity >= minimum) return new Future(ok(capacity));
      const pollable = (this.value as any).subscribeCapacity(Number(minimum)) as Model.Pollable;
      const task = (async (): Promise<Result<bigint, 'io' | 'pipe' | 'illegal-byte-sequence'>> => {
        try {
          await pollable.block();
          return ok(this.value.checkWrite());
        } catch (error) {
          if (
            error instanceof ServiceError &&
            error.code !== 'invalid-resource' &&
            error.code !== 'closed'
          )
            return { tag: 'err', val: ioError(error) };
          throw error;
        } finally {
          await pollable[Symbol.asyncDispose]();
        }
      })();
      return scope.future(task, () => pollable[Symbol.asyncDispose]());
    }
    writeViaStream(data: Stream<number>) {
      const probe = this.value.subscribe();
      void probe[Symbol.asyncDispose]();
      return writeStream(scope, data, this.value, ioError, false);
    }
    [Symbol.asyncDispose]() {
      return this.value[Symbol.asyncDispose]();
    }
  }
  class ChildProcess implements Process.ChildProcess {
    constructor(private value: Model.ChildProcess) {}
    pid() {
      return this.value.pid();
    }
    async wait(): Promise<Result<Process.ExitResult, Process.WaitError>> {
      try {
        const result = await this.value.wait();
        return ok({
          tag: result.kind,
          val: result.kind === 'exited' ? result.code : result.message,
        } as Process.ExitResult);
      } catch (error) {
        if (error instanceof ServiceError && error.code === 'already-consumed')
          return { tag: 'err', val: { tag: 'already-consumed' } };
        throw error;
      }
    }
    requestStop() {
      return this.value.requestStop();
    }
    [Symbol.asyncDispose]() {
      return this.value[Symbol.asyncDispose]();
    }
  }
  const standard: any = {};
  for (const iface of apiShape.filter(
    (i) => i.package.startsWith('wasi:') && !(i.package === 'wasi:cli' && i.interface === 'run'),
  )) {
    const pkg = iface.package.split(':')[1];
    const group = (standard[pkg] ??= {});
    const object: any = {};
    for (const operation of iface.operations) {
      const fail = () => trap(`${iface.package}/${iface.interface}@0.3.2/${operation.wit}`);
      if (typeof operation.kind === 'string') object[operation.ts] = fail;
      else if (
        'static' in operation.kind ||
        'async-static' in operation.kind ||
        Object.hasOwn(operation.kind, 'constructor')
      ) {
        const resource = operation.wit
          .replace(/^\[[^\]]+\]/, '')
          .split('.')[0]
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        (object[resource] ??= {})[operation.ts] = fail;
      }
    }
    group[iface.interface.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = Object.freeze(object);
  }
  const terminal = (index: number) => {
    const value = index === 0 ? model.io.stdin : index === 1 ? model.io.stdout : model.io.stderr;
    const connected = (value as any).isTerminal;
    void value[Symbol.asyncDispose]();
    return connected ? { [Symbol.asyncDispose]: () => Promise.resolve() } : undefined;
  };
  Object.assign(standard.cli, {
    environment: Object.freeze({
      getEnvironment: () => model.env.entries().map(({ key, value }) => [key, value] as const),
      getArguments: () => model.args,
      getInitialCwd: () => model.env.get('PWD'),
    }),
    exit: Object.freeze({
      exit: (status: Result<void, void>) => {
        throw new ProcessExit(status.tag === 'ok' ? 0 : 1);
      },
      exitWithCode: (code: number) => {
        throw new ProcessExit(code);
      },
    }),
    stdin: Object.freeze({ readViaStream: () => byteSource(scope, model.io.stdin, ioError) }),
    stdout: Object.freeze({
      writeViaStream: (data: Stream<number>) =>
        writeStream(scope, data, model.io.stdout, ioError, true),
    }),
    stderr: Object.freeze({
      writeViaStream: (data: Stream<number>) =>
        writeStream(scope, data, model.io.stderr, ioError, true),
    }),
    terminalStdin: Object.freeze({ getTerminalStdin: () => terminal(0) }),
    terminalStdout: Object.freeze({ getTerminalStdout: () => terminal(1) }),
    terminalStderr: Object.freeze({ getTerminalStderr: () => terminal(2) }),
  });
  const wait = (pollable: Model.Pollable) =>
    cancellable(
      (async () => {
        try {
          await pollable.block();
        } finally {
          await pollable[Symbol.asyncDispose]();
        }
      })(),
      () => pollable[Symbol.asyncDispose](),
    );
  Object.assign(standard.clocks, {
    monotonicClock: Object.freeze({
      now: model.clock.monotonic.now,
      getResolution: model.clock.monotonic.resolution,
      waitUntil: (when: bigint) => wait(model.clock.monotonic.subscribeInstant(when)),
      waitFor: (duration: bigint) => wait(model.clock.monotonic.subscribeDuration(duration)),
    }),
    systemClock: Object.freeze({
      now: model.clock.wall.now,
      getResolution: () => {
        const value = model.clock.wall.resolution();
        return value.seconds * 1000000000n + BigInt(value.nanoseconds);
      },
    }),
  });
  Object.assign(standard.random, {
    random: Object.freeze({
      getRandomBytes: model.random.getRandomBytes,
      getRandomU64: model.random.getRandomU64,
    }),
    insecure: Object.freeze({
      getInsecureRandomBytes: model.random.getInsecureRandomBytes,
      getInsecureRandomU64: model.random.getInsecureRandomU64,
    }),
    insecureSeed: Object.freeze({ getInsecureSeed: model.random.insecureSeed }),
  });
  standard.filesystem.preopens = Object.freeze({
    getDirectories: () =>
      model.fs.getDirectories().map(([d, path]) => [new Descriptor(d), path] as const),
  });
  const walos: ProcessContext['walos'] = {
    io: Object.freeze({
      readViaDescriptor: (file: FS.Descriptor, offset: bigint) =>
        fsCall(async () => new InputEndpoint(await dValue(file).readViaStream(offset))),
      writeViaDescriptor: (file: FS.Descriptor, offset: bigint, append: boolean) =>
        fsCall(
          async () =>
            new OutputEndpoint(
              await (append ? dValue(file).appendViaStream() : dValue(file).writeViaStream(offset)),
            ),
        ),
      getStdin: () => new InputEndpoint(model.io.stdin),
      getStdout: () => new OutputEndpoint(model.io.stdout),
      getStderr: () => new OutputEndpoint(model.io.stderr),
      createPipe: async () => {
        const [input, output] = await model.io.createPipe();
        return [new InputEndpoint(input), new OutputEndpoint(output)] as const;
      },
    }),
    process: Object.freeze({
      spawn: async (
        executable: FS.Descriptor,
        argv: readonly string[],
        env: readonly (readonly [string, string])[],
        stdin?: IO.InputEndpoint,
        stdout?: IO.OutputEndpoint,
        stderr?: IO.OutputEndpoint,
      ) => {
        // Enter the common spawn function before awaiting: stdio still moves at invocation.
        const pending = model.process.spawn(
          dValue(executable),
          argv,
          env.map(([key, value]) => ({ key, value })),
          stdin ? (inputs.get(stdin) ?? ({} as Model.InputStream)) : undefined,
          stdout ? (outputs.get(stdout) ?? ({} as Model.OutputStream)) : undefined,
          stderr ? (outputs.get(stderr) ?? ({} as Model.OutputStream)) : undefined,
        );
        try {
          return ok(new ChildProcess(await pending));
        } catch (error) {
          if (!(error instanceof ServiceError)) throw error;
          const tag =
            error.code === 'timeout'
              ? 'timeout'
              : error.code === 'cancelled'
                ? 'cancelled'
                : error.code === 'busy'
                  ? 'busy'
                  : error.code === 'internal'
                    ? 'internal'
                    : error.code === 'invalid-resource'
                      ? /descriptor|executable/i.test(error.message)
                        ? 'invalid-descriptor'
                        : 'invalid-stream'
                      : 'initialization';
          return {
            tag: 'err',
            val:
              tag === 'initialization' || tag === 'internal'
                ? { tag, val: error.message }
                : { tag },
          } as Result<Process.ChildProcess, Process.SpawnError>;
        }
      },
    }),
  };
  for (const pkg of Object.values(standard)) Object.freeze(pkg);
  return {
    context: {
      pid: model.pid,
      ppid: model.ppid,
      wasi: Object.freeze(standard) as WasiImports,
      walos: Object.freeze(walos),
    },
    dispose: () => scope.dispose(),
  };
}
