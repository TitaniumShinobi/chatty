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

usage() {
    cat <<'USAGE'
Chatty Deploy Script

Usage:
  ./deploy/deploy.sh [full|--sync-only|--build|--restart] [flags]

Modes:
  full         rsync + remote build + restart + health check (default)
  --sync-only  rsync only
  --build      remote build + restart + health check (no rsync)
  --restart    restart + health check (no rsync/build)

Flags:
  --allow-dirty     allow deploying with uncommitted local changes (not recommended)
  --allow-unpushed  allow deploying with commits not pushed to upstream (not recommended)
  --allow-non-main  allow deploying from a branch other than 'main' (not recommended)
  -h, --help        show this help
USAGE
}

MODE="full"
ALLOW_DIRTY=0
ALLOW_UNPUSHED=0
ALLOW_NON_MAIN=0

while [ "${1:-}" != "" ]; do
    case "$1" in
        full|--sync-only|--build|--restart)
            MODE="$1"
            ;;
        --allow-dirty)
            ALLOW_DIRTY=1
            ;;
        --allow-unpushed)
            ALLOW_UNPUSHED=1
            ;;
        --allow-non-main)
            ALLOW_NON_MAIN=1
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            err "Unknown argument: $1 (use --help)"
            ;;
    esac
    shift
done

preflight_git() {
    if ! command -v git >/dev/null 2>&1; then
        warn "git not found; skipping deploy git preflight checks"
        return 0
    fi
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        warn "Not in a git worktree; skipping deploy git preflight checks"
        return 0
    fi

    local branch
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
    if [ "$branch" != "main" ] && [ "$ALLOW_NON_MAIN" -ne 1 ]; then
        err "Refusing to deploy from branch '$branch' (expected 'main'). Use --allow-non-main to override."
    fi

    local dirty
    dirty="$(git status --porcelain 2>/dev/null || true)"
    if [ -n "$dirty" ] && [ "$ALLOW_DIRTY" -ne 1 ]; then
        err "Refusing to deploy with a dirty working tree. Commit/stash changes or use --allow-dirty to override."
    fi

    # Ensure local branch is not behind upstream, and (by default) not ahead either.
    # This keeps GitHub 'main' as the source of truth for prod.
    if git rev-parse --abbrev-ref @{u} >/dev/null 2>&1; then
        # Best-effort fetch so ahead/behind counts are meaningful.
        # In some environments (restricted DNS/offline), this may fail; that's OK.
        git fetch -q 2>/dev/null || true

        local behind ahead
        behind="$(git rev-list --left-right --count @{u}...HEAD 2>/dev/null | awk '{print $1}')"
        ahead="$(git rev-list --left-right --count @{u}...HEAD 2>/dev/null | awk '{print $2}')"

        if [ "${behind:-0}" -gt 0 ]; then
            err "Refusing to deploy: local branch is behind upstream by ${behind} commit(s). Pull first."
        fi
        if [ "${ahead:-0}" -gt 0 ] && [ "$ALLOW_UNPUSHED" -ne 1 ]; then
            err "Refusing to deploy: local branch has ${ahead} unpushed commit(s). Push first or use --allow-unpushed."
        fi
    else
        warn "No upstream configured for this branch; skipping ahead/behind checks"
    fi
}

stamp_deployed_sha() {
    if ! command -v git >/dev/null 2>&1 || ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        warn "Skipping DEPLOYED_SHA stamp (not a git repo)"
        return 0
    fi

    local sha branch ts dirty_flag
    sha="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
    ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    dirty_flag="clean"
    if [ -n "$(git status --porcelain 2>/dev/null || true)" ]; then
        dirty_flag="dirty"
    fi

    log "Stamping deployed SHA on droplet: ${sha} (${branch}, ${dirty_flag}, ${ts})"
    ssh "${SSH_TARGET}" "cat > \"${REMOTE_PATH}/DEPLOYED_SHA\" <<EOF
sha=${sha}
branch=${branch}
state=${dirty_flag}
deployed_at_utc=${ts}
EOF
chmod 644 \"${REMOTE_PATH}/DEPLOYED_SHA\" || true"
}

sync_code() {
    preflight_git

    log "Syncing code to ${SSH_TARGET}:${REMOTE_PATH}..."
    rsync -avz --delete \
        --exclude='users/' \
        --exclude='ai-uploads/' \
        --exclude='gpt-uploads/' \
        --exclude='*.db*' \
        --exclude='*.sqlite*' \
        --exclude='.env.production*' \
        --exclude='DEPLOYED_SHA' \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='.pythonlibs' \
        --exclude='dist' \
        --exclude='.cache' \
        --exclude='.local' \
        --exclude='.config' \
        --exclude='.upm' \
        --exclude='attached_assets' \
        --exclude='.env' \
        --exclude='.env.local' \
        --exclude='deploy/' \
        ./ "${SSH_TARGET}:${REMOTE_PATH}/"
    log "Code synced successfully."

    stamp_deployed_sha
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

case "${MODE:-full}" in
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
