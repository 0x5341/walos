/** @module Interface walos:runtime-p2/ipc@0.3.2 **/
export function createPipe(): [InputStream, OutputStream];
export type InputStream = import('./wasi-io-streams.js').InputStream;
export type OutputStream = import('./wasi-io-streams.js').OutputStream;
