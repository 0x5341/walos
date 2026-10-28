# walos

A browser OS library with one logical Host ProcessContext and explicit WASI
Preview 1/2 processes. P2 Components run with **jsco only**. OPFS file I/O stays
local to the Host/Process Worker; bounded Pipe DATA travels over direct MessagePorts.
Only run trusted applications: Worker boundaries do not enforce capability isolation.

`@walos/os` **v0.3.0 is a breaking change**. OS creation starts no Shell,
installs no commands and preserves user OPFS files. The workbench in `src/main.ts`
installs its own demo binaries, spawns the C Shell and connects explicit byte pipes.

```ts
import { Walos, HostProcessContext } from '@walos/os';

await using os = await Walos.create({ env: { PWD: '/', PATH: '/bin' } });
await using host = new HostProcessContext(os.getHostProcess());
const [[root]] = host.fs.getDirectories();
await using directory = root;
// The consumer has already placed app.wasm in OPFS.
await using executable = await directory.openAt({}, 'app.wasm', {}, { read: true });
await using child = await host.process.spawn(
  executable, ['app'], [{ key: 'PWD', value: '/' }],
);
console.log(await child.wait()); // omitted stdio is Null
```

See the [package API and byte Pipe example](packages/os/README.md),
[contract](docs/process-context-api.md), [implementation](docs/process-context-implementation.md)
and [migration notes](docs/process-context-migration.md). Public resource disposal
uses `Symbol.asyncDispose`. Child `wait()` is one-shot; disposal releases the handle
without stopping the child. Use `child.requestStop()` for an explicit stop.

## Build and run

Requires Node 22.14+. **OS build/pack needs no WASI SDK, WIT generator, command
binaries or demo assets**:

```sh
npm ci
npm run build:os
npm pack --workspace @walos/os
```

For the demo/tests, install checksum-pinned wasi-sdk 27 and wit-bindgen 0.46.0
(Linux x86-64; other platforms may set `WASI_SDK_PATH` and `WIT_BINDGEN_PATH`):

```sh
bash scripts/setup-sdk.sh
bash scripts/setup-wit-bindgen.sh
npm run build:apps
npm run dev
```

Open Vite's localhost URL in current Chromium with JSPI. HTTPS is required outside
localhost for OPFS. `Walos.create()` itself does not require JSPI. Use one OS tab per
origin; concurrent instances have no filesystem isolation guarantee.

The demo overwrites only its named `/bin` commands. `/home`, `/tmp` and other user
files survive reload. Try:

```sh
cd /home
echo saved > note.txt
cat < note.txt | p2-cat | p2-sort
p2-pwd
export MESSAGE=hello
echo $MESSAGE
```

The Shell supports PATH lookup, `cd`/PWD updates, `export`, `exit`, quotes,
whole-word `$NAME`/`$?`, pipes and `<`, `>`, `>>`. It has no job control, globbing,
compound commands or automatic interactive child stdin forwarding. Use redirection
for child stdin. Output is captured in temporary files and displayed after the
pipeline finishes; direct child-to-child pipes retain bounded streaming. **Stop
shell** requests stop of the Shell handle; already READY descendants may finish
independently. See [migration notes](docs/process-context-migration.md) for these limits.

## Validation and hosting

```sh
npm run check
npm run build
npm test
npm run test:production
npm run test:pages
npm run check:wit
npm run test:benchmark
npm run benchmark -- --trials 3
```

`CHROMIUM_PATH` can select a system browser. `npm run check:wit` regenerates types
under `work/wit-generated`; compare with `wit/generated`. `npm run build:apps`
regenerates C bindings and P1/P2 fixtures for `walos:runtime-p2@0.3.2`.
Jco remains **build tooling** for WIT/component fixture generation, not an execution
engine. Component caches and `clearComponentCache` are removed without deleting
existing OPFS cache directories or user contents.

[GitHub Pages](https://0x5341.github.io/walos/) deploys `dist` via
`.github/workflows/pages.yml`. Select GitHub Actions in repository Pages settings.
PRs build/test a subpath artifact; pushes to main deploy it. Production code uses
relative asset URLs and does not require cross-origin isolation. Hosting/CSP must
allow module workers and WebAssembly compilation.

[Current performance comparison](docs/process-context-integration-performance.md) and the
[historical engine comparison](docs/benchmarks/2026-10-25-engines.md) retain their
original measurements; current measurements are linked from the migration notes.
Unsupported WASI features remain outside this change (#6/#7). JS Process execution
is deferred to #34; no generic execution-runtime abstraction is introduced.

`cat` uses [sbase](apps/vendor/sbase/README.md). License: [AGPL-3.0-only](LICENSE).


The raw Host Context follows pinned WASI 0.3.2 WIT. Construct
`new HostProcessContext(os.getHostProcess())` explicitly for convenience FS/Pipe
operations. See [API](docs/process-context-api.md),
[migration](docs/process-context-migration.md), and
[coverage](docs/wasi-p3-coverage.md). The P3 Runtime execution gate is tracked in
[validation](docs/runtime-validation.md); API availability alone is not execution
support. `bash scripts/setup-runtime-tools.sh` installs the pinned P3 tooling.
