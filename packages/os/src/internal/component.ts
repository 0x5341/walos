export interface ComponentMetrics {
  prepareMs?: number;
  instantiateMs?: number;
}
export function executableKind(bytes: Uint8Array): 'p1' | 'component' {
  if (bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109)
    throw new Error('Expected a WebAssembly executable');
  if (bytes[4] === 1 && bytes[5] === 0 && bytes[6] === 0 && bytes[7] === 0) return 'p1';
  if (bytes[4] === 13 && bytes[5] === 0 && bytes[6] === 1 && bytes[7] === 0) return 'component';
  throw new Error('Unsupported WebAssembly binary version');
}

export type PreparedComponent = Awaited<ReturnType<typeof prepareComponent>>;
export async function prepareComponent(bytes: Uint8Array, metrics?: ComponentMetrics) {
  return (await import('./component-jsco.js')).prepareJsco(bytes, metrics);
}
export async function executableFormat(bytes: Uint8Array) {
  return executableKind(bytes) === 'p1' ? 'p1' : (await prepareComponent(bytes)).format;
}

export async function loadComponent(
  bytes: Uint8Array,
  imports: Record<string, unknown>,
  metrics?: ComponentMetrics,
  prepared?: PreparedComponent,
) {
  return (await import('./component-jsco.js')).loadJsco(bytes, imports, metrics, prepared);
}
