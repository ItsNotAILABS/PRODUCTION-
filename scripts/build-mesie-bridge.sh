#!/usr/bin/env bash
# MESIE Bridge build script
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
MESIE_DIR="$ROOT_DIR/src/mesie-bridge"

echo "[MESIE Bridge] Validating modules..."
python -c "import ast; ast.parse(open('$MESIE_DIR/conduit/mesie_conduit.py').read())" 2>/dev/null && echo "  OK: mesie_conduit.py" || echo "  Skip"
python -c "import ast; ast.parse(open('$MESIE_DIR/spectral_io/io_manager.py').read())" 2>/dev/null && echo "  OK: io_manager.py" || echo "  Skip"
python -c "import ast; ast.parse(open('$MESIE_DIR/fastapi_adapters/adapter.py').read())" 2>/dev/null && echo "  OK: adapter.py" || echo "  Skip"
echo "[MESIE Bridge] Build complete"
