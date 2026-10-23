import type { Spec } from './protocol.js';

const commands = [
  'sh',
  'cat',
  'grep',
  'sort',
  'echo',
  'pwd',
  'env',
  'false',
  'true',
  'trap',
  'hang',
];

export async function bootstrap(binUrl: string | URL, signal: AbortSignal): Promise<Spec> {
  signal.throwIfAborted();
  if (typeof WebAssembly.Suspending !== 'function')
    throw new Error('Use a current desktop Chromium browser with JSPI support.');
  const root = await navigator.storage.getDirectory();
  signal.throwIfAborted();
  const bin = await root.getDirectoryHandle('bin', { create: true });
  const home = await root.getDirectoryHandle('home', { create: true });
  try {
    await root.removeEntry('tmp', { recursive: true });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e;
  }
  await root.getDirectoryHandle('tmp', { create: true });
  const base = new URL(String(binUrl), globalThis.location.href);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  for (const name of commands) {
    signal.throwIfAborted();
    const response = await fetch(new URL(`${name}.wasm`, base), { signal });
    if (!response.ok) throw new Error(`Missing ${name}.wasm at ${response.url}`);
    const bytes = await response.arrayBuffer();
    signal.throwIfAborted();
    const handle = await bin.getFileHandle(name, { create: true });
    const writer = await handle.createWritable();
    try {
      await writer.write(bytes);
      await writer.close();
    } catch (e) {
      await writer.abort();
      throw e;
    }
  }
  signal.throwIfAborted();
  try {
    await home.getFileHandle('README.md');
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e;
    const file = await home.getFileHandle('README.md', { create: true });
    const writer = await file.createWritable();
    await writer.write('TODO zebra\nhello from OPFS\nTODO apple\n');
    await writer.close();
  }
  signal.throwIfAborted();
  return {
    file: await bin.getFileHandle('sh'),
    cwd: root,
    cwdPath: '/',
    argv: ['/bin/sh'],
    env: { PATH: '/bin', HOME: '/home', PWD: '/' },
    stdio: [null, null, null],
  };
}
