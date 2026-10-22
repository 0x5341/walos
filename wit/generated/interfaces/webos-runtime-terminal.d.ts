/** @module Interface webos:runtime/terminal@0.1.0 **/
export function setForeground(children: Array<ChildProcess>, input: ChildProcess | undefined): void;
export function restoreShellInput(): void;
export type ChildProcess = import('./webos-runtime-process.js').ChildProcess;
