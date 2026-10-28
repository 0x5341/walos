import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const sdk = process.env.WASI_P3_SDK_PATH || resolve('work/wasi-sdk-34.0-x86_64-linux');
const tools =
  process.env.WASM_TOOLS_PATH || resolve('work/wasm-tools-1.262.0-x86_64-linux/wasm-tools');
const bindgen =
  process.env.WIT_BINDGEN_P3_PATH || resolve('work/wit-bindgen-0.63.0-x86_64-linux/wit-bindgen');
const out = 'work/p3-bindings';
mkdirSync(out, { recursive: true });
execFileSync(bindgen, ['c', 'wit/p3', '--world', 'command', '--all-features', '--out-dir', out], {
  stdio: 'inherit',
});
execFileSync(
  `${sdk}/bin/clang`,
  [
    '--target=wasm32-wasip3',
    '-mexec-model=reactor',
    '-O2',
    '-Wall',
    '-Wextra',
    '-Werror',
    `-I${out}`,
    'tests/fixtures/preview3.c',
    `${out}/command.c`,
    `${out}/command_component_type.o`,
    '-o',
    'public/bin/p3-probe.wasm',
  ],
  { stdio: 'inherit' },
);
const wit = execFileSync(tools, ['component', 'wit', 'public/bin/p3-probe.wasm'], {
  encoding: 'utf8',
});
if (
  !wit.includes('run: async func()') ||
  !wit.includes('stream<u8>') ||
  !wit.includes('future<') ||
  /@0\.(?:2\.|3\.(?!2\b))/.test(wit)
)
  throw new Error('P3 fixture must use genuine native async and official 0.3.2');
writeFileSync(`${out}/component.wit`, wit);
const wat = execFileSync(tools, ['print', 'public/bin/p3-probe.wasm'], { encoding: 'utf8' });
for (const feature of ['canon lift', 'async', 'canon stream', 'canon future'])
  if (!wat.includes(feature)) throw new Error(`Missing P3 canonical ABI feature: ${feature}`);
// Negative fixtures are deliberately synthetic; positive E2Es use compiled C.
for (const [name, entry, importName] of [
  ['unknown-world', 'example:unknown/run@0.3.2', 'wasi:cli/stdin@0.3.2'],
  ['wrong-version', 'wasi:cli/run@0.3.1', 'wasi:cli/stdin@0.3.1'],
  ['mixed-world', 'wasi:cli/run@0.3.2', 'wasi:cli/stdin@0.2.3'],
  ['unknown-import', 'wasi:cli/run@0.3.2', 'example:unknown/service@0.3.2'],
  ['missing-run', 'wasi:cli/run@0.3.2', 'wasi:cli/types@0.3.2'],
]) {
  const source = `(component (type $empty (instance)) (import "${importName}" (instance $i (type $empty))) (export "${entry}" (instance $i)))`;
  writeFileSync(`${out}/${name}.wat`, source);
  execFileSync(tools, ['parse', `${out}/${name}.wat`, '-o', `public/bin/p3-${name}.wasm`], {
    stdio: 'inherit',
  });
}
console.log('Verified P3 0.3.2 native async CLI, streams, futures and negative world fixtures.');

copyFileSync('public/bin/p3-probe.wasm', 'public/bin/p3-lifecycle-parent.wasm');

// The installed cat is a command with file operands, independent of the stdin-only probe.
execFileSync(
  `${sdk}/bin/clang`,
  [
    '--target=wasm32-wasip3',
    '-mexec-model=reactor',
    '-O2',
    '-Wall',
    '-Wextra',
    '-Werror',
    `-I${out}`,
    'apps/p3-cat.c',
    `${out}/command.c`,
    `${out}/command_component_type.o`,
    '-o',
    'public/bin/p3-cat.wasm',
  ],
  { stdio: 'inherit' },
);
