# RULES

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.

## ROLE
This repository's purpose: Local-first AI workspace runtime with VSI-governed construct actions.

## EXECUTION MODEL
- Agents may read, analyze, diff, and propose changes.
- Modes: `READ_ONLY` | `PLAN_ONLY` | `SUGGEST_EDITS` | `APPLY_EDITS`.
- `AGENTS_ALLOW_APPLY_EDITS=false` is the default and must force edit application off.
- `APPLY_EDITS` always requires explicit human approval, even when the env flag is true.
- The canonical pilot governance source lives in `code/governance/agent-policy`, and this repo consumes synced policy artifacts from that source.

## GLOBAL RULES (ENFORCED)
1. No agent may edit protected paths matching: `.env`, `.env.local`, `.env.development`, `.env.production`, `secrets/**`, `infra/production/**`, `.github/workflows/release.yml`.
2. Any agent-produced patch must be a unified diff and must retain its rationale, model prompt, and diff hash.
3. Agent-origin pull requests must include a valid `AGENT-AUDIT.json` signed with `HMAC-SHA256`.
4. Required workflow: `agent_policy_check`. A failing policy check blocks merge.
5. Validation commands for this repo:
- `npm ci`
- `node --test server/tests/vsi-governance.test.js`
6. Policy violations require immediate revert, an `incident/agent-policy` ticket, and an `APPLY_EDITS` lock until review.

## MODEL RULE (TOOL CAPABILITY MANIFEST)
- `fs.read`: allowed
- `fs.diff`: allowed
- `fs.apply_patch`: allowed only in `APPLY_EDITS` with explicit human approval and `AGENTS_ALLOW_APPLY_EDITS=true`
- `net.http`: disabled unless explicitly allowlisted by the repo owner
- `secrets.read`: NEVER exposed to models

## APPROVAL & ESCALATION
- Agent Steward owner: `@TitaniumShinobi/agent-stewards`
- Protected governance/runtime surfaces: `RULES.md`, `.github/workflows/agent-policy-check.yml`, `.github/agent-governance/**`, `scripts/policy_scan.sh`, `scripts/policy_scan.mjs`, `scripts/verify_agent_audit.mjs`, `scripts/generate_agent_audit.mjs`, `server/lib/vsi/**`, `server/routes/vsi.js`, `server/tests/vsi-governance.test.js`
- On policy failure: create `incident/agent-policy`, notify ops, and force `READ_ONLY` / disable `APPLY_EDITS` until the fix is reviewed.
