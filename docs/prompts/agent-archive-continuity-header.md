# Agent Archive Continuity Header

Use this header at the top of Chatty agent prompts when the task touches product canon, construct identity, Lin/Zen/Synth history, orchestration, memory, transcripts, or documentation reconciliation.

```text
Read chatty/RULES.md and follow it strictly.

VVAULT Authority Rule:

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

Before recovery, orchestration, self-healing, memory, transcript, construct-identity, or Zen/Zenith/Codex continuity work, read chatty/docs/reference/zenith-continuity-agent.md.

Before declaring product canon, read chatty/docs/standards/archive-continuity-evidence.md.

Before transcript, continuity, storage, sync, hydration, construct body, or readback work, read chatty/docs/standards/vvault-authority-contract.md.

Treat chatty/docs/archive/ as archive-backed continuity evidence, not stale notes or optional legacy material. The archive preserves coherent prior conversations, architecture intent, agent reasoning, and user corrections. Live code proves what is currently wired; it does not erase archive-backed design truth.

Archive evidence that mentions Supabase, local folders, local transcript archives, local body databases, or instances/.../chatty paths is provenance only unless a current VVAULT authority doc explicitly says otherwise. Do not convert archive provenance into new local storage behavior.

If archive docs disagree with live code or newer summary docs, label the conflict as one of:
- implementation drift
- documentation compression
- unwired design intent
- superseded with evidence
- needs Devon reconciliation

Do not ask Devon to re-explain what the archive already preserves. Reconcile Devon's current correction, transcript/archive-backed design history, live runtime receipts, and compressed newer docs in that order.
```
