import { Filesystem } from './fs.js';
import { connect } from './streams.js';
import {
  Rpc,
  RpcFailure,
  transferables,
  type Exit,
  type Spec,
  type StreamRef,
} from './protocol.js';
import {
  InputStream,
  OutputStream,
  Pollable,
  poll,
  StreamFailure,
  StreamResource,
} from './p2-io.js';
import { Descriptor, DirectoryEntryStream, P2Filesystem, filesystemErrorCode } from './p2-fs.js';
import { WasiExit } from './wasi.js';

const randomBytes = (len: bigint) => {
  if (len > 16_777_216n) throw new Error('Random request exceeds host allocation limit');
  const bytes = new Uint8Array(Number(len));
  for (let i = 0; i < bytes.length; i += 65536)
    crypto.getRandomValues(bytes.subarray(i, i + 65536));
  return bytes;
};
const randomU64 = () => new DataView(randomBytes(8n).buffer).getBigUint64(0, true);
const now = () => BigInt(Math.floor(performance.now() * 1e6));
const timer = (instant: bigint) =>
  new Pollable(
    () => now() >= instant,
    (wake) => {
      const id = setTimeout(
        wake,
        Math.min(2147483647, Math.max(0, Number((instant - now()) / 1000000n) + 1)),
      );
      return () => clearTimeout(id);
    },
  );
class TerminalInput {
  [Symbol.dispose]() {}
}
class TerminalOutput {
  [Symbol.dispose]() {}
}

export class ChildProcess {
  private consumed = false;
  private live = true;
  constructor(
    private processId: number,
    private rpc: Rpc,
    private release: () => void,
  ) {}
  pid() {
    if (!this.live) throw new Error('child-process was dropped');
    return this.processId;
  }
  async wait() {
    if (!this.live || this.consumed) throw { tag: 'already-consumed' };
    this.consumed = true;
    const exit: Exit = await this.rpc.call({ op: 'wait', pid: this.processId });
    return { tag: exit.kind, val: exit.kind === 'exited' ? exit.code : exit.message };
  }
  async requestStop() {
    await this.rpc.call({ op: 'stop', pid: this.pid() });
  }
  [Symbol.dispose]() {
    if (!this.live) return;
    this.live = false;
    this.release();
    if (!this.consumed) void this.rpc.call({ op: 'drop', pid: this.processId }).catch(() => {});
  }
}

/** Preview 2 resources are local objects; only handles and control RPC cross the Core. */
export class Wasi2 {
  stopping = false;
  private streams = new Set<StreamResource>();
  private children = new Set<ChildProcess>();
  private stdio: StreamResource[] = [];
  private fs!: P2Filesystem;
  constructor(
    private spec: Spec,
    private rpc: Rpc,
  ) {}
  private track = (stream: StreamResource) => {
    this.streams.add(stream);
  };
  private release = (stream: StreamResource, moved = false) => {
    this.streams.delete(stream);
    // A moved stream keeps its Core owner until the child's spawn transaction.
    if (stream.stream.ref.id && !moved)
      void this.rpc.call({ op: 'stream-close', streamId: stream.stream.ref.id }).catch(() => {});
  };
  async init() {
    const root = await navigator.storage.getDirectory();
    this.fs = new P2Filesystem(
      new Filesystem(root, this.spec.cwd, this.spec.cwdPath),
      this.track,
      this.release,
    );
    for (let i = 0; i < 3; i++) {
      const stream = await connect(this.spec.stdio[i]!, true);
      const resource =
        i === 0 ? new InputStream(stream, this.release) : new OutputStream(stream, this.release);
      this.track(resource);
      this.stdio.push(resource);
    }
  }
  private checkStop() {
    if (this.stopping) throw new WasiExit(130);
  }
  private async spawn(
    executable: Descriptor,
    cwd: Descriptor,
    argv: string[],
    env: { key: string; value: string }[],
    stdin?: InputStream,
    stdout?: OutputStream,
    stderr?: OutputStream,
  ) {
    const refs: (StreamRef | null)[] = [];
    let submitted = false;
    try {
      let invalidStream = false;
      for (const stream of [stdin, stdout, stderr]) {
        try {
          if (stream && !this.streams.has(stream)) throw new Error('stream is not owned');
          refs.push(stream ? stream.take() : null);
        } catch {
          refs.push(null);
          invalidStream = true;
        }
      }
      if (invalidStream || refs.some((r, i) => r && r.direction !== (i === 0 ? 'in' : 'out')))
        throw { tag: 'invalid-stream' };
      if (
        !this.fs.descriptors.has(executable) ||
        !this.fs.descriptors.has(cwd) ||
        !executable.data.file ||
        !executable.getFlags().read ||
        !cwd.data.dir
      )
        throw { tag: 'invalid-descriptor' };
      const spec: Spec = {
        file: executable.data.file,
        cwd: cwd.data.dir,
        cwdPath: cwd.data.path,
        argv: [...argv],
        env: Object.fromEntries(env.map(({ key, value }) => [key, value])),
        stdio: refs,
      };
      const request = this.rpc.call({ op: 'spawn', spec }, transferables(refs));
      submitted = true;
      const pid: number = await request;
      const child = new ChildProcess(pid, this.rpc, () => this.children.delete(child));
      this.children.add(child);
      return child;
    } catch (error) {
      if (!submitted)
        for (const ref of refs) {
          if (!ref) continue;
          if (ref.kind === 'tty' || ref.kind === 'pipe') {
            try {
              ref.port.postMessage({ type: 'broken' });
              ref.port.close();
            } catch {}
          }
          if (ref.id) void this.rpc.call({ op: 'stream-close', streamId: ref.id }).catch(() => {});
        }
      if (error instanceof RpcFailure)
        throw error.kind === 'timeout'
          ? { tag: 'timeout' }
          : error.kind === 'cancelled'
            ? { tag: 'cancelled' }
            : { tag: 'initialization', val: error.message };
      if (typeof error === 'object' && error && 'tag' in error) throw error;
      throw { tag: 'initialization', val: String(error) };
    }
  }
  imports(): Record<string, any> {
    const tty = (index: number) => this.spec.stdio[index]?.kind === 'tty';
    const imports: Record<string, any> = {
      'wasi:cli/environment': {
        getArguments: () => [...this.spec.argv],
        getEnvironment: () => Object.entries(this.spec.env),
        initialCwd: () => this.spec.cwdPath,
      },
      'wasi:cli/exit': {
        exit: (status: { tag: string }) => {
          throw new WasiExit(status.tag === 'ok' ? 0 : 1);
        },
      },
      'wasi:cli/stdin': { getStdin: () => this.stdio[0] },
      'wasi:cli/stdout': { getStdout: () => this.stdio[1] },
      'wasi:cli/stderr': { getStderr: () => this.stdio[2] },
      'wasi:cli/terminal-input': { TerminalInput },
      'wasi:cli/terminal-output': { TerminalOutput },
      'wasi:cli/terminal-stdin': {
        getTerminalStdin: () => (tty(0) ? new TerminalInput() : undefined),
      },
      'wasi:cli/terminal-stdout': {
        getTerminalStdout: () => (tty(1) ? new TerminalOutput() : undefined),
      },
      'wasi:cli/terminal-stderr': {
        getTerminalStderr: () => (tty(2) ? new TerminalOutput() : undefined),
      },
      'wasi:io/error': { Error: StreamFailure },
      'wasi:io/streams': { InputStream, OutputStream },
      'wasi:io/poll': { Pollable, poll },
      'wasi:filesystem/types': { Descriptor, DirectoryEntryStream, filesystemErrorCode },
      'wasi:filesystem/preopens': { getDirectories: () => this.fs.preopens() },
      'wasi:clocks/wall-clock': {
        now: () => ({
          seconds: BigInt(Math.floor(Date.now() / 1000)),
          nanoseconds: (Date.now() % 1000) * 1000000,
        }),
        resolution: () => ({ seconds: 0n, nanoseconds: 1000000 }),
      },
      'wasi:clocks/monotonic-clock': {
        now,
        resolution: () => 1000000n,
        subscribeInstant: timer,
        subscribeDuration: (duration: bigint) => timer(now() + duration),
      },
      'wasi:random/random': { getRandomBytes: randomBytes, getRandomU64: randomU64 },
      'wasi:random/insecure': {
        getInsecureRandomBytes: randomBytes,
        getInsecureRandomU64: randomU64,
      },
      'wasi:random/insecure-seed': { insecureSeed: () => [randomU64(), randomU64()] },
      'walos:runtime/process': { ChildProcess, spawn: this.spawn.bind(this) },
      'walos:runtime/ipc': {
        createPipe: async () => {
          const refs: StreamRef[] = await this.rpc.call({ op: 'pipe' });
          const input = new InputStream(await connect(refs[0], true), this.release);
          const output = new OutputStream(await connect(refs[1], true), this.release);
          this.track(input);
          this.track(output);
          return [input, output];
        },
      },
      'walos:runtime/terminal': {
        setForeground: async (children: ChildProcess[], input?: ChildProcess) => {
          await this.rpc.call({
            op: 'foreground',
            pids: children.map((p) => p.pid()),
            input: input?.pid() ?? null,
          });
        },
        restoreShellInput: async () => {
          await this.rpc.call({ op: 'foreground', pids: [], input: 0 });
        },
      },
    };
    // Stop is checked at host boundaries; the supervisor still escalates pure CPU loops.
    for (const value of Object.values(imports))
      for (const [key, fn] of Object.entries(value)) {
        if (typeof fn === 'function' && !/^[A-Z]/.test(key))
          value[key] = (...args: unknown[]) => {
            this.checkStop();
            return (fn as Function)(...args);
          };
      }
    return imports;
  }
  async close() {
    for (const child of this.children) child[Symbol.dispose]();
    for (const stream of this.streams) {
      try {
        stream[Symbol.dispose]();
      } catch {}
    }
    this.fs?.close();
  }
  gone(id: number) {
    for (const resource of this.streams) if (resource.stream.ref.id === id) resource.stream.gone();
  }
}
