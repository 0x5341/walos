# @walos/os

A browser WASI Preview 1 / Preview 2 runtime independent of the walos workbench UI. The
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
`@walos/os` using Vite, which bundles the nested module Workers. Set
`worker.format` to `es` so the Worker can load the converter as a separate chunk:

```ts
export default { worker: { format: 'es' } };
```

Both development and production workbench builds use this compiled package entry.

The separately compiled WASI command assets are host-provided. Run
`npm run build:apps` and serve the files in `public/bin` at `binUrl` (defaults to
`/bin/`; relative URLs resolve against the current page). `binUrl` is a directory
URL with an optional trailing slash. Bootstrap installs sh, cat, grep, sort,
echo, pwd, env, false, true, trap and hang, plus their `p2-*` counterparts, into
OPFS `/bin`. Existing `/home` files are preserved and `/tmp` is reset at each boot.

Requires a secure browser context, OPFS, module Workers and Chromium JSPI.
The default runtime works without COOP/COEP headers, as verified by the Pages
smoke test; the Vite development server enables them for isolated testing. This
is a browser library; it does not provide a Node.js runtime. Only trusted WASI
applications and one session per origin are supported; Worker boundaries do not
enforce capability isolation.

## Preview 2 and component cache

A Process Worker detects Core Wasm versus Component Model binaries from the
Wasm header. By default it lazily loads jsco 0.2.0-preview.0 to parse/compile
and instantiate a Component with JSPI, then runs `wasi:cli/run`. Jco 1.15.1 remains
available as a baseline; polyengine 0.6.7 is experimental and currently fails
Unicode argv compatibility. Runtime assets are bundled locally; no CDN, Node.js
host or server-side conversion is used. Engine dependencies are version-pinned;
the browser modules are bundled by the library build.

The host implements CLI/environment/stdio, I/O streams/pollables, basic OPFS
filesystem operations, clocks, randomness and `walos:runtime@0.1.0` process/IPC/
terminal interfaces. P1 and P2 use the same Process Manager and direct Pipe data
paths. The shell can mix `cat | p2-cat | cat`. Unsupported non-socket interfaces fail startup;
unreachable wasi-sdk socket imports link to trapping placeholders (no socket support);
unsupported filesystem operations return the standard `unsupported` error.
See [implementation notes](../../docs/implementation.md) for the exact limits.

The optional OPFS artifact cache is engine independent. Keys include the Component
SHA-256, engine ID/version, effective options (with canonical object key ordering),
host revision and cache schema. Entries live in
`.walos-components/schema-2/<engine-id>/`. Engines own artifact formats and metadata;
the shared layer supports canonical relative paths, including nested directories,
and verifies every artifact's SHA-256 before restoring it. There is no L1 memory
cache. An engine with `cache: null` skips cache hashing, OPFS and publication entirely;
jsco is the default and uses this cacheless path. Jco caches generated JS/Core
Wasm; polyengine caches a translation envelope under its own namespace. For the
repository application, select a build with `WALOS_COMPONENT_ENGINE=jco` (or
`polyengine`) before `npm run build`/`npm run dev`. External embedders may define
`__WALOS_COMPONENT_ENGINE__` at bundle time; absent a definition, jsco is used.
This is internal configuration, not a public `Walos` constructor option.

Loading and instantiation perform no artifact writes. The Process Worker sends
READY first, starts deferred persistence, and joins it before normal EXIT (including
nonzero exits and traps). Saving errors affect cache diagnostics, not command results.
Key-scoped Web Locks protect readers and publishers. After verified artifact writes,
`createWritable().close()` publishes the manifest; only then are interrupted and
superseded stages for that key reclaimed under the same lock. Cleanup is best effort
and runs during deferred publication, never on the startup path. Other keys are left
alone; no automatic GC/LRU runs.

The public `clearComponentCache(): Promise<void>` API is unchanged and idempotently
removes all engines/schemas, including legacy Jco artifacts. Stop OS sessions first.
Legacy manifests are deliberately cold misses rather than migrated; manual clearing
reclaims them and abandoned stages for keys that are never published again.

```ts
import { clearComponentCache } from '@walos/os';

// Stop OS sessions first, then remove all persistent conversion artifacts.
await clearComponentCache();
```

The following CSP was tested on both development and production builds (serve it
on Worker responses as well as the document):

```text
default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' data: ws:; style-src 'self' 'unsafe-inline'
```

`blob:` permits generated module imports, and `'wasm-unsafe-eval'` permits Wasm
compilation. `data:` in `connect-src` permits the converter's bundled Wasm assets.
The `ws:` connection is for Vite development HMR and can be omitted in production.
A stricter policy that blocks these mechanisms prevents cold Component startup.
There is no `eval` or `new Function` fallback.
