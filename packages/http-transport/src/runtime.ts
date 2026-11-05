export interface GoHttpReply {
  status: number;
  headers: [string, string][];
  read(maximum: number): Promise<Uint8Array | null>;
  trailers(): [string, string][];
  close(): void | Promise<void>;
}
export interface ByteConnection {
  abort?(): void;
  read(maximum: number): Promise<Uint8Array | null>;
  write(bytes: Uint8Array): Promise<void>;
  close(): void | Promise<void>;
}
export interface GoHttpOptions {
  url: string;
  method: string;
  headers: [string, string][];
  ca: string;
  connectTimeoutMs: number;
  firstByteTimeoutMs: number;
  body: null | {
    read(maximum: number): Promise<Uint8Array | null>;
    cancel(): Promise<void>;
    trailers(): Promise<[string, string][]>;
  };
  dial(address: string, timeoutMs: number): Promise<ByteConnection>;
  onCancel(callback: (() => void) | null): void;
  onSent(error: string | null): void;
}
export interface GoHttpRuntime {
  serve(options: Record<string, unknown>): Promise<{ close(): Promise<void> }>;
  request(options: GoHttpOptions): Promise<GoHttpReply>;
}
let loading: Promise<GoHttpRuntime> | undefined;
/** One standard Go runtime per realm. Artifacts are always loaded as a matched pair. */
export function loadHttpRuntime(wasm: string, runtime: string): Promise<GoHttpRuntime> {
  return (loading ??= (async () => {
    await import(/* @vite-ignore */ runtime);
    const Go = (
      globalThis as unknown as {
        Go: new () => {
          importObject: WebAssembly.Imports;
          run(instance: WebAssembly.Instance): Promise<void>;
        };
      }
    ).Go;
    const go = new Go();
    const response = await fetch(wasm);
    if (!response.ok) throw new Error(`Cannot load HTTP Wasm: ${response.status}`);
    const { instance } = await WebAssembly.instantiate(
      await response.arrayBuffer(),
      go.importObject,
    );
    return new Promise<GoHttpRuntime>((resolve, reject) => {
      const root = globalThis as unknown as { __walosHttpReady?: (api: GoHttpRuntime) => void };
      root.__walosHttpReady = (api) => {
        delete root.__walosHttpReady;
        resolve(api);
      };
      void go.run(instance).then(() => reject(new Error('HTTP Wasm exited')), reject);
    });
  })());
}
