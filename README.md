# walos

A browser Web OS proof of concept. A WASI Preview 1 shell starts other WASI
commands in Dedicated Workers, persists files in OPFS, and connects pipelines
with bounded, direct MessagePort streams.

This first review slice implements the Preview 1 path through the supplied
[design baseline](docs/grilled_webos_concept.md). It does **not** complete the
whole PoC: Preview 2 execution, component conversion/cache, WASI pollables and
full benchmark coverage remain follow-up work. See [implementation status](docs/implementation.md).
Only run trusted applications. Worker boundaries do not enforce capability isolation.

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

Requires Node.js 22.12+, a current desktop Chromium browser with JSPI, and wasi-sdk 27.
The bootstrap script downloads the checksum-pinned Linux x86-64 SDK. On another
platform install the matching SDK and set `WASI_SDK_PATH` to its directory.

```sh
npm ci
bash scripts/setup-sdk.sh
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

The WIT uses unmodified standard WASI 0.2.0 dependency types. `npm run check:wit`
validates it and generates TypeScript bindings with Jco 1.15.1. Compare these
with `wit/generated` to review ABI changes. These declarations prepare the
Preview 2 contract; they do not imply an implemented Preview 2 runtime.
