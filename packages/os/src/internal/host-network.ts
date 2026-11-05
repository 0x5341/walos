import type { HttpExposeOptions, HttpExposure, ProcessContext } from '../types.js';
import type { WalosRuntimeHttp } from '../wasi-types.js';
export type HostExpose = (
  service: WalosRuntimeHttp.Service,
  options: HttpExposeOptions,
) => Promise<HttpExposure>;
const hosts = new WeakMap<ProcessContext, HostExpose>();
export function registerHostNetwork(context: ProcessContext, expose: HostExpose) {
  hosts.set(context, expose);
}
export function exposeHostNetwork(
  context: ProcessContext,
  service: WalosRuntimeHttp.Service,
  options: HttpExposeOptions,
) {
  const expose = hosts.get(context);
  if (!expose) throw new Error('Host network services unavailable');
  return expose(service, options);
}
