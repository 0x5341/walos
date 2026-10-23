import './style.css';
import { Walos } from '@walos/os';

const terminal = document.querySelector<HTMLPreElement>('#terminal')!;
const input = document.querySelector<HTMLInputElement>('#input')!;
const state = document.querySelector('#state')!;
const processes = document.querySelector('#processes')!;
const os = new Walos();

const output = (text: string) => {
  terminal.append(document.createTextNode(text));
  terminal.scrollTop = terminal.scrollHeight;
};
const renderState = () => {
  state.textContent = {
    created: 'Starting…',
    booting: 'Starting…',
    running: 'Running',
    stopped: 'Stopped',
    failed: 'OS failed',
    disposed: 'Stopped',
  }[os.state];
  input.disabled = os.state !== 'running' || os.foreground.input === null;
  if (!input.disabled) input.focus();
};

os.subscribe((event) => {
  switch (event.type) {
    case 'output':
      output(event.text);
      break;
    case 'state':
    case 'foreground':
      renderState();
      break;
    case 'processes':
      processes.textContent = event.processes
        .map(
          (process) => `${process.pid}  ${process.state.toLowerCase()}  ${process.argv.join(' ')}`,
        )
        .join('\n');
      break;
    case 'error':
      output(`\n${event.error.message}\n`);
      break;
    case 'exit':
      console.info('process exit', event);
      break;
  }
});

document.querySelector('#interrupt')!.addEventListener('click', () => os.interrupt());
document.addEventListener('keydown', (event) => {
  if (event.key === 'c' && event.ctrlKey && !window.getSelection()?.toString()) {
    event.preventDefault();
    os.interrupt();
  }
});
input.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const line = input.value + '\n';
  input.value = '';
  if (os.writeInput(line)) output(line);
});
window.addEventListener('pagehide', () => void os.dispose());
renderState();
// Boot errors are reported through the library's error event.
void os.boot().catch(() => {});
