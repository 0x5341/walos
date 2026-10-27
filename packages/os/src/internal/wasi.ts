import { createRandom, wallClock, monotonicClock } from './services.js';
import { Filesystem } from './fs.js';
import { connect, FileStream, IoError, ioError, type Stream } from './streams.js';
import { Rpc, transferables, type Spec, type StreamRef } from './protocol.js';
export class WasiExit {
  constructor(public code: number) {}
}
export class Wasi {
  memory!: WebAssembly.Memory;
  fs!: Filesystem;
  streams = new Map<number, Stream>();
  private nextStream = 10000;
  private resources = new Map<number, number>();
  private nextResource = 1;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  stopping = false;
  private random = createRandom();
  constructor(
    private spec: Spec,
    private rpc: Rpc,
  ) {}
  async init() {
    const root = await navigator.storage.getDirectory();
    this.fs = new Filesystem(root, this.spec.cwd ?? root, this.spec.cwdPath ?? '/');
    if (!this.spec.cwd) this.fs.descriptors.delete(4);
    for (let i = 0; i < 3; i++) this.streams.set(i, await connect(this.spec.stdio[i]!));
  }
  private view() {
    return new DataView(this.memory.buffer);
  }
  private bytes(p: number, n: number) {
    if (p < 0 || n < 0 || p + n > this.memory.buffer.byteLength)
      throw new IoError(21, 'invalid memory');
    return new Uint8Array(this.memory.buffer, p, n);
  }
  private str(p: number, n: number) {
    return this.decoder.decode(this.bytes(p, n));
  }
  private u32(p: number, v: number) {
    this.view().setUint32(p, v, true);
  }
  private u64(p: number, v: bigint) {
    this.view().setBigUint64(p, v, true);
  }
  private strings(values: string[], ptr: number, buf: number) {
    for (let i = 0; i < values.length; i++) {
      this.u32(ptr + i * 4, buf);
      const b = this.encoder.encode(values[i] + '\0');
      this.bytes(buf, b.length).set(b);
      buf += b.length;
    }
  }
  private stream(fd: number) {
    const s = this.streams.get(fd) ?? this.fs.get(fd).stream;
    if (!s) throw new IoError(8, 'not a stream');
    return s;
  }
  private resource(h: number) {
    const pid = this.resources.get(h);
    if (pid === undefined) throw new IoError(8, 'invalid process resource');
    return pid;
  }
  private host(fn: (...a: any[]) => any) {
    return new WebAssembly.Suspending(async (...a: any[]) => {
      try {
        if (this.stopping) throw new WasiExit(130);
        return await fn(...a);
      } catch (e) {
        if (e instanceof WasiExit) throw e;
        console.debug('WASI error', e);
        return ioError(e).errno;
      }
    });
  }
  private take(fd: number): StreamRef | null {
    if (fd < 0) return null;
    const s = this.stream(fd);
    try {
      return s.detach();
    } finally {
      this.streams.delete(fd);
      this.fs.descriptors.delete(fd);
    }
  }
  imports() {
    const args = this.spec.argv,
      env = Object.entries(this.spec.env).map(([k, v]) => `${k}=${v}`);
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
      proc_exit: (n: number) => {
        throw new WasiExit(n);
      },
      fd_prestat_get: (fd: number, p: number) => {
        if (!this.fs.descriptors.get(fd)?.dir || (fd !== 3 && fd !== 4)) return 8;
        this.u32(p, 0);
        this.u32(p + 4, this.encoder.encode(fd === 3 ? '/' : (this.spec.cwdPath ?? '/')).length);
        return 0;
      },
      fd_prestat_dir_name: (fd: number, p: number, n: number) => {
        if (!this.fs.descriptors.get(fd)?.dir || (fd !== 3 && fd !== 4)) return 8;
        const b = this.encoder.encode(fd === 3 ? '/' : (this.spec.cwdPath ?? '/'));
        if (n < b.length) return 37;
        this.bytes(p, b.length).set(b);
        return 0;
      },
      fd_fdstat_get: this.host(async (fd: number, p: number) => {
        const s = this.streams.get(fd);
        const d = s ? undefined : this.fs.get(fd);
        this.bytes(p, 24).fill(0);
        this.view().setUint8(p, d?.dir ? 3 : s?.ref.kind === 'tty' ? 2 : 4);
        this.u64(p + 8, 0x1fffffffn);
        this.u64(p + 16, 0x1fffffffn);
        return 0;
      }),
      fd_read: this.host(async (fd: number, iovs: number, count: number, out: number) => {
        let total = 0;
        const s = this.stream(fd);
        for (let i = 0; i < count; i++) {
          const v = this.view(),
            p = v.getUint32(iovs + i * 8, true),
            n = v.getUint32(iovs + i * 8 + 4, true);
          const b = await s.read(n);
          this.bytes(p, b.length).set(b);
          total += b.length;
          if (b.length < n) break;
        }
        this.u32(out, total);
        return 0;
      }),
      fd_write: this.host(async (fd: number, iovs: number, count: number, out: number) => {
        let total = 0;
        const s = this.stream(fd);
        for (let i = 0; i < count; i++) {
          const v = this.view(),
            p = v.getUint32(iovs + i * 8, true),
            n = v.getUint32(iovs + i * 8 + 4, true);
          const bytes = this.bytes(p, n).slice();
          const written = await s.write(bytes);
          total += written;
          if (written < n) break;
        }
        this.u32(out, total);
        return 0;
      }),
      fd_close: this.host(async (fd: number) => {
        const s = this.streams.get(fd);
        if (s) {
          s.close();
          this.streams.delete(fd);
          if (s.ref.id) await this.rpc.call({ op: 'stream-close', streamId: s.ref.id });
        } else this.fs.close(fd);
        return 0;
      }),
      fd_sync: this.host(async (fd: number) => {
        const s = this.stream(fd);
        if (s instanceof FileStream) s.flush();
        return 0;
      }),
      fd_datasync: this.host(async (fd: number) => {
        const s = this.stream(fd);
        if (s instanceof FileStream) s.flush();
        return 0;
      }),
      fd_filestat_set_size: this.host(async (fd: number, size: bigint) => {
        const s = this.stream(fd);
        if (!(s instanceof FileStream)) return 8;
        await s.truncate(Number(size));
        return 0;
      }),
      fd_seek: this.host(async (fd: number, offset: bigint, whence: number, out: number) => {
        const s = this.stream(fd);
        if (!(s instanceof FileStream)) return 70;
        let p =
          whence === 0
            ? Number(offset)
            : whence === 1
              ? s.ref.position + Number(offset)
              : (await s.ref.file.getFile()).size + Number(offset);
        if (p < 0) return 28;
        s.ref.position = p;
        this.u64(out, BigInt(p));
        return 0;
      }),
      fd_tell: this.host(async (fd: number, out: number) => {
        const s = this.stream(fd);
        if (!(s instanceof FileStream)) return 70;
        this.u64(out, BigInt(s.ref.position));
        return 0;
      }),
      path_open: this.host(
        async (
          fd: number,
          _lookup: number,
          p: number,
          n: number,
          flags: number,
          rights: bigint,
          _inherit: bigint,
          fdflags: number,
          out: number,
        ) => {
          const result = await this.fs.open(fd, this.str(p, n), flags, rights, fdflags);
          this.u32(out, result);
          return 0;
        },
      ),
      fd_filestat_get: this.host(async (fd: number, out: number) => {
        const s = this.streams.get(fd),
          d = s ? undefined : this.fs.get(fd);
        this.stat(
          out,
          d?.dir ? 3 : s?.ref.kind === 'tty' ? 2 : 4,
          d?.file
            ? await d.file.getFile()
            : s?.ref.kind === 'file'
              ? await s.ref.file.getFile()
              : undefined,
        );
        return 0;
      }),
      path_filestat_get: this.host(
        async (fd: number, _flags: number, p: number, n: number, out: number) => {
          const r = await this.fs.resolve(fd, this.str(p, n));
          if (!r.name) {
            this.stat(out, 3);
            return 0;
          }
          try {
            const f = await r.parent.getFileHandle(r.name);
            this.stat(out, 4, await f.getFile());
          } catch (e) {
            if (e instanceof DOMException && e.name === 'TypeMismatchError') {
              await r.parent.getDirectoryHandle(r.name);
              this.stat(out, 3);
            } else throw e;
          }
          return 0;
        },
      ),
      path_create_directory: this.host(async (fd: number, p: number, n: number) => {
        const r = await this.fs.resolve(fd, this.str(p, n));
        try {
          await r.parent.getDirectoryHandle(r.name);
          return 20;
        } catch (e) {
          if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e;
        }
        await r.parent.getDirectoryHandle(r.name, { create: true });
        return 0;
      }),
      path_unlink_file: this.host(async (fd: number, p: number, n: number) => {
        const r = await this.fs.resolve(fd, this.str(p, n));
        await r.parent.getFileHandle(r.name);
        await r.parent.removeEntry(r.name);
        return 0;
      }),
      path_remove_directory: this.host(async (fd: number, p: number, n: number) => {
        const r = await this.fs.resolve(fd, this.str(p, n));
        await r.parent.getDirectoryHandle(r.name);
        await r.parent.removeEntry(r.name);
        return 0;
      }),
      path_rename: this.host(
        async (fd: number, p: number, n: number, toFd: number, toP: number, toN: number) => {
          const source = await this.fs.resolve(fd, this.str(p, n));
          const target = await this.fs.resolve(toFd, this.str(toP, toN));
          const file = await source.parent.getFileHandle(source.name);
          if (!file.move) return 52;
          await file.move(target.parent, target.name);
          return 0;
        },
      ),
      random_get: (p: number, n: number) => {
        try {
          this.bytes(p, n).set(this.random.getRandomBytes(BigInt(n)));
          return 0;
        } catch (error) {
          return ioError(error).errno;
        }
      },
      clock_time_get: (id: number, _precision: bigint, out: number) => {
        if (id !== 0 && id !== 1) return 28;
        const wall = id === 0 ? wallClock.now() : undefined;
        this.u64(
          out,
          wall ? wall.seconds * 1000000000n + BigInt(wall.nanoseconds) : monotonicClock.now(),
        );
        return 0;
      },
      clock_res_get: (id: number, p: number) => {
        if (id !== 0 && id !== 1) return 28;
        this.u64(p, 1000000n);
        return 0;
      },
      sched_yield: () => 0,
    };
    // Unsupported Preview 1 calls return the standard NOSYS errno.
    const names = [
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
    ];
    for (const name of names) wasi[name] = () => 52;
    const webos = {
      initial_cwd: (p: number, n: number) => {
        if (this.spec.env.PWD === undefined) return -1;
        const b = this.encoder.encode(this.spec.env.PWD);
        if (b.length >= n) return -1;
        this.bytes(p, b.length).set(b);
        return b.length;
      },
      spawn: this.host(
        async (
          executable: number,
          p: number,
          n: number,
          stdin: number,
          stdout: number,
          stderr: number,
          out: number,
        ) => {
          // Consume every explicit stream even when validation/launch subsequently fails.
          const stdio: (StreamRef | null)[] = [];
          try {
            let takeError: unknown;
            for (const fd of [stdin, stdout, stderr]) {
              try {
                stdio.push(this.take(fd));
              } catch (e) {
                stdio.push(null);
                takeError ??= e;
              }
            }
            if (takeError) throw takeError;
            if (stdio.some((ref, i) => ref && ref.direction !== (i === 0 ? 'in' : 'out')))
              throw new IoError(8, 'stdio direction mismatch');
            const descriptor = this.fs.get(executable);
            const file = descriptor.file;
            if (!file || descriptor.stream?.ref.direction !== 'in')
              throw new IoError(8, 'spawn requires a readable executable');
            const opts = JSON.parse(this.str(p, n)) as {
              argv: string[];
              env: Record<string, string>;
            };
            if (
              !Array.isArray(opts.argv) ||
              opts.argv.some((v) => typeof v !== 'string') ||
              !opts.env ||
              typeof opts.env !== 'object' ||
              Array.isArray(opts.env) ||
              Object.values(opts.env).some((v) => typeof v !== 'string')
            )
              throw new IoError(28, 'invalid argv or env');
            const spec: Spec = {
              file,
              argv: [...opts.argv],
              env: { ...opts.env },
              stdio,
            };
            const pid = await this.rpc.call({ op: 'spawn', spec }, transferables(stdio));
            const h = this.nextResource++;
            this.resources.set(h, pid);
            this.u32(out, h);
            return 0;
          } catch (e) {
            for (const s of stdio)
              if (s && (s.kind === 'pipe' || s.kind === 'tty'))
                try {
                  s.port.postMessage({ type: 'broken' });
                  s.port.close();
                } catch {}
            throw e;
          }
        },
      ),
      pid: (h: number) => this.resource(h),
      wait: this.host(async (h: number, out: number) => {
        const pid = this.resource(h);
        this.resources.delete(h);
        const exit = await this.rpc.call({ op: 'wait', pid, release: true });
        this.u32(out, exit.kind === 'exited' ? 0 : exit.kind === 'trap' ? 1 : 2);
        this.u32(out + 4, exit.kind === 'exited' ? exit.code : exit.kind === 'trap' ? 125 : 130);
        return 0;
      }),
      drop: this.host(async (h: number) => {
        const pid = this.resource(h);
        this.resources.delete(h);
        await this.rpc.call({ op: 'drop', pid });
        return 0;
      }),
      request_stop: this.host(async (h: number) => {
        await this.rpc.call({ op: 'stop', pid: this.resource(h) });
        return 0;
      }),
      create_pipe: this.host(async (out: number) => {
        const refs: StreamRef[] = await this.rpc.call({ op: 'pipe' });
        for (let i = 0; i < 2; i++) {
          const fd = this.nextStream++;
          this.streams.set(fd, await connect(refs[i]));
          this.u32(out + i * 4, fd);
        }
        return 0;
      }),
    };
    return { wasi_snapshot_preview1: wasi, webos_v1: webos };
  }
  private stat(out: number, type: number, file?: File) {
    this.bytes(out, 64).fill(0);
    this.view().setUint8(out + 16, type);
    this.u64(out + 24, 1n);
    this.u64(out + 32, BigInt(file?.size ?? 0));
    if (file) this.u64(out + 48, BigInt(file.lastModified) * 1000000n);
  }
  async close() {
    for (const s of this.streams.values())
      try {
        s.close();
      } catch {}
    this.streams.clear();
    this.fs?.closeAll();
  }
  gone(id: number) {
    for (const s of this.streams.values()) if (s.ref.id === id) s.gone();
  }
}
