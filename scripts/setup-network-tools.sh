#!/usr/bin/env bash
set -euo pipefail
# Network Wasm builds use this compiler and its matching wasm_exec.js.
network_archive=work/toolchains/go-1.27.3.tar.gz
network_go=work/toolchains/go-1.27.3/go/bin/go
mkdir -p work/toolchains/go-1.27.3
if [[ ! -x "$network_go" ]]; then
  if [[ ! -f "$network_archive" ]]; then
    curl --fail --location --retry 2 https://go.dev/dl/go1.27.3.linux-amd64.tar.gz --output "$network_archive"
  fi
  printf '%s  %s\n' 65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40 "$network_archive" | sha256sum --check
  tar -xzf "$network_archive" -C work/toolchains/go-1.27.3
fi
"$network_go" version
if [[ "${1:-}" == --tinygo ]]; then
  network_tinygo_archive=work/toolchains/tinygo0.44.0.tar.gz
  if [[ ! -x work/toolchains/tinygo/bin/tinygo ]]; then
    if [[ ! -f "$network_tinygo_archive" ]]; then
      curl --fail --location --retry 2 https://github.com/tinygo-org/tinygo/releases/download/v0.44.0/tinygo0.44.0.linux-amd64.tar.gz --output "$network_tinygo_archive"
    fi
    printf '%s  %s\n' ed0f45543a49ff2a99120a5a1b8814a0750e1fda1a66f8e2a0a172576134aaf9 "$network_tinygo_archive" | sha256sum --check
    tar -xzf "$network_tinygo_archive" -C work/toolchains
  fi
fi
