import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runtimeImports } from './check-runtime-boundaries.mjs';

test('runtime imports preserve default, namespace, side effect and mixed imports', () => {
  const source = `import Default, { type A, value } from './mixed.js';
import * as ns from './namespace.js';
import './side-effect.js';
import { value as other } from './named.js';
import DefaultType, { type B } from './default.js';`;
  assert.deepEqual(
    [...runtimeImports('test.ts', source)],
    ['./mixed.js', './namespace.js', './side-effect.js', './named.js', './default.js'],
  );
});

test('type imports and import-looking text are ignored', () => {
  const source = `import type Default from './default.js';
import type * as ns from './namespace.js';
import { type A, type B as C } from './types.js';
const text = "import value from './text.js'";
// import value from './comment.js'
`;
  assert.deepEqual([...runtimeImports('test.ts', source)], []);
});

test('invalid source fails closed', () => {
  assert.throws(() => [...runtimeImports('test.ts', 'import {')], /Cannot parse/);
});
