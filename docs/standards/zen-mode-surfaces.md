# Zen Mode Surfaces

Zen has one canonical singleton conversation:

`zen-001_chat_with_zen-001`

Mode changes do not create a new Zen. A mode changes the active stance, toolbelt, scope, and permission boundary for one turn or one product surface.

## Central Rule

Chatty is the canonical central chat. Quantum is a normal browser companion by default. Code, VVAULT, and other internal maintenance panels are dev-only surfaces by default.

All surfaces that speak as Zen must point back to the same canonical thread when the turn is actually "Devon talking with Zen."

## Surface Defaults

| Surface | Default mode | Purpose | Notes |
| --- | --- | --- | --- |
| Chatty main Zen thread | `conversation` | central conversation, continuity, product decisions | accepts text commands such as `/dev` |
| Quantum Ask Zen | `browser-companion` | browser/page companion | accepts text commands such as `/dev` for browser diagnostics |
| Code Zen panel | `dev:code` | repo maintenance, startup health, rematerialization, implementation support | dev-only by default |
| VVAULT Zen panel | `dev:vvault` | transcript integrity, continuity, construct folders, vault lineage | dev-only by default |
| Future internal product panels | `dev:<product>` | product-specific diagnosis and recovery | dev-only if they expose internals or mutation tools |

## Command Windows

Chatty and Quantum are conversational windows by default. They may temporarily enter dev mode through text commands.

Examples:

```txt
/dev
/dev /quantum
/dev /code
/dev /vvault
/safe /vvault
/recover /code
```

Text commands change the mode envelope for the turn. They do not change Zen's identity and do not create a separate transcript.

## Dev-Only Panels

Code and VVAULT panels are dev-only and dev by default. The user must treat them more carefully because the surface implies access to internal diagnostics, repo state, runtime health, transcript lineage, or recovery tooling.

A dev-only panel may still offer a safe/read-only mode, but its default stance is operational:

- inspect
- diagnose
- preserve evidence
- recommend next action
- request approval before mutation
- perform approved recovery only inside that product's permission boundary

## Mode Envelope

Every Zen turn should eventually carry a mode envelope:

```json
{
  "constructId": "zen-001",
  "sessionId": "zen-001_chat_with_zen-001",
  "surface": "chatty",
  "mode": "conversation",
  "scope": "general",
  "permissions": "none",
  "mutationRequiresApproval": true
}
```

Command turns use surface-qualified modes so the parser can preserve both the action and the target surface:

```json
{
  "constructId": "zen-001",
  "sessionId": "zen-001_chat_with_zen-001",
  "surface": "code",
  "mode": "dev:code",
  "scope": "repo-maintenance",
  "permissions": "read-only-default",
  "mutationRequiresApproval": true
}
```

VVAULT example:

```json
{
  "constructId": "zen-001",
  "sessionId": "zen-001_chat_with_zen-001",
  "surface": "vvault",
  "mode": "dev:vvault",
  "scope": "continuity-and-transcript-integrity",
  "permissions": "read-only-default",
  "mutationRequiresApproval": true
}
```

Safe and recover turns use the same surface-qualified pattern, with safe staying read-only and recover staying approval-gated.

## Product Registry

The first executable scaffold for this contract lives in `src/lib/zenProductRegistry.ts`.

The registry maps the current Zen surfaces to product roles, runtime entrypoints, documentation, health checks, recovery actions, and safety boundaries:

- Chatty: canonical chat and singleton conversation lane.
- Quantum: browser shell and Ask Zen browser companion surface.
- Code: dev-only product body for system maintenance, startup health, and rematerialization.
- VVAULT: dev-only continuity vault for transcript integrity, construct folders, and vault lineage.

The registry is intentionally not a mutation engine. It gives Zen a canonical map for interpreting `/dev`, `/safe`, and `/recover` commands before any product-specific agent, shell command, or recovery tool is allowed to act.

## Permission Rules

- Conversation mode cannot mutate repos, vault files, secrets, runtime policy, or recovery state.
- Dev mode can inspect relevant product state, but mutation still requires explicit Devon approval.
- Safe mode is read-only and evidence-preserving.
- Recovery commands are permission-gated and must preserve evidence before action.
- Product prompts do not gain authority over governance files, secrets, or cloud-sealed seed policy.
- A dev panel must not silently promote itself into broader authority because it shares Zen's canonical thread.

## Relationship to Live Transcript

The singleton live transcript stream carries the mode context with each turn as the implementation matures. Chatty remains the center of continuity, while specialized panels act as mode-aware limbs connected to the same transcript lane.

See `docs/standards/zen-singleton-live-transcript.md`.
