import { generate } from '@bytecodealliance/jco/component';
import type { componentOptions } from './component-options.js';

export interface Converted {
  files: [string, Uint8Array][];
  imports: string[];
  exports: [string, string][];
}

// The package build bundles Jco and its Wasm assets here, for browser consumers.
export async function convert(
  bytes: Uint8Array,
  options: typeof componentOptions,
): Promise<Converted> {
  return await generate(bytes, options);
}
