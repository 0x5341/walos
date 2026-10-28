import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import ts from 'typescript';

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
const visited = new Set();
function inspect(file, chain = []) {
  if (visited.has(file)) return;
  visited.add(file);
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const clause = node.importClause;
    if (
      clause?.isTypeOnly ||
      (clause?.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        !clause.name &&
        clause.namedBindings.elements.every((element) => element.isTypeOnly))
    )
      continue;
    const specifier = node.moduleSpecifier.text;
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
