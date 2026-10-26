import './style.css';
import { Walos } from '@walos/os';

// The application chooses when to install/start commands. OS creation itself
// creates only a logical Host and preserves all user OPFS content.
const terminal = document.querySelector<HTMLPreElement>('#terminal')!;
const input = document.querySelector<HTMLInputElement>('#input')!;
const state = document.querySelector('#state')!;
const processes = document.querySelector('#processes')!;
input.disabled = true;
document.querySelector<HTMLButtonElement>('#interrupt')!.disabled = true;
void Walos.create()
  .then((os) => {
    state.textContent = 'Running';
    const render = () => {
      processes.textContent = os.processes
        .map((p) => `${p.pid}  ${p.state.toLowerCase()}  ${p.argv.join(' ') || 'Host'}`)
        .join('\n');
    };
    os.subscribe((event) => {
      if (event.type === 'processes') render();
      if (event.type === 'error') {
        state.textContent = 'OS failed';
        terminal.textContent += event.error.message;
      }
    });
    render();
    terminal.textContent =
      'Empty OS ready. Use Walos.create().getHostProcess() to open descriptors and run WASI commands.\nThe interactive shell demo migration is tracked in issue #33.\n';
    window.addEventListener('pagehide', () => void os.dispose());
  })
  .catch((error) => {
    state.textContent = 'OS failed';
    terminal.textContent = String(error);
  });
