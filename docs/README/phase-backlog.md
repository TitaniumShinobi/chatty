# Follow-Up Backlog

The live cleanup pass has been implemented. Remaining work, if needed in later prompts, should focus on lower-value follow-up rather than reopening the live docs surface.

## Recommended Follow-Up

1. Normalize archive-only stale links if the legacy tree needs to be browsed heavily.
2. Resolve the `instances/` vs `constructs/` contradiction in code and then collapse the remaining dual-language docs.
3. Re-audit auth/provider wording whenever backend provider routes change.
4. Promote additional archived docs back into the live surface only if they regain current operational value.
5. If desired, rename the remaining retained legacy-style feature filenames (`RAG_SYSTEM.md`, `COMMUNITY_GPTs_STRUCTURE.md`, `AGENT_DIRECT_SEND.md`) to lowercase slugs in a later pass; they are canonical now, but not yet naming-normalized.

## Decision Rules

- Code and runtime scripts win over prose when they disagree.
- Keep one canonical document per topic.
- Archive useful history, but do not keep old tickets in live browsing folders.
- Do not create new top-level doc buckets unless the current folder cannot be made smaller safely.
