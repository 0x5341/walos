import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const sdk = process.env.WASI_SDK_PATH || resolve('work/wasi-sdk-27.0-x86_64-linux');
if (!existsSync(`${sdk}/bin/clang`))
  throw new Error('Set WASI_SDK_PATH to wasi-sdk 27 (see README.md)');
mkdirSync('public/bin', { recursive: true });
const cc = (name, files, extra = []) =>
  execFileSync(
    `${sdk}/bin/clang`,
    [
      '-O2',
      '-Wall',
      '-Wextra',
      '-Wl,--strip-all',
      ...extra,
      ...files,
      'apps/compat.c',
      '-o',
      `public/bin/${name}.wasm`,
    ],
    { stdio: 'inherit' },
  );
// This fixture deliberately has no compat.c constructor: no code needs cwd.
execFileSync(
  `${sdk}/bin/clang`,
  ['-O2', '-Wall', '-Wextra', 'tests/fixtures/services.c', '-o', 'public/bin/services-probe.wasm'],
  { stdio: 'inherit' },
);
cc('sh', ['apps/sh.c']);
for (const name of ['echo', 'pwd', 'env', 'false', 'true', 'trap', 'hang', 'grep', 'sort'])
  cc(name, ['apps/tools.c']);
cc(
  'cat',
  [
    'apps/vendor/sbase/cat.c',
    'apps/vendor/sbase/libutil/concat.c',
    'apps/vendor/sbase/libutil/eprintf.c',
    'apps/vendor/sbase/libutil/writeall.c',
  ],
  ['-Iapps/vendor/sbase'],
);
cc('cwd-probe', ['tests/fixtures/cwd.c']);
cc('fs-probe', ['tests/fixtures/filesystem.c']);
cc('lifecycle-parent', ['tests/fixtures/lifecycle.c']);

// wasi-sdk emits a real Component Model executable for wasm32-wasip2.
const cc2 = (name, files, extra = []) =>
  execFileSync(
    `${sdk}/bin/clang`,
    [
      '--target=wasm32-wasip2',
      '-O2',
      '-Wall',
      '-Wextra',
      '-Wl,--strip-all',
      ...extra,
      ...files,
      'apps/compat2.c',
      '-o',
      `public/bin/${name}.wasm`,
    ],
    { stdio: 'inherit' },
  );
for (const name of ['echo', 'pwd', 'env', 'false', 'true', 'trap', 'hang', 'grep', 'sort'])
  cc2(`p2-${name}`, ['apps/tools.c']);
cc2(
  'p2-cat',
  [
    'apps/vendor/sbase/cat.c',
    'apps/vendor/sbase/libutil/concat.c',
    'apps/vendor/sbase/libutil/eprintf.c',
    'apps/vendor/sbase/libutil/writeall.c',
  ],
  ['-Iapps/vendor/sbase'],
);
execFileSync(
  `${sdk}/bin/clang`,
  [
    '--target=wasm32-wasip2',
    '-O2',
    '-Wall',
    '-Wextra',
    'tests/fixtures/services.c',
    '-o',
    'public/bin/p2-services-probe.wasm',
  ],
  { stdio: 'inherit' },
);
cc2('p2-cwd-probe', ['tests/fixtures/cwd.c'], ['-DWALOS_P2']);
cc2('p2-fs-probe', ['tests/fixtures/filesystem.c']);
await import('./build-p2-probe.mjs');
