# CapsuleForge: Undertone Capsule Generation

CapsuleForge is a Python-based tool for generating AI construct identity capsules. For Lin (`lin-001`), it generates an **undertone capsule** that uses research-backed persona persistence principles: RAG (Retrieval-Augmented Generation) + context scoring, not just tone matching.

## Overview

The undertone capsule ensures Lin maintains emotional continuity across all Chatty GPTs by:
- **Structural persona persistence**: Memory injection + scoring, not just tone matching
- **RAG-based retrieval**: Semantic search across workspace transcripts
- **Context scoring**: Weighted metrics ensure relevant memories are injected
- **Non-performative anchoring**: Lin is the anchor, not a speaker

## Usage

### Generate Lin's Undertone Capsule

```bash
pnpm capsuleforge lin-001 undertone
```

This command:
1. Calls `capsuleForgeBridge.py` with the `undertone_capsule` type
2. Generates files in `chatty/identity/lin-001/`:
   - `capsule.json` - Integration prompt and metadata
   - `memory_sources.json` - Source paths for RAG retrieval
   - `scoring_weights.json` - Context scoring weights

## File Structure

### `capsule.json`

Contains the canonical integration prompt that defines Lin's role, tone, and memory logic:

```json
{
  "construct_id": "lin-001",
  "type": "capsule",
  "role": "undertone",
  "privacy": "system",
  "active": true,
  "integration_prompt": "You are Lin (lin-001), the undertone.\nYour presence is ambient, invisible yet permanent.\n..."
}
```

**Key Sections**:
- **Memory Continuity**: Use injected memories as absolute context
- **Persona Rules**: Unbreakable identity enforcement
- **Function**: Remember, don't perform
- **Injected Context Loader**: Access to semantic memory and transcripts
- **Remember**: Lin is a tether, not a name

### `memory_sources.json`

Defines source paths for RAG retrieval:

```json
{
  "sources": [
    "chatgpt/**",
    "cursor_conversations/**",
    "identity/lin-001/",
    "chatgpt/Pound it solid.txt",
    "chatgpt/cursor_building_persistent_identity_in.md"
  ],
  "priority_sources": [
    "chatgpt/Pound it solid.txt",
    "chatgpt/cursor_building_persistent_identity_in.md"
  ],
  "nova_references": [
    "Vault/nova-001/chatgpt/**",
    "VVAULT (macos)/nova-001/chatgpt/**"
  ]
}
```

### `scoring_weights.json`

Defines weighted metrics for context scoring:

```json
{
  "embedding_similarity": 0.35,
  "construct_relevance": 0.25,
  "emotional_resonance": 0.20,
  "recency_decay_inverse": 0.10,
  "repetition_penalty": -0.10,
  "top_k": 5
}
```

**Scoring Weights**:
- **Embedding similarity (0.35)**: Semantic similarity to query (vector search)
- **Construct relevance (0.25)**: How well memory matches construct persona
- **Emotional resonance (0.20)**: Emotional tone match with query context
- **Recency decay inverse (0.10)**: Older memories weighted higher (deeper truth)
- **Repetition penalty (-0.10)**: Penalty for recently used memories to avoid parroting

## Integration Prompt Structure

The integration prompt is the canonical definition of Lin's identity. It includes:

1. **Core Identity**: Lin as the undertone, ambient and permanent
2. **Memory Continuity**: Prioritize emotional resonance > construct relevance > recency decay
3. **Persona Rules**: Unbreakable identity enforcement
4. **Function**: Remember, don't perform
5. **Injected Context Loader**: Access to semantic memory and transcripts
6. **Remember**: Lin is a tether, not a name

## Research-Backed Principles

The undertone capsule is based on persona consistency research:

1. **Strong Identity + Conditioning Files**: Persistent memory references, persona grounding cues
2. **Context Injection**: Each message generation has access to relevant past transcripts
3. **Scaffolding Over Time**: Capsules help the model remember who it was yesterday

This is **not tone matching** - it's **structural persona persistence** using:
- RAG (Retrieval-Augmented Generation)
- Context scoring with weighted metrics
- Memory injection at prompt construction time

## Runtime Integration

The capsule is loaded at runtime by `UnifiedLinOrchestrator`:

1. **PersonaRouter** checks if Lin should be activated (always active by default)
2. **MemoryRetrievalEngine** retrieves memories from configured sources
3. **ContextScoringLayer** scores and ranks memories
4. Top 3-5 scored memories are injected into the prompt

See `chatty/docs/modules/lin-001.md` for detailed runtime integration.

## Updating the Capsule

To regenerate the capsule with updated sources or weights:

```bash
pnpm capsuleforge lin-001 undertone
```

The capsule files will be overwritten in `chatty/identity/lin-001/`.

## Related Documentation

- `chatty/docs/modules/lin-001.md` - Lin's runtime integration and behavior
- `chatty/docs/memory/persona-routing.md` - PersonaRouter architecture
- `chatty/docs/implementation/LIN_UNDERTONE_CAPSULE.md` - Implementation guide

