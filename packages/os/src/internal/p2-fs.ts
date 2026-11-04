import { instant, node as makeNode, type State, type Node, type NewTime } from './fs-store.js';
import { Filesystem, type Descriptor as FileDescriptor } from './fs.js';
import { FileStream, IoError, ioError } from './streams.js';
import { InputStream, OutputStream, StreamFailure, type StreamResource } from './p2-io.js';

type Flags = {
  read?: boolean;
  write?: boolean;
  mutateDirectory?: boolean;
  fileIntegritySync?: boolean;
  dataIntegritySync?: boolean;
  requestedWriteSync?: boolean;
};
type PathFlags = { symlinkFollow?: boolean };
type OpenFlags = { create?: boolean; exclusive?: boolean; truncate?: boolean; directory?: boolean };
export const filesystemError = (error: unknown): string =>
  typeof error === 'string'
    ? error
    : ({
        2: 'access',
        8: 'bad-descriptor',
        10: 'busy',
        20: 'exist',
        27: 'file-too-large',
        28: 'invalid',
        29: 'io',
        31: 'is-directory',
        44: 'no-entry',
        51: 'quota',
        52: 'unsupported',
        54: 'not-directory',
        55: 'not-empty',
        64: 'pipe',
        76: 'not-permitted',
      }[ioError(error).errno] ?? 'io');
const fsCall = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    throw filesystemError(error);
  }
};
export const offsetNumber = (offset: bigint) => {
  if (offset < 0n || offset > BigInt(Number.MAX_SAFE_INTEGER)) throw 'overflow';
  return Number(offset);
};
export const filesystemErrorCode = (error: StreamFailure) => {
  if (!(error instanceof StreamFailure) || !error.code) return undefined;
  return filesystemError(new IoError(Number(error.code), error.message));
};

export class P2Filesystem {
  private next = 10;
  readonly descriptors = new Set<Descriptor>();
  constructor(
    public fs: Filesystem,
    public track: (stream: StreamResource) => void,
    public release: (stream: StreamResource, moved?: boolean) => void,
  ) {}
  descriptor(data: FileDescriptor, flags: Flags) {
    const descriptor = new Descriptor(this, this.next++, data, flags);
    this.descriptors.add(descriptor);
    return descriptor;
  }
  preopens() {
    const flags = { read: true, write: true, mutateDirectory: true };
    return [[this.descriptor(this.fs.get(3), flags), '/']];
  }
  close() {
    for (const descriptor of this.descriptors) descriptor[Symbol.dispose]();
  }
}
export class Descriptor {
  private live = true;
  private streams = new Set<FileStream>();
  constructor(
    private owner: P2Filesystem,
    private fd: number,
    public data: FileDescriptor,
    private flags: Flags,
  ) {
    owner.fs.descriptors.set(fd, data);
  }
  check() {
    if (!this.live) throw 'bad-descriptor';
  }
  private readable() {
    this.check();
    if (!this.flags.read) throw 'bad-descriptor';
  }
  private writable() {
    this.check();
    if (!this.flags.write) throw 'bad-descriptor';
  }
  private mutable() {
    this.check();
    if (!this.flags.mutateDirectory) throw 'read-only';
  }
  private file() {
    this.check();
    if (!this.data.file) throw 'is-directory';
    return this.data.file;
  }
  private get store() {
    return this.owner.fs.store;
  }
  private get id() {
    return this.data.id;
  }
  private resolve(s: State, path: string, follow = true, missing = false) {
    this.check();
    return this.store.resolve(s, this.id, path, follow, missing);
  }
  private async dataFor(n: Node, path: string): Promise<FileDescriptor> {
    return {
      id: n.id,
      path,
      ...(n.type === 'regular-file'
        ? { file: await this.store.file(n.id) }
        : { dir: this.owner.fs.root }),
    };
  }
  private async fileStream(direction: 'in' | 'out', offset: bigint, append = false) {
    direction === 'in' ? this.readable() : this.writable();
    const stream = (await this.owner.fs.platform.connect({
      kind: 'file',
      id: 0,
      direction,
      file: this.file(),
      storage: this.store.root,
      nodeId: this.id,
      position: offsetNumber(offset),
      append,
    })) as FileStream;
    this.streams.add(stream);
    return stream;
  }
  readViaStream(offset: bigint) {
    return fsCall(async () => {
      const stream = await this.fileStream('in', offset);
      const resource = new InputStream(stream, (resource, moved) => {
        this.streams.delete(stream);
        this.owner.release(resource, moved);
      });
      this.owner.track(resource);
      return resource;
    });
  }
  writeViaStream(offset: bigint) {
    return fsCall(async () => {
      const stream = await this.fileStream('out', offset);
      const resource = new OutputStream(stream, (resource, moved) => {
        this.streams.delete(stream);
        this.owner.release(resource, moved);
      });
      this.owner.track(resource);
      return resource;
    });
  }
  appendViaStream() {
    return fsCall(async () => {
      const stream = await this.fileStream('out', 0n, true);
      const resource = new OutputStream(stream, (resource, moved) => {
        this.streams.delete(stream);
        this.owner.release(resource, moved);
      });
      this.owner.track(resource);
      return resource;
    });
  }
  getType(): 'directory' | 'regular-file' {
    this.check();
    return this.data.dir ? 'directory' : 'regular-file';
  }
  getFlags() {
    this.check();
    return { ...this.flags };
  }
  async advise() {
    this.check();
  }
  async syncData() {
    this.check();
    for (const stream of this.streams) await stream.flushAsync();
  }
  async sync() {
    await this.syncData();
  }
  setSize(size: bigint) {
    return fsCall(async () => {
      const stream = await this.fileStream('out', 0n);
      try {
        await stream.truncate(offsetNumber(size));
      } finally {
        await stream.finish();
        this.streams.delete(stream);
      }
    });
  }
  async setTimes(a: NewTime, m: NewTime) {
    this.writable();
    return this.store.run((s) => this.store.setTimes(this.store.get(s, this.id), a, m), true);
  }
  async setTimesAt(flags: { symlinkFollow?: boolean }, path: string, a: NewTime, m: NewTime) {
    this.mutable();
    return this.store.run(
      (s) =>
        this.store.setTimes(
          this.store.get(s, this.resolve(s, path, !!flags.symlinkFollow).id!),
          a,
          m,
        ),
      true,
    );
  }
  async linkAt(flags: { symlinkFollow?: boolean }, path: string, to: Descriptor, newPath: string) {
    this.check();
    to.mutable();
    if (!(await this.store.root.isSameEntry(to.store.root))) throw 'cross-device';
    return this.store.run((s) => {
      const source = this.store.get(s, this.resolve(s, path, !!flags.symlinkFollow).id!);
      if (source.type === 'directory') throw 'not-permitted';
      const target = to.resolve(s, newPath, false, true);
      if (target.id) throw 'exist';
      const parent = this.store.get(s, target.parent);
      if (!parent.links) throw 'no-entry';
      Object.defineProperty(parent.entries!, target.name, {
        value: source.id,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      source.links++;
      this.store.touch(source);
      this.store.touch(parent, true);
    }, true);
  }
  async readlinkAt(path: string) {
    this.check();
    return this.store.run((s) => {
      const n = this.store.get(s, this.resolve(s, path, false).id!);
      if (n.type !== 'symbolic-link') throw 'invalid';
      if (n.target!.startsWith('/')) throw 'not-permitted';
      return n.target!;
    });
  }
  async symlinkAt(old: string, path: string) {
    this.mutable();
    if (old.startsWith('/')) throw 'not-permitted';
    if (!old || old.includes('\0')) throw 'invalid';
    return this.store.run((s) => {
      const target = this.resolve(s, path, false, true);
      if (target.id) throw 'exist';
      const n = makeNode('symbolic-link');
      n.target = old;
      s.nodes[n.id] = n;
      const parent = this.store.get(s, target.parent);
      if (!parent.links) throw 'no-entry';
      Object.defineProperty(parent.entries!, target.name, {
        value: n.id,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      this.store.touch(parent, true);
    }, true);
  }
  read(length: bigint, offset: bigint) {
    return fsCall(async () => {
      this.readable();
      const file = await this.file().getFile(),
        start = offsetNumber(offset);
      const count = Number(length > 65536n ? 65536n : length);
      const bytes = new Uint8Array(await file.slice(start, start + count).arrayBuffer());
      return [bytes, start + bytes.length >= file.size];
    });
  }
  write(bytes: Uint8Array, offset: bigint) {
    return fsCall(async () => {
      const stream = await this.fileStream('out', offset);
      try {
        return BigInt(await stream.write(bytes));
      } finally {
        await stream.finish();
        this.streams.delete(stream);
      }
    });
  }
  readDirectory() {
    return fsCall(async () => {
      this.check();
      const entries = await this.store.run((s) => {
        const n = this.store.get(s, this.id);
        if (n.type !== 'directory') throw 'not-directory';
        return Object.entries(n.entries!).map(([name, id]) => ({
          name,
          type: this.store.get(s, id).type,
        }));
      });
      return new DirectoryEntryStream(entries);
    });
  }
  createDirectoryAt(path: string) {
    return fsCall(async () => {
      this.mutable();
      await this.store.run((s) => {
        const target = this.resolve(s, path, false, true);
        if (target.id) throw 'exist';
        const n = makeNode('directory');
        s.nodes[n.id] = n;
        const parent = this.store.get(s, target.parent);
        if (!parent.links) throw 'no-entry';
        Object.defineProperty(parent.entries!, target.name, {
          value: n.id,
          enumerable: true,
          writable: true,
          configurable: true,
        });
        this.store.touch(parent, true);
      }, true);
    });
  }
  private async nodeStat(n: Node) {
    const file =
      n.type === 'regular-file' ? await (await this.store.file(n.id)).getFile() : undefined;
    return {
      type: n.type,
      linkCount: BigInt(n.links),
      size: BigInt(file?.size ?? (n.target ? new TextEncoder().encode(n.target).length : 0)),
      dataAccessTimestamp: instant(n.atime),
      dataModificationTimestamp: instant(n.mtime),
      statusChangeTimestamp: instant(n.ctime),
    };
  }
  stat() {
    return fsCall(async () => {
      this.check();
      return this.store.run((s) => this.nodeStat(this.store.get(s, this.id)));
    });
  }
  statAt(pathFlags: PathFlags, path: string) {
    return fsCall(() =>
      this.store.run((s) =>
        this.nodeStat(this.store.get(s, this.resolve(s, path, !!pathFlags.symlinkFollow).id!)),
      ),
    );
  }
  openAt(pathFlags: PathFlags, path: string, open: OpenFlags, flags: Flags) {
    return fsCall(async () => {
      this.check();
      if (open.create || open.truncate || flags.write || flags.mutateDirectory) this.mutable();
      if (open.truncate && !flags.write) throw 'invalid';
      if (flags.fileIntegritySync || flags.dataIntegritySync || flags.requestedWriteSync)
        throw 'unsupported';
      const data = await this.store.run(async (s) => {
        if (open.create && open.exclusive && this.resolve(s, path, false, true).id) throw 'exist';
        const target = this.resolve(s, path, !!pathFlags.symlinkFollow, !!open.create);
        let n = target.id ? this.store.get(s, target.id) : undefined;
        if (!n) {
          if (open.directory) throw 'invalid';
          n = makeNode('regular-file');
          const physical = await (await this.store.file(n.id, true)).getFile();
          n.dataStamp = `${physical.lastModified}:${physical.size}`;
          s.nodes[n.id] = n;
          const parent = this.store.get(s, target.parent);
          if (!parent.links) throw 'no-entry';
          Object.defineProperty(parent.entries!, target.name, {
            value: n.id,
            enumerable: true,
            writable: true,
            configurable: true,
          });
          this.store.touch(parent, true);
        }
        if (n.type === 'symbolic-link') throw 'loop';
        if (open.directory && n.type !== 'directory') throw 'not-directory';
        if (n.type === 'directory' && (open.truncate || open.create)) throw 'is-directory';
        return this.dataFor(n, path);
      }, !!open.create);
      const descriptor = this.owner.descriptor(data, { ...flags });
      try {
        if (open.truncate) await descriptor.setSize(0n);
      } catch (e) {
        descriptor[Symbol.dispose]();
        throw e;
      }
      return descriptor;
    });
  }
  private remove(path: string, directory: boolean) {
    return fsCall(async () => {
      this.mutable();
      return this.store.run((s) => {
        const t = this.resolve(s, path, false);
        if (!t.name) throw 'invalid';
        const n = this.store.get(s, t.id!);
        if (directory && n.type !== 'directory') throw 'not-directory';
        if (!directory && n.type === 'directory') throw 'is-directory';
        if (n.entries && Object.keys(n.entries).length) throw 'not-empty';
        delete this.store.get(s, t.parent).entries![t.name];
        n.links--;
        this.store.touch(n);
        this.store.touch(this.store.get(s, t.parent), true);
      }, true);
    });
  }
  removeDirectoryAt(path: string) {
    return this.remove(path, true);
  }
  unlinkFileAt(path: string) {
    return this.remove(path, false);
  }
  renameAt(path: string, destination: Descriptor, newPath: string) {
    return fsCall(async () => {
      this.mutable();
      destination.mutable();
      if (!(await this.store.root.isSameEntry(destination.store.root))) throw 'cross-device';
      return this.store.run((s) => {
        const a = this.resolve(s, path, false),
          b = destination.resolve(s, newPath, false, true);
        if (!a.name || !b.name) throw 'invalid';
        if (a.id === b.id) return;
        const n = this.store.get(s, a.id!);
        const contains = (id: string): boolean =>
          id === b.parent ||
          Object.values(this.store.get(s, id).entries ?? {}).some(
            (child) => this.store.get(s, child).type === 'directory' && contains(child),
          );
        if (n.type === 'directory' && contains(n.id)) throw 'invalid';
        if (b.id) {
          const old = this.store.get(s, b.id);
          if (n.type === 'directory' && old.type !== 'directory') throw 'not-directory';
          if (n.type !== 'directory' && old.type === 'directory') throw 'is-directory';
          if (old.entries && Object.keys(old.entries).length) throw 'not-empty';
          old.links--;
          this.store.touch(old);
        }
        const from = this.store.get(s, a.parent),
          to = this.store.get(s, b.parent);
        if (!to.links) throw 'no-entry';
        delete from.entries![a.name];
        Object.defineProperty(to.entries!, b.name, {
          value: n.id,
          enumerable: true,
          writable: true,
          configurable: true,
        });
        this.store.touch(n);
        this.store.touch(from, true);
        this.store.touch(to, true);
      }, true);
    });
  }
  isSameObject(other: Descriptor) {
    return fsCall(async () => {
      this.check();
      other.check();
      return this.id === other.id && (await this.store.root.isSameEntry(other.store.root));
    });
  }
  private async hash(s: State, id: string) {
    const n = this.store.get(s, id),
      stat = await this.nodeStat(n);
    const bytes = new TextEncoder().encode(
      JSON.stringify([n.id, String(stat.size), n.mtime, n.generation]),
    );
    const hash = new DataView(await crypto.subtle.digest('SHA-256', bytes));
    return { lower: hash.getBigUint64(0, true), upper: hash.getBigUint64(8, true) };
  }
  metadataHash() {
    return fsCall(async () => {
      this.check();
      return this.store.run((s) => this.hash(s, this.id));
    });
  }
  metadataHashAt(flags: PathFlags, path: string) {
    return fsCall(() =>
      this.store.run((s) => this.hash(s, this.resolve(s, path, !!flags.symlinkFollow).id!)),
    );
  }
  [Symbol.dispose]() {
    if (!this.live) return;
    this.live = false;
    // Streams have independent resource lifetimes and offsets.
    this.owner.descriptors.delete(this);
    this.owner.fs.descriptors.delete(this.fd);
  }
}
export class DirectoryEntryStream {
  private live = true;
  private index = 0;
  constructor(private entries: { name: string; type: Node['type'] }[]) {}
  async readDirectoryEntry() {
    if (!this.live) throw 'bad-descriptor';
    return this.entries[this.index++];
  }
  async closeAsync() {
    this.live = false;
  }
  [Symbol.dispose]() {
    this.live = false;
  }
}
