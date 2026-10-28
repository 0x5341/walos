import {
  ServiceError,
  type ProcessContext,
  type FileDescriptor,
  type InputStream,
  type OutputStream,
  type ChildProcess,
  type DescriptorStat,
} from '../types.js';
import { errno } from './abi-errors.js';
import { WasiExit, PendingDrops, type Runtime } from './runtime.js';
import type { ProcessMetrics } from './protocol.js';
export { WasiExit } from './runtime.js';

type Fd = {
  descriptor?: FileDescriptor;
  input?: InputStream;
  output?: OutputStream;
  position: bigint;
  append?: boolean;
  preopen?: string;
};

/** Preview 1's fd table, memory layout and errno conversion; all OS work uses Context. */
export class Wasi implements Runtime {
  private context!: ProcessContext;
  memory!: WebAssembly.Memory;
  private fds = new Map<number, Fd>();
  private nextFd = 5;
  private children = new Map<number, ChildProcess>();
  private nextChild = 1;
  private drops = new PendingDrops();
  private stopping = false;
  private started = false;
  private entry?: () => Promise<unknown>;
  private disposal?: Promise<void>;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  constructor(private metrics?: ProcessMetrics) {}
  async initialize(bytes: Uint8Array, context: ProcessContext) {
    this.context = context;
    this.fds.set(0, { input: context.io.stdin, position: 0n });
    this.fds.set(1, { output: context.io.stdout, position: 0n });
    this.fds.set(2, { output: context.io.stderr, position: 0n });
    context.fs
      .getDirectories()
      .forEach(([descriptor, preopen], index) =>
        this.fds.set(3 + index, { descriptor, preopen, position: 0n }),
      );
    const start = performance.now();
    const module = await WebAssembly.compile(bytes.slice());
    if (this.metrics) this.metrics.compileMs = performance.now() - start;
    const instantiate = performance.now();
    const instance = await WebAssembly.instantiate(
      module,
      this.imports() as unknown as WebAssembly.Imports,
    );
    if (this.metrics) this.metrics.instantiateMs = performance.now() - instantiate;
    this.memory = instance.exports.memory as WebAssembly.Memory;
    if (!this.memory || typeof instance.exports._start !== 'function')
      throw new Error('Expected a WASI Preview 1 command with memory and _start exports');
    this.entry = WebAssembly.promising(instance.exports._start);
    if (this.metrics) this.metrics.linearMemoryBytes = this.memory.buffer.byteLength;
  }
  async run() {
    if (!this.entry || this.started) throw new Error('Runtime is uninitialized or already run');
    this.started = true;
    try {
      if (this.stopping) throw new WasiExit(130);
      await this.entry();
      return 0;
    } catch (error) {
      if (error instanceof WasiExit) return error.code;
      throw error;
    }
  }
  requestStop() {
    this.stopping = true;
  }
  private view() {
    return new DataView(this.memory.buffer);
  }
  private bytes(p: number, n: number) {
    if (p < 0 || n < 0 || p + n > this.memory.buffer.byteLength)
      throw Object.assign(new Error('invalid memory'), { errno: 21 });
    return new Uint8Array(this.memory.buffer, p, n);
  }
  private str(p: number, n: number) {
    return this.decoder.decode(this.bytes(p, n));
  }
  private u32(p: number, n: number) {
    this.view().setUint32(p, n, true);
  }
  private u64(p: number, n: bigint) {
    this.view().setBigUint64(p, n, true);
  }
  private fd(fd: number) {
    const entry = this.fds.get(fd);
    if (!entry) throw new ServiceError('invalid-resource', 'Invalid fd');
    return entry;
  }
  private descriptor(fd: number) {
    const d = this.fd(fd).descriptor;
    if (!d) throw new ServiceError('invalid-resource', 'fd is not a descriptor');
    return d;
  }
  private child(handle: number) {
    const child = this.children.get(handle);
    if (!child) throw new ServiceError('invalid-resource', 'Invalid process handle');
    return child;
  }
  private host(fn: (...args: any[]) => unknown) {
    return new WebAssembly.Suspending(async (...args: any[]) => {
      try {
        if (this.stopping) throw new WasiExit(130);
        return await fn(...args);
      } catch (error) {
        if (
          error instanceof WasiExit ||
          (!(error instanceof ServiceError) &&
            !(error && typeof error === 'object' && 'errno' in error))
        )
          throw error;
        return errno(error);
      }
    });
  }
  private strings(values: string[], ptr: number, buf: number) {
    values.forEach((value, index) => {
      this.u32(ptr + index * 4, buf);
      const bytes = this.encoder.encode(value + '\0');
      this.bytes(buf, bytes.length).set(bytes);
      buf += bytes.length;
    });
  }
  private async closeStreams(entry: Fd) {
    const input = entry.input,
      output = entry.output;
    entry.input = undefined;
    entry.output = undefined;
    const results = await Promise.allSettled([
      input?.[Symbol.asyncDispose](),
      output?.[Symbol.asyncDispose](),
    ]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
  private async write(output: OutputStream, bytes: Uint8Array) {
    let offset = 0;
    while (offset < bytes.length) {
      const pollable = output.subscribe();
      try {
        await pollable.block();
      } finally {
        await pollable[Symbol.asyncDispose]();
      }
      const count = Math.min(Number(output.checkWrite()), bytes.length - offset);
      await output.write(bytes.subarray(offset, offset + count));
      offset += count;
    }
    return offset;
  }
  private stat(out: number, stat?: DescriptorStat, terminal = false) {
    this.bytes(out, 64).fill(0);
    this.view().setUint8(out + 16, stat?.type === 'directory' ? 3 : terminal ? 2 : 4);
    this.u64(out + 24, stat?.linkCount ?? 1n);
    this.u64(out + 32, stat?.size ?? 0n);
    const timestamp = stat?.dataModificationTimestamp;
    if (timestamp)
      this.u64(out + 48, timestamp.seconds * 1000000000n + BigInt(timestamp.nanoseconds));
  }
  imports() {
    const context = this.context;
    const args = [...context.args],
      env = context.env.entries().map(({ key, value }) => `${key}=${value}`);
    const wasi: Record<string, any> = {
      args_sizes_get: (a: number, b: number) => {
        this.u32(a, args.length);
        this.u32(b, this.encoder.encode(args.join('\0') + '\0').length);
        return 0;
      },
      args_get: (a: number, b: number) => {
        this.strings(args, a, b);
        return 0;
      },
      environ_sizes_get: (a: number, b: number) => {
        this.u32(a, env.length);
        this.u32(b, this.encoder.encode(env.join('\0') + '\0').length);
        return 0;
      },
      environ_get: (a: number, b: number) => {
        this.strings(env, a, b);
        return 0;
      },
      proc_exit: (code: number) => {
        throw new WasiExit(code);
      },
      fd_prestat_get: (fd: number, out: number) => {
        const name = this.fds.get(fd)?.preopen;
        if (name === undefined) return 8;
        this.u32(out, 0);
        this.u32(out + 4, this.encoder.encode(name).length);
        return 0;
      },
      fd_prestat_dir_name: (fd: number, out: number, len: number) => {
        const name = this.fds.get(fd)?.preopen;
        if (name === undefined) return 8;
        const bytes = this.encoder.encode(name);
        if (len < bytes.length) return 37;
        this.bytes(out, bytes.length).set(bytes);
        return 0;
      },
      fd_fdstat_get: this.host(async (fd: number, out: number) => {
        const entry = this.fd(fd);
        this.bytes(out, 24).fill(0);
        this.view().setUint8(
          out,
          entry.descriptor?.getType() === 'directory'
            ? 3
            : (entry.input ?? (entry.output as any))?.isTerminal
              ? 2
              : 4,
        );
        this.u64(out + 8, 0x1fffffffn);
        this.u64(out + 16, 0x1fffffffn);
        return 0;
      }),
      fd_read: this.host(async (fd: number, iovs: number, count: number, out: number) => {
        const entry = this.fd(fd);
        if (!entry.input) entry.input = await this.descriptor(fd).readViaStream(entry.position);
        let total = 0;
        for (let index = 0; index < count; index++) {
          const ptr = this.view().getUint32(iovs + index * 8, true),
            len = this.view().getUint32(iovs + index * 8 + 4, true);
          let bytes: Uint8Array;
          try {
            bytes = await entry.input.blockingRead(BigInt(len));
          } catch (error) {
            if (!(error instanceof ServiceError) || error.code !== 'closed') throw error;
            bytes = new Uint8Array();
          }
          this.bytes(ptr, bytes.length).set(bytes);
          entry.position += BigInt(bytes.length);
          total += bytes.length;
          if (bytes.length < len) break;
        }
        this.u32(out, total);
        return 0;
      }),
      fd_write: this.host(async (fd: number, iovs: number, count: number, out: number) => {
        const entry = this.fd(fd);
        if (!entry.output)
          entry.output = entry.append
            ? await this.descriptor(fd).appendViaStream()
            : await this.descriptor(fd).writeViaStream(entry.position);
        let total = 0;
        for (let index = 0; index < count; index++) {
          const ptr = this.view().getUint32(iovs + index * 8, true),
            len = this.view().getUint32(iovs + index * 8 + 4, true);
          const written = await this.write(entry.output, this.bytes(ptr, len).slice());
          total += written;
          entry.position += BigInt(written);
          if (written < len) break;
        }
        this.u32(out, total);
        return 0;
      }),
      fd_close: this.host(async (fd: number) => {
        const entry = this.fd(fd);
        this.fds.delete(fd);
        try {
          await this.closeStreams(entry);
        } finally {
          await entry.descriptor?.[Symbol.asyncDispose]();
        }
        return 0;
      }),
      fd_sync: this.host(async (fd: number) => {
        const entry = this.fd(fd);
        if (entry.output) await entry.output.flush();
        else if (entry.descriptor) await entry.descriptor.sync();
        return 0;
      }),
      fd_filestat_set_size: this.host(async (fd: number, size: bigint) => {
        const entry = this.fd(fd);
        await this.closeStreams(entry);
        await this.descriptor(fd).setSize(size);
        return 0;
      }),
      fd_seek: this.host(async (fd: number, offset: bigint, whence: number, out: number) => {
        const entry = this.fd(fd);
        if (!entry.descriptor || entry.descriptor.getType() === 'directory') return 70;
        const position =
          whence === 0
            ? offset
            : whence === 1
              ? entry.position + offset
              : whence === 2
                ? (await entry.descriptor.stat()).size + offset
                : -1n;
        if (position < 0n) return 28;
        await this.closeStreams(entry);
        entry.position = position;
        this.u64(out, position);
        return 0;
      }),
      fd_tell: this.host(async (fd: number, out: number) => {
        const entry = this.fd(fd);
        if (!entry.descriptor || entry.descriptor.getType() === 'directory') return 70;
        this.u64(out, entry.position);
        return 0;
      }),
      path_open: this.host(
        async (
          fd: number,
          lookup: number,
          ptr: number,
          len: number,
          flags: number,
          rights: bigint,
          _inherit: bigint,
          fdflags: number,
          out: number,
        ) => {
          const descriptor = await this.descriptor(fd).openAt(
            { symlinkFollow: !!(lookup & 1) },
            this.str(ptr, len),
            {
              create: !!(flags & 1),
              directory: !!(flags & 2),
              exclusive: !!(flags & 4),
              truncate: !!(flags & 8),
            },
            {
              read: !!(rights & 2n),
              write: !!(rights & 64n),
              mutateDirectory: !!(rights & 0x1fffe00n),
            },
          );
          const entry: Fd = { descriptor, position: 0n, append: !!(fdflags & 1) };
          if (descriptor.getType() !== 'directory') {
            try {
              if (rights & 64n)
                entry.output = entry.append
                  ? await descriptor.appendViaStream()
                  : await descriptor.writeViaStream(0n);
              else if (rights & 2n) entry.input = await descriptor.readViaStream(0n);
            } catch (error) {
              await descriptor[Symbol.asyncDispose]();
              throw error;
            }
          }
          const handle = this.nextFd++;
          this.fds.set(handle, entry);
          this.u32(out, handle);
          return 0;
        },
      ),
      fd_filestat_get: this.host(async (fd: number, out: number) => {
        const entry = this.fd(fd);
        this.stat(
          out,
          await entry.descriptor?.stat(),
          !!(entry.input as any)?.isTerminal || !!(entry.output as any)?.isTerminal,
        );
        return 0;
      }),
      path_filestat_get: this.host(
        async (fd: number, flags: number, ptr: number, len: number, out: number) => {
          this.stat(
            out,
            await this.descriptor(fd).statAt({ symlinkFollow: !!(flags & 1) }, this.str(ptr, len)),
          );
          return 0;
        },
      ),
      path_create_directory: this.host(async (fd: number, ptr: number, len: number) => {
        await this.descriptor(fd).createDirectoryAt(this.str(ptr, len));
        return 0;
      }),
      path_unlink_file: this.host(async (fd: number, ptr: number, len: number) => {
        await this.descriptor(fd).unlinkFileAt(this.str(ptr, len));
        return 0;
      }),
      path_remove_directory: this.host(async (fd: number, ptr: number, len: number) => {
        await this.descriptor(fd).removeDirectoryAt(this.str(ptr, len));
        return 0;
      }),
      path_rename: this.host(
        async (fd: number, ptr: number, len: number, to: number, np: number, nn: number) => {
          await this.descriptor(fd).renameAt(
            this.str(ptr, len),
            this.descriptor(to),
            this.str(np, nn),
          );
          return 0;
        },
      ),
      random_get: (ptr: number, len: number) => {
        try {
          this.bytes(ptr, len).set(context.random.getRandomBytes(BigInt(len)));
          return 0;
        } catch (error) {
          if (error instanceof ServiceError) return errno(error);
          throw error;
        }
      },
      clock_time_get: (id: number, _precision: bigint, out: number) => {
        if (id !== 0 && id !== 1) return 28;
        const wall = id === 0 ? context.clock.wall.now() : undefined;
        this.u64(
          out,
          wall
            ? wall.seconds * 1000000000n + BigInt(wall.nanoseconds)
            : context.clock.monotonic.now(),
        );
        return 0;
      },
      clock_res_get: (id: number, out: number) => {
        if (id !== 0 && id !== 1) return 28;
        const wall = id === 0 ? context.clock.wall.resolution() : undefined;
        this.u64(
          out,
          wall
            ? wall.seconds * 1000000000n + BigInt(wall.nanoseconds)
            : context.clock.monotonic.resolution(),
        );
        return 0;
      },
      sched_yield: () => 0,
    };
    wasi.fd_datasync = wasi.fd_sync;
    for (const name of [
      'fd_advise',
      'fd_allocate',
      'fd_fdstat_set_flags',
      'fd_fdstat_set_rights',
      'fd_filestat_set_times',
      'fd_pread',
      'fd_pwrite',
      'fd_readdir',
      'fd_renumber',
      'path_filestat_set_times',
      'path_link',
      'path_readlink',
      'path_symlink',
      'poll_oneoff',
      'proc_raise',
      'sock_accept',
      'sock_recv',
      'sock_send',
      'sock_shutdown',
    ])
      wasi[name] = () => 52;
    const webos = {
      initial_cwd: (ptr: number, len: number) => {
        const pwd = context.env.get('PWD');
        if (pwd === undefined) return -1;
        const bytes = this.encoder.encode(pwd);
        if (bytes.length >= len) return -1;
        this.bytes(ptr, bytes.length).set(bytes);
        return bytes.length;
      },
      spawn: this.host(
        async (
          executable: number,
          ptr: number,
          len: number,
          stdin: number,
          stdout: number,
          stderr: number,
          out: number,
        ) => {
          let failure: unknown;
          const stdio = [stdin, stdout, stderr].map((fd, index) => {
            if (fd < 0) return undefined;
            try {
              const entry = this.fd(fd);
              this.fds.delete(fd);
              if (entry.descriptor) this.drops.add(entry.descriptor[Symbol.asyncDispose]());
              return index === 0 ? (entry.input ?? {}) : (entry.output ?? {});
            } catch (error) {
              failure ??= error;
              return {};
            }
          });
          let descriptor: FileDescriptor | undefined,
            argv: string[] = [],
            env: Record<string, string> = {};
          try {
            descriptor = this.descriptor(executable);
            const options = JSON.parse(this.str(ptr, len));
            if (
              !Array.isArray(options.argv) ||
              options.argv.some((x: unknown) => typeof x !== 'string') ||
              !options.env ||
              typeof options.env !== 'object' ||
              Array.isArray(options.env) ||
              Object.values(options.env).some((x) => typeof x !== 'string')
            )
              throw new ServiceError('invalid', 'Invalid argv or env');
            argv = [...options.argv];
            env = { ...options.env };
          } catch (error) {
            failure ??= error;
          }
          const childPromise = context.process.spawn(
            (failure ? {} : descriptor) as FileDescriptor,
            argv,
            Object.entries(env).map(([key, value]) => ({ key, value })),
            stdio[0] as InputStream,
            stdio[1] as OutputStream,
            stdio[2] as OutputStream,
          );
          let child: ChildProcess;
          try {
            child = await childPromise;
          } catch (error) {
            if (failure)
              throw failure instanceof ServiceError
                ? failure
                : new ServiceError('invalid', String(failure));
            throw error;
          }
          const handle = this.nextChild++;
          this.children.set(handle, child);
          this.u32(out, handle);
          return 0;
        },
      ),
      pid: (handle: number) => this.child(handle).pid(),
      wait: this.host(async (handle: number, out: number) => {
        const child = this.child(handle);
        this.children.delete(handle);
        try {
          const exit = await child.wait();
          this.u32(out, exit.kind === 'exited' ? 0 : exit.kind === 'trap' ? 1 : 2);
          this.u32(out + 4, exit.kind === 'exited' ? exit.code : exit.kind === 'trap' ? 125 : 130);
          return 0;
        } finally {
          await child[Symbol.asyncDispose]();
        }
      }),
      drop: this.host(async (handle: number) => {
        const child = this.child(handle);
        this.children.delete(handle);
        await child[Symbol.asyncDispose]();
        return 0;
      }),
      request_stop: this.host(async (handle: number) => {
        await this.child(handle).requestStop();
        return 0;
      }),
      create_pipe: this.host(async (out: number) => {
        const [input, output] = await context.io.createPipe();
        const first = this.nextFd++,
          second = this.nextFd++;
        this.fds.set(first, { input, position: 0n });
        this.fds.set(second, { output, position: 0n });
        this.u32(out, first);
        this.u32(out + 4, second);
        return 0;
      }),
    };
    return { wasi_snapshot_preview1: wasi, webos_v1: webos };
  }
  [Symbol.asyncDispose](): Promise<void> {
    return (this.disposal ??= this.close());
  }
  private async close() {
    const entries = [...this.fds.values()];
    this.fds.clear();
    const children = [...this.children.values()];
    this.children.clear();
    const results = await Promise.allSettled([
      this.drops.drain(),
      ...entries.map(async (entry) => {
        try {
          await this.closeStreams(entry);
        } finally {
          await entry.descriptor?.[Symbol.asyncDispose]();
        }
      }),
      ...children.map((child) => child[Symbol.asyncDispose]()),
    ]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
}
