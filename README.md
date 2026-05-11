# Chatty

Chatty is a local-first AI workspace with a Vite frontend, an Express backend, Electron launch paths, GPT creation flows, file intelligence, and VVAULT-backed construct storage.

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

Authority contract: [docs/standards/vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md).

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.

## Runtime

- Web app: `http://localhost:5173`
- Backend API: `http://localhost:5050`
- Operator launcher: `./bin/chatty`
- Operator CLI launcher: `./bin/chatty-cli`
- Raw frontend: `npm run dev`
- Raw full stack: `npm run dev:full`
- Raw terminal CLI: `npm run cli`
- Alias raw terminal CLI: `npm run terminal`
- Managed background runtime: `npm run runtime:up`

## CLI

- Use `./bin/chatty-cli` when you want the operator-facing terminal command.
- Use `npm run cli` or `npm run terminal` when you want the raw repo-local CLI path.
- The global `chatty-cli` command is meant to resolve to the same repo-owned wrapper as `./bin/chatty-cli`, whether you expose it through `~/.zshrc` or a `/usr/local/bin/chatty-cli` symlink.

## Docs

- Main docs index: [docs/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/README.md)
- Audit packet: [docs/README/README.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/README/README.md)
- Backend runtime doc: [server/README.md](/Users/devonwoodson/Documents/GitHub/chatty/server/README.md)

## Orchestration Start Here

- Canonical orchestration/core split: [docs/standards/orchestration-canon-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-canon-rubric.md)
- Explicit orchestration surface map: [docs/standards/orchestration-surface-inventory.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-surface-inventory.md)
- Receipt-backed runtime contract: [docs/standards/orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md)
- Three I seat canon: [docs/standards/lin-three-i-seat-canon.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md)
- Wrapper split and Lin substrate truth: [docs/reference/constructs-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md)

### One-Word Trigger: `orchestration`

When an operator or agent prompt is exactly `orchestration`, the wanted action is to prove and tighten the live orchestration loop. Do not explain architecture, start transcript intake, create a parallel local-file route, or treat helper surfaces as proof.

Required action:

1. Use `chatty-cli` as the operator surface.
2. Verify backend mode delegates construct-quality turns to `/api/vvault/message`.
3. Prove the turn exposes `runtime_receipt` and `orchestration_checklist`.
4. Report construct identity, provider/model truth, memory/persistence owner, visible output, and the failed stage if any.

Required worker output:

```txt
STATUS:
ROUTE_USED:
CONSTRUCT_ID:
ORCHESTRATION_MODE:
RECEIPT_PRESENT:
CHECKLIST_PRESENT:
PERSISTENCE_OWNER:
VISIBLE_OUTPUT:
FAILED_STAGE:
FILES_CHANGED:
TESTS_RUN:
FINAL_VERDICT:
```

## Source-of-Truth Notes

- Canonical orchestration and operator surface is `chatty-cli`, described in [docs/standards/orchestration-canon-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-canon-rubric.md) and mapped in [docs/standards/orchestration-surface-inventory.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-surface-inventory.md).
- Canonical receipt-backed construct runtime route is `/api/vvault/message`, with proof in [docs/standards/orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md).
- Chatty UI remains the visible Three I wrapper and Code remains the one-seat wrapper over that shared orchestration truth.
- Runtime ports and launcher behavior are documented in [docs/reference/runtime-and-ports.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/runtime-and-ports.md).
- Auth and provider status are documented in [docs/reference/auth-and-oauth.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/auth-and-oauth.md).
- VVAULT path rules and current contradictions are documented in [docs/reference/vvault-and-storage.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/vvault-and-storage.md) and [docs/README/contradictions.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/README/contradictions.md).
