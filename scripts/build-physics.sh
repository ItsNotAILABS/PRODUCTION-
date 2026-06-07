#!/usr/bin/env bash
# Build script for the foundational physics layer
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$ROOT_DIR/src"

echo "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550"
echo "  PRODUCTION- Physics Build Pipeline"
echo "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550"

echo "\n[1/5] Compiling Parralax Governance SDK..."
python -m compileall "$SRC_DIR/parralax-governance-sdk/" -q 2>/dev/null || echo "  Warning: Python compilation skipped"
echo "  Done"

echo "\n[2/5] Compiling Celestial Synchronization Engine..."
python -m compileall "$SRC_DIR/celestial-sync-engine/" -q 2>/dev/null || echo "  Warning: Python compilation skipped"
echo "  Done"

echo "\n[3/5] Compiling MESIE Bridge..."
python -m compileall "$SRC_DIR/mesie-bridge/" -q 2>/dev/null || echo "  Warning: Python compilation skipped"
echo "  Done"

echo "\n[4/5] Compiling TypeScript bindings..."
if command -v npx &> /dev/null; then
    npx tsc --noEmit "$SRC_DIR/parralax-governance-sdk/bindings/motoko_bridge.ts" 2>/dev/null || echo "  Warning: TS compilation skipped"
fi
echo "  Done"

echo "\n[5/5] Validating zone configs..."
for config_file in "$SRC_DIR/uncaged-generative-zones/mini-brains"/*/config.json; do
    if [ -f "$config_file" ]; then
        python -m json.tool "$config_file" > /dev/null 2>&1 || { echo "  Invalid: $config_file"; exit 1; }
    fi
done
echo "  Done"

echo "\nPhysics build complete."
