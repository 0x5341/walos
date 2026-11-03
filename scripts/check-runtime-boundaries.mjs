import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { parseSync } from 'oxc-parser';

// Runtime adapters may depend on format/ABI helpers, never OS implementations.
const forbidden = new Set([
  'process-context.ts',
  'wasi-services.ts',
  'services.ts',
  'service-model.ts',
  'platform.ts',
  'fs.ts',
  'p2-fs.ts',
  'p2-io.ts',
  'streams.ts',
  'core.ts',
  'protocol.ts',
]);
export function* runtimeImports(file, source) {
  const { program, errors } = parseSync(file, source);
  if (errors.length) throw new Error(`Cannot parse ${file}: ${JSON.stringify(errors)}`);
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    if (
      node.importKind === 'type' ||
      (node.specifiers.length > 0 &&
        node.specifiers.every((specifier) => specifier.importKind === 'type'))
    )
      continue;
    yield node.source.value;
  }
}

const visited = new Set();
function inspect(file, chain = []) {
  if (visited.has(file)) return;
  visited.add(file);
  for (const specifier of runtimeImports(file, readFileSync(file, 'utf8'))) {
    if (!specifier.startsWith('.')) continue;
    const dependency = resolve(dirname(file), specifier.replace(/\.js$/, '.ts'));
    if (forbidden.has(basename(dependency)))
      throw new Error(
        `Runtime imports OS implementation: ${[...chain, basename(file), basename(dependency)].join(' -> ')}`,
      );
    if (existsSync(dependency)) inspect(dependency, [...chain, basename(file)]);
  }
}
for (const name of ['wasi', 'wasi2', 'wasi3']) {
  const file = resolve(`packages/os/src/internal/${name}.ts`);
  if (existsSync(file)) inspect(file);
}
console.log('Runtime adapters have no OS implementation dependencies.');
