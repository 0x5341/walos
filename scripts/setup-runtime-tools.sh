#!/usr/bin/env bash
set -euo pipefail
mkdir -p work
fetch_tool() {
  local archive_path="work/$1.tar.gz" tool_path="$2" expected_digest="$3" download_url="$4"
  if [[ ! -x "$tool_path" ]]; then
    if [[ ! -f "$archive_path" ]]; then curl --fail --location --retry 2 "$download_url" --output "$archive_path"; fi
    printf '%s  %s\n' "$expected_digest" "$archive_path" | sha256sum --check
    tar -xzf "$archive_path" -C work
  fi
}
fetch_tool wasm-tools-1.262.0-x86_64-linux work/wasm-tools-1.262.0-x86_64-linux/wasm-tools \
  655b8df67d54c3ef9b52fc237c4e94bbfbb5f5f43825245cb0940a7002a9ed65 \
  https://github.com/bytecodealliance/wasm-tools/releases/download/v1.262.0/wasm-tools-1.262.0-x86_64-linux.tar.gz
fetch_tool wit-bindgen-0.63.0-x86_64-linux work/wit-bindgen-0.63.0-x86_64-linux/wit-bindgen \
  bf4efe883ab70d34a4740253911dda20caf895d58a003af58369506b04684cbe \
  https://github.com/bytecodealliance/wit-bindgen/releases/download/v0.63.0/wit-bindgen-0.63.0-x86_64-linux.tar.gz
fetch_tool wasi-sdk-34.0-x86_64-linux work/wasi-sdk-34.0-x86_64-linux/bin/clang \
  b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4 \
  https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-34/wasi-sdk-34.0-x86_64-linux.tar.gz
