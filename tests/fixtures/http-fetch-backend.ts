import type { HttpFetchBackend, HttpFetchInit } from '../../packages/os/dist/index.js';
export function createFetch(init: HttpFetchInit): HttpFetchBackend {
  const config = init.config as { audit?: string; tag?: string; fail?: boolean };
  if (config.fail) throw new Error('fetch backend initialization failed');
  const audit = config.audit ? new BroadcastChannel(config.audit) : undefined;
  audit?.postMessage({ type: 'init', pid: init.pid, ppid: init.ppid, tag: config.tag });
  let disposed = false;
  return {
    async fetch(url, options) {
      audit?.postMessage({ type: 'fetch', pid: init.pid, url: url.href });
      if (url.pathname === '/pending')
        return new Promise((_, reject) => {
          options.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        });
      return new Response('p3-http');
    },
    async [Symbol.asyncDispose]() {
      if (disposed) return;
      disposed = true;
      audit?.postMessage({ type: 'dispose', pid: init.pid, aborted: init.signal.aborted });
      audit?.close();
    },
  };
}
