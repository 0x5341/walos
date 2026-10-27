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
    return [
      [this.descriptor(this.fs.get(3), flags), '/'],
      ...(this.fs.descriptors.has(4)
        ? [[this.descriptor(this.fs.get(4), flags), this.fs.cwdPath]]
        : []),
    ];
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
  private resolve(path: string) {
    this.check();
    return this.owner.fs.resolve(this.fd, path);
  }
  private async fileStream(direction: 'in' | 'out', offset: bigint, append = false) {
    direction === 'in' ? this.readable() : this.writable();
    const stream = await new FileStream({
      kind: 'file',
      id: 0,
      direction,
      file: this.file(),
      position: offsetNumber(offset),
      append,
    }).open(typeof window === 'undefined');
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
  async setTimes() {
    this.check();
    throw 'unsupported';
  }
  async setTimesAt() {
    this.check();
    throw 'unsupported';
  }
  async linkAt() {
    this.check();
    throw 'unsupported';
  }
  async readlinkAt() {
    this.check();
    throw 'unsupported';
  }
  async symlinkAt() {
    this.check();
    throw 'unsupported';
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
      if (!this.data.dir) throw 'not-directory';
      return new DirectoryEntryStream(this.data.dir.entries());
    });
  }
  createDirectoryAt(path: string) {
    return fsCall(async () => {
      this.mutable();
      const { parent, name } = await this.resolve(path);
      if (!name) throw 'exist';
      try {
        await parent.getDirectoryHandle(name);
        throw 'exist';
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
      }
      await parent.getDirectoryHandle(name, { create: true });
    });
  }
  stat() {
    return fsCall(async () => {
      this.check();
      const file = this.data.file ? await this.data.file.getFile() : undefined;
      return {
        type: this.getType(),
        linkCount: 1n,
        size: BigInt(file?.size ?? 0),
        dataModificationTimestamp: file
          ? {
              seconds: BigInt(Math.floor(file.lastModified / 1000)),
              nanoseconds: (file.lastModified % 1000) * 1000000,
            }
          : undefined,
      };
    });
  }
  async statAt(pathFlags: unknown, path: string) {
    const descriptor = await this.openAt(pathFlags, path, {}, {});
    try {
      return await descriptor.stat();
    } finally {
      descriptor[Symbol.dispose]();
    }
  }
  openAt(_pathFlags: unknown, path: string, open: OpenFlags, flags: Flags) {
    return fsCall(async () => {
      if (open.create || open.truncate || flags.write || flags.mutateDirectory) this.mutable();
      if (open.truncate && !flags.write) throw 'invalid';
      if (flags.fileIntegritySync || flags.dataIntegritySync || flags.requestedWriteSync)
        throw 'unsupported';
      const { parent, name, path: resolvedPath } = await this.resolve(path);
      let data: FileDescriptor;
      if (!name || open.directory) {
        if (open.create || open.truncate) throw 'invalid';
        data = { dir: name ? await parent.getDirectoryHandle(name) : parent, path: resolvedPath };
      } else {
        if (open.exclusive && open.create) {
          try {
            await parent.getFileHandle(name);
            throw 'exist';
          } catch (error) {
            if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
          }
        }
        try {
          data = {
            file: await parent.getFileHandle(name, { create: !!open.create }),
            path: resolvedPath,
          };
        } catch (error) {
          if (
            !(error instanceof DOMException && error.name === 'TypeMismatchError') ||
            open.create ||
            open.truncate
          )
            throw error;
          data = { dir: await parent.getDirectoryHandle(name), path: resolvedPath };
        }
      }
      const descriptor = this.owner.descriptor(data, { ...flags });
      try {
        if (open.truncate) await descriptor.setSize(0n);
      } catch (error) {
        descriptor[Symbol.dispose]();
        throw error;
      }
      return descriptor;
    });
  }
  removeDirectoryAt(path: string) {
    return fsCall(async () => {
      this.mutable();
      const { parent, name } = await this.resolve(path);
      await parent.getDirectoryHandle(name);
      await parent.removeEntry(name);
    });
  }
  unlinkFileAt(path: string) {
    return fsCall(async () => {
      this.mutable();
      const { parent, name } = await this.resolve(path);
      try {
        await parent.getFileHandle(name);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TypeMismatchError')
          throw 'is-directory';
        throw error;
      }
      await parent.removeEntry(name);
    });
  }
  renameAt(path: string, destination: Descriptor, newPath: string) {
    return fsCall(async () => {
      this.mutable();
      destination.mutable();
      const source = await this.resolve(path),
        target = await destination.resolve(newPath);
      const file = await source.parent.getFileHandle(source.name);
      if (!file.move) throw 'unsupported';
      await file.move(target.parent, target.name);
    });
  }
  isSameObject(other: Descriptor) {
    return fsCall(async () => {
      this.check();
      other.check();
      return (this.data.file ?? this.data.dir)!.isSameEntry((other.data.file ?? other.data.dir)!);
    });
  }
  metadataHash() {
    return fsCall(async () => {
      const stat = await this.stat();
      const bytes = new TextEncoder().encode(
        JSON.stringify(stat, (_k, value) => (typeof value === 'bigint' ? String(value) : value)),
      );
      const hash = new DataView(await crypto.subtle.digest('SHA-256', bytes));
      return { lower: hash.getBigUint64(0, true), upper: hash.getBigUint64(8, true) };
    });
  }
  async metadataHashAt(pathFlags: unknown, path: string) {
    const descriptor = await this.openAt(pathFlags, path, {}, {});
    try {
      return await descriptor.metadataHash();
    } finally {
      descriptor[Symbol.dispose]();
    }
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
  constructor(private iterator: AsyncIterableIterator<[string, FileSystemHandle]>) {}
  readDirectoryEntry() {
    return fsCall(async () => {
      if (!this.live) throw 'bad-descriptor';
      const entry = await this.iterator.next();
      return entry.done
        ? undefined
        : {
            name: entry.value[0],
            type: entry.value[1].kind === 'directory' ? 'directory' : 'regular-file',
          };
    });
  }
  async closeAsync() {
    if (!this.live) return;
    this.live = false;
    await this.iterator.return?.();
  }
  [Symbol.dispose]() {
    void this.closeAsync();
  }
}
