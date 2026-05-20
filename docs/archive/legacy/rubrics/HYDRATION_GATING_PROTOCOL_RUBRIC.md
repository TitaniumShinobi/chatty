# Hydration Gating Protocol — Preservation Rubric

**Status:** ENFORCED  
**Effective:** 2026-02-13  
**Scope:** `server/lib/gptManager.js` — `hydrateFromVVAULT()`, `_applyIdentityUpdate()`, `_isStubValue()`, `_isStubStarters()`

## Purpose

Prevent overwriting of user-authored GPT identity fields (`description`, `instructions`, `conversationStarters`) during server startup hydration. Supabase/VVAULT values must never automatically overwrite authored fields post-creation.

## Protected Fields

| Field | Write-Protected When |
|---|---|
| `description` | Non-null, non-empty, >= 50 chars, not a known placeholder |
| `instructions` | Non-null, non-empty, >= 50 chars, not a "You are {Name}." template |
| `conversationStarters` | Non-empty array with authored content (not just "hello"/"hi") |
| `name` | Always updatable (low-risk identity sync) |

## Stub Detection Criteria

A field value is treated as a **stub** (eligible for hydration overwrite) only if:

1. **Null or empty** — field is `null`, `undefined`, or empty string `""`
2. **Known placeholder pattern** — exact match to: `"A custom GPT"`, `"No description"`, `"Instructions here"`, `"TBD"`, `"Placeholder"`, etc.
3. **Generic template** — matches `"You are {Name}."` pattern (instructions only)
4. **Below length threshold** — content is fewer than **50 characters** (for both description and instructions)
5. **Default starters** — conversationStarters array is empty, contains a single empty entry, or contains only generic greetings (`"hello"`, `"hi"`, `"hey"`)

If **none** of these conditions apply, the field is classified as **authored content** and is write-protected.

## Audit Logging

Every hydration decision is logged per-field with:

- **Construct ID** (callsign)
- **Field name** being evaluated
- **Action taken** (`hydrated` or `write-protected`)
- **Reason** for the gating decision
- **Source** of the incoming data (`VVAULT API` or `Supabase`)

### Log Format Examples

```
🔒 [GPTManager] nova-001.description: WRITE-PROTECTED — authored content detected (source: Supabase)
🔒 [GPTManager] nova-001.instructions: WRITE-PROTECTED — authored content detected (source: Supabase)
📥 [GPTManager] katana-001.conversationStarters: hydrated — was empty starters array (source: Supabase)
```

## Sync Path Rules

1. **Save GPT** (user action) → writes to both SQLite and Supabase. This is the ONLY path that can update authored fields.
2. **Server startup hydration** → reads from VVAULT API / Supabase → gated by stub detection → can only fill empty/placeholder fields.
3. **Supabase `prompt.json`** must never act as an overwrite source unless explicitly restored by the user through Save GPT.

## Field Locking Policy

Once user-authored content is present in a field:
- That field becomes **write-protected from automatic syncs**
- Updates can ONLY occur through direct **Save GPT** actions in GPTCreator
- Server restarts, Supabase syncs, and VVAULT hydration are all blocked from overwriting

## Future Scope: Traits & Memory Sync

The following fields are **not yet covered** by this protocol but are planned for future enforcement:

- **traits** — Custom personality traits assigned to a construct
- **memory sync** — Memory anchors, capsule data, and continuity ledger entries

When these fields gain user-editable pathways, they must be brought under the same gating, audit, and field-locking policy described here. Until then, these fields follow their existing write paths (capsule generation, transcript parsing, etc.) and are not subject to automatic overwrite protection.

## Implementation Location

- `server/lib/gptManager.js` — `_isStubValue()` returns `{ isStub: boolean, reason: string }`
- `server/lib/gptManager.js` — `_isStubStarters()` returns `{ isStub: boolean, reason: string }`
- `server/lib/gptManager.js` — `_applyIdentityUpdate()` evaluates each field independently and logs audit trail

## NO EXCEPTIONS. NO DEVIATIONS.
