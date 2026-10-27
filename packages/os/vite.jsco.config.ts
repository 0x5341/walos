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
        return code.replace(
          /import\(["']\.\/(?:cli|wasip3-node)\.js["']\)/g,
          'Promise.reject(new Error("Node-only jsco API unavailable in a browser"))',
        );
      },
    },
  ],
  build: {
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
