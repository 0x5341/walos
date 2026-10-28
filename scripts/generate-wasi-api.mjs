import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { format, resolveConfig } from 'prettier';
const tool =
  process.env.WASM_TOOLS_PATH || resolve('work/wasm-tools-1.262.0-x86_64-linux/wasm-tools');
const pinned = JSON.parse(readFileSync('wit/p3/upstream-sha256.json', 'utf8'));
for (const [path, digest] of Object.entries(pinned))
  if (
    createHash('sha256')
      .update(readFileSync(`wit/p3/${path}`))
      .digest('hex') !== digest
  )
    throw Error(`Modified official WIT: ${path}`);
const graph = JSON.parse(
  execFileSync(tool, ['component', 'wit', 'wit/p3', '--json', '--all-features'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }),
);
const camel = (s) => s.replace(/%/g, '').replace(/-([a-zA-Z])/g, (_, c) => c.toUpperCase());
const pascal = (s) => {
  s = camel(s);
  return s[0].toUpperCase() + s.slice(1);
};
const pkgName = (p) => p.name.slice(0, p.name.indexOf('@'));
const nsName = (i) =>
  pkgName(graph.packages[i.package]).split(':').map(pascal).join('') + pascal(i.name);
const integer = {
  u8: 'U8',
  u16: 'U16',
  u32: 'U32',
  u64: 'U64',
  s8: 'S8',
  s16: 'S16',
  s32: 'S32',
  s64: 'S64',
  f32: 'F32',
  f64: 'F64',
  bool: 'boolean',
  string: 'string',
  char: 'string',
  'error-context': 'ErrorContext',
};
function type(ref, iface, expand = false) {
  if (ref == null) return 'void';
  if (typeof ref === 'string')
    return (
      integer[ref] ??
      (() => {
        throw Error(`Unknown primitive ${ref}`);
      })()
    );
  const def = graph.types[ref];
  if (def.name && !expand) {
    const owner = def.owner?.interface;
    return `${owner === iface ? '' : nsName(graph.interfaces[owner]) + '.'}${pascal(def.name)}`;
  }
  const k = def.kind;
  if (typeof k === 'string') {
    if (k === 'resource') return pascal(def.name);
    throw Error(`Unknown type kind ${k}`);
  }
  if ('type' in k) return type(k.type, iface);
  if ('list' in k) return k.list === 'u8' ? 'Uint8Array' : `readonly (${type(k.list, iface)})[]`;
  if ('option' in k) return `(${type(k.option, iface)} | undefined)`;
  if ('tuple' in k) return `readonly [${k.tuple.types.map((t) => type(t, iface)).join(', ')}]`;
  if ('result' in k) return `Result<${type(k.result.ok, iface)}, ${type(k.result.err, iface)}>`;
  if ('future' in k) return `Future<${type(k.future, iface)}>`;
  if ('stream' in k) return `Stream<${type(k.stream, iface)}>`;
  if ('handle' in k) {
    const own = 'own' in k.handle;
    return `${own ? 'Own' : 'Borrow'}<${type(k.handle[own ? 'own' : 'borrow'], iface)}>`;
  }
  if ('record' in k)
    return `{ ${k.record.fields.map((f) => `readonly ${camel(f.name)}: ${type(f.type, iface)};`).join(' ')} }`;
  if ('flags' in k)
    return `{ ${k.flags.flags.map((f) => `readonly ${camel(f.name)}?: boolean;`).join(' ')} }`;
  if ('enum' in k) return k.enum.cases.map((c) => JSON.stringify(c.name)).join(' | ');
  if ('variant' in k)
    return k.variant.cases
      .map(
        (c) =>
          `{ readonly tag: ${JSON.stringify(c.name)};${c.type == null ? '' : ` readonly val: ${type(c.type, iface)};`} }`,
      )
      .join(' | ');
  throw Error(`Unknown type kind ${JSON.stringify(k)}`);
}
const asyncKind = (f) =>
  (typeof f.kind === 'string' ? f.kind : Object.keys(f.kind)[0]).startsWith('async-');
const functionName = (f) =>
  f.name.startsWith('[constructor]')
    ? 'new'
    : camel(
        f.name
          .split('.')
          .at(-1)
          .replace(/^\[[^\]]+\]/, ''),
      );
function signature(f, iface, method = false) {
  const params = (method ? f.params.slice(1) : f.params)
    .map((p) => `${camel(p.name)}: ${type(p.type, iface)}`)
    .join(', ');
  let result = type(f.result, iface);
  if (asyncKind(f)) result = `Promise<${result}>`;
  return `${functionName(f) === 'new' ? "'new'" : functionName(f)}(${params}): ${result};`;
}
let source = `// Generated from the official WASI v0.3.2 WIT and Walos extensions.\n// Run npm run generate:wasi; do not edit this projection by hand.\nimport type { Future, Stream } from './async.js';\nexport type U8 = number; export type U16 = number; export type U32 = number; export type U64 = bigint;\nexport type S8 = number; export type S16 = number; export type S32 = number; export type S64 = bigint;\nexport type F32 = number; export type F64 = number;\nexport type Own<T> = T; export type Borrow<T> = T;\nexport type Result<T, E> = { readonly tag: 'ok'; readonly val: T } | { readonly tag: 'err'; readonly val: E };\nexport interface ErrorContext extends AsyncDisposable { toDebugString(): string; }\n`;
const catalog = [];
graph.interfaces.forEach((iface, id) => {
  const namespace = nsName(iface),
    pkg = pkgName(graph.packages[iface.package]);
  source += `\nexport namespace ${namespace} {\n`;
  for (const [name, ref] of Object.entries(iface.types)) {
    const def = graph.types[ref];
    if (def.kind === 'resource') {
      source += `  export interface ${pascal(name)} extends AsyncDisposable {\n`;
      for (const f of Object.values(iface.functions))
        if (typeof f.kind === 'object' && (f.kind.method === ref || f.kind['async-method'] === ref))
          source += `    ${signature(f, id, true)}\n`;
      source += '  }\n';
    } else source += `  export type ${pascal(name)} = ${type(ref, id, true)};\n`;
  }
  source += '  export interface Interface {\n';
  for (const f of Object.values(iface.functions))
    if (typeof f.kind === 'string') source += `    ${signature(f, id)}\n`;
  for (const [name, ref] of Object.entries(iface.types)) {
    if (graph.types[ref].kind !== 'resource') continue;
    const factories = Object.values(iface.functions).filter(
      (f) =>
        typeof f.kind === 'object' &&
        (f.kind.static === ref || f.kind['async-static'] === ref || f.kind.constructor === ref),
    );
    if (factories.length)
      source += `    readonly ${camel(name)}: { ${factories.map((f) => signature(f, id)).join(' ')} };\n`;
  }
  source += '  }\n}\n';
  catalog.push({
    package: pkg,
    version: '0.3.2',
    interface: iface.name,
    namespace,
    types: Object.fromEntries(
      Object.entries(iface.types).map(([name, ref]) => [
        name,
        { kind: graph.types[ref].kind, ts: type(ref, id, true) },
      ]),
    ),
    operations: Object.values(iface.functions).map((f) => ({
      wit: f.name,
      ts: functionName(f),
      kind: f.kind,
      async: asyncKind(f),
      params: f.params.map((p) => ({ name: p.name, type: type(p.type, id) })),
      result: type(f.result, id),
    })),
  });
});
for (const [namespace, prefix] of [
  ['WasiImports', 'wasi'],
  ['WalosImports', 'walos'],
]) {
  source += `\nexport interface ${namespace} {\n`;
  const packages = [
    ...new Set(catalog.filter((c) => c.package.startsWith(prefix + ':')).map((c) => c.package)),
  ];
  for (const pkg of packages) {
    source += `  readonly ${camel(pkg.split(':')[1])}: {\n`;
    for (const c of catalog.filter(
      (c) => c.package === pkg && !(c.package === 'wasi:cli' && c.interface === 'run'),
    ))
      source += `    readonly ${camel(c.interface)}: ${c.namespace}.Interface;\n`;
    source += '  };\n';
  }
  source += '}\n';
}
const inventory =
  JSON.stringify(
    { upstream: 'bdadbbb8cadd287cc5014c4b5a0bf76efc60291c', interfaces: catalog },
    null,
    2,
  ) + '\n';
source = await format(source, {
  ...(await resolveConfig('packages/os/src/wasi-types.ts')),
  parser: 'typescript',
});
const shape =
  '// Generated from pinned WIT.\nexport const apiShape = ' +
  JSON.stringify(
    catalog.map((c) => ({
      package: c.package,
      interface: c.interface,
      operations: c.operations.map((o) => ({ wit: o.wit, ts: o.ts, kind: o.kind })),
    })),
    null,
    2,
  ) +
  ' as const;\n';
const artifacts = {
  'packages/os/src/wasi-types.ts': source,
  'wit/p3/api.json': inventory,
  'packages/os/src/internal/wasi-shape.ts': await format(shape, {
    ...(await resolveConfig('packages/os/src/internal/wasi-shape.ts')),
    parser: 'typescript',
  }),
};
for (const [path, text] of Object.entries(artifacts)) {
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== text) throw Error(`Stale WIT projection: ${path}`);
  } else writeFileSync(path, text);
}
console.log(
  `${catalog.length} interfaces, ${catalog.reduce((n, c) => n + c.operations.length, 0)} operations; schema ${createHash('sha256').update(inventory).digest('hex').slice(0, 12)}`,
);
