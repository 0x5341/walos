export interface ComponentMetrics {
  prepareMs?: number;
  instantiateMs?: number;
}
export function executableFormat(bytes: Uint8Array): 'p1' | 'p2' {
  if (bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109)
    throw new Error('Expected a WebAssembly executable');
  if (bytes[4] === 1 && bytes[5] === 0 && bytes[6] === 0 && bytes[7] === 0) return 'p1';
  if (bytes[4] === 13 && bytes[5] === 0 && bytes[6] === 1 && bytes[7] === 0) return 'p2';
  throw new Error('Unsupported WebAssembly binary version');
}

export type WasiComponentVersion = 'p2' | 'p3';

export function wasiCommandVersion(exports: string[]): WasiComponentVersion {
  if (exports.some((name) => /^wasi:cli\/run@0\.3\./.test(name))) return 'p3';
  if (exports.some((name) => /^wasi:cli\/run@0\.2\./.test(name))) return 'p2';
  throw new Error('Expected a wasi:cli/run@0.2.x or @0.3.0 command component');
}

export async function loadComponent(
  bytes: Uint8Array,
  createImports: (
    version: WasiComponentVersion,
    required: string[],
  ) => Promise<Record<string, unknown>>,
  metrics?: ComponentMetrics,
) {
  return (await import('./component-jsco.js')).loadJsco(bytes, createImports, metrics);
}
