import { connect } from './streams.js';
import type { StreamRef } from './protocol.js';

/** Browser primitives only; filesystem and resource semantics belong to services. */
export interface PlatformBackend {
  connect(ref: StreamRef): ReturnType<typeof connect>;
}

export const browserPlatform: PlatformBackend = {
  connect: (ref) => connect(ref, typeof window === 'undefined'),
};
