# VSI Runner Deployment (Queue + Container)

## Overview
The runner executes VSI manifests out-of-process. API `execute` enqueues into `VSI_SPOOL_DIR`; the runner polls, validates, executes whitelisted actions, and writes artifacts + audit entries.

## Prereqs
- Docker or Podman on the host.
- Volumes:
  - `VSI_SPOOL_DIR` (rw, default `/vvault/spool/vsi`)
  - `VVAULT_VSI_ROOT` (rw, default `/vvault/intelligences`)
  - `VSI_KEYS_DIR` for public keys (ro, default `/vvault/keys/vsi`)

## Build & Run
```bash
cd /opt/chatty
IMAGE_NAME=vsi-runner IMAGE_TAG=latest \
VSI_SPOOL_DIR=/vvault/spool/vsi \
VVAULT_VSI_ROOT=/vvault/intelligences \
VSI_KEYS_DIR=/vvault/keys/vsi \
deploy/scripts/deploy_vsi_runner.sh
```

Systemd unit: `deploy/vsi-runner.service` (adjust paths, then `sudo systemctl enable --now vsi-runner`).

## Health
- Heartbeat file: `${VSI_SPOOL_DIR}/runner.heartbeat` (mtime shows last loop).
- API: `GET /api/vsi/runner/health` returns spool depth + heartbeat age.

## Safety Defaults
- Network disabled (`--network=none`).
- Actions: `list_dir` (cap 200 entries), `read_file` (cap 1MB).
- Denylist: `/proc`, `/sys`, `/dev`; path-guarded under `VVAULT_VSI_ROOT`.
- Per-job timeout: `VSI_RUNNER_TIMEOUT_MS` (default 5000ms).
