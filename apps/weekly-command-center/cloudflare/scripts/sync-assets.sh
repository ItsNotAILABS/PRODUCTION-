#!/usr/bin/env bash
# The Cloudflare deployment serves the same frontend gateway-node/public
# serves for local/Docker use — copy it fresh before every dev/deploy so the
# two never drift out of sync (there is exactly one copy of the UI source;
# this directory is a build artifact, not a place to hand-edit).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf public
mkdir -p public
cp -r ../gateway-node/public/. public/

echo "Synced ../gateway-node/public/ -> cloudflare/public/"
