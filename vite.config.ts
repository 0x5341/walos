import { defineConfig } from 'vite';
export default defineConfig({
  // Keep built assets relative so the demo also works below a Pages project path.
  base: './',
  build: process.env.WALOS_TEST_BUILD
    ? {
        rollupOptions: { input: { main: 'index.html', library: 'tests/fixtures/production.html' } },
      }
    : undefined,
  worker: { format: 'es' },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      // jsco compiles Wasm directly; no blob modules or JS unsafe-eval required.
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self'",
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
