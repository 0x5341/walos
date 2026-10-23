/** @module Interface walos:runtime/process@0.1.0 **/
export function spawn(executable: Descriptor, cwd: Descriptor, argv: Array<string>, env: Array<EnvironmentEntry>, stdin: InputStream | undefined, stdout: OutputStream | undefined, stderr: OutputStream | undefined): ChildProcess;
export type Descriptor = import('./wasi-filesystem-types.js').Descriptor;
export type InputStream = import('./wasi-io-streams.js').InputStream;
export type OutputStream = import('./wasi-io-streams.js').OutputStream;
export interface EnvironmentEntry {
  key: string,
  value: string,
}
export type SpawnError = SpawnErrorInvalidDescriptor | SpawnErrorInvalidStream | SpawnErrorInitialization | SpawnErrorTimeout | SpawnErrorCancelled;
export interface SpawnErrorInvalidDescriptor {
  tag: 'invalid-descriptor',
}
export interface SpawnErrorInvalidStream {
  tag: 'invalid-stream',
}
export interface SpawnErrorInitialization {
  tag: 'initialization',
  val: string,
}
export interface SpawnErrorTimeout {
  tag: 'timeout',
}
export interface SpawnErrorCancelled {
  tag: 'cancelled',
}
export type ExitResult = ExitResultExited | ExitResultTrap | ExitResultTerminated;
export interface ExitResultExited {
  tag: 'exited',
  val: number,
}
export interface ExitResultTrap {
  tag: 'trap',
  val: string,
}
export interface ExitResultTerminated {
  tag: 'terminated',
  val: string,
}
export type WaitError = WaitErrorAlreadyConsumed;
export interface WaitErrorAlreadyConsumed {
  tag: 'already-consumed',
}

export class ChildProcess {
  /**
   * This type does not have a public constructor.
   */
  private constructor();
  pid(): number;
  wait(): ExitResult;
  requestStop(): void;
}
