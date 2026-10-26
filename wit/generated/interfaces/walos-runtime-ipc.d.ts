/** @module Interface walos:runtime/ipc@0.2.0 **/
export function createPipe(): [InputStream, OutputStream];
export type InputStream = import('./wasi-io-streams.js').InputStream;
export type OutputStream = import('./wasi-io-streams.js').OutputStream;
