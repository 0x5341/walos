import { SessionRpc } from './rpc.js';
import type {
  TailscaleSessionOptions,
  TailscaleSession,
  TailscaleStatus,
  TailscaleSocketConfig,
} from './types.js';
export async function createTailscaleSession(
  options: TailscaleSessionOptions = {},
): Promise<TailscaleSession> {
  if (typeof SharedWorker === 'undefined') throw new Error('Tailscale requires SharedWorker');
  if (options.signal?.aborted) throw options.signal.reason;
  const worker = options.worker ?? new URL('./session.worker.js', import.meta.url).href;
  const session = crypto.randomUUID();
  const capability = crypto.randomUUID() + crypto.randomUUID();
  const config: TailscaleSocketConfig = Object.freeze({ worker, session, capability });
  const shared = new SharedWorker(worker, { type: 'module', name: `walos-tailscale-${session}` });
  const rpc = new SessionRpc(shared.port, options.onEvent);
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const dispose = async () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    options.signal?.removeEventListener('abort', aborted);
    try {
      await rpc.request('$dispose-session');
    } finally {
      rpc.close();
    }
  };
  const aborted = () => {
    void dispose().catch(() => {});
  };
  options.signal?.addEventListener('abort', aborted, { once: true });
  shared.onerror = () => {
    rpc.close(new Error('Tailscale SharedWorker failed'));
  };
  try {
    await rpc.request('$initialize', {
      session,
      capability,
      wasm: options.wasm ?? new URL('./tailscale.wasm', import.meta.url).href,
      runtime: options.runtime ?? new URL('./wasm_exec.js', import.meta.url).href,
      hostname: options.hostname,
      authKey: options.authKey,
      controlURL: options.controlURL,
    });
    if (closed) throw new Error('Tailscale initialization cancelled');
    heartbeat = setInterval(() => {
      void rpc.request('$heartbeat').catch(aborted);
    }, 10000);
    return {
      config,
      socketOptions(module, udpBindings) {
        return { module, config: { ...config, udpBindings } };
      },
      status: () => rpc.request<TailscaleStatus>('status'),
      login: () => rpc.request<void>('login'),
      logout: () => rpc.request<void>('logout'),
      selectExitNode: (id) => rpc.request<TailscaleStatus>('select-exit', { id }),
      [Symbol.asyncDispose]: dispose,
    };
  } catch (error) {
    options.signal?.removeEventListener('abort', aborted);
    try {
      await rpc.request('$dispose-session');
    } catch {}
    rpc.close();
    throw error;
  }
}
