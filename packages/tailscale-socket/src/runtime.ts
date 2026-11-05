import type { RemoteRuntime } from './types.js';
export async function loadTailscaleRuntime(
  wasm: string,
  runtime: string,
  onExit: (error: Error) => void = () => {},
): Promise<RemoteRuntime> {
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
  if (!response.ok) throw new Error(`Cannot load Tailscale Wasm: ${response.status}`);
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
  return new Promise((resolve, reject) => {
    const root = globalThis as unknown as { __walosTailscaleReady?: (api: RemoteRuntime) => void };
    root.__walosTailscaleReady = (api) => {
      delete root.__walosTailscaleReady;
      resolve(api);
    };
    void go.run(instance).then(
      () => {
        const error = new Error('Tailscale Wasm exited');
        onExit(error);
        reject(error);
      },
      (error) => {
        onExit(error);
        reject(error);
      },
    );
  });
}
