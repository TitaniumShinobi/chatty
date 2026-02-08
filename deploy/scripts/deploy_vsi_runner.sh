#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-vsi-runner}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
POLL_MS="${VSI_RUNNER_POLL_MS:-2000}"

echo "[vsi-runner] Building image ${FULL_IMAGE}..."
docker build -f Dockerfile.vsi-runner -t "${FULL_IMAGE}" .

echo "[vsi-runner] Stopping existing container if present..."
docker rm -f vsi-runner 2>/dev/null || true

echo "[vsi-runner] Starting container..."
docker run -d \
  --name vsi-runner \
  --restart=always \
  --network=none \
  -e VSI_RUNNER_POLL_MS="${POLL_MS}" \
  -e VSI_RUNNER_TIMEOUT_MS="${VSI_RUNNER_TIMEOUT_MS:-5000}" \
  -e VVAULT_VSI_ROOT="${VVAULT_VSI_ROOT:-/vvault/intelligences}" \
  -e VSI_SPOOL_DIR="${VSI_SPOOL_DIR:-/vvault/spool/vsi}" \
  -v "${VSI_SPOOL_DIR:-/vvault/spool/vsi}:/vvault/spool/vsi" \
  -v "${VVAULT_VSI_ROOT:-/vvault/intelligences}:${VVAULT_VSI_ROOT:-/vvault/intelligences}" \
  -v "${VSI_KEYS_DIR:-/vvault/keys/vsi}:/vvault/keys/vsi:ro" \
  "${FULL_IMAGE}"

echo "[vsi-runner] Container started. Logs: docker logs -f vsi-runner"
