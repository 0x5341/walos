# walos

A browser OS library with one logical Host ProcessContext and explicit WASI
Preview 1/2/3 processes. Components run with **jsco only**, including native
async WASI 0.3.2 CLI components. OPFS file I/O stays
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

With [mise](https://mise.jdx.dev/), the repository configuration selects Node 26.13.0 and npm 12.2.1
(matching CI) and provides tasks for the existing npm commands and setup scripts:

```sh
mise install
mise run setup          # npm ci + pinned WASI tools (Linux x86-64)
mise run dev            # build demo applications and start Vite
```

For browser tests, run `mise run setup:browser` once, then `mise run test`.
Chromium's system libraries must also be installed, or set `CHROMIUM_PATH` to a
compatible system browser. Run `mise tasks` to list the available tasks.
For OS-package-only development, use `mise run setup:npm` and `mise run build:os`.

Requires Node 26.13.0+. **OS build/pack needs no WASI SDK, WIT generator, command
binaries or demo assets**:

```sh
npm ci
npm run build:os
npm pack --workspace @walos/os
```

For demo/tests, install checksum-pinned wasi-sdk 34 (P1/P2/P3),
wit-bindgen 0.63.0 and wasm-tools 1.263.0 (Linux x86-64):

```sh
bash scripts/setup-sdk.sh
bash scripts/setup-wit-bindgen.sh
bash scripts/setup-runtime-tools.sh
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
p3-cat note.txt
cat < note.txt | p3-cat | p2-sort
p3-probe
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
npm run check:wit:p3
npm run test:benchmark
npm run benchmark -- --trials 3
```

`CHROMIUM_PATH` can select a system browser. `npm run check:wit` regenerates types
under `work/wit-generated`; compare with `wit/generated`. `npm run build:apps`
regenerates versioned custom P1/P2 bindings and the native P3 fixture from official
`wit/p3` sources. Override P3 tools with `WASI_P3_SDK_PATH`, `WIT_BINDGEN_P3_PATH`
and `WASM_TOOLS_PATH`. The P3 fixture uses generated 0.3.2 bindings directly:
wasi-sdk 34's stock libc embeds 0.3.0 imports, which this Runtime rejects. It uses
native async run, async imports, streams and futures; no P2 conversion is involved.
Jco remains **build tooling** for WIT/component fixture generation, not an execution
engine. Component caches and `clearComponentCache` are removed without deleting
existing OPFS cache directories or user contents.

[Demo](https://0x5341.github.io/walos/) and
[@walos/os API documentation](https://0x5341.github.io/walos/docs/) are published
via `.github/workflows/pages.yml`. The demo stays at the site root; TypeDoc generates
the public API from `packages/os/src/index.ts` at `docs/` within the same Pages artifact.
Select GitHub Actions in repository Pages settings.
PRs build/test both pages; pushes to main deploy them, and manual runs on main can
also deploy. To generate the API documentation locally (no WASI SDK required), run
`npm ci` and `npm run build:docs`, then open `dist/docs/index.html`.
When building both, run `npm run build` before `npm run build:docs` because Vite
cleans `dist`. Production code uses
relative asset URLs and does not require cross-origin isolation. Hosting/CSP must
allow module workers and WebAssembly compilation.

[Current performance comparison](docs/process-context-integration-performance.md) and the
[historical engine comparison](docs/benchmarks/2026-10-25-engines.md) retain their
original measurements; current measurements are linked from the migration notes.
All official WASI 0.3.2 interfaces are public; HTTP, sockets and selected
filesystem operations throw from the common Context. See the full
[coverage table](docs/wasi-p3-coverage.md) and
[step-by-step validation/performance record](docs/runtime-validation.md).
JS Process execution remains deferred to #34.

`cat` uses [sbase](apps/vendor/sbase/README.md). License: [AGPL-3.0-only](LICENSE).


The raw Host Context follows pinned WASI 0.3.2 WIT. Construct
`new HostProcessContext(os.getHostProcess())` explicitly for convenience FS/Pipe
operations. See [API](docs/process-context-api.md),
[migration](docs/process-context-migration.md), and
[coverage](docs/wasi-p3-coverage.md). The P3 Runtime execution gate is tracked in
[validation](docs/runtime-validation.md); API availability alone is not execution
support. `bash scripts/setup-runtime-tools.sh` installs the pinned P3 tooling.

Timezone APIs read the browser timezone on each call (TZ is ignored). Browser Intl/tzdb data and the JavaScript Date range limit offset queries; unavailable information returns none. Debug strings are for humans only.

API documentation is built in the private `@walos/docs-toolchain` workspace with
TypeDoc 0.28.20 and TypeScript 6.0.3. Project builds and type checks use TypeScript
7.0.2 from the root workspace. `npm ci` installs both toolchains.
