# ABI sources

`world.wit` is the canonical Web OS extension contract. Jco 1.15.1 validates
borrowed standard filesystem descriptors and owned standard I/O streams across
the process and IPC interfaces. `terminal` describes foreground selection and
restoring the caller's terminal input.

`deps/{clocks,filesystem,io}` are copied without modifications from the dependency
snapshot shipped in https://github.com/WebAssembly/wasi-cli/tree/v0.2.0/wit/deps
(WASI 0.2.0). The matching upstream dependency lock is in `deps.lock`. These
standard definitions are not implemented by this Preview 1-only runtime yet.

Generate with `npm run check:wit`. `generated` contains Jco output; do not edit
it manually. The Preview 1 Core Wasm bridge is documented in
[the implementation notes](../docs/implementation.md).
