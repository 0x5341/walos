import { Store, node } from '../../packages/os/dist/internal/fs-store.js';
self.onmessage = async ({ data: root }) => {
  const store = new Store(root);
  await store.run(async (s) => {
    const n = node('regular-file');
    await store.file(n.id, true);
    s.nodes[n.id] = n;
    s.nodes.root.entries!.interrupted = n.id;
    self.postMessage('staged');
    await new Promise(() => {});
  }, true);
};
