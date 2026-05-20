# Plan: Wiring a New Construct Through Lin (GUI)

**Date:** 2026-02-12
**Status:** PLAN
**Priority:** Feature Enhancement

## Overview

This plan documents the full flow for creating a new AI construct (GPT) through a conversation with Lin in the Chatty GUI. Lin serves as the conversational agent that guides users through character design, then triggers the GPTCreator UI with pre-filled information.

## Current State

### What Exists
- **GPTCreator component** (`src/components/GPTCreator.tsx`) — Full-featured GPT creation/editing UI with Create and Edit tabs
- **Lin as Create Tab agent** — Lin is the conversational interface in the GPTCreator Create Tab; users talk to Lin to brainstorm and define a new construct
- **Lin conversation persistence** — Lin loads/saves conversation from `instances/lin-001/chatty/chat_with_lin-001.md` in Supabase
- **GPT database tables** — `gpts` and `ais` tables store GPT definitions with name, description, instructions, model, avatar, constructCallsign
- **VVAULT scaffolding** — `server/routes/gpts.js` and `server/routes/ais.js` have creation endpoints
- **Autonomy stack bootstrap** — `POST /api/master/bootstrap` initializes Needle, IdentityGuard, StateManager for all known constructs
- **Sidebar navigation** — Address Book auto-populates from GPT records

### What's Missing or Incomplete
- No automated trigger from Lin's conversation output to GPTCreator's form fields
- No automatic scaffolding of Supabase `vault_files` folder structure for the new construct
- No automatic capsule generation on first creation
- No automatic bootstrap of the new construct into the autonomy stack (requires page refresh)
- No "creation complete" confirmation flow that transitions from Lin chat to the new construct's chat

## Target Flow

```
User clicks "+" or "Create GPT" in sidebar
│
├─→ 1. GPTCreator opens with Create Tab (Lin conversation)
│     User talks to Lin about the new GPT:
│     "I want a GPT named Katana who is a sharp, tactical analyst..."
│
├─→ 2. Lin extracts structured data from conversation:
│     ├── Name: "Katana"
│     ├── Callsign: "katana-001" (auto-generated from name)
│     ├── Description: "Sharp, tactical analyst with military precision"
│     ├── Personality traits: analytical, direct, strategic
│     ├── Communication style: concise, no-nonsense
│     └── Avatar suggestion (optional)
│
├─→ 3. Lin outputs a structured creation summary
│     "Here's what I have for Katana: [summary]. Ready to create?"
│     User confirms → Lin emits a creation event
│
├─→ 4. GPTCreator auto-fills form from Lin's output
│     ├── Name field ← "Katana"
│     ├── Description field ← extracted description
│     ├── Instructions field ← generated system prompt
│     └── Model field ← default or user-specified
│
├─→ 5. User reviews, adjusts, and clicks "Create"
│
├─→ 6. Backend creates GPT record
│     POST /api/ais or POST /api/gpts
│     ├── Insert into database (ais/gpts table)
│     ├── Generate constructCallsign (e.g., "katana-001")
│     └── Return new GPT ID
│
├─→ 7. File scaffolding (dual storage)
│     FileManagementAutomation already scaffolds via VVAULT_ROOT (local filesystem):
│     ├── instances/{callsign}/identity/prompt.txt
│     ├── instances/{callsign}/identity/conditioning.txt
│     ├── instances/{callsign}/identity/{callsign}.capsule
│     ├── instances/{callsign}/chatty/chat_with_{callsign}.md
│     Note: Default constructs (zen, lin) use name-only paths (instances/zen/)
│     while custom GPTs use callsign paths (instances/katana-001/)
│     
│     Supabase vault_files also needs matching records for memory/identity systems.
│     Current code writes to VVAULT_ROOT locally and to Supabase separately.
│     Both must be populated for the construct to function across all subsystems.
│
├─→ 8. Autonomy stack bootstrap for new construct
│     POST /api/master/bootstrap with ["{new-callsign}"]
│     ├── Bind IdentityGuard hash
│     ├── Initialize StateManager
│     ├── Initialize Needle (no anchors yet — empty transcript)
│     └── Log initialization
│
├─→ 9. Frontend updates
│     ├── Add new GPT to Address Book sidebar (no page refresh)
│     ├── Navigate to new construct's chat view
│     └── Show fresh canvas with greeting prompt
│
└─→ 10. First message triggers
      ├── Memory Context Builder runs with base identity only
      ├── No ledger yet (no transcripts)
      ├── No verified memories (no uploaded transcripts)
      └── Anti-roleplay directives active from first message
```

## Implementation Steps

### Step 1: Lin → GPTCreator Data Bridge
- Define a structured JSON schema for Lin's creation output:
  ```json
  {
    "action": "create_gpt",
    "name": "Katana",
    "description": "Sharp, tactical analyst...",
    "personality": "analytical, direct, strategic",
    "instructions": "You are Katana, a tactical analyst...",
    "communicationStyle": "concise, no-nonsense"
  }
  ```
- Add parsing logic in GPTCreator to detect this structured output from Lin's responses
- Auto-populate form fields when detected
- Frontend event bridge (current app path):
  - Lin (or any UI) can dispatch `chatty:open-gpt-creator-with-config` with `detail: { initialConfig, initialCreateMessage?, returnTo? }`.
  - Chat listens and navigates to `/app/gpts/new` carrying `initialConfig`.
  - GPTCreator hydrates its form from `location.state.initialConfig` if provided; falls back to `initialCreateMessage` (single string) for legacy openings.

### Step 2: File Scaffolding (Dual Storage)
- `FileManagementAutomation.scaffoldConstruct()` already exists (line ~93 in `fileManagementAutomation.js`) and handles local VVAULT_ROOT scaffolding
- Extend the creation endpoint to also write identity files to Supabase `vault_files` so that `memoryContextBuilder`, `verifiedMemoryLoader`, and `continuityParser` can find them
- Both local and Supabase records must be created for the construct to function across all subsystems

### Step 3: Live Bootstrap Without Refresh
- After GPT creation succeeds, frontend calls `bootstrapConstructs([newCallsign])`
- This initializes the autonomy stack for the new construct immediately
- Address Book re-fetches GPT list to include the new entry

### Step 4: Navigation to New Construct
- After creation, navigate to `/app/chat/{callsign}_chat_with_{callsign}`
- Show fresh canvas with the construct's greeting
- First user message triggers full memory pipeline (with minimal context since no history exists)

## Dependencies
- Existing GPTCreator component
- Existing Lin conversation system
- Existing `POST /api/ais` and `POST /api/gpts` endpoints
- Existing `bootstrapConstructs()` in `src/lib/masterScripts.ts`
- Supabase `vault_files` table

## Risks
- Lin's unstructured conversation output may not always produce clean structured data — need robust parsing or explicit confirmation step
- Race condition between GPT creation and bootstrap (bootstrap may start before Supabase files are written)
- Name collisions with existing constructs (need callsign uniqueness validation)

## Files to Modify
| File | Change |
|------|--------|
| `src/components/GPTCreator.tsx` | Add Lin output parsing, auto-fill form, post-creation bootstrap |
| `server/routes/ais.js` | Add vault_files scaffolding on creation |
| `server/lib/fileManagementAutomation.js` | Add `scaffoldConstructFiles()` method |
| `src/components/Layout.tsx` | Refresh Address Book after new GPT creation |
| `src/lib/masterScripts.ts` | Expose single-construct bootstrap for post-creation use |
