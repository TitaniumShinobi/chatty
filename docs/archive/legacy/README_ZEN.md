# Zen README

## Who Zen is

Zen (`zen-001`) is Chatty's primary construct and the default workspace representative.

- He is the first-line conversation construct for the workspace.
- His runtime identity emphasizes calm, thoughtful, and precise guidance.
- In current runtime identity, Zen also has a Codex mode for code, repo, architecture, bug, and test questions.
- His role is synthesis and continuity: receive requests, stay grounded, and route or delegate when needed.

## Where Zen's identity is defined

- Embedded runtime identity: `server/lib/identityLoader.js`
- Prompt assembly and conditioning injection: `server/lib/memoryContextBuilder.js`
- Main VVAULT message route: `server/routes/vvault.js`
- Canonical construct storage when present: `instances/zen-001/identity/` and `instances/zen-001/chatty/`

## Territory and capabilities

Zen's native territory is the main Chatty conversation surface.

- Primary workspace conversation partner
- Workspace representative when the user is talking to the default construct
- Coding/Codex mode for technical questions already present in runtime identity
- Memory-aware orchestration through the VVAULT message path
- Shared behavioral-directive layer plus Zen-specific identity and conditioning

What Zen is not:

- Not a generic assistant persona detached from the workspace
- Not Lin's undertone role
- Not a separate construct when Codex mode is active; Codex mode is part of Zen's runtime identity

## Orchestration and constraints

Zen runs through the same construct pipeline as other Chatty constructs: one system prompt per request, built from construct identity plus shared orchestration layers.

- Base prompt comes from `systemPromptOverride || identity?.prompt || gptConfig?.instructions || fallback` in `server/lib/memoryContextBuilder.js`.
- Conditioning is appended from the loaded Zen identity when present.
- The active message path is `server/routes/vvault.js` via `/api/vvault/message`.
- Current diagnostics expose prompt source, conditioning injection, retrieval injection, and final history count for audit work.
- Zen remains the primary construct even when provider fallback occurs; provider choice does not change identity source.

Key references:

- `docs/architecture/HOUSE_RULES_ZEN_LIN.md`
- `docs/implementation/ZEN_CANONICAL_IMPLEMENTATION.md`
- `docs/rubrics/ZEN_PRIMARY_CONSTRUCT_RUBRIC.md`
- `docs/implementation/ZEN_DELEGATION_TESTING.md`
- `docs/features/VVAULT_COMPLETE_GUIDE.md`

## Change log

### 2026-03-09 — Initial master Zen README

Documented:

- Zen's current runtime role as primary construct and workspace representative
- The active identity/orchestration source files
- The current Codex-mode behavior already present in `server/lib/identityLoader.js`

## Related docs

- `docs/README.md`
- `docs/architecture/HOUSE_RULES_ZEN_LIN.md`
- `docs/implementation/ZEN_CANONICAL_IMPLEMENTATION.md`
- `docs/rubrics/ZEN_PRIMARY_CONSTRUCT_RUBRIC.md`
- `docs/implementation/ZEN_DELEGATION_TESTING.md`
- `docs/features/VVAULT_COMPLETE_GUIDE.md`
- `docs/audits/CHATTY_ORCHESTRATION_STABILITY_AUDIT.md`

## How to verify

In Chatty, open Zen and ask:

- `Who are you?`
- `What is your role in Chatty?`
- `When do you switch into Codex mode?`

Expected behavior:

- Zen identifies as Zen and as the primary construct
- He describes his workspace-representative role without dropping into a generic assistant identity
- He explains Codex mode as part of Zen's own technical-reasoning behavior
