import { Store } from './fs-store.js';
import { IoError } from './streams.js';
import { browserPlatform, type PlatformBackend } from './platform.js';
export interface Descriptor {
  id: string;
  file?: FileSystemFileHandle;
  dir?: FileSystemDirectoryHandle;
  path: string;
}
export class Filesystem {
  descriptors = new Map<number, Descriptor>();
  readonly store: Store;
  constructor(
    public root: FileSystemDirectoryHandle,
    public platform: PlatformBackend = browserPlatform,
  ) {
    this.store = new Store(root);
    this.descriptors.set(3, { id: 'root', dir: root, path: '/' });
  }
  get(fd: number) {
    const d = this.descriptors.get(fd);
    if (!d) throw new IoError(8, 'bad descriptor');
    return d;
  }
}
