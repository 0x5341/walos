interface DedicatedWorkerGlobalScope {
  close(): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
}
interface FileSystemSyncAccessHandle {
  read(buffer: ArrayBufferView, options?: { at?: number }): number;
  write(buffer: ArrayBufferView, options?: { at?: number }): number;
  truncate(size: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
}
interface FileSystemFileHandle {
  createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>;
  move?(directory: FileSystemDirectoryHandle, name: string): Promise<void>;
}
declare namespace WebAssembly {
  class Suspending {
    constructor(fn: (...args: any[]) => any);
  }
  function promising(fn: Function): (...args: any[]) => Promise<any>;
}
