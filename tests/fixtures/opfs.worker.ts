let access: FileSystemSyncAccessHandle | undefined;
self.onmessage = async (e: MessageEvent) => {
  try {
    if (e.data.op === 'release') {
      access?.flush();
      access?.close();
      access = undefined;
      self.postMessage({ ok: true });
      return;
    }
    access = await e.data.file.createSyncAccessHandle();
    access.write(new Uint8Array([4, 5, 6]), { at: 2 });
    self.postMessage({ ok: true });
  } catch (error) {
    self.postMessage({ ok: false, name: (error as DOMException).name });
  }
};
