import './style.css';
import {
  Walos,
  HostProcessContext,
  ServiceError,
  type HostOutput as OutputStream,
  type HostInput as InputStream,
} from '@walos/os';

const terminal = document.querySelector<HTMLPreElement>('#terminal')!;
const input = document.querySelector<HTMLInputElement>('#input')!;
const state = document.querySelector('#state')!;
const processes = document.querySelector('#processes')!;
const stop = document.querySelector<HTMLButtonElement>('#interrupt')!;
const encoder = new TextEncoder();
async function writeAll(output: OutputStream, bytes: Uint8Array) {
  for (let offset = 0; offset < bytes.length; ) {
    const ready = output.subscribe();
    try {
      await ready.block();
    } finally {
      await ready[Symbol.asyncDispose]();
    }
    const count = Math.min(Number(output.checkWrite()), bytes.length - offset);
    await output.write(bytes.subarray(offset, offset + count));
    offset += count;
  }
  await output.blockingFlush();
}
async function display(stream: InputStream) {
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const bytes = await stream.blockingRead(65536n);
      terminal.textContent += decoder.decode(bytes, { stream: true });
    }
  } catch (error) {
    if (!(error instanceof ServiceError) || error.code !== 'closed') throw error;
    terminal.textContent += decoder.decode();
  } finally {
    await stream[Symbol.asyncDispose]();
  }
}
async function start() {
  const os = await Walos.create({ env: { PWD: '/', PATH: '/bin' } });
  window.addEventListener('pagehide', () => void os.dispose());
  try {
    const host = new HostProcessContext(os.getHostProcess());
    const render = () => {
      processes.textContent = os.processes
        .map((p) => `${p.pid}  ${p.state.toLowerCase()}  ${p.argv.join(' ') || 'Host'}`)
        .join('\n');
    };
    os.subscribe((event) => {
      if (event.type === 'processes') render();
      if (event.type === 'error') terminal.textContent += `\n${event.error.message}\n`;
    });
    render();
    state.textContent = 'Installing demo commands…';
    const [[root]] = host.fs.getDirectories();
    for (const dir of ['bin', 'home', 'tmp']) {
      try {
        await root.createDirectoryAt(dir);
      } catch (e) {
        if (!(e instanceof ServiceError) || e.code !== 'exist') throw e;
      }
    }
    // Installation is a consumer choice. No user files or directories are cleared.
    for (const name of [
      'sh',
      'cat',
      'echo',
      'pwd',
      'env',
      'false',
      'true',
      'trap',
      'hang',
      'grep',
      'sort',
      'p2-echo',
      'p2-cat',
      'p2-pwd',
      'p2-env',
      'p2-grep',
      'p2-sort',
      'p3-probe',
      'p3-cat',
    ]) {
      const response = await fetch(`${import.meta.env.BASE_URL}bin/${name}.wasm`);
      if (!response.ok) throw new Error(`Cannot install ${name}: ${response.status}`);
      const file = await root.openAt(
        {},
        `bin/${name}`,
        { create: true, truncate: true },
        { read: true, write: true },
      );
      const output = await file.writeViaStream(0n);
      try {
        await writeAll(output, new Uint8Array(await response.arrayBuffer()));
      } finally {
        await output[Symbol.asyncDispose]();
        await file[Symbol.asyncDispose]();
      }
    }
    const executable = await root.openAt({}, 'bin/sh', {}, { read: true });
    const [stdin, writer] = await host.io.createPipe();
    const [stdout, out] = await host.io.createPipe();
    const [stderr, err] = await host.io.createPipe();
    const displays = Promise.all([display(stdout), display(stderr)]);
    void displays.catch(() => {});
    const child = await host.process.spawn(
      executable,
      ['sh'],
      [
        { key: 'PWD', value: '/' },
        { key: 'PATH', value: '/bin' },
      ],
      stdin,
      out,
      err,
    );
    await executable[Symbol.asyncDispose]();
    await root[Symbol.asyncDispose]();
    state.textContent = 'Running';
    input.disabled = false;
    input.focus();
    let pending = Promise.resolve();
    input.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void child.requestStop();
        return;
      }
      if (event.key !== 'Enter') return;
      const line = input.value;
      input.value = '';
      terminal.textContent += `${line}\n`; // local echo belongs to this UI
      pending = pending
        .then(() => writeAll(writer, encoder.encode(`${line}\n`)))
        .catch((error) => {
          terminal.textContent += `${error}\n`;
        });
    });
    stop.disabled = false;
    stop.onclick = () => {
      void child.requestStop();
    };
    await child.wait();
    await child[Symbol.asyncDispose]();
    await writer[Symbol.asyncDispose]();
    await displays;
    input.disabled = true;
    stop.disabled = true;
    state.textContent = 'Shell exited';
  } catch (error) {
    await os.dispose();
    throw error;
  }
}
void start().catch((error) => {
  state.textContent = 'OS failed';
  terminal.textContent += String(error);
});
