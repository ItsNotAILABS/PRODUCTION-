#!/usr/bin/env bash
# Compile the organism Kuramoto kernel to WebAssembly with clang's built-in
# wasm32 target — no Emscripten required. Produces kernel.wasm, which both
# the browser node (node.html) and the Node tests load.
set -euo pipefail
cd "$(dirname "$0")"

clang --target=wasm32 -O3 -nostdlib -ffreestanding \
  -Wl,--no-entry -Wl,--allow-undefined \
  -Wl,--export=simulate_range -Wl,--export=kernel_max_nodes \
  -Wl,--export=__heap_base -Wl,--export=memory \
  -Wl,--initial-memory=16777216 \
  kernel_wasm.c -o kernel.wasm

echo "built kernel.wasm ($(wc -c < kernel.wasm) bytes)"
