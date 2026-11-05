import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2] ?? 'http';
if (!['http', 'tailscale'].includes(target)) throw new Error('Expected http or tailscale');
const packageDir = resolve(
  root,
  'packages',
  target === 'http' ? 'http-transport' : 'tailscale-socket',
);
const go = resolve(root, 'work/toolchains/go-1.27.3/go/bin/go');
if (!existsSync(go)) throw new Error('Run bash scripts/setup-network-tools.sh first');
const env = {
  ...process.env,
  GOOS: 'js',
  GOARCH: 'wasm',
  GOTOOLCHAIN: 'local',
  GOCACHE: resolve(root, 'work/go-cache'),
  GOMODCACHE: resolve(root, 'work/go-mod'),
  GOPATH: resolve(root, 'work/go-path'),
};
mkdirSync(resolve(packageDir, 'dist'), { recursive: true });
execFileSync(
  go,
  [
    'build',
    '-mod=readonly',
    '-trimpath',
    '-ldflags=-s -w',
    '-o',
    resolve(packageDir, `dist/${target}.wasm`),
    '.',
  ],
  { cwd: resolve(packageDir, 'go'), env, stdio: 'inherit' },
);
copyFileSync(
  resolve(root, 'work/toolchains/go-1.27.3/go/lib/wasm/wasm_exec.js'),
  resolve(packageDir, 'dist/wasm_exec.js'),
);

// Distribute the notices of modules actually linked into the browser artifact.
const linked = execFileSync(
  go,
  [
    'list',
    '-mod=readonly',
    '-deps',
    '-f',
    '{{if .Module}}{{.Module.Path}}|{{.Module.Dir}}{{end}}',
    '.',
  ],
  { cwd: resolve(packageDir, 'go'), env, encoding: 'utf8' },
);
let notices =
  'Third-party software linked into this package\n\nGo 1.27.3\n' +
  readFileSync(resolve(root, 'work/toolchains/go-1.27.3/go/LICENSE'), 'utf8') +
  '\n';
for (const entry of [...new Set(linked.split('\n').filter((line) => line.includes('|')))].sort()) {
  const [name, dir] = entry.split('|');
  if (dir === resolve(packageDir, 'go')) continue;
  for (const file of readdirSync(dir)
    .filter((name) => /^(LICENSE|COPYING|NOTICE)([._-].*)?$/i.test(name))
    .sort()) {
    const path = resolve(dir, file);
    try {
      notices += `\n----- ${name}/${file} -----\n\n` + readFileSync(path, 'utf8') + '\n';
    } catch (error) {
      if (error.code !== 'EISDIR') throw error;
    }
  }
}
writeFileSync(resolve(packageDir, 'NOTICE'), notices.trimEnd() + '\n');
