import { connect } from './streams.js';
import type { StreamRef } from './protocol.js';

/** Browser primitives only; filesystem and resource semantics belong to services. */
export interface PlatformBackend {
  root(): Promise<FileSystemDirectoryHandle>;
  connect(ref: StreamRef): ReturnType<typeof connect>;
}

export const browserPlatform: PlatformBackend = {
  root: () => navigator.storage.getDirectory(),
  connect: (ref) => connect(ref, typeof window === 'undefined'),
};
