/** @module Interface walos:runtime/terminal@0.1.0 **/
export function setForeground(children: Array<ChildProcess>, input: ChildProcess | undefined): void;
export function restoreShellInput(): void;
export type ChildProcess = import('./walos-runtime-process.js').ChildProcess;
