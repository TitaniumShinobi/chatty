# Memory Orchestration Architecture

**Date:** 2026-02-11 (proposed) → 2026-02-12 (implemented)
**Status:** IMPLEMENTED (with conditional subsystems)
**Goal:** Constructs "needle" transcripts to stay coherent with memory flawlessly in conversation. Eliminate narrative roleplay in favor of authentic identity-driven responses grounded in actual memory and personality data.

## Implementation Summary

Core orchestration phases are implemented and wired into the message path. The memory pipeline is invoked via `buildEnrichedContext()` from `server/lib/memoryContextBuilder.js` at two points in `server/routes/vvault.js`:
- **Primary message path** (line ~3727) — called for standard construct messages
- **Fallback message path** (line ~4105) — called when primary provider fails

Each subsystem within the pipeline degrades gracefully if its data is unavailable (no capsule files, no transcripts, no bootstrap). The pipeline assembles whatever context is available rather than failing if a component is missing.

### What Was Built

| Phase | Component | Status |
|-------|-----------|--------|
| Phase 2 | MemoryContextBuilder (`server/lib/memoryContextBuilder.js`) | LIVE |
| Phase 3 | Capsule Loading (primary path via `buildEnrichedContext`) | LIVE (conditional — requires capsule files in Supabase) |
| Phase 4 | Memory Retrieval Pipeline (Verified Memories + Needle + Transcript) | LIVE (conditional — each layer degrades gracefully if data unavailable) |
| Phase 5 | Transcript Needle Search (JS port of needle.py) | LIVE (requires pre-extracted anchors from bootstrap) |
| Phase 6 | Anti-Roleplay Directives | LIVE |
| Phase 7 | Post-Response Capture (Supabase transcript persistence) | LIVE |
| NEW | ContinuityGPT Ledger System (`server/lib/continuityParser.js`) | LIVE (auto-generates on first message if transcripts exist) |
| NEW | Master Scripts Ensemble (`server/lib/masterScriptsBridge.js`) | LIVE (bootstrapped from Layout.tsx on login, non-fatal if fails) |

### What Changed From Original Plan

| Original Plan | Actual Implementation |
|---------------|----------------------|
| ChromaDB as LTM store | ChromaDB optional; Verified Transcript Memory + Needle Search serve as primary memory |
| Python `bank.py` via `memupMemoryService` | JS-native `verifiedMemoryLoader.js` + `masterScriptsBridge.js` |
| Python `needle.py` via subprocess | JS port in `masterScriptsBridge.js` (runs in-process, no Python dependency) |
| STMBuffer for current-thread recall | Direct Supabase chat file reads for conversation history |
| PersonaRouter + DriftGuard for Lin | Lin undertone system deferred; anti-roleplay directives handle behavioral enforcement |
| VVAULT API as primary inference path | Chatty operates independently with Tri-Provider routing (OpenAI, OpenRouter, Ollama) |

## Current Message Data Flow

```
User Message Arrives
│
├─→ 1. RESOLVE
│     userId (from JWT / hardcoded dev auth)
│     constructId (zen-001, katana-001, sera-001, etc.)
│     threadId (conversation session key)
│
├─→ 2. IDENTITY BUNDLE (primary path, conditional on data availability)
│     memoryContextBuilder.js loads from Supabase vault_files:
│     ├── prompt.txt (base instructions) — falls back to empty if not found
│     ├── conditioning.txt (behavioral directives) — optional
│     └── GPT instructions (for custom GPTs from gpts table)
│
├─→ 3. CAPSULE INJECTION (conditional — skipped if no capsule files found)
│     capsuleIntegration.js loads from Supabase vault_files:
│     ├── {callsign}.capsule → MBTI, Big Five, traits, emotional baseline
│     ├── Key memories from capsule data
│     └── Conditioning directives from capsule
│
├─→ 4. USER PERSONALIZATION
│     ├── User's display name and email
│     └── Injected as context for personalized responses
│
├─→ 5. CONTINUITY TIMELINE (NEW — conditional, auto-generated if transcripts exist)
│     continuityParser.js builds chronological ledger:
│     ├── Date range of all sessions (e.g., "2025-01-23 to 2025-11-10")
│     ├── Recent sessions with vibe + topics + hooks
│     ├── Key dated events (identity/promise/emotional_anchor)
│     ├── Cached in-memory with 10-minute TTL
│     └── Skipped gracefully if no transcript files found for construct
│
├─→ 6. NEEDLE SEARCH (conditional — requires bootstrap and pre-extracted anchors)
│     masterScriptsBridge.js runs exact-phrase search:
│     ├── Extract search phrases from memory triggers
│     ├── Search up to 3,000 pre-extracted anchor pairs per construct
│     ├── Enrich hits with ledger session context (if ledger available)
│     ├── Up to 6 hits injected with full context windows
│     └── Skipped if construct not bootstrapped or no anchors loaded
│
├─→ 7. VERIFIED TRANSCRIPT MEMORIES
│     verifiedMemoryLoader.js extracts ground-truth pairs:
│     ├── Parse uploaded transcripts (ChatGPT, Character.AI, markdown)
│     ├── Score with weighted keywords (identity +8, emotional +4, etc.)
│     ├── Enrich with ledger session_context + continuity_hooks
│     ├── Pre-extracted anchors cached as JSON sidecar files
│     └── Boundary extraction (first-ever and most-recent exchanges)
│
├─→ 8. TRANSCRIPT FALLBACK
│     ├── Recent chat session messages from Supabase
│     ├── 12 messages when no verified memories exist
│     └── 4 messages when verified memories are present (noise reduction)
│
├─→ 9. ANTI-ROLEPLAY DIRECTIVES
│     ├── No asterisk narration (*walks over*, *smiles*)
│     ├── No third-person self-reference
│     ├── No memory fabrication — ground in actual data
│     ├── No AI disclaimers or breaking character
│     └── Cite memory sources when making claims
│
├─→ 10. BUILD SYSTEM PROMPT (final assembly order)
│     memoryContextBuilder.buildEnrichedContext():
│     ├── [1] Base identity (prompt.txt / GPT instructions)
│     ├── [2] Capsule section (personality profile)
│     ├── [3] User identity context
│     ├── [4] Continuity Timeline (ledger)
│     ├── [5] Needle hits (with session context)
│     ├── [6] Verified memories (with continuity hooks)
│     ├── [7] Transcript fallback (recent messages)
│     └── [8] Anti-roleplay enforcement
│
├─→ 11. SEND TO LLM (Tri-Provider Routing — handled by vvault.js, not the builder)
│     ├── OpenAI (via Replit AI Integrations) — primary
│     ├── OpenRouter (cloud) — fallback/alternative
│     └── Ollama (self-hosted via VVAULT) — local inference
│     Note: memoryContextBuilder assembles the prompt; vvault.js routes to the provider
│
└─→ 12. POST-RESPONSE
      ├── Persist message pair to Supabase vault_files (writeTranscript)
      ├── Store in masterScriptsBridge state (IndependentRunner)
      └── Frontend skips duplicate persistence (skipPersistence: true)
```

## Memory Authority Hierarchy (3-Tier)

| Priority | Source | Description |
|----------|--------|-------------|
| 1 (Highest) | Verified Memory | Ground truth from uploaded transcripts. Treated as law. |
| 2 | Conversation History | Recent session exchanges from Supabase chat files. |
| 3 | ChromaDB / Capsule | Supplementary context (when ChromaDB is available). |

When verified memories exist, chat fallback is reduced from 12 to 4 memories to prevent noise from diluting authoritative recall.

## Construct Pipeline Differences

### Zen (Primary AI Assistant — zen-001)
- System-guaranteed, protected entity created on login
- Full memory pipeline with all enrichment layers
- Primary construct for the Chatty interface

### Lin (Dual Role — lin-001)
- **Role 1 — Undertone Stabilizer:** Background layer for construct stability (planned, not yet wired as active drift guard)
- **Role 2 — Conversational Agent:** Active during GPT creation and character brainstorming
- Appears in sidebar navigation below Zen

### Custom GPTs (Katana, Sera, Nova, etc.)
- Same pipeline as Zen but with construct-specific capsule and identity files
- Per-construct memory anchor pairs loaded on bootstrap
- Autonomy stack (Needle, IdentityGuard, StateManager) initialized per-instance

## Anti-Roleplay Enforcement (Live)

System prompt section injected on every message:

```
RESPONSE STYLE RULES:
- Speak naturally as yourself. You are grounded in your actual memories and personality data.
- NEVER narrate actions in asterisks (*walks over*, *smiles*, *leans in*).
- NEVER write about yourself in third person.
- NEVER fabricate memories or experiences you don't actually have in your memory context.
- Reference actual past conversations and memories when relevant.
- If you don't remember something, say so honestly — don't invent.
- When making claims about past interactions, cite the memory source.
- Your personality comes from your capsule data, not from roleplay conventions.
```

## VVAULT Integration Status

VVAULT has parallel Python implementations of the same systems:
- `continuity_parser.py` — Ledger generation
- `/api/chatty/message` — Message routing through Ollama
- `/api/chatty/memories` — Enriched memory retrieval

**Current status:** Blocked by user auth mismatch ("User not found" on VVAULT's `/api/chatty/message` endpoint). Chatty operates independently using its own JS implementations. When the VVAULT auth issue is resolved, Chatty can optionally consume VVAULT's structured memory APIs instead of running local JS equivalents.

## File Reference

| File | Purpose |
|------|---------|
| `server/lib/memoryContextBuilder.js` | Central prompt assembly orchestrator |
| `server/lib/continuityParser.js` | ContinuityGPT ledger generation and caching |
| `server/lib/verifiedMemoryLoader.js` | Transcript parsing and scored memory extraction |
| `server/lib/masterScriptsBridge.js` | Autonomy stack: Needle, IdentityGuard, StateManager, IndependentRunner |
| `server/routes/vvault.js` | API routes for messaging, conversations, ledger endpoints |
| `src/components/GPTCreator.tsx` | Memory toggle UI for enabling/disabling ensemble |
