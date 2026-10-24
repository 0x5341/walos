import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { componentNew, preview1AdapterReactorPath } from '@bytecodealliance/jco';

const sdk = process.env.WASI_SDK_PATH || resolve('work/wasi-sdk-27.0-x86_64-linux');
const bindgen =
  process.env.WIT_BINDGEN_PATH || resolve('work/wit-bindgen-0.46.0-x86_64-linux/wit-bindgen');
if (!existsSync(bindgen))
  throw new Error(
    'Run bash scripts/setup-wit-bindgen.sh or set WIT_BINDGEN_PATH to wit-bindgen 0.46.0',
  );
const directory = 'work/p2-bindings';
mkdirSync(`${directory}/wit`, { recursive: true });
cpSync('wit/deps', `${directory}/wit/deps`, { recursive: true });
cpSync('wit/world.wit', `${directory}/wit/world.wit`);
cpSync('tests/fixtures/process2.wit', `${directory}/wit/probe.wit`);
execFileSync(
  bindgen,
  ['c', `${directory}/wit`, '--world', 'process-probe', '--out-dir', directory],
  { stdio: 'inherit' },
);
execFileSync(
  `${sdk}/bin/clang`,
  [
    '--target=wasm32-wasip1',
    '-mexec-model=reactor',
    '-O2',
    `-I${directory}`,
    'tests/fixtures/process2.c',
    `${directory}/process_probe.c`,
    `${directory}/process_probe_component_type.o`,
    '-o',
    `${directory}/probe.core.wasm`,
  ],
  { stdio: 'inherit' },
);
// The generated public WIT bindings use native Component resources. The reactor
// adapter only supplies libc's incidental Preview 1 imports (allocation/abort).
writeFileSync(
  'public/bin/p2-process-probe.wasm',
  await componentNew(readFileSync(`${directory}/probe.core.wasm`), [
    ['wasi_snapshot_preview1', readFileSync(preview1AdapterReactorPath())],
  ]),
);
