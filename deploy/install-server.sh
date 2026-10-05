#!/usr/bin/env bash
# One-time (and safe to repeat) setup of the server. Run on your PC:   ./deploy/install-server.sh
# Sends the deploy folder to the server and runs remote/server-setup.sh there as root.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/config.sh"
[[ "$DEPLOY_HOST" != *NEW_SERVER_IP* ]] || { echo "Set DEPLOY_HOST in deploy/config.sh (root@<server ip>) first."; exit 1; }
# tar rather than rsync: a fresh server may not have rsync yet (the setup installs it).
tar -C "$HERE" --exclude='*.md' -czf - . | ssh "$DEPLOY_HOST" 'rm -rf /root/kiosk-deploy && mkdir -p /root/kiosk-deploy && tar -xzf - -C /root/kiosk-deploy'

ssh -t "$DEPLOY_HOST" "bash /root/kiosk-deploy/remote/server-setup.sh"
