import type { SocketBackendOptions, WasiSocketsTypes as S } from '@walos/os';
export interface TailscaleStatus {
  readonly state: string;
  readonly addresses: readonly string[];
  readonly exitNodes: readonly {
    readonly id: string;
    readonly name: string;
    readonly online: boolean;
  }[];
  readonly exitNode: string;
  readonly exitReady: boolean;
}
export type TailscaleEvent =
  | { readonly type: 'status'; readonly status: TailscaleStatus }
  | { readonly type: 'auth-url'; readonly url: string }
  | { readonly type: 'error'; readonly message: string };
export interface TailscaleSessionOptions {
  readonly worker?: string;
  readonly wasm?: string;
  readonly runtime?: string;
  readonly hostname?: string;
  readonly authKey?: string;
  readonly controlURL?: string;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: TailscaleEvent) => void;
}
/** Only these capabilities are cloned to processes. Auth keys stay in the owner Worker. */
export interface TailscaleSocketConfig {
  readonly worker: string;
  readonly session: string;
  readonly capability: string;
  /** Bindings prepared before the process is ready, making WASI UDP bind synchronous. */
  readonly udpBindings?: readonly S.IpSocketAddress[];
}
export interface TailscaleSession extends AsyncDisposable {
  readonly config: TailscaleSocketConfig;
  socketOptions(module: string, udpBindings?: readonly S.IpSocketAddress[]): SocketBackendOptions;
  status(): Promise<TailscaleStatus>;
  login(): Promise<void>;
  logout(): Promise<void>;
  selectExitNode(id: string): Promise<TailscaleStatus>;
}
export interface RemoteSocket {
  readonly handle: number;
  readonly local: string;
  readonly remote?: string;
}
export interface RemoteRuntime {
  call(
    operation: string,
    args: Record<string, unknown>,
    notify?: (json: string) => void,
  ): Promise<unknown>;
}
export interface RpcRequest {
  id: number;
  op: string;
  args: Record<string, unknown>;
}
export type RpcReply = { id: number; value?: unknown; error?: string } | { event: TailscaleEvent };
