import { defineConfig } from 'vite';
export default defineConfig({
  // Keep built assets relative so the demo also works below a Pages project path.
  base: './',
  define: {
    __WALOS_COMPONENT_ENGINE__: JSON.stringify(process.env.WALOS_COMPONENT_ENGINE || 'jsco'),
  },
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
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
