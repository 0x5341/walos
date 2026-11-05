import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const sdk = process.env.WASI_P3_SDK_PATH || resolve('work/wasi-sdk-34.0-x86_64-linux');
execFileSync(
  `${sdk}/bin/clang`,
  [
    '--target=wasm32-wasip3',
    '-mexec-model=reactor',
    '-O2',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-Iwork/p3-bindings',
    'apps/curl.c',
    'work/p3-bindings/command.c',
    'work/p3-bindings/command_component_type.o',
    '-o',
    'public/bin/curl.wasm',
  ],
  { stdio: 'inherit' },
);
