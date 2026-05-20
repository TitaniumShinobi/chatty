#!/usr/bin/env bash

set -euo pipefail

LOG_DIR="${CHATTY_LOG_DIR:-/tmp}"
LOCK_DIR="$LOG_DIR/chatty-runtime.lock"
LOCK_PIDFILE="$LOCK_DIR/pid"
VITE_PIDFILE="$LOG_DIR/chatty-vite.pid"
SERVER_PIDFILE="$LOG_DIR/chatty-server.pid"
AUTH_PIDFILE="$LOG_DIR/chatty-auth.pid"
VVAULT_PIDFILE="$LOG_DIR/chatty-vvault.pid"

pid_from_file() {
  local pidfile="$1"
  if [[ ! -f "$pidfile" ]]; then
    return 1
  fi

  local pid
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    return 1
  fi

  printf '%s\n' "$pid"
}

pid_alive() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null
}

wait_for_exit() {
  local pid="$1"
  local attempts=20

  while (( attempts > 0 )); do
    if ! pid_alive "$pid"; then
      return 0
    fi
    sleep 0.25
    attempts=$((attempts - 1))
  done

  return 1
}

stop_pidfile() {
  local label="$1"
  local pidfile="$2"
  local pid

  if ! pid="$(pid_from_file "$pidfile")"; then
    rm -f "$pidfile"
    return 0
  fi

  if ! pid_alive "$pid"; then
    echo "Removing stale $label pidfile ($pidfile)."
    rm -f "$pidfile"
    return 0
  fi

  echo "Stopping $label (pid $pid)."
  kill "$pid" 2>/dev/null || true
  if ! wait_for_exit "$pid"; then
    echo "$label did not stop cleanly (pid $pid)." >&2
    return 1
  fi

  rm -f "$pidfile"
}

if supervisor_pid="$(pid_from_file "$LOCK_PIDFILE")" && pid_alive "$supervisor_pid"; then
  echo "Stopping Chatty runtime supervisor (pid $supervisor_pid)."
  kill "$supervisor_pid" 2>/dev/null || true
  if ! wait_for_exit "$supervisor_pid"; then
    echo "Chatty runtime supervisor did not stop cleanly (pid $supervisor_pid)." >&2
    exit 1
  fi
else
  echo "No Chatty runtime supervisor is running."
  stop_pidfile "Shared auth" "$AUTH_PIDFILE"
  stop_pidfile "VVAULT backend" "$VVAULT_PIDFILE"
  stop_pidfile "Chatty backend" "$SERVER_PIDFILE"
  stop_pidfile "Chatty frontend" "$VITE_PIDFILE"
fi

if [[ -d "$LOCK_DIR" ]]; then
  rm -rf "$LOCK_DIR"
fi

echo "Chatty runtime stopped."
