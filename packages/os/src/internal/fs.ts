import { FileStream, IoError } from './streams.js';
import { browserPlatform, type PlatformBackend } from './platform.js';
export interface Descriptor {
  file?: FileSystemFileHandle;
  dir?: FileSystemDirectoryHandle;
  path: string;
  stream?: FileStream;
}
export const normalize = (path: string, cwd = '/') => {
  const parts: string[] = [];
  for (const p of `${path.startsWith('/') ? '' : cwd + '/'}${path}`.split('/')) {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  }
  return '/' + parts.join('/');
};
export class Filesystem {
  descriptors = new Map<number, Descriptor>();
  private next = 5;
  constructor(
    public root: FileSystemDirectoryHandle,
    public cwd: FileSystemDirectoryHandle,
    public cwdPath: string,
    public platform: PlatformBackend = browserPlatform,
  ) {
    this.descriptors.set(3, { dir: root, path: '/' });
    this.descriptors.set(4, { dir: cwd, path: cwdPath });
  }
  get(fd: number) {
    const d = this.descriptors.get(fd);
    if (!d) throw new IoError(8, 'bad descriptor');
    return d;
  }
  async resolve(base: number, path: string) {
    const b = this.get(base);
    if (!b.dir) throw new IoError(54, 'not a directory');
    if (path.startsWith('/')) throw new IoError(76, 'WASI paths must be relative');
    const parts: string[] = [];
    for (const part of path.split('/')) {
      if (part === '..') {
        if (!parts.length) throw new IoError(76, 'path escapes directory descriptor');
        parts.pop();
      } else if (part && part !== '.') parts.push(part);
    }
    let dir = b.dir;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return { parent: dir, name: parts.at(-1) ?? '', path: normalize(parts.join('/'), b.path) };
  }
  async open(base: number, path: string, flags: number, rights: bigint, fdflags: number) {
    if (flags & 8 && !(rights & 64n)) throw new IoError(28, 'truncate requires write');
    const resolved = await this.resolve(base, path);
    let d: Descriptor;
    if (flags & 2 || !resolved.name) {
      const dir = resolved.name
        ? await resolved.parent.getDirectoryHandle(resolved.name)
        : resolved.parent;
      d = { dir, path: resolved.path };
    } else {
      if (flags & 4) {
        try {
          await resolved.parent.getFileHandle(resolved.name);
          throw new IoError(20, 'already exists');
        } catch (e) {
          if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e;
        }
      }
      let file: FileSystemFileHandle;
      try {
        file = await resolved.parent.getFileHandle(resolved.name, { create: !!(flags & 1) });
      } catch (error) {
        if (
          !(error instanceof DOMException && error.name === 'TypeMismatchError') ||
          flags & (1 | 8)
        )
          throw error;
        const dir = await resolved.parent.getDirectoryHandle(resolved.name);
        const fd = this.next++;
        this.descriptors.set(fd, { dir, path: resolved.path });
        return fd;
      }
      const write = !!(rights & 64n);
      const stream = await new FileStream({
        kind: 'file',
        id: 0,
        direction: write ? 'out' : 'in',
        file,
        position: 0,
        append: !!(fdflags & 1),
      }).open();
      try {
        if (flags & 8) await stream.truncate(0);
      } catch (error) {
        stream.close();
        throw error;
      }
      d = { file, path: resolved.path, stream };
    }
    const fd = this.next++;
    this.descriptors.set(fd, d);
    return fd;
  }
  close(fd: number) {
    const d = this.get(fd);
    d.stream?.close();
    this.descriptors.delete(fd);
  }
  closeAll() {
    for (const d of this.descriptors.values())
      try {
        d.stream?.close();
      } catch {}
    this.descriptors.clear();
  }
}
