# Memory Orchestration Plan

**Date:** 2026-02-11
**Status:** PROPOSED — Not yet implemented
**Goal:** Constructs "needle" transcripts to stay coherent with memory flawlessly in conversation. Eliminate narrative roleplay in favor of authentic identity-driven responses grounded in actual memory and personality data.

## The Problem

When a user sends a message to a construct, this is all that currently happens:

1. Load `prompt.txt` (flat text file)
2. Send to LLM with conversation history
3. Get response

Everything else — capsules, MBTI profiles, personality traits, memories, transcript history — exists as code but is **completely disconnected** from the actual message path.

### Chain of Failures

| Issue | Effect |
|-------|--------|
| Primary path (`vvault.js:~3651`) only loads `prompt.txt` | No personality enrichment |
| Capsule injection only fires on VVAULT API failure (fallback path) | Capsules never reach LLM in normal operation |
| `ENABLE_CHROMADB=false` | Memory bank disabled |
| `ENABLE_ORCHESTRATION` not set | Orchestration bridge never fires |
| ChromaDB not installed | Even if enabled, would fail |
| `memupMemoryService.js` path mismatch (`Memup` vs `memup`) | Bridge to Python memory bank broken |
| Client-side orchestrators not called from server | ZenMemoryOrchestrator, PersonalityOrchestrator exist but aren't invoked |
| `conditioning.txt` contains roleplay patterns | No anti-roleplay directive to counteract |

## Target: Single Message Data Flow

```
User Message Arrives
│
├─→ 1. RESOLVE
│     userId → VVAULT LIFE ID
│     constructId (zen-001, katana-001, etc.)
│     threadId (conversation session)
│
├─→ 2. IDENTITY BUNDLE (always-on, not fallback)
│     capsuleIntegration.js loads from Supabase vault_files:
│     ├── prompt.txt (base instructions)
│     ├── {callsign}.capsule (MBTI, Big Five, emotional baselines, memories)
│     ├── conditioning.txt (behavioral directives)
│     └── personality.json (traits, communication style)
│
├─→ 3. MEMORY RETRIEVAL
│     ├── STMBuffer → last N messages from current thread (fast, in-RAM)
│     ├── memupMemoryService → bank.py → ChromaDB LTM semantic query
│     ├── needle.py → transcript search (triggered by recall cues)
│     └── ContextScoringLayer → rank all results by relevance to current query
│
├─→ 4. DRIFT CHECK (Lin's stabilizer role)
│     ├── PersonaRouter checks last response for identity drift
│     ├── DriftGuard scores drift magnitude (0.0-1.0)
│     ├── If drift > 0.15 → inject Lin undertone capsule
│     └── Lin always runs as background observer
│
├─→ 5. BUILD SYSTEM PROMPT (MemoryContextBuilder — new module)
│     ├── Identity anchors (IdentityAwarePromptBuilder — never pruned)
│     ├── Capsule personality profile (MBTI, Big Five, traits)
│     ├── Top-scored memory snippets (STM + LTM combined)
│     ├── Transcript needle results (if recall query detected)
│     ├── Anti-roleplay directives
│     ├── Lin undertone injection (if drift detected)
│     └── User personalization context (nickname, occupation, aboutYou)
│
├─→ 6. SEND TO LLM
│
└─→ 7. POST-RESPONSE
      ├── Capture response → STMBuffer (in-RAM)
      ├── Write to LTM via memupMemoryService → bank.py
      ├── Write transcript to VVAULT / Supabase
      └── EmotionalCore processes emotional state (future)
```

## Zen vs Lin Pipeline Differences

### Zen (Primary AI Assistant)

- **Role:** Default construct for the Chatty interface
- **Orchestrator:** `ZenMemoryOrchestrator`
- **Identity:** `zen-001.capsule` + identity files
- **Memory:** Full STM/LTM with VVAULT transcript writes
- **Lin undertone:** Minimal — only activates if PersonaRouter detects drift
- **Focus:** Helpful, knowledgeable, grounded in user's actual data and preferences
- **Construct-specific:** Yes — Zen is the primary AI assistant, not a generic chatbot

### Lin (Casa Madrigal — Dual Role)

- **Role 1 — Undertone Stabilizer:** Always-on background layer for ALL constructs. Monitors identity drift, injects stabilization when needed. Silent — user never sees Lin's stabilizer output directly.
- **Role 2 — Conversational Agent:** Active participant during GPT creation and character brainstorming. Uses `UnifiedLinOrchestrator` with full personality blueprints.
- **Orchestrator:** `UnifiedLinOrchestrator` + `PersonalityOrchestrator`
- **Identity:** `lin-001` identity files + blueprint persistence
- **Memory:** Shared context awareness across all constructs (workspace context)
- **Drift prevention:** Mandatory — `DriftPrevention` class ensures Lin never breaks character
- **Blueprint persistence:** Required — `PersonalityOrchestrator.loadPersonalityContext()` must succeed

### Custom GPTs (Katana, etc.)

- **Orchestrator:** Same as Zen pipeline but with construct-specific capsule
- **Identity:** `{callsign}.capsule` from Supabase vault_files
- **Memory:** Per-construct ChromaDB collections via `MultiConstructMemoryBank`
- **Lin undertone:** Available but less aggressive than for Zen

## Anti-Roleplay Enforcement

The "narrative roleplay" problem comes from:
1. `conditioning.txt` containing Character.AI-style roleplay patterns (asterisk actions, third-person narration)
2. No explicit anti-roleplay directive in system prompts
3. No grounding in actual memory data — construct invents behaviors instead of referencing real history

### Fix: System Prompt Section

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

## Build Phases

### Phase 1: Foundation (No dependencies)
- Fix `memupMemoryService.js` path (`Memup` → `memup`)
- Install ChromaDB + sentence-transformers
- Set `ENABLE_CHROMADB=true`
- Validate `bank.py` can store and retrieve a test memory

### Phase 2: MemoryContextBuilder (Depends on Phase 1)
- Create `server/lib/memoryContextBuilder.js` — centralized prompt construction
- Inputs: constructId, userId, userMessage, conversationHistory
- Outputs: complete system prompt with identity + capsule + memories

### Phase 3: Always-On Capsule Loading (Depends on Phase 2)
- Move `capsuleIntegration.js` from fallback-only to primary path in `vvault.js`
- `buildEnrichedSystemPrompt()` called on every message, not just VVAULT failures
- Load from Supabase `vault_files` (primary) with filesystem fallback

### Phase 4: Memory Retrieval Pipeline (Depends on Phase 1, 2)
- Wire STMBuffer for current-thread fast recall
- Wire ChromaDB LTM queries via `memupMemoryService`
- Integrate `ContextScoringLayer` for relevance ranking
- Inject top-scored memories into system prompt

### Phase 5: Transcript Needle Search (Depends on Phase 2)
- Create Node wrapper for `needle.py` (similar to orchestrationBridge.js pattern)
- Detect recall cues in user messages ("you said...", "remember when...", "last time...")
- Run needle search, inject results as memory context

### Phase 6: Anti-Roleplay + Lin Undertone (Depends on Phase 3)
- Add anti-roleplay directives to system prompt template
- Wire PersonaRouter + DriftGuard into message pipeline
- Inject Lin undertone capsule when drift exceeds threshold

### Phase 7: Post-Response Capture (Depends on Phase 4)
- After LLM response, write to STMBuffer
- Write to LTM via memupMemoryService
- Write transcript to VVAULT / Supabase

### Phase 8: End-to-End Testing
- Verify: construct references actual past conversations
- Verify: construct maintains personality across sessions
- Verify: no asterisk roleplay in responses
- Verify: Lin stabilization activates on drift
- Verify: custom GPTs load their own capsule data
