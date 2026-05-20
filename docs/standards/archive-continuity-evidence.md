# Archive Continuity Evidence

Chatty's archive is not a discard pile. It preserves coherent prior conversations, architecture intent, agent reasoning, and user corrections that may still define product canon even when current runtime code has not caught up.

This standard exists so agents do not flatten Devon's history by treating `docs/archive/` as optional legacy material.

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

See [vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md).

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders and calling them VVAULT.
- Reading local transcript files for continuity.
- Calling local file placement "VVAULT sync."
- Continuing locally when VVAULT write/readback is unavailable.
- Treating Supabase as current VVAULT.

## Archive Supersession Warning

Archive evidence may preserve old Supabase, local filesystem, `instances/.../chatty`, local body database, or local transcript-folder instructions. Those references are provenance only. They explain how the system used to be discussed, repaired, tested, or migrated.

They must not guide new work unless a current live authority document explicitly reactivates them. Current VVAULT work must use VVAULT-owned database writes plus readback proof, or report blocked.

## Evidence Doctrine

- `docs/archive/` is archive-backed continuity evidence.
- Archive-backed design history must be reconciled with current runtime behavior before an agent declares product canon.
- Live code proves what is currently wired. It does not erase prior design truth.
- Archive-backed local storage references are never VVAULT authority without current VVAULT database readback proof.
- Newer summary docs can compress or narrow history. They do not automatically supersede the archive unless they cite clear evidence for the change.
- If Devon gives a current correction, treat it as the controlling clarification and reconcile the archive, live code, and newer summaries around it.

## Priority Order

When sources disagree, agents must use this order:

1. Devon's current direct corrections.
2. Transcript-backed and archive-backed coherent design history.
3. Live runtime receipts and code paths proving what is currently wired.
4. Compressed newer summary docs.

This order does not mean runtime evidence is unimportant. It means runtime evidence answers "what is wired now," while archive and transcript evidence can answer "what this was intended to be."

## Required Conflict Labels

When archive evidence disagrees with live code or newer docs, agents must label the conflict instead of dismissing the archive:

- `implementation drift`: live code diverges from documented or transcript-backed intent.
- `documentation compression`: a newer summary narrowed or oversimplified earlier design history.
- `unwired design intent`: the archive records a valid design that is not yet connected to runtime.
- `superseded with evidence`: a later source explicitly replaced the older design and explains why.
- `needs Devon reconciliation`: sources conflict and the agent cannot safely decide the canon.

## Banned Shortcuts

Agents must not describe `docs/archive/` as:

- stale docs
- optional archive
- old notes
- legacy therefore obsolete
- historical context only
- non-canonical because archived

Preferred terms:

- archive-backed continuity evidence
- historical design record
- prior coherent architecture output
- implementation drift source
- transcript-backed design history

## Agent Requirements

Before declaring product canon, an agent must:

1. Inspect relevant live docs and relevant archive docs.
2. Separate live runtime state from design intent.
3. Report conflicts using the required labels above.
4. Avoid asking Devon to re-explain what the archive already preserves.
5. Treat Lin, Synth, Zen, Zenith, Casa Madrigal, and construct identity history as continuity evidence that must be reconciled, not flattened.
