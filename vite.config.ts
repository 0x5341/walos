import { defineConfig } from 'vite';
const productionTest = Boolean(process.env.WALOS_TEST_BUILD);
const networkEntries = new Set([
  'http-transport',
  'tailscale-socket',
  'tailscale-session',
  'tailscale-client',
]);
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        'http-transport': 'src/network/http-transport.ts',
        'tailscale-socket': 'src/network/tailscale-socket.ts',
        'tailscale-session': 'src/network/tailscale-session.worker.ts',
        'tailscale-client': 'src/network/tailscale-client.ts',
        ...(productionTest
          ? {
              library: 'tests/fixtures/production.html',
              'socket-backend': 'tests/fixtures/socket-backend.ts',
            }
          : {}),
      },
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: (chunk) =>
          networkEntries.has(chunk.name)
            ? 'network/[name].js'
            : chunk.name === 'socket-backend'
              ? 'tests/fixtures/socket-backend.js'
              : 'assets/[name]-[hash].js',
      },
    },
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
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' https: wss:; style-src 'self'",
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
