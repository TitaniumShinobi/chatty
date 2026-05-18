#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQUIRED_NODE_VERSION="${CHATTY_REQUIRED_NODE_VERSION:-$(tr -d '[:space:]' < "$ROOT_DIR/.nvmrc")}"

activate_pinned_node() {
  if [[ -z "${REQUIRED_NODE_VERSION:-}" ]]; then
    echo "Pinned Node version is not configured." >&2
    return 1
  fi

  if command -v node >/dev/null 2>&1 && [[ "$(node -v 2>/dev/null || true)" == "$REQUIRED_NODE_VERSION" ]]; then
    return 0
  fi

  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    export NVM_DIR="$nvm_dir"
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
    nvm use --silent "$REQUIRED_NODE_VERSION" >/dev/null
  fi

  local pinned_bin="$HOME/.nvm/versions/node/$REQUIRED_NODE_VERSION/bin"
  if [[ -x "$pinned_bin/node" ]]; then
    export PATH="$pinned_bin:$PATH"
  fi

  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null || true)" != "$REQUIRED_NODE_VERSION" ]]; then
    echo "Chatty requires Node $REQUIRED_NODE_VERSION." >&2
    echo "Install it with: nvm install $REQUIRED_NODE_VERSION" >&2
    return 1
  fi
}

activate_pinned_node

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  return 0
fi

if [[ $# -eq 0 ]]; then
  node -v
  exit 0
fi

exec "$@"
