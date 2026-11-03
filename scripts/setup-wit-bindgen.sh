#!/usr/bin/env bash
set -euo pipefail
mkdir -p work
archive=work/wit-bindgen-0.63.0-x86_64-linux.tar.gz
curl --fail --location --retry 2 \
  https://github.com/bytecodealliance/wit-bindgen/releases/download/v0.63.0/wit-bindgen-0.63.0-x86_64-linux.tar.gz \
  --output "$archive"
printf '%s  %s\n' bf4efe883ab70d34a4740253911dda20caf895d58a003af58369506b04684cbe "$archive" | sha256sum --check
tar -xzf "$archive" -C work
