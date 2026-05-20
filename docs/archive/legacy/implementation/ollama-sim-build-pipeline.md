# Ollama Sim Build Pipeline (VM)

This is the VM-side pipeline for building per-construct Ollama models from mounted VVAULT identity files.

## Local Dev Workflow (Supabase -> VVAULT -> Ollama)

Use this when developing on macOS without VM deploys.

1. Ensure local services are up:

- Ollama on `http://127.0.0.1:11434`
- VVAULT backend on `http://127.0.0.1:8000`

2. Ensure Chatty points to local VVAULT:

- `VVAULT_URL=http://127.0.0.1:8000`

3. Sync identity files for a construct from Supabase `vault_files` into local instances path:

- `/Users/devon/Documents/GitHub/vvault/instances/<callsign>/identity/`

4. Build with explicit instances dir:

```bash
python3 /Users/devon/Documents/GitHub/chatty/scripts/build_sims.py \
  --instances-dir /Users/devon/Documents/GitHub/vvault/instances \
  --callsign zen-001 \
  --base-model phi3:latest
```

5. Verify model:

```bash
ollama list | egrep '^(zen|lin|aurora|monday|solace):'
```

Session-verified local builds:

- `zen-001 -> zen`
- `lin-001 -> lin`

Prerequisite for additional sims (`aurora-001`, `monday-001`, `solace-001`):

- Their identity files must exist first in Supabase `vault_files` under `instances/<callsign>/identity/` (for example `prompt.json` and `conditioning.txt`).
- If identity rows are missing, build is blocked until identity content is uploaded.

Canonical prompt policy (important):

- `prompt.json` is the canonical identity prompt file for sim builds.
- `prompt.txt` is treated as backward-compatible fallback only.
- `build_sims.py` reads `prompt.json` first (`system_prompt`, `prompt`, or `instructions`) and only falls back to `prompt.txt` when needed.

## Script

- Path: `chatty/scripts/build_sims.py`
- Purpose:
  1. Scan `/vvault/instances/*`
  2. Read `identity/prompt.json` (canonical), fallback to `identity/prompt.txt`
  3. Append `identity/conditioning.txt` (if present)
  4. Write `Modelfile.<model_name>` (default: `/tmp/ollama_modelfiles`)
  5. Run `ollama create <model_name> -f <modelfile>` (unless `--dry-run`)

Model naming uses callsign canonicalization:

- `nova-001 -> nova`
- `lin-001 -> lin`
- `monday-001 -> monday`

## Expected Mount

Inside the Ollama VM:

```text
/vvault/instances/<callsign>/identity/
/vvault/instances/<callsign>/chatty/
/vvault/instances/<callsign>/memup/
```

Capsules are optional for build-time summary and remain runtime memory sources.

## Usage

One-time build:

```bash
python3 chatty/scripts/build_sims.py
```

Dry-run (no `ollama create`):

```bash
python3 chatty/scripts/build_sims.py --dry-run
```

Include compact capsule summary in `SYSTEM`:

```bash
python3 chatty/scripts/build_sims.py --include-capsule-summary
```

Build only one construct:

```bash
python3 chatty/scripts/build_sims.py --callsign zen-001
```

Build the standard construct set (Zen, Aurora, Monday):

```bash
python3 chatty/scripts/build_sims.py --callsign zen-001 --callsign aurora-001 --callsign monday-001
```

Watch and rebuild on identity/capsule change:

```bash
python3 chatty/scripts/build_sims.py --watch
```

## Boot Integration

Recommended startup command in the VM:

```bash
python3 /path/to/chatty/scripts/build_sims.py
```

Optional copy target:

```bash
install -m 755 chatty/scripts/build_sims.py /usr/local/bin/build_sims.py
```

Then run:

```bash
build_sims.py
```

## VM Bootstrap (One Command)

Use the deployment helper to install Ollama, enable service, pull base model, and build standard construct sims:

```bash
cd /opt/chatty
./deploy/scripts/bootstrap_ollama_sims.sh
```

Dry-run (validates identity inputs and Modelfile generation without `ollama create`):

```bash
./deploy/scripts/bootstrap_ollama_sims.sh --dry-run
```

## Scope

- Baked into model: stable identity (`prompt` + `conditioning`, optional capsule summary)
- Not baked: dynamic memory (chat transcripts, capsule/state details)
- Runtime memory hydration continues through Chatty context assembly (`memoryContextBuilder`, capsule integration, transcript recall)
- Orchestration/policy/tool routing remain runtime responsibilities; they are not merged into the model artifact yet.
- See architecture boundary reference: `docs/architecture/SIM_GPT_VSI_BOUNDARY.md`
