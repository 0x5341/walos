#!/usr/bin/env bash
set -euo pipefail
mkdir -p work
archive=work/wasi-sdk-34.0-x86_64-linux.tar.gz
curl --fail --location --retry 2 \
  https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-34/wasi-sdk-34.0-x86_64-linux.tar.gz \
  --output "$archive"
printf '%s  %s\n' b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4 "$archive" | sha256sum --check
tar -xzf "$archive" -C work
