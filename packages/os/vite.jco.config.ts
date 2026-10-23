import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/internal/jco.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'jco.js',
    },
    outDir: fileURLToPath(new URL('./dist/internal', import.meta.url)),
    emptyOutDir: false,
    minify: true,
  },
});
