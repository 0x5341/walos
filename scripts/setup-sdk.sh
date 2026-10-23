#!/usr/bin/env bash
set -euo pipefail
mkdir -p work
archive=work/wasi-sdk-27.0-x86_64-linux.tar.gz
curl --fail --location --retry 2 \
  https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-27/wasi-sdk-27.0-x86_64-linux.tar.gz \
  --output "$archive"
printf '%s  %s\n' b7d4d944c88503e4f21d84af07ac293e3440b1b6210bfd7fe78e0afd92c23bc2 "$archive" | sha256sum --check
tar -xzf "$archive" -C work
