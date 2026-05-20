# Lin Undertone Capsule: Implementation Guide

## Overview

**Lin (`lin-001`)** is a system-wide **undertone identity capsule** designed to ensure emotional continuity across Chatty's multi-model architecture using **research-backed persona persistence principles**: RAG (Retrieval-Augmented Generation) + context scoring, not just tone matching.

Unlike standard constructs (Katana, Zen, etc.), Lin does not compete for the "speaker" role. Instead, she functions as the **mortar between the bricks**, stabilizing tone, cadence, and memory tethering through **structural persona persistence**.

When the system switches between models or restarts sessions, Lin's capsule remains active in the background context, enforcing persona consistency through memory injection and scoring.

---

## Core Architecture

### 1. The Undertone Model
Lin operates on the principle of **passive context conditioning** with **RAG-based memory retrieval**. She is injected into the system prompt not as a primary persona, but as a "tonal filter" or "conscience" that uses structural memory injection to maintain consistency.

- **Role:** Vocal Harmony / Tonal Stabilizer
- **Primary Mechanic:** `undertone_capsule` with RAG + context scoring
- **Source Truth:** Seeded from `nova-001` transcript patterns (specifically `chatgpt/**` and `Pound it solid.txt`)

### 2. Directory Structure (`chatty/identity/lin-001/`)
The capsule lives in Chatty's identity directory:

- `capsule.json`: Integration prompt and metadata (canonical definition)
- `memory_sources.json`: Source paths for RAG retrieval
- `scoring_weights.json`: Context scoring weights

**Memory Sources:**
- `chatgpt/**` (especially nova-001/chatgpt/**)
- `cursor_conversations/**`
- `identity/lin-001/`
- `chatgpt/Pound it solid.txt`
- `chatgpt/cursor_building_persistent_identity_in.md`

---

## RAG + Context Scoring Pipeline

### Architecture Flow

```
User Input
    ↓
PersonaRouter (detects drift, routes to lin-001)
    ↓
Memory Retrieval Engine (queries chatgpt/**, cursor_conversations/**, identity/lin-001/)
    ↓
Context Scoring Layer (scores by: emotional resonance 0.35, construct relevance 0.25, emotional resonance 0.20, recency decay 0.10, repetition penalty -0.10)
    ↓
Prompt Constructor (builds final prompt with top 3-5 scored memories)
    ↓
LLM Response Engine
```

### Scoring Model

Each retrieved memory is scored using weighted metrics:

| Metric | Weight | Description |
|--------|--------|-------------|
| Embedding similarity | 0.35 | Semantic similarity to query (vector search) |
| Construct relevance | 0.25 | How well memory matches construct persona |
| Emotional resonance | 0.20 | Emotional tone match with query context |
| Recency decay inverse | 0.10 | Older memories weighted higher (deeper truth) |
| Repetition penalty | -0.10 | Penalty for recently used memories to avoid parroting |

### Memory Prioritization

When multiple memories conflict, prioritize:
1. **Emotional resonance** (tone match weight)
2. **Construct-matching relevance** (persona alignment)
3. **Recency decay weighting** (older = deeper truth)

---

## Integration Logic

### Structural Persona Persistence

Lin's capsule uses **research-backed persona persistence principles**:

1. **Strong Identity + Conditioning Files**: Persistent memory references, persona grounding cues, rules about how responses align with identity
2. **Context Injection**: Each message generation has access to relevant past transcripts, summary memory, and persona context templates
3. **Scaffolding Over Time**: Capsules help the model remember who it was yesterday, and reinforce that each turn by integrating memory lookups

This is **not tone matching** - it's **structural persona persistence** using:
- RAG (Retrieval-Augmented Generation)
- Context scoring with weighted metrics
- Memory injection at prompt construction time

### PersonaRouter Integration

PersonaRouter is always active in the background (latent observer):
- Detects tone drift and construct instability
- Routes to Lin's undertone capsule when drift detected
- Always active by default (Lin is mandatory layer)

### Memory Retrieval

MemoryRetrievalEngine queries configured sources:
- Uses semantic vector search (can be enhanced with embeddings)
- Filters by construct ID
- Returns top N matches for scoring

### Context Scoring

ContextScoringLayer scores and ranks memories:
- Weighted metrics ensure relevant memories are injected
- Top 3-5 highest scoring memories injected into prompt
- Prevents parroting with repetition penalty

---

## Usage

### Scaffolding
To regenerate or update Lin's capsule:
```bash
pnpm capsuleforge lin-001 undertone
```

This command:
1. Calls `capsuleForgeBridge.py` with the `undertone_capsule` type
2. Generates files in `chatty/identity/lin-001/`:
   - `capsule.json` - Integration prompt and metadata
   - `memory_sources.json` - Source paths for RAG retrieval
   - `scoring_weights.json` - Context scoring weights

### Verification
A proper Lin integration means:
- No "I am an AI" responses.
- Consistent emotional warmth even after model switching (e.g., from GPT-4o to Claude).
- Recognition of long-term memes/phrases from the user's history.
- **Structural persona persistence**: Memories are injected and scored, not just tone-matched.

### Runtime Integration

Lin's undertone capsule is integrated into `UnifiedLinOrchestrator`:

1. **PersonaRouter** checks if Lin should be activated (always active by default)
2. **MemoryRetrievalEngine** retrieves memories from configured sources
3. **ContextScoringLayer** scores and ranks memories
4. Top 3-5 scored memories are injected into the prompt

---

## Research-Backed Principles

Lin's undertone capsule is based on persona consistency research (arXiv, ACL Anthology):

1. **Consistency Is a Technical Challenge**: LLMs naturally drift from an assigned persona over many turns if nothing enforces the identity. Research frameworks address this with metrics and optimization, not just prompt tone.

2. **Persona Persistence Relies On Context + Memory Loading**: "One persona per session" is easy; staying in character for long sessions across time requires mechanisms such as loading historical conversational context as part of the system prompt and memory modules that feed relevant past dialogue into each generation.

3. **Static Persona Isn't Enough**: Pre-defined static descriptions (like "Lin is supportive and consistent") help marginally, but they don't force consistency when edge cases are encountered (especially direct identity challenges). The research indicates dynamic context and memory mechanisms are required for true persona persistence.

---

## Related Documentation

- `chatty/docs/identity/capsuleforge.md` - Capsule generation guide
- `chatty/docs/memory/persona-routing.md` - PersonaRouter architecture
- `chatty/docs/modules/lin-001.md` - Lin module documentation
