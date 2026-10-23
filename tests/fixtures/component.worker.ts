import { loadComponent } from '../../packages/os/dist/internal/component.js';
import { Wasi2 } from '../../packages/os/dist/internal/wasi2.js';
import { Rpc } from '../../packages/os/dist/internal/protocol.js';
self.onmessage = async ({ data: file }: MessageEvent<FileSystemFileHandle>) => {
  const root = await navigator.storage.getDirectory();
  const adapter = new Wasi2(
    {
      file,
      cwd: root,
      cwdPath: '/',
      argv: ['p2-true'],
      env: {},
      stdio: ['in', 'out', 'out'].map((direction) => ({ kind: 'null', id: 0, direction })) as any,
    },
    new Rpc(() => {
      throw new Error('Unexpected Core RPC');
    }),
  );
  try {
    await adapter.init();
    const bytes = new Uint8Array(await (await file.getFile()).arrayBuffer());
    const command = await loadComponent(bytes, adapter.imports());
    await command.run.run();
    await adapter.close();
    self.postMessage({ ok: true });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
  self.close();
};
