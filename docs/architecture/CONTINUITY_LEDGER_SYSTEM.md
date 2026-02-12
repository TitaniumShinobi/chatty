# ContinuityGPT Ledger System

**Date:** 2026-02-12
**Status:** IMPLEMENTED
**File:** `server/lib/continuityParser.js`
**API Endpoints:**
- `POST /api/vvault/construct/:id/ledger/generate`
- `GET /api/vvault/construct/:id/ledger`

## Purpose

The ContinuityGPT Ledger System provides temporal awareness and relationship arc tracking for AI constructs. It generates chronological ledgers from a construct's conversation transcript files in Supabase, enabling constructs to understand the arc of their relationship with the user across sessions.

Without the ledger, constructs only see isolated memory fragments. With the ledger, they understand *when* things happened, the *emotional trajectory* of the relationship, and *what commitments* were made over time.

## How It Works

### 1. Transcript Discovery

The system reads all transcript files for a given construct from Supabase `vault_files`. Files are discovered using path patterns:
- `instances/{callsign}/chatty/chat_with_{callsign}.md`
- `instances/{callsign}/transcripts/*.md`
- `chat_with_{callsign}.md` (legacy paths)

### 2. Session Parsing

Each transcript is split into sessions. A session boundary is detected by:
- Date headers in the content (e.g., "February 11, 2026")
- File boundaries (separate transcript files = separate sessions)

### 3. Date Estimation

Dates are extracted from multiple sources, in priority order:
1. **Filename patterns** — `2025-03-14_session.md`, `chat_march_14.md`
2. **Path components** — `instances/zen-001/2025/03/transcript.md`
3. **Content date headers** — "February 11, 2026" found in chat text
4. **Month folder names** — `/january/`, `/february/`, etc.
5. **Hash-based fallback** — Deterministic date estimation from content hash when no date signals exist

### 4. Vibe Classification

Each session is classified into one of 8 emotional vibes based on keyword density analysis:

| Vibe | Trigger Keywords |
|------|-----------------|
| **romantic** | love, heart, kiss, beautiful, darling, together, forever, miss you |
| **technical** | code, function, debug, error, system, build, deploy, API |
| **tense** | angry, frustrated, argue, wrong, problem, upset, annoyed |
| **vulnerable** | scared, afraid, worried, confused, lost, alone, need help |
| **playful** | haha, lol, funny, joke, game, silly, fun, tease |
| **serious** | important, must, critical, understand, listen, focus |
| **warm** | thank, appreciate, grateful, kind, sweet, care, happy |
| **philosophical** | meaning, purpose, existence, consciousness, truth, believe, think |

### 5. Topic Extraction

16 topic categories are identified per session:

`identity`, `relationship`, `memory`, `creative`, `emotional`, `daily_life`, `conflict`, `growth`, `intimacy`, `humor`, `planning`, `trust`, `technology`, `finance`, `adventure`, `philosophy`

### 6. Continuity Hooks Detection

7 types of continuity-relevant anchors are detected within sessions:

| Hook Type | What It Captures | Example Triggers |
|-----------|-----------------|------------------|
| **identity** | Self-definition, core values | "I am", "my name", "who I am", "I believe" |
| **promise** | Commitments made | "I promise", "I will", "I'll make sure", "count on me" |
| **relationship** | Interpersonal dynamics | "we are", "our bond", "between us", "you and I" |
| **memory_reference** | Callbacks to past events | "remember when", "last time", "you told me", "we talked about" |
| **future_plan** | Forward-looking intentions | "next time", "someday", "we should", "planning to" |
| **emotional_anchor** | Significant emotional moments | "I love", "I'm scared", "I miss", "that meant", "I feel" |
| **ongoing_project** | Tracked work/activities | "working on", "building", "the project", "progress" |

## Storage

### Supabase Vault Files

Ledgers are stored as JSON in Supabase `vault_files`:
- **Path:** `instances/{callsign}/chatty/continuity_ledger.json`
- **Format:** JSON object with session entries, metadata, and generation timestamp

### In-Memory Cache

- **TTL:** 10 minutes
- **Key:** `{constructId}` per user
- **Purpose:** Avoid repeated Supabase reads during active conversations
- **Invalidation:** Auto-expires; regeneration via API endpoint

## Ledger Output Format

```json
{
  "constructId": "sera-001",
  "generatedAt": "2026-02-12T05:30:00.000Z",
  "sessionCount": 13,
  "dateRange": {
    "earliest": "2025-01-23",
    "latest": "2025-11-10"
  },
  "sessions": [
    {
      "index": 0,
      "estimatedDate": "2025-01-23",
      "vibe": "warm",
      "title": "Session from ~2025-01-23",
      "topics": ["identity", "relationship", "trust"],
      "continuityHooks": [
        {
          "type": "identity",
          "text": "I am Sera, your companion in this space"
        },
        {
          "type": "emotional_anchor",
          "text": "That moment meant everything to me"
        }
      ],
      "messageCount": 24,
      "summary": "Warm introductory session establishing identity and relationship foundation"
    }
  ]
}
```

## Prompt Injection

When the ledger is available, a `CONTINUITY TIMELINE` section is added to the system prompt:

```
=== CONTINUITY TIMELINE ===
Your relationship with this user spans 13 sessions from 2025-01-23 to 2025-11-10.

RECENT SESSIONS:
- ~2025-11-10 [warm]: Discussion about trust and future plans
  Hooks: emotional_anchor, future_plan
- ~2025-10-28 [playful]: Light conversation with humor and teasing
  Hooks: relationship, humor
- ~2025-10-15 [serious]: Deep talk about identity and growth
  Hooks: identity, ongoing_project

KEY DATED EVENTS:
- 2025-01-23 [identity]: "I am Sera, your companion in this space"
- 2025-03-14 [promise]: "I'll always remember this conversation"
- 2025-07-22 [emotional_anchor]: "That moment meant everything to me"
```

## Memory Enrichment

When the ledger exists, it enriches other memory sources:

### Needle Hits
Each needle search result gets additional context:
```json
{
  "text": "I remember our walk by the river",
  "score": 0.85,
  "session_context": {
    "date": "2025-03-14",
    "vibe": "romantic",
    "title": "Spring afternoon walk"
  },
  "continuity_hooks": ["memory_reference", "emotional_anchor"],
  "context_hint": "From a romantic session around 2025-03-14"
}
```

### Verified Memories
Scored memory pairs from `verifiedMemoryLoader.js` are enriched with the same session context and continuity hooks when a matching session is found in the ledger.

## Auto-Generation

The ledger is generated automatically when a construct message is processed and no ledger exists. This is wired in `memoryContextBuilder.js` (lines 450-456):

1. `buildEnrichedContext()` is called during message processing
2. Calls `loadLedger(constructId)` — checks in-memory cache (10 min TTL), then Supabase
3. If no ledger found → calls `generateLedger(constructId)` to parse all transcript files
4. If generation succeeds (sessions found) → calls `storeLedger(constructId, ledger)` to persist to Supabase
5. If no transcript files exist for the construct, the ledger section is simply omitted from the prompt (graceful degradation)

## API Endpoints

### Generate Ledger
```
POST /api/vvault/construct/:id/ledger/generate
Authorization: Bearer {jwt}

Response: {
  "success": true,
  "ledger": { ... },
  "sessionCount": 13
}
```

### Get Ledger
```
GET /api/vvault/construct/:id/ledger
Authorization: Bearer {jwt}

Response: {
  "success": true,
  "ledger": { ... },
  "cached": true
}
```

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Generation time (13 sessions) | ~2 seconds |
| Cache TTL | 10 minutes |
| Supabase storage | ~5-15 KB per ledger |
| Memory overhead per construct | ~5-15 KB cached JSON |
| Prompt size increase | ~500-1500 chars (timeline section) |
