import { defineConfig } from 'vite';
export default defineConfig({
  define: {
    __WALOS_COMPONENT_ENGINE__: JSON.stringify(process.env.WALOS_COMPONENT_ENGINE || 'jco'),
  },
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
