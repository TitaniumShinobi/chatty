#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Starting Chatty: activating venv..."
if [ -f ./chatty_env/bin/activate ]; then
  # shellcheck disable=SC1091
  source ./chatty_env/bin/activate
else
  echo "Warning: venv not found at ./chatty_env. Skipping venv activation."
fi

echo "Starting backend (npm run dev)... logs -> /tmp/chatty-backend.log"
if command -v npm >/dev/null 2>&1; then
  npm run dev > /tmp/chatty-backend.log 2>&1 &
else
  echo "npm not found; start your backend manually (e.g. node server/server.js)"
fi

echo "Bringing up docker sidecars (if present)..."
if [ -f docker-compose.yml ]; then
  docker compose -f docker-compose.yml -f docker-compose.openvoice.build.yml up -d || docker compose up -d || true
else
  echo "docker-compose.yml not found; skipping docker compose."
fi

echo "Waiting for services to settle..."
sleep 5

echo "Checking endpoints..."
printf "backend: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5050/ || echo "no response"
printf "openvoice: "
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/health || curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/ || echo "no response"

echo "Done. Backend logs: /tmp/chatty-backend.log"
echo "If needed, make this script executable: chmod +x scripts/start-chatty.sh"
