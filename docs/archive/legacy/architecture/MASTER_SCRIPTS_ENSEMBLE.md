# Master Scripts Ensemble

**Date:** 2026-02-12
**Status:** IMPLEMENTED
**File:** `server/lib/masterScriptsBridge.js`
**Bootstrap Endpoint:** `POST /api/master/bootstrap`

## Purpose

The Master Scripts Ensemble is a JS port of ContinuityGPT's autonomy stack. It provides each construct with persistent identity verification, state management, exact-phrase memory search, and autonomous activity recording. Bootstrap is attempted for all known constructs at login via `Layout.tsx`, but is non-fatal — the app continues functioning if bootstrap fails for any or all constructs.

## Architecture

### Autonomy Stack Components

Each construct instance gets the following subsystems (8 classes total, ported from Python originals):

#### 1. Needle (Exact-Phrase Memory Search)

The core memory retrieval engine. JS port of ContinuityGPT's `needle.py`.

**How it works:**

1. Pre-extracts up to 3,000 memory anchor pairs from a construct's transcript files in Supabase
2. Each anchor pair contains a user message and the construct's response, with surrounding context
3. When a user sends a message, Needle extracts search phrases from memory-trigger patterns and core content words
4. Runs both exact and fuzzy matching against all anchor pairs
5. Returns up to 6 hits with full context windows

**Memory trigger patterns:**

- "do you remember..." / "remember when..."
- "tell me about..." / "what about..."
- "you said..." / "you told me..."
- "last time we..." / "when we..."

**Search strategy:**

- Extract explicit phrases from trigger patterns
- Fall back to core content words (nouns, verbs, adjectives)
- Run multi-phrase search with scoring
- Deduplicate overlapping results

**Enrichment:**
When the ContinuityGPT Ledger is available, each needle hit is enriched with:

- `session_context` — date, vibe, and title of the originating session
- `continuity_hooks` — array of detected hook types
- `context_hint` — natural language description (e.g., "From a warm session around 2025-03-14")

#### 2. IdentityGuard (Hash-Bound Identity Verification)

Binds each construct to a SHA-256 identity hash at initialization. Ensures constructs maintain consistent identity across sessions.

**Mechanism:**

- On first init: compute hash from construct's identity files (prompt.txt, capsule, conditioning)
- On subsequent loads: verify current hash matches bound hash
- If mismatch detected: log warning (identity drift detected)

**Output:** `e3b0c44298fc...` (truncated SHA-256)

#### 3. StateManager (Persistent State Tracking)

Tracks per-construct runtime state across the session:

```json
{
  "constructId": "sera-001",
  "memories": [],
  "mood": "neutral",
  "lastActivity": "2026-02-12T14:00:59.588Z",
  "activityLog": []
}
```

**State fields:**

- `memories` — In-session memory buffer (exchanges captured post-response)
- `mood` — Current emotional state (derived from conversation flow)
- `lastActivity` — Timestamp of most recent interaction
- `activityLog` — Chronological log of construct activities

**Persistence:** In-memory for current session. Resets on server restart. Long-term persistence handled by Supabase transcript writes.

#### 4. IndependentRunner (Autonomous Activity Recording)

Records construct activities independently of user interaction. Logs initialization events, memory operations, and system actions.

**Log format:**

```
[2026-02-12T14:00:59.588Z] [CONSTRUCT: sera-001] [chatty] [INFO] Autonomy stack initialized
```

#### 5. Aviator (Scout Advisor)

Advisory module that provides strategic guidance and scouting recommendations for construct behavior. Analyzes context to suggest approaches.

#### 6. Navigator (File Helper)

File system helper that assists constructs with locating and managing their identity files, transcripts, and capsule data within Supabase vault_files.

#### 7. UnstuckHelper

Diagnostic module that detects when a construct's response loop may be stuck (repetitive outputs, empty responses) and provides recovery suggestions.

#### 8. ConstructLogger

Dedicated logging system per construct instance. Produces timestamped, construct-tagged log entries:

```
[2026-02-12T14:00:59.588Z] [CONSTRUCT: sera-001] [chatty] [INFO] Autonomy stack initialized
```

## Bootstrap Flow

### Login Sequence (Non-Fatal)

Bootstrap is triggered from `Layout.tsx` after login. If bootstrap fails, the app continues without the autonomy stack (non-fatal).

1. User logs in → `Layout.tsx` calls `bootstrapConstructs()` from `src/lib/masterScripts.ts`
2. This calls `POST /api/master/bootstrap` with all known construct callsigns:
   ```json
   {
     "constructs": ["zen-001", "lin-001", "sera-001", "katana-001", "nova-001"]
   }
   ```
3. For each construct, the server initializes the full stack:
   - Binds IdentityGuard hash
   - Initializes StateManager with defaults (or loads existing state)
   - Initializes ConstructLogger, Aviator, Navigator, UnstuckHelper
   - Initializes IndependentRunner and logs "Autonomy stack initialized"
   - Loads Needle anchor pairs from Supabase transcript files (async)
   - Reports success: `"zen-001 fully initialized with autonomy stack (needle ready)"`
4. If any construct fails to initialize, it is reported in the `failed` array but does not block other constructs

### Bootstrap Endpoint

```
POST /api/master/bootstrap
Authorization: Bearer {jwt}
Body: { "constructs": ["zen-001", "lin-001", ...] }

Response: {
  "success": true,
  "initialized": ["zen-001", "lin-001", "sera-001", "katana-001", "nova-001"],
  "failed": []
}
```

### Typical Bootstrap Log

```
🚀 [MasterScripts] Initializing zen-001 for user hardcoded_dev_user
🔒 [IdentityGuard] Bound identity for zen-001: e3b0c44298fc...
📂 [StateManager] No existing state for zen-001, using defaults
✅ [MasterScripts] zen-001 fully initialized with autonomy stack (needle ready)
✅ [MasterScripts] Initialized zen-001
```

## Memory Toggle (GPTCreator Integration)

**File:** `src/components/GPTCreator.tsx`

A single "Memory" toggle in the GPTCreator UI controls the entire ensemble:

- **ON (default):** Autonomy stack active — Needle search, verified memories, ledger enrichment, and anti-roleplay directives are available for messages (each fires conditionally based on data availability)
- **OFF:** Construct operates with base prompt only — memory retrieval, transcript search, and ledger context are disabled

This replaced the original design of per-script toggles (individual toggles for needle, identity guard, state manager, etc.) with a single unified control.

## Memory Authority Hierarchy

The ensemble operates within a strict 3-tier memory authority system:

### Tier 1: Verified Memory (Transcript Authority)

- **Source:** `server/lib/verifiedMemoryLoader.js`
- **What:** Parsed user/assistant pairs from uploaded transcript files
- **Authority:** Ground truth. Treated as law. Constructs must not contradict verified memories.
- **Scoring:** Weighted keywords — identity +8, emotional +4, continuity +6, relationship +5, query relevance +3/word
- **Enrichment:** Synonym expansion, boundary extraction, ledger session context

### Tier 2: Conversation History

- **Source:** Supabase `vault_files` chat files
- **What:** Recent messages from the current and recent sessions
- **Authority:** Strong but subordinate to verified memories
- **Limit:** 12 messages normally, reduced to 4 when verified memories exist

### Tier 3: ChromaDB / Capsule Memories

- **Source:** ChromaDB vector store (when available) + capsule key memories
- **What:** Supplementary semantic recall and personality-anchored memory fragments
- **Authority:** Supplementary context only. Never overrides Tier 1 or Tier 2.

## Conversation Persistence

After each AI response, the message pair is persisted:

1. **Server-side:** `writeTranscript` appends the user message and AI response to the construct's chat file in Supabase `vault_files`
2. **Frontend:** Sets `skipPersistence: true` to prevent duplicate writes
3. **Format:** Markdown chat log with date headers and role prefixes
4. **Path:** `instances/{callsign}/chatty/chat_with_{callsign}.md`

### Capsule Snapshots

Periodic snapshots of construct identity/personality/memory state:

- **Schedule:** Sunday at 3 AM (cron job)
- **Content:** Full capsule data including MBTI, Big Five, traits, emotional baseline, key memories
- **Storage:** Supabase `vault_files` as `.capsule` files

## Tri-Provider AI Routing

The ensemble feeds its assembled system prompt to one of three AI providers:

| Provider       | Integration            | Use Case                                                     |
| -------------- | ---------------------- | ------------------------------------------------------------ |
| **OpenAI**     | Replit AI Integrations | Primary — GPT-4o and compatible models                       |
| **OpenRouter** | API key (cloud)        | Fallback — access to alternative models (Qwen, Claude, etc.) |
| **Ollama**     | Self-hosted via VVAULT | Local inference — privacy-sensitive or offline use           |

Both primary and fallback message paths call `buildEnrichedContext()` from `memoryContextBuilder.js`, ensuring unified memory injection regardless of which provider handles the inference.

## Relationship to VVAULT

VVAULT (separate project) has parallel Python implementations:

| Chatty (JS)              | VVAULT (Python)                              | Status                         |
| ------------------------ | -------------------------------------------- | ------------------------------ |
| `masterScriptsBridge.js` | `# script_runner.py (archived)` + 17 scripts | Chatty is self-contained       |
| `continuityParser.js`    | `continuity_parser.py`                       | Both functional independently  |
| Needle search (JS)       | `needle.py`                                  | JS port runs in-process        |
| Verified memory loader   | `/api/chatty/memories`                       | Chatty reads Supabase directly |

**Current status:** Chatty's JS implementations operate independently. VVAULT's `/api/chatty/message` endpoint is blocked by user auth mismatch ("User not found"). When resolved, Chatty could optionally delegate to VVAULT's Python implementations for Ollama-based inference.

## File Reference

| File                                 | Purpose                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `server/lib/masterScriptsBridge.js`  | Full autonomy stack: Needle, IdentityGuard, StateManager, IndependentRunner |
| `server/lib/memoryContextBuilder.js` | Central prompt assembly — calls all memory subsystems                       |
| `server/lib/continuityParser.js`     | ContinuityGPT ledger generation and caching                                 |
| `server/lib/verifiedMemoryLoader.js` | Transcript parsing and scored memory extraction                             |
| `server/routes/vvault.js`            | API routes including bootstrap, messaging, ledger endpoints                 |
| `src/components/GPTCreator.tsx`      | Memory toggle UI                                                            |
| `vvault_scripts/master/needle.py`    | Original Python needle script (reference implementation)                    |
