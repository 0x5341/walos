import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2];
if (!['http', 'tailscale'].includes(target)) throw new Error('Expected http or tailscale');
execFileSync(resolve(root, 'work/toolchains/go-1.27.3/go/bin/go'), process.argv.slice(3), {
  cwd: resolve(root, 'packages', target === 'http' ? 'http-transport' : 'tailscale-socket', 'go'),
  env: {
    ...process.env,
    GOTOOLCHAIN: 'local',
    GOCACHE: resolve(root, 'work/go-cache'),
    GOMODCACHE: resolve(root, 'work/go-mod'),
    GOPATH: resolve(root, 'work/go-path'),
  },
  stdio: 'inherit',
});
