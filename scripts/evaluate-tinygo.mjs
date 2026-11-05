import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname, delimiter } from 'node:path';
import { gzipSync } from 'node:zlib';
const root = resolve('.');
const out = resolve('work/network-evaluation');
mkdirSync(out, { recursive: true });
const go = resolve('work/toolchains/go-1.27.3/go/bin/go');
const tinygo = resolve('work/toolchains/tinygo/bin/tinygo');
const env = {
  ...process.env,
  PATH: dirname(go) + delimiter + process.env.PATH,
  GOTOOLCHAIN: 'local',
  XDG_CACHE_HOME: resolve('work/tinygo-cache'),
  GOCACHE: resolve('work/go-cache'),
  GOMODCACHE: resolve('work/go-mod'),
  GOPATH: resolve('work/go-path'),
};

const targets =
  process.argv[2] && process.argv[2] !== 'all' ? [process.argv[2]] : ['http', 'tailscale'];
for (const target of targets) {
  if (!['http', 'tailscale'].includes(target)) throw new Error('Expected http, tailscale or all');
  const packageName = target === 'http' ? 'http-transport' : 'tailscale-socket';
  const artifact = resolve(out, `${target}-tinygo.wasm`);
  const build = spawnSync(
    tinygo,
    ['build', '-target=wasm', '-no-debug', '-panic=trap', '-opt=z', '-o', artifact, '.'],
    {
      cwd: resolve('packages', packageName, 'go'),
      env,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  writeFileSync(
    resolve(out, `${target}-build.log`),
    (build.stdout ?? '') + (build.stderr ?? '') + (build.error?.message ?? ''),
  );
  const result = {
    target,
    compiler: 'TinyGo 0.44.0',
    go: 'Go 1.27.3',
    buildPassed: build.status === 0,
    functionalTestsPassed: false,
    selected: false,
    artifacts: {},
  };
  for (const [name, path] of [
    ['go', resolve('packages', packageName, 'dist', `${target}.wasm`)],
    ...(result.buildPassed ? [['tinygo', artifact]] : []),
  ]) {
    const bytes = readFileSync(path);
    result.artifacts[name] = { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
  }
  if (result.buildPassed && target === 'http') {
    copyFileSync(
      resolve('work/toolchains/tinygo/targets/wasm_exec.js'),
      resolve(out, 'wasm_exec-tinygo.js'),
    );
    const test = spawnSync(process.execPath, ['scripts/http-sockets.test.mjs'], {
      cwd: root,
      env: { ...env, WALOS_HTTP_COMPILER: 'tinygo' },
      encoding: 'utf8',
      timeout: 120000,
    });
    writeFileSync(
      resolve(out, 'http-tests.log'),
      (test.stdout ?? '') + (test.stderr ?? '') + (test.error?.message ?? ''),
    );
    result.functionalTestsPassed = test.status === 0;
  }
  writeFileSync(resolve(out, `${target}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!result.buildPassed || !result.functionalTestsPassed) process.exitCode = 1;
}
