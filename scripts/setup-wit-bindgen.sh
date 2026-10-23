#!/usr/bin/env bash
set -euo pipefail
mkdir -p work
archive=work/wit-bindgen-0.46.0-x86_64-linux.tar.gz
curl --fail --location --retry 2 \
  https://github.com/bytecodealliance/wit-bindgen/releases/download/v0.46.0/wit-bindgen-0.46.0-x86_64-linux.tar.gz \
  --output "$archive"
printf '%s  %s\n' 8f426d9b0ed0150c71feea697effe4b90b1426a49e22e48bc1d4f4c6396bf771 "$archive" | sha256sum --check
tar -xzf "$archive" -C work
