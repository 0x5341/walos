import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    {
      name: 'jsco-browser-only',
      transform(code, id) {
        if (!id.endsWith('/@pavelsavara/jsco/index.js')) return;
        // The npm root also exports Node hosts/CLI. They are never used by this
        // adapter and otherwise pull Node builtins into the browser bundle.
        // preview.2 drops the future handle without notifying its producer.
        // Keep the patch pinned and fail loudly when upgrading the engine.
        const futureDrop = 'dropReadable(e,t){o.delete(t)}';
        if (!code.includes(futureDrop)) throw new Error('Review jsco future cancellation patch');
        code = code.replace(
          futureDrop,
          'dropReadable(e,t){o.get(t)?.cancel?.();o.delete(t);r.delete(-2&t)}',
        );
        // Async canonical lower imports always receive a result pointer, including
        // scalar results (e.g. descriptor.is-same-object -> bool). preview.2
        // incorrectly selects a flat return for a single scalar and never stores it.
        const asyncResult = 'g=2===r.params?2===r.results?Ko:qo:2===r.results?Xo:Zo';
        if (!code.includes(asyncResult)) throw new Error('Review jsco async scalar result patch');
        code = code.replace(
          asyncResult,
          'g=n?2===r.params?Ko:Xo:2===r.params?2===r.results?Ko:qo:2===r.results?Xo:Zo',
        );
        return code.replace(
          /import\(["']\.\/(?:cli|wasip3-node)\.js["']\)/g,
          'Promise.reject(new Error("Node-only jsco API unavailable in a browser"))',
        );
      },
    },
  ],
  build: {
    // Share Future identity and async-operation cancellation with Context.
    rollupOptions: { external: ['../async.js'] },
    lib: {
      entry: Object.fromEntries(
        ['component-jsco'].map((name) => [
          name,
          fileURLToPath(new URL(`./src/internal/${name}.ts`, import.meta.url)),
        ]),
      ),
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    outDir: fileURLToPath(new URL('./dist/internal', import.meta.url)),
    emptyOutDir: false,
    minify: true,
  },
});
