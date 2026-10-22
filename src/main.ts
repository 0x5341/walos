import './style.css';
import type { Spec } from './protocol';
const terminal = document.querySelector<HTMLPreElement>('#terminal')!;
const input = document.querySelector<HTMLInputElement>('#input')!;
const state = document.querySelector('#state')!;
const processes = document.querySelector('#processes')!;
const ports = new Map<number, MessagePort>();
const decoders = new Map<MessagePort, TextDecoder>();
const outputPorts = new Map<number, Set<MessagePort>>();
let foreground: number | null = null;
let shellPid: number | null = null;
let commandPending = false;
let activeGroup: number[] = [];
let drainingGroup: number[] = [];
let shellOutput = '';
// A child's output port may drain after the Core delivers its exit. Hold the
// shell prompt until the foreground group's CLOSE messages reach the UI.
function flushShell() {
  if (commandPending || drainingGroup.some((pid) => outputPorts.has(pid))) return;
  drainingGroup = [];
  if (shellOutput) {
    output(shellOutput);
    shellOutput = '';
  }
}
function processOutput(pid: number, text: string) {
  if (pid === shellPid && (commandPending || drainingGroup.some((id) => outputPorts.has(id))))
    shellOutput += text;
  else output(text);
}
const encoder = new TextEncoder();
const output = (text: string) => {
  terminal.append(document.createTextNode(text));
  terminal.scrollTop = terminal.scrollHeight;
};
const core = new Worker(new URL('./core.worker.ts', import.meta.url), { type: 'module' });
core.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'tty') {
    if (shellPid === null) shellPid = m.pid;
    if (m.direction === 'in') ports.set(m.pid, m.port);
    else {
      const decoder = new TextDecoder();
      decoders.set(m.port, decoder);
      const group = outputPorts.get(m.pid) ?? new Set<MessagePort>();
      group.add(m.port);
      outputPorts.set(m.pid, group);
      m.port.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'data')
          processOutput(m.pid, decoder.decode(e.data.bytes, { stream: true }));
        else if (e.data.type === 'close') {
          processOutput(m.pid, decoder.decode());
          m.port.close();
          decoders.delete(m.port);
          group.delete(m.port);
          if (!group.size) outputPorts.delete(m.pid);
          flushShell();
        }
      };
      m.port.start();
    }
  } else if (m.type === 'foreground') {
    if (m.input === shellPid && commandPending) {
      drainingGroup = activeGroup;
      commandPending = false;
    }
    activeGroup = m.pids ?? [];
    flushShell();
    foreground = m.input;
    state.textContent = foreground === null ? 'Starting…' : 'Running';
    input.disabled = foreground === null;
    if (foreground !== null) input.focus();
  } else if (m.type === 'processes') {
    processes.textContent = m.processes
      .map((p: any) => `${p.pid}  ${p.state.toLowerCase()}  ${p.argv.join(' ')}`)
      .join('\n');
  } else if (m.type === 'tty-close') {
    ports.get(m.pid)?.close();
    ports.delete(m.pid);
    if (m.abnormal) {
      for (const port of outputPorts.get(m.pid) ?? []) {
        output(decoders.get(port)?.decode() ?? '');
        port.close();
        decoders.delete(port);
      }
      outputPorts.delete(m.pid);
      flushShell();
    }
  } else if (m.type === 'error') {
    state.textContent = 'Boot failed';
    output(`\n${m.message}\n`);
  } else if (m.type === 'exit') console.info('process exit', m);
};
core.onerror = (e) => {
  state.textContent = 'Core failed';
  output(e.message);
};
const interrupt = () => core.postMessage({ type: 'interrupt' });
document.querySelector('#interrupt')!.addEventListener('click', interrupt);
document.addEventListener('keydown', (e) => {
  if (e.key === 'c' && e.ctrlKey && !window.getSelection()?.toString()) {
    e.preventDefault();
    interrupt();
  }
});
input.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const line = input.value + '\n';
  input.value = '';
  if (foreground !== null) {
    if (foreground === shellPid) commandPending = true;
    output(line);
    const bytes = encoder.encode(line);
    ports.get(foreground)?.postMessage({ type: 'data', bytes: bytes.buffer }, [bytes.buffer]);
  }
});
async function boot() {
  if (typeof WebAssembly.Suspending !== 'function')
    throw new Error('Use a current desktop Chromium browser with JSPI support.');
  const root = await navigator.storage.getDirectory();
  const bin = await root.getDirectoryHandle('bin', { create: true });
  const home = await root.getDirectoryHandle('home', { create: true });
  try {
    await root.removeEntry('tmp', { recursive: true });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e;
  }
  await root.getDirectoryHandle('tmp', { create: true });
  for (const name of [
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
  ]) {
    const response = await fetch(`/bin/${name}.wasm`);
    if (!response.ok) throw new Error(`Missing ${name}.wasm; run npm run build:apps`);
    const handle = await bin.getFileHandle(name, { create: true });
    const writer = await handle.createWritable();
    await writer.write(await response.arrayBuffer());
    await writer.close();
  }
  try {
    await home.getFileHandle('README.md');
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e;
    const f = await home.getFileHandle('README.md', { create: true });
    const w = await f.createWritable();
    await w.write('TODO zebra\nhello from OPFS\nTODO apple\n');
    await w.close();
  }
  const spec: Spec = {
    file: await bin.getFileHandle('sh'),
    cwd: root,
    cwdPath: '/',
    argv: ['/bin/sh'],
    env: { PATH: '/bin', HOME: '/home', PWD: '/' },
    stdio: [null, null, null],
  };
  core.postMessage({ type: 'boot', spec });
}
void boot().catch((e) => {
  state.textContent = 'Boot failed';
  output(String(e));
});
