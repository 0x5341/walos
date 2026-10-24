import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: 'work/benchmark-bin',
  worker: { format: 'es' },
  build: {
    outDir: 'work/benchmark-site',
    rollupOptions: { input: 'benchmarks/index.html' },
  },
  preview: {
    host: '127.0.0.1',
    port: 4184,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
