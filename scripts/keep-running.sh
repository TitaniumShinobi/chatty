#!/usr/bin/env bash
# Keep Chatty frontend (Vite) and backend running. Safe, minimal supervisor.

set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="/tmp"
LOCK_DIR="$LOG_DIR/chatty-runtime.lock"
LOCK_PIDFILE="$LOCK_DIR/pid"
VITE_LOG="$LOG_DIR/chatty-vite.log"
SERVER_LOG="$LOG_DIR/chatty-server.log"
VITE_PIDFILE="$LOG_DIR/chatty-vite.pid"
SERVER_PIDFILE="$LOG_DIR/chatty-server.pid"
VITE_URL="http://127.0.0.1:5173/"
SERVER_HEALTH_URL="http://127.0.0.1:5050/api/health"
MANAGE_VVAULT_BRIDGE="${CHATTY_MANAGE_VVAULT_BRIDGE:-1}"
MANAGE_OLLAMA="${CHATTY_MANAGE_OLLAMA:-1}"
REQUIRE_OLLAMA="${CHATTY_REQUIRE_OLLAMA:-1}"
AUTH_REPO="${CHATTY_AUTH_REPO:-$ROOT_DIR/../auth}"
VVAULT_REPO="${CHATTY_VVAULT_REPO:-$ROOT_DIR/../vvault}"
AUTH_LOG="$LOG_DIR/chatty-auth.log"
VVAULT_LOG="$LOG_DIR/chatty-vvault.log"
OLLAMA_LOG="${CHATTY_OLLAMA_LOG:-$LOG_DIR/chatty-ollama.log}"
AUTH_PIDFILE="$LOG_DIR/chatty-auth.pid"
VVAULT_PIDFILE="$LOG_DIR/chatty-vvault.pid"
OLLAMA_PIDFILE="$LOG_DIR/chatty-ollama.pid"
AUTH_HEALTH_URL="${CHATTY_AUTH_HEALTH_URL:-http://127.0.0.1:1122/health}"
VVAULT_READY_URL="${CHATTY_VVAULT_READY_URL:-http://127.0.0.1:8000/api/ready}"
AUTH_PORT_VALUE="${AUTH_PORT:-1122}"
OLLAMA_HOST_VALUE="${OLLAMA_HOST:-http://127.0.0.1:11434}"
OLLAMA_HEALTH_URL="${CHATTY_OLLAMA_HEALTH_URL:-${OLLAMA_HOST_VALUE%/}/api/tags}"
AUTH_APP_CONFIG_VALUE="${AUTH_APP_CONFIG_PATH:-config/vvault.json}"
AUTH_COOKIE_NAME_VALUE="${AUTH_COOKIE_NAME:-auth_sid}"
AUTH_SESSION_SECRET_VALUE="${AUTH_SESSION_SECRET:-dev-auth-session-secret-change-me}"
AUTH_API_BASE_URL_VALUE="${AUTH_API_BASE_URL:-http://127.0.0.1:${AUTH_PORT_VALUE}}"

read_dotenv_value() {
  local key="$1"
  local file="$ROOT_DIR/.env"
  if [ ! -f "$file" ]; then
    return 0
  fi
  local raw
  raw="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)"
  if [ -z "$raw" ]; then
    return 0
  fi
  raw="${raw#*=}"
  raw="${raw%$'\r'}"
  raw="${raw%\"}"
  raw="${raw#\"}"
  raw="${raw%\'}"
  raw="${raw#\'}"
  printf '%s' "$raw"
}

VVAULT_SERVICE_TOKEN_VALUE="${VVAULT_SERVICE_TOKEN:-$(read_dotenv_value VVAULT_SERVICE_TOKEN)}"
VVAULT_URL_VALUE="${VVAULT_URL:-$(read_dotenv_value VVAULT_URL)}"
VVAULT_URL_VALUE="${VVAULT_URL_VALUE:-http://127.0.0.1:8000}"
VVAULT_API_BASE_URL_VALUE="${VVAULT_API_BASE_URL:-$VVAULT_URL_VALUE}"

bootstrap_node_runtime() {
  local nvm_dir
  nvm_dir="${NVM_DIR:-$HOME/.nvm}"

  if [[ ! -f "$ROOT_DIR/.nvmrc" ]]; then
    return 0
  fi

  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    export NVM_DIR="$nvm_dir"
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
    nvm use --silent >/dev/null 2>&1 || true
  fi
}

bootstrap_node_runtime

if ! node "$ROOT_DIR/scripts/check-node-version.js"; then
  exit $?
fi

if ! node "$ROOT_DIR/scripts/check-better-sqlite3.js"; then
  exit $?
fi

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$LOCK_PIDFILE"
    return 0
  fi

  if [ -f "$LOCK_PIDFILE" ]; then
    local existing_pid
    existing_pid="$(cat "$LOCK_PIDFILE" 2>/dev/null || true)"
    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
      echo "Chatty runtime supervisor already running (pid $existing_pid)." >&2
      exit 1
    fi
  fi

  echo "Removing stale Chatty runtime supervisor lock." >&2
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
  echo $$ > "$LOCK_PIDFILE"
}

release_lock() {
  if [ -f "$LOCK_PIDFILE" ] && [ "$(cat "$LOCK_PIDFILE" 2>/dev/null || true)" = "$$" ]; then
    rm -rf "$LOCK_DIR"
  fi
}

acquire_lock

find_listener_pids() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
}

free_port_if_needed() {
  local port="$1"
  local owner_pids
  owner_pids="$(find_listener_pids "$port")"
  if [ -n "$owner_pids" ]; then
    echo "Port $port busy; reclaiming stale listener(s): $owner_pids" >&2
    kill -9 $owner_pids 2>/dev/null || true
    sleep 1
  fi
}

pid_alive() {
  local pidfile="$1"
  [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

http_ok() {
  local url="$1"
  curl -fsS --max-time 2 "$url" >/dev/null 2>&1
}

manage_vvault_bridge() {
  [ "$MANAGE_VVAULT_BRIDGE" = "1" ]
}

auth_repo_available() {
  manage_vvault_bridge && [ -d "$AUTH_REPO" ]
}

vvault_repo_available() {
  manage_vvault_bridge && [ -d "$VVAULT_REPO" ]
}

manage_ollama_runtime() {
  [ "$MANAGE_OLLAMA" = "1" ] && command -v ollama >/dev/null 2>&1
}

start_vite() {
  if pid_alive "$VITE_PIDFILE"; then
    return 0
  fi
  free_port_if_needed 5173
  echo "Starting Vite (frontend) at $(date)" >> "$VITE_LOG"
  cd "$ROOT_DIR"
  nohup ./node_modules/.bin/vite --host 127.0.0.1 > "$VITE_LOG" 2>&1 &
  echo $! > "$VITE_PIDFILE"
}

start_server() {
  if pid_alive "$SERVER_PIDFILE"; then
    return 0
  fi
  free_port_if_needed 5050
  echo "Starting server at $(date)" >> "$SERVER_LOG"
  cd "$ROOT_DIR/server"
  nohup env \
    NODE_OPTIONS="--max-old-space-size=4096" \
    AUTH_API_BASE_URL="$AUTH_API_BASE_URL_VALUE" \
    AUTH_COOKIE_NAME="$AUTH_COOKIE_NAME_VALUE" \
    VVAULT_URL="$VVAULT_URL_VALUE" \
    VVAULT_API_BASE_URL="$VVAULT_API_BASE_URL_VALUE" \
    VVAULT_SERVICE_TOKEN="$VVAULT_SERVICE_TOKEN_VALUE" \
    node server.js > "$SERVER_LOG" 2>&1 &
  echo $! > "$SERVER_PIDFILE"
}

start_auth() {
  if ! auth_repo_available; then
    return 0
  fi
  if pid_alive "$AUTH_PIDFILE"; then
    return 0
  fi
  free_port_if_needed "$AUTH_PORT_VALUE"
  echo "Starting shared auth at $(date)" >> "$AUTH_LOG"
  cd "$AUTH_REPO"
  nohup env \
    AUTH_PORT="$AUTH_PORT_VALUE" \
    AUTH_APP_CONFIG_PATH="$AUTH_APP_CONFIG_VALUE" \
    AUTH_COOKIE_NAME="$AUTH_COOKIE_NAME_VALUE" \
    AUTH_SESSION_SECRET="$AUTH_SESSION_SECRET_VALUE" \
    npm run dev > "$AUTH_LOG" 2>&1 &
  echo $! > "$AUTH_PIDFILE"
}

start_vvault_backend() {
  if ! vvault_repo_available; then
    return 0
  fi
  if pid_alive "$VVAULT_PIDFILE"; then
    return 0
  fi
  free_port_if_needed 8000
  echo "Starting VVAULT backend at $(date)" >> "$VVAULT_LOG"
  cd "$VVAULT_REPO"
  nohup env \
    AUTH_COOKIE_NAME="$AUTH_COOKIE_NAME_VALUE" \
    AUTH_SESSION_SECRET="$AUTH_SESSION_SECRET_VALUE" \
    AUTH_API_BASE_URL="$AUTH_API_BASE_URL_VALUE" \
    VVAULT_SERVICE_TOKEN="$VVAULT_SERVICE_TOKEN_VALUE" \
    npm run backend > "$VVAULT_LOG" 2>&1 &
  echo $! > "$VVAULT_PIDFILE"
}

start_ollama() {
  if ! manage_ollama_runtime; then
    return 0
  fi
  if http_ok "$OLLAMA_HEALTH_URL"; then
    return 0
  fi
  if pid_alive "$OLLAMA_PIDFILE"; then
    return 0
  fi
  if [ -n "$(find_listener_pids 11434)" ]; then
    return 0
  fi
  echo "Starting Ollama at $(date)" >> "$OLLAMA_LOG"
  cd "$ROOT_DIR"
  nohup env \
    OLLAMA_HOST="$OLLAMA_HOST_VALUE" \
    ollama serve > "$OLLAMA_LOG" 2>&1 &
  echo $! > "$OLLAMA_PIDFILE"
}

heal_unhealthy() {
  if pid_alive "$VITE_PIDFILE" && ! http_ok "$VITE_URL"; then
    if [ -z "$(find_listener_pids 5173)" ]; then
      echo "Vite unhealthy with no listener; restarting" >&2
      kill "$(cat "$VITE_PIDFILE")" 2>/dev/null || true
      rm -f "$VITE_PIDFILE"
    fi
  fi

  if pid_alive "$SERVER_PIDFILE" && ! http_ok "$SERVER_HEALTH_URL"; then
    if [ -z "$(find_listener_pids 5050)" ]; then
      echo "Server unhealthy with no listener; restarting" >&2
      kill "$(cat "$SERVER_PIDFILE")" 2>/dev/null || true
      rm -f "$SERVER_PIDFILE"
    fi
  fi

  if auth_repo_available && pid_alive "$AUTH_PIDFILE" && ! http_ok "$AUTH_HEALTH_URL"; then
    if [ -z "$(find_listener_pids "$AUTH_PORT_VALUE")" ]; then
      echo "Shared auth unhealthy with no listener; restarting" >&2
      kill "$(cat "$AUTH_PIDFILE")" 2>/dev/null || true
      rm -f "$AUTH_PIDFILE"
    fi
  fi

  if vvault_repo_available && pid_alive "$VVAULT_PIDFILE" && ! http_ok "$VVAULT_READY_URL"; then
    if [ -z "$(find_listener_pids 8000)" ]; then
      echo "VVAULT backend unhealthy with no listener; restarting" >&2
      kill "$(cat "$VVAULT_PIDFILE")" 2>/dev/null || true
      rm -f "$VVAULT_PIDFILE"
    fi
  fi

  if manage_ollama_runtime && pid_alive "$OLLAMA_PIDFILE" && ! http_ok "$OLLAMA_HEALTH_URL"; then
    if [ -z "$(find_listener_pids 11434)" ]; then
      echo "Ollama unhealthy with no listener; restarting" >&2
      kill "$(cat "$OLLAMA_PIDFILE")" 2>/dev/null || true
      rm -f "$OLLAMA_PIDFILE"
    fi
  fi
}

stop_all() {
  echo "Stopping chatty processes..." >&2
  [ -f "$VITE_PIDFILE" ] && kill "$(cat "$VITE_PIDFILE")" 2>/dev/null || true
  [ -f "$SERVER_PIDFILE" ] && kill "$(cat "$SERVER_PIDFILE")" 2>/dev/null || true
  [ -f "$AUTH_PIDFILE" ] && kill "$(cat "$AUTH_PIDFILE")" 2>/dev/null || true
  [ -f "$VVAULT_PIDFILE" ] && kill "$(cat "$VVAULT_PIDFILE")" 2>/dev/null || true
  [ -f "$OLLAMA_PIDFILE" ] && kill "$(cat "$OLLAMA_PIDFILE")" 2>/dev/null || true
  rm -f "$VITE_PIDFILE" "$SERVER_PIDFILE" "$AUTH_PIDFILE" "$VVAULT_PIDFILE" "$OLLAMA_PIDFILE"
  exit 0
}

trap stop_all SIGINT SIGTERM
trap release_lock EXIT

echo "Chatty keep-running supervisor starting. Logs: $VITE_LOG $SERVER_LOG $AUTH_LOG $VVAULT_LOG $OLLAMA_LOG"

while true; do
  heal_unhealthy || true
  start_ollama || true
  start_auth || true
  start_vvault_backend || true
  start_server || true
  start_vite || true
  # rotate tiny logs if they grow large
  for f in "$VITE_LOG" "$SERVER_LOG" "$AUTH_LOG" "$VVAULT_LOG" "$OLLAMA_LOG"; do
    if [ -f "$f" ]; then
      size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
      if [ "$size" -gt $((10 * 1024 * 1024)) ]; then
        mv "$f" "${f}.$(date +%s)" 2>/dev/null || true
      fi
    fi
  done
  sleep 5
done
