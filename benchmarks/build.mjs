import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const sdk = process.env.WASI_SDK_PATH || resolve('work/wasi-sdk-27.0-x86_64-linux');
mkdirSync('work/benchmark-bin', { recursive: true });
for (const format of ['p1', 'p2']) {
  execFileSync(
    `${sdk}/bin/clang`,
    [
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-Wl,--strip-all',
      ...(format === 'p2' ? ['--target=wasm32-wasip2'] : []),
      'benchmarks/workload.c',
      `apps/compat${format === 'p2' ? '2' : ''}.c`,
      '-o',
      `work/benchmark-bin/${format}.wasm`,
    ],
    { stdio: 'inherit' },
  );
}
