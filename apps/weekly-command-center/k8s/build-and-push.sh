#!/usr/bin/env bash
# Builds all four images and pushes them to your container registry.
# Usage: REGISTRY=ghcr.io/yourorg ./build-and-push.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${REGISTRY:?Set REGISTRY, e.g. REGISTRY=ghcr.io/yourorg ./k8s/build-and-push.sh}"
TAG="${TAG:-latest}"

echo "[1/4] core-api"
docker build -t "$REGISTRY/wcc-core-api:$TAG" -f core-api/Dockerfile.prod core-api
docker push "$REGISTRY/wcc-core-api:$TAG"

echo "[2/4] gateway-node"
docker build -t "$REGISTRY/wcc-gateway-node:$TAG" -f gateway-node/Dockerfile.prod gateway-node
docker push "$REGISTRY/wcc-gateway-node:$TAG"

echo "[3/4] optimizer-julia"
docker build -t "$REGISTRY/wcc-optimizer-julia:$TAG" optimizer-julia
docker push "$REGISTRY/wcc-optimizer-julia:$TAG"

echo "[4/4] taskrules-haskell"
docker build -t "$REGISTRY/wcc-taskrules-haskell:$TAG" taskrules-haskell
docker push "$REGISTRY/wcc-taskrules-haskell:$TAG"

echo ""
echo "Done. Now update REGISTRY_PLACEHOLDER in k8s/*.yaml, e.g.:"
echo "  sed -i \"s|REGISTRY_PLACEHOLDER|$REGISTRY|g\" k8s/*.yaml"
