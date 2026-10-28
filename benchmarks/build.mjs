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

// Same observable workload with the actual official native async ABI.
await import('../scripts/build-p3-probe.mjs');
const sdk3 = process.env.WASI_P3_SDK_PATH || resolve('work/wasi-sdk-34.0-x86_64-linux');
execFileSync(
  `${sdk3}/bin/clang`,
  [
    '--target=wasm32-wasip3',
    '-mexec-model=reactor',
    '-O2',
    '-Wall',
    '-Wextra',
    '-Wno-unused-function',
    '-Wl,--strip-all',
    '-DWALOS_BENCHMARK',
    '-Iwork/p3-bindings',
    'tests/fixtures/preview3.c',
    'work/p3-bindings/command.c',
    'work/p3-bindings/command_component_type.o',
    '-o',
    'work/benchmark-bin/p3.wasm',
  ],
  { stdio: 'inherit' },
);
