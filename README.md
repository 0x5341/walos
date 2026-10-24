# walos

A browser Web OS proof of concept. A WASI Preview 1 shell starts Preview 1
Core Wasm commands and Preview 2 (`wasip2`) Components in Dedicated Workers,
persists files in OPFS, and connects pipelines with bounded, direct MessagePort
streams. Components are converted with Jco inside their own Process Worker;
completed conversions are cached in OPFS.

The implementation follows the [design baseline](docs/grilled_webos_concept.md).
See [implementation status](docs/implementation.md) for the supported WASI subset
and the [nine-criterion acceptance audit](docs/poc-audit.md) for reproducible
evidence, supported features and constraints. All nine criteria pass within the
documented Chromium PoC subset, including real P1/P2 parent/child lifecycle tests
with explicit controls for READY ordering and failure injection.
Only run trusted applications. Worker boundaries do not
enforce capability isolation.

## OS library and UI

The OS is the independent npm workspace [`@walos/os`](packages/os/README.md).
It owns OPFS bootstrap, WASI execution, Core/Process Workers, terminal streams
and process lifecycle. `src/main.ts` is a workbench UI that imports the package
and only handles rendering, local echo and keyboard events.

```ts
import { Walos } from '@walos/os';

const os = new Walos();
os.subscribe((event) => {
  if (event.type === 'output') console.log(event.text);
});
await os.boot();
os.writeInput('echo hello\n');
// Call await os.dispose() when the session is no longer needed.
```

`npm run build:os` builds just the library, including ESM modules, Worker assets
and TypeScript declarations. `npm pack --workspace @walos/os` creates an
installable tarball. See the package README for the public API and consumer
hosting requirements. `npm run dev`, `npm run check` and `npm run build` build
the library before using it; no UI internals are imported by the OS package.

## Run

Requires Node.js 22.12+, a current desktop Chromium browser with JSPI,
wasi-sdk 27 and wit-bindgen 0.46.0.
The setup scripts download the checksum-pinned Linux x86-64 tools. On another
platform install the matching tools and set `WASI_SDK_PATH` to the SDK directory
and `WIT_BINDGEN_PATH` to the wit-bindgen executable.

```sh
npm ci
bash scripts/setup-sdk.sh
bash scripts/setup-wit-bindgen.sh
npm run build:apps
npm run dev
```

Open the localhost URL printed by Vite. Production hosting needs HTTPS (OPFS is
available in secure contexts). No backend or runtime network access is required
beyond loading the application assets. The initial bootstrap installs the
bundled commands into `/bin`; `/home` persists and `/tmp` resets on each OS boot.
Use one OS tab per origin while evaluating this slice.

```sh
cd /home
cat README.md | grep TODO | sort
echo saved > note.txt
echo appended >> note.txt
cat < note.txt
export MESSAGE=hello
echo $MESSAGE
false
echo $?
p2-echo "hello component"
p2-cat README.md | grep TODO | p2-sort
cat README.md | p2-cat > mixed.txt
```

Use **Stop pipeline** or Ctrl+C in the input field to interrupt `hang`. `trap`
provides a trap fixture. The shell supports PATH lookup, `cd`, `export`, `exit`,
quoted literal arguments, whole-word unquoted `$NAME` / `$?`, pipes, and
`<`, `>`, `>>`. It is a small shell, not a POSIX shell: no scripts, globbing,
command substitution, compound commands, `dup`, or job control. `grep` implements
literal substring filtering on stdin; `sort` sorts stdin lines in memory.
`cat` is the upstream Linux/Unix-oriented sbase implementation, rebuilt for WASI;
[source, revision and license](apps/vendor/sbase/README.md) are included.

## Validate

```sh
npx playwright install --with-deps chromium
npm run check:wit
npm run build
npm test
npm run test:production
```

For a system Chromium, set `CHROMIUM_PATH=/path/to/chromium` for either test
command. Tests use isolated browser contexts. The suite covers real WASI
pipelines, persistence, redirection, cwd/argv/env, a 1 MiB transfer, namespace
operations, traps and termination; separate browser tests exercise OPFS locks,
pipe protocol errors/migration, and deterministic process lifecycle races.
Production tests exercise the bundled Worker assets.

Run `npm run benchmark -- --trials 5` for the P1/P2 startup, conversion cache,
Worker memory, CPU, OPFS and Pipe benchmarks. See the
[benchmark methodology and recorded results](docs/benchmarks.md) for setup,
timing boundaries, variability and measurement limits. CI runs a single-trial
integrity check and uploads the raw JSON and summary without performance gates.

The `p2-*` commands are compiled with `--target=wasm32-wasip2`. The shell remains
Preview 1 and detects either executable format through the shared runtime.
`apps/compat2.c` initializes wasi-sdk 27's libc cwd using standard `initial-cwd`.
The generated-WIT process fixture is built by `scripts/build-p2-probe.mjs`.

The WIT uses unmodified standard WASI 0.2.0 dependency types. `npm run check:wit`
validates it and generates TypeScript bindings with Jco 1.15.1. Compare these
with `wit/generated` to review ABI changes. The extension namespace is `walos:runtime@0.1.0`; the existing Preview 1
`webos_v1` compatibility imports retain their names. Standard WASI 0.2.x
interfaces used by the bundled SDK components are connected to the OS host.
Networking, symlinks, hard links, timestamp mutation and directory rename remain
unsupported. Standard Preview 2 command exits carry success/failure (0/1).

Conversion needs CSP permission for Blob modules and Wasm compilation. See the
[library hosting notes](packages/os/README.md) for the tested policy and cache API.
