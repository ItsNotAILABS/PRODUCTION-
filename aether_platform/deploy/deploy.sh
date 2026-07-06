#!/usr/bin/env bash
# Deploy the Aether Sovereign Platform backend to your own server (bare
# metal or VPS — no third-party PaaS). Syncs the repo, (re)installs the
# systemd unit, and restarts the service.
#
# Usage:
#   ./deploy.sh user@your-server.example.com /opt/aether/PRODUCTION-
#
# Prerequisites on the remote host:
#   - Python 3.9+
#   - a system user named `aether` (or edit aether-platform.service)
#   - sudo access for the SSH user (to install the systemd unit)

set -euo pipefail

REMOTE="${1:?Usage: deploy.sh user@host /remote/path}"
REMOTE_PATH="${2:?Usage: deploy.sh user@host /remote/path}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "==> Syncing repo to ${REMOTE}:${REMOTE_PATH}"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  "${REPO_ROOT}/" "${REMOTE}:${REMOTE_PATH}/"

echo "==> Installing systemd unit"
ssh "${REMOTE}" "sudo cp ${REMOTE_PATH}/aether_platform/deploy/aether-platform.service /etc/systemd/system/aether-platform.service && \
  sudo sed -i 's#WorkingDirectory=.*#WorkingDirectory=${REMOTE_PATH}#' /etc/systemd/system/aether-platform.service && \
  sudo sed -i 's#ReadWritePaths=.*#ReadWritePaths=${REMOTE_PATH}#' /etc/systemd/system/aether-platform.service && \
  sudo systemctl daemon-reload && \
  sudo systemctl enable aether-platform && \
  sudo systemctl restart aether-platform"

echo "==> Status"
ssh "${REMOTE}" "sudo systemctl status aether-platform --no-pager -l | head -15"

echo "==> Done. API should be live on port 7700 of ${REMOTE}."
