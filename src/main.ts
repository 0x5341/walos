import './style.css';
import {
  Walos,
  HostProcessContext,
  ServiceError,
  type HostOutput as OutputStream,
  type HostInput as InputStream,
} from '@walos/os';
import { setupNetwork, type DemoNetwork } from './demo-network';

const terminal = document.querySelector<HTMLPreElement>('#terminal')!;
const input = document.querySelector<HTMLInputElement>('#input')!;
const state = document.querySelector('#state')!;
const processes = document.querySelector('#processes')!;
const stop = document.querySelector<HTMLButtonElement>('#interrupt')!;
const encoder = new TextEncoder();
let generation = 0;
let activeOS: Walos | undefined;
let inputEvents: AbortController | undefined;
window.addEventListener(
  'pagehide',
  () => {
    void activeOS?.dispose();
  },
  { once: true },
);
async function writeAll(output: OutputStream, bytes: Uint8Array) {
  for (let offset = 0; offset < bytes.length;) {
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
async function display(stream: InputStream, run: number) {
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const bytes = await stream.blockingRead(65536n);
      if (run === generation) terminal.textContent += decoder.decode(bytes, { stream: true });
    }
  } catch (error) {
    if (run === generation) {
      if (!(error instanceof ServiceError) || error.code !== 'closed') throw error;
      terminal.textContent += decoder.decode();
    }
  } finally {
    try {
      await stream[Symbol.asyncDispose]();
    } catch (error) {
      if (run === generation) throw error;
    }
  }
}
async function start(network?: DemoNetwork) {
  const run = ++generation;
  input.disabled = stop.disabled = true;
  stop.onclick = null;
  inputEvents?.abort();
  const oldOS = activeOS;
  activeOS = undefined;
  await oldOS?.dispose();
  inputEvents = new AbortController();
  const events = inputEvents;
  state.textContent = 'Starting…';
  const os = await Walos.create({
    storage: await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('walos-v1', { create: true }),
    env: { PWD: '/', PATH: '/bin' },
    ...network,
  });
  activeOS = os;
  try {
    const host = new HostProcessContext(os.getHostProcess());
    const render = () => {
      if (run !== generation) return;
      processes.textContent = os.processes
        .map((p) => `${p.pid}  ${p.state.toLowerCase()}  ${p.argv.join(' ') || 'Host'}`)
        .join('\n');
    };
    os.subscribe((event) => {
      if (event.type === 'processes') render();
      if (run === generation && event.type === 'error')
        terminal.textContent += `\n${event.error.message}\n`;
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
      'curl',
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
    const displays = Promise.all([display(stdout, run), display(stderr, run)]);
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
    input.addEventListener(
      'keydown',
      (event) => {
        if (event.ctrlKey && event.key.toLowerCase() === 'c') {
          event.preventDefault();
          void child.requestStop().catch((error) => {
            if (run === generation) terminal.textContent += `${error}\n`;
          });
          return;
        }
        if (event.key !== 'Enter') return;
        const line = input.value;
        input.value = '';
        terminal.textContent += `${line}\n`; // local echo belongs to this UI
        pending = pending
          .then(() => writeAll(writer, encoder.encode(`${line}\n`)))
          .catch((error) => {
            if (run === generation) terminal.textContent += `${error}\n`;
          });
      },
      { signal: events.signal },
    );
    stop.disabled = false;
    stop.onclick = () => {
      void child.requestStop().catch((error) => {
        if (run === generation) terminal.textContent += `${error}\n`;
      });
    };
    // Startup resolves once input is usable. Shell completion belongs to this run.
    void (async () => {
      await child.wait();
      if (run !== generation) return;
      await child[Symbol.asyncDispose]();
      await writer[Symbol.asyncDispose]();
      await displays;
      events.abort();
      input.disabled = stop.disabled = true;
      state.textContent = 'Shell exited';
    })().catch((error) => {
      if (run !== generation) return;
      events.abort();
      input.disabled = stop.disabled = true;
      state.textContent = 'Shell failed';
      terminal.textContent += `${error}\n`;
    });
  } catch (error) {
    await os.dispose();
    if (activeOS === os) activeOS = undefined;
    events.abort();
    throw error;
  }
}
let restarting = Promise.resolve();
function restart(network?: DemoNetwork) {
  const next = restarting.then(() => start(network));
  restarting = next.catch((error) => {
    state.textContent = 'OS failed';
    terminal.textContent += `${error}\n`;
  });
  return next;
}
setupNetwork(restart);
void restart().catch(() => {});
