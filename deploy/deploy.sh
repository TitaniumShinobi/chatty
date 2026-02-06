#!/usr/bin/env bash
# =============================================================================
# Chatty Deploy Script
# Run from your Mac to push code to vvault-server and restart the service
#
# Usage:
#   ./deploy/deploy.sh              # Full deploy (rsync + build + restart)
#   ./deploy/deploy.sh --sync-only  # Just rsync, no build/restart
#   ./deploy/deploy.sh --restart    # Just restart the service
# =============================================================================

set -euo pipefail

DROPLET_IP="165.245.136.194"
DROPLET_USER="vvault"
REMOTE_PATH="/opt/chatty"
SSH_TARGET="${DROPLET_USER}@${DROPLET_IP}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
err()  { echo -e "${RED}[deploy]${NC} $1"; exit 1; }

sync_code() {
    log "Syncing code to ${SSH_TARGET}:${REMOTE_PATH}..."
    rsync -avz --delete \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='.pythonlibs' \
        --exclude='dist' \
        --exclude='.cache' \
        --exclude='.local' \
        --exclude='.config' \
        --exclude='.upm' \
        --exclude='attached_assets' \
        --exclude='*.db' \
        --exclude='*.sqlite' \
        --exclude='.env' \
        --exclude='.env.local' \
        --exclude='deploy/' \
        ./ "${SSH_TARGET}:${REMOTE_PATH}/"
    log "Code synced successfully."
}

remote_build() {
    log "Installing dependencies and building on droplet..."

    log "Ensuring .env.production exists on droplet..."
    if [ -f "deploy/env.production" ]; then
        scp deploy/env.production "${SSH_TARGET}:${REMOTE_PATH}/.env.production"
    else
        warn "deploy/env.production not found locally - make sure it exists on the droplet"
    fi

    ssh "${SSH_TARGET}" << 'REMOTE_CMDS'
        set -e
        cd /opt/chatty

        if [ ! -f .env.production ]; then
            echo "ERROR: /opt/chatty/.env.production is missing!"
            echo "Copy deploy/env.production to /opt/chatty/.env.production and fill in values."
            exit 1
        fi

        echo ">>> Installing root dependencies..."
        npm install --production=false 2>&1 | tail -5

        echo ">>> Installing server dependencies..."
        cd server && npm install --production=false 2>&1 | tail -5
        cd ..

        echo ">>> Building Vite frontend..."
        npm run build

        echo ">>> Build complete. dist/ contents:"
        ls -la dist/ | head -10
REMOTE_CMDS
    log "Remote build completed."
}

restart_service() {
    log "Restarting Chatty service..."
    ssh "${SSH_TARGET}" << 'REMOTE_CMDS'
        sudo systemctl restart chatty
        sleep 3
        sudo systemctl status chatty --no-pager -l
REMOTE_CMDS
    log "Service restarted."
}

check_health() {
    log "Checking health..."
    sleep 5
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://chatty.thewreck.org/ 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        log "Health check passed (HTTP ${HTTP_CODE})"
    else
        warn "Health check returned HTTP ${HTTP_CODE} - check logs with: ssh ${SSH_TARGET} 'sudo journalctl -u chatty -n 50 --no-pager'"
    fi
}

case "${1:-full}" in
    --sync-only)
        sync_code
        ;;
    --restart)
        restart_service
        check_health
        ;;
    --build)
        remote_build
        restart_service
        check_health
        ;;
    full|*)
        sync_code
        remote_build
        restart_service
        check_health
        ;;
esac

log "Done."
