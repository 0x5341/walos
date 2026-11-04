import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const sdk = process.env.WASI_P3_SDK_PATH || resolve('work/wasi-sdk-34.0-x86_64-linux');
const tools =
  process.env.WASM_TOOLS_PATH || resolve('work/wasm-tools-1.263.0-x86_64-linux/wasm-tools');
const bindgen =
  process.env.WIT_BINDGEN_P3_PATH || resolve('work/wit-bindgen-0.63.0-x86_64-linux/wit-bindgen');
mkdirSync('public/bin', { recursive: true });
for (const world of ['http-service', 'http-middleware']) {
  const out = `work/${world}-bindings`,
    name = world.replaceAll('-', '_');
  mkdirSync(out, { recursive: true });
  execFileSync(bindgen, ['c', 'wit/p3', '--world', world, '--all-features', '--out-dir', out], {
    stdio: 'inherit',
  });
  const binary = `public/bin/p3-${world}.wasm`;
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
      `tests/fixtures/${world}.c`,
      `${out}/${name}.c`,
      `${out}/${name}_component_type.o`,
      '-o',
      binary,
    ],
    { stdio: 'inherit' },
  );
  const wit = execFileSync(tools, ['component', 'wit', binary], { encoding: 'utf8' });
  if (
    !wit.includes('handle: async func(') ||
    !wit.includes('wasi:http/handler@0.3.2') ||
    /@0\.(?:2\.|3\.(?!2\b))/.test(wit)
  )
    throw new Error(`Expected native HTTP 0.3.2 component: ${world}`);
  const wat = execFileSync(tools, ['print', binary], { encoding: 'utf8' });
  for (const feature of [
    'canon lift',
    'async',
    ...(world === 'http-service' ? ['canon stream', 'canon future'] : []),
  ])
    if (!wat.includes(feature)) throw new Error(`Missing native ABI feature: ${feature}`);
}
