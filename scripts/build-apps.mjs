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
cc('fs-probe', ['tests/fixtures/filesystem.c']);
