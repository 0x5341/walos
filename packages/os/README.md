# @walos/os

A browser WASI Preview 1 runtime independent of the walos workbench UI. The
package owns filesystem bootstrap, the Core/Process Workers, terminal streams,
foreground selection, prompt ordering and lifecycle cleanup. It has no DOM or
UI framework dependency. Applications subscribe to typed events and supply input.

```ts
import { Walos } from '@walos/os';

const os = new Walos({ binUrl: '/bin/' });
const unsubscribe = os.subscribe((event) => {
  if (event.type === 'output') console.log(event.text);
  if (event.type === 'processes') console.table(event.processes);
  if (event.type === 'error') console.error(event.error);
});

await os.boot();
os.writeInput('echo hello\n');
// os.interrupt(); // Stop the current foreground pipeline.
// When this session is no longer needed:
await os.dispose();
unsubscribe();
```

`boot()` resolves after the shell Worker is ready; initial output arrives through
events and may arrive afterward. Each instance can boot once. `state`,
`foreground` and `processes` expose current snapshots. `writeInput(text)` sends
raw text without local echo and returns false when no input owner is available.
The caller decides how to display output, echo input and handle keyboard shortcuts.
`interrupt()` requests a foreground stop. `dispose()` cancels pending bootstrap,
stops all session processes and the Core Worker, closes terminal ports and removes
subscriptions. It is safe to call more than once. Failed boots reject the promise
and emit an `error` event. Create a new instance for another session.

Events: `output` (pid/text), `state`, `foreground` (input/pids), `processes`,
`exit` (pid/exit/durationMs), and `error` (Error). Subscribe before booting to
receive startup output. Subscriptions receive future events; read the getters for
the current state. The Worker protocol and WASI adapter are private implementation
details, excluded from the package's public exports.

## Build and host

From the repository root, `npm ci` links the npm workspace and
`npm run build:os` emits ESM JavaScript, declarations and both Worker modules to
`packages/os/dist`. `npm pack --workspace @walos/os` creates an installable package;
the package has no runtime npm dependencies. Build tools live in the repository's
root development dependencies. A consumer can install the tarball and import
`@walos/os` using Vite, which bundles the nested module Workers. Both development
and production workbench builds use this compiled package entry.

The separately compiled WASI command assets are host-provided. Run
`npm run build:apps` and serve the files in `public/bin` at `binUrl` (defaults to
`/bin/`; relative URLs resolve against the current page). `binUrl` is a directory
URL with an optional trailing slash. Bootstrap installs sh, cat, grep, sort,
echo, pwd, env, false, true, trap and hang into OPFS `/bin`. Existing `/home`
files are preserved and `/tmp` is reset at each boot.

Requires a secure browser context, OPFS, module Workers and Chromium JSPI.
Use the COOP/COEP headers shown in the repository's Vite configuration. This is
a browser library; it does not provide a Node.js runtime. Only trusted WASI
applications and one session per origin are supported; Worker boundaries do not
enforce capability isolation. Preview 2 execution remains follow-up work.
