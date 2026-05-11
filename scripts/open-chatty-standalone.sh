#!/usr/bin/env bash

set -euo pipefail

CHATTY_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHATTY_URL="${CHATTY_URL:-http://localhost:5173}"
CHATTY_PORT="${CHATTY_PORT:-5173}"
CHATTY_BACKEND_HEALTH_URL="${CHATTY_BACKEND_HEALTH_URL:-http://127.0.0.1:5050/api/health}"
CHATTY_LAUNCH_LOG="${CHATTY_LAUNCH_LOG:-/tmp/chatty-runtime-up.log}"
CHATTY_VITE_LOG="${CHATTY_VITE_LOG:-/tmp/chatty-vite.log}"
CHATTY_SERVER_LOG="${CHATTY_SERVER_LOG:-/tmp/chatty-server.log}"
CHATTY_AUTH_LOG="${CHATTY_AUTH_LOG:-/tmp/chatty-auth.log}"
CHATTY_VVAULT_LOG="${CHATTY_VVAULT_LOG:-/tmp/chatty-vvault.log}"
CHATTY_OLLAMA_LOG="${CHATTY_OLLAMA_LOG:-/tmp/chatty-ollama.log}"
CHATTY_WAIT_SECONDS="${CHATTY_WAIT_SECONDS:-30}"
CHATTY_OPEN_BROWSER="${CHATTY_OPEN_BROWSER:-1}"
CHATTY_REQUIRE_VVAULT_BRIDGE="${CHATTY_REQUIRE_VVAULT_BRIDGE:-1}"
CHATTY_REQUIRE_OLLAMA="${CHATTY_REQUIRE_OLLAMA:-1}"
CHATTY_AUTH_HEALTH_URL="${CHATTY_AUTH_HEALTH_URL:-http://127.0.0.1:1122/health}"
CHATTY_VVAULT_READY_URL="${CHATTY_VVAULT_READY_URL:-http://127.0.0.1:8000/api/ready}"
CHATTY_OLLAMA_HEALTH_URL="${CHATTY_OLLAMA_HEALTH_URL:-${OLLAMA_HOST:-http://127.0.0.1:11434}/api/tags}"

bootstrap_node_runtime() {
  local nvm_dir
  nvm_dir="${NVM_DIR:-$HOME/.nvm}"

  if [[ ! -f "$CHATTY_REPO/.nvmrc" ]]; then
    return 0
  fi

  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    export NVM_DIR="$nvm_dir"
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
    nvm use --silent >/dev/null 2>&1 || true
  fi
}

is_frontend_listening() {
  lsof -nP -iTCP:"$CHATTY_PORT" -sTCP:LISTEN >/dev/null 2>&1
}

is_frontend_reachable() {
  curl -fsS --max-time 2 "$CHATTY_URL" >/dev/null 2>&1
}

is_backend_ready() {
  curl -fsS --max-time 2 "$CHATTY_BACKEND_HEALTH_URL" >/dev/null 2>&1
}

is_auth_ready() {
  curl -fsS --max-time 2 "$CHATTY_AUTH_HEALTH_URL" >/dev/null 2>&1
}

is_vvault_ready() {
  curl -fsS --max-time 2 "$CHATTY_VVAULT_READY_URL" >/dev/null 2>&1
}

is_ollama_ready() {
  curl -fsS --max-time 2 "$CHATTY_OLLAMA_HEALTH_URL" >/dev/null 2>&1
}

bridge_ready() {
  if [[ "$CHATTY_REQUIRE_VVAULT_BRIDGE" != "1" ]]; then
    return 0
  fi
  is_auth_ready && is_vvault_ready
}

ollama_ready() {
  if [[ "$CHATTY_REQUIRE_OLLAMA" != "1" ]]; then
    return 0
  fi
  is_ollama_ready
}

open_browser() {
  if [[ "$CHATTY_OPEN_BROWSER" == "0" ]]; then
    return 0
  fi

  if command -v open >/dev/null 2>&1; then
    open "$CHATTY_URL" >/dev/null 2>&1 || true
    return 0
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$CHATTY_URL" >/dev/null 2>&1 || true
  fi
}

if [[ ! -d "$CHATTY_REPO" ]]; then
  echo "Chatty repo not found at $CHATTY_REPO" >&2
  exit 1
fi

bootstrap_node_runtime

if ! is_frontend_listening || ! is_frontend_reachable || ! is_backend_ready || ! bridge_ready || ! ollama_ready; then
  (
    cd "$CHATTY_REPO"
    bootstrap_node_runtime
    nohup bash scripts/keep-running.sh >"$CHATTY_LAUNCH_LOG" 2>&1 </dev/null &
    disown "$!" 2>/dev/null || true
  ) >/dev/null 2>&1
fi

ready=0
for ((i = 0; i < CHATTY_WAIT_SECONDS; i += 1)); do
  if is_frontend_listening && is_frontend_reachable && is_backend_ready && bridge_ready && ollama_ready; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" != "1" ]]; then
  echo "Chatty did not start successfully. Check $CHATTY_LAUNCH_LOG, $CHATTY_VITE_LOG, $CHATTY_SERVER_LOG, $CHATTY_AUTH_LOG, $CHATTY_VVAULT_LOG, and $CHATTY_OLLAMA_LOG" >&2
  exit 1
fi

open_browser
echo "Chatty is running at $CHATTY_URL"
