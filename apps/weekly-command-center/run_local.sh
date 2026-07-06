#!/usr/bin/env bash
# Starts the platform right now with just python3 + node — no Docker, no
# Julia/Haskell toolchain required. The Julia optimizer and Haskell parser
# are optional accelerants (see docker-compose.yml); core-api falls back to
# equivalent Python logic when they aren't reachable, so this alone is a
# fully working platform.
set -euo pipefail
cd "$(dirname "$0")"

echo "[1/3] installing core-api Python deps..."
pip install --quiet -r core-api/requirements.txt

echo "[2/3] installing gateway-node deps..."
(cd gateway-node && npm install --no-audit --no-fund --silent)

echo "[3/3] starting services..."
(cd core-api && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000) &
CORE_PID=$!
(cd gateway-node && node server.js) &
GATEWAY_PID=$!

trap "kill $CORE_PID $GATEWAY_PID 2>/dev/null" EXIT INT TERM

echo ""
echo "Weekly Command Center is running:"
echo "  web UI     -> http://localhost:3000"
echo "  core API   -> http://localhost:8000"
echo ""
echo "Optional (for the Julia/Haskell 'intelligent entity' services):"
echo "  docker compose up optimizer-julia taskrules-haskell"
echo ""
wait
