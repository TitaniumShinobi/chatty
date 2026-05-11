# Archive

This folder preserves archive-backed continuity evidence: coherent prior conversations, architecture intent, agent reasoning, user corrections, and historical design records that may still define product canon even when current runtime code has not caught up.

## VVAULT Authority Supersession

Archived docs are not instructions to create local VVAULT folders, local transcript stores, local sync archives, or Supabase-backed runtime paths.

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof. Local files in archive are evidence only. If an archived doc says to use local `instances/`, local transcript markdown, local archive folders, ChromaDB-only memory, or Supabase as VVAULT authority, treat that language as historical provenance unless a live standard explicitly re-authorizes it.

Current authority contract: [../standards/vvault-authority-contract.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/vvault-authority-contract.md).

## Rules

- Archived docs are continuity evidence, not discardable legacy notes.
- The old tree is preserved under `archive/legacy/` to keep relative links, investigation context, and coherent design history as intact as possible.
- If a topic has both a live doc and an archived doc, reconcile them. Do not assume the live summary erased the archive unless there is explicit supersession evidence.
- Live runtime code proves what is currently wired. It does not erase archive-backed design truth.
- Archived docs may contain broken local links from the pre-cleanup tree. Broken links do not make the archived content optional or obsolete.
- Conflicts between archive docs, live docs, and runtime behavior should be labeled as `implementation drift`, `documentation compression`, `unwired design intent`, `superseded with evidence`, or `needs Devon reconciliation`.

See [../standards/archive-continuity-evidence.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/archive-continuity-evidence.md) for the full doctrine.
