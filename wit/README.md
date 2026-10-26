# ABI sources

`world.wit` is the canonical Web OS extension contract. Jco 1.15.1 validates
borrowed standard filesystem descriptors and owned standard I/O streams across
the process and IPC interfaces. The custom terminal/foreground interface and
spawn cwd argument have been removed; standard WASI terminal introspection remains.

`deps/{clocks,filesystem,io}` are copied without modifications from the dependency
snapshot shipped in https://github.com/WebAssembly/wasi-cli/tree/v0.2.0/wit/deps
(WASI 0.2.0). The matching upstream dependency lock is in `deps.lock`. The selected standard
CLI interface files in `deps/cli` come from the same
`wasi-cli` v0.2.0 snapshot, with their package header in `package.wit`. They are
used by the generated-C integration fixture. Standard interface bodies remain
unchanged. The Preview 2 host implements a documented subset of these APIs.

Generate with `npm run check:wit`. `generated` contains Jco output; do not edit
it manually. The Preview 1 Core Wasm bridge is documented in
[the implementation notes](../docs/implementation.md).

The extension package is `walos:runtime@0.2.0`. The Preview 1 Core Wasm
compatibility module keeps its existing name. `scripts/build-p2-probe.mjs` uses
wit-bindgen 0.46.0 to generate C resource bindings from this contract plus
`tests/fixtures/process2.wit`; its Component runs in browser regression tests.
Generated C files and metadata objects live under `work/`.
