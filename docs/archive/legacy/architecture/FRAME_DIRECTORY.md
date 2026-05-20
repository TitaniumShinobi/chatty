# Frame Directory Structure

**Date:** 2026-02-11
**Status:** Reference documentation
**Location:** `frame/` (Chatty workspace root)

## Overview

The `frame/` directory contains the Python-based cognitive, biological, and memory infrastructure for AI constructs. Originally from the standalone Frame project, it has been integrated into the Chatty workspace to enable direct memory and identity operations via Node→Python bridges.

## Directory Tree

```
frame/
├── bodilyfunctions/
│   └── xx/                          # Female biological simulation (xx chromosome variant)
│       ├── __init__.py
│       ├── cns.py                   # Central Nervous System — CRITICAL: memory reflection + insight synthesis
│       ├── pns.py                   # Peripheral Nervous System — sensory input simulation
│       ├── hypothalamus.py          # (stub)
│       ├── pituitary_gland.py       # (stub)
│       ├── pineal_gland.py          # (stub)
│       ├── thyroid_gland.py         # (stub)
│       ├── parathyroid_glands.py    # (stub)
│       ├── adrenal_glands.py        # Stress response system (partial implementation)
│       ├── pancreas.py              # (stub)
│       ├── ovaries.py               # (stub)
│       ├── placenta.py              # (stub)
│       ├── thymus.py                # (stub)
│       ├── heart.py                 # (stub)
│       ├── lungs.py                 # (stub)
│       ├── kidneys.py               # (stub)
│       ├── liver.py                 # (stub)
│       ├── stomach.py               # Hunger system (stub with class def)
│       ├── intestines.py            # Gut microbiome (stub)
│       ├── spleen.py                # (stub)
│       ├── blood.py                 # (stub)
│       ├── blood_vessels.py         # Arteries, arterioles, capillaries, veins (stub classes)
│       ├── bone.py                  # BoneStructure, BoneMarrow (stub)
│       ├── muscles.py               # (stub)
│       ├── skin.py                  # Epidermis, Dermis (stub)
│       ├── eyes.py                  # (stub)
│       ├── ears.py                  # Auricle, Ossicle (stub)
│       ├── nose.py                  # (stub)
│       ├── mouth.py                 # (stub)
│       ├── lymph_nodes.py           # (stub)
│       ├── tonsils_and_adenoids.py  # (stub)
│       ├── mucosa.py                # (stub)
│       ├── salivary_glands.py       # (stub)
│       ├── parotids.py              # (stub)
│       ├── sublingual_gland.py      # (stub)
│       ├── submandibulars.py        # (stub)
│       ├── proteins.py              # (stub)
│       └── watercontent.py          # (stub)
│
├── neuralfunctions/                 # Cognitive and emotional processing layer
│   ├── __init__.py                  # Exports: EmotionalCore, PersonalityIslands, DreamProcessor, SleepManager
│   ├── emotions.py                  # EmotionalCore — 5 core emotions (joy, sadness, anger, fear, disgust)
│   ├── islands.py                   # PersonalityIslands — 5 traits (curiosity, empathy, creativity, resilience, wisdom)
│   ├── dreams.py                    # DreamProcessor — dream generation from memory queues, theme extraction
│   └── sleep.py                     # SleepManager — idle-based sleep cycles, dream triggers, memory consolidation
│
└── Terminal/
    └── memup/                       # Memory infrastructure (ChromaDB-backed)
        ├── __init__.py              # Exports: UnifiedMemoryBank + helpers
        ├── bank.py                  # UnifiedMemoryBank — primary memory store (STM + LTM via ChromaDB)
        ├── multi_construct_bank.py  # MultiConstructMemoryBank — per-construct isolated ChromaDB collections
        ├── chroma_config.py         # ChromaDB client config + SentenceTransformer embedding setup
        ├── context.py               # ConversationContext — session tracking, context window management
        ├── stm.py                   # Short-term memory import from ChatGPT/transcript exports
        ├── ltm.py                   # Long-term memory import with deduplication
        ├── memory_short_import.py   # ShortTermMemoryBank — ChatGPT export processor
        ├── memory_long_import.py    # Long-term memory import (duplicate of ltm.py content)
        ├── memcheck.py              # Quick diagnostic: inspect ChromaDB collection status
        ├── memory_check.py          # Full diagnostic: inspect ChromaDB collections, count memories
        └── MEMUP_ANALYSIS.md        # Analysis document
```

## Key Modules in Detail

### cns.py — Central Nervous System

The most critical file in `frame/`. This is the memory reflection and insight synthesis engine.

- **Class:** `CentralNervousSystem(memory_bank: UnifiedMemoryBank)`
- **`process_memory()`** — Retrieves recent memories from bank, synthesizes insights via OpenAI GPT-4-turbo, stores reflections back as long-term memories
- **`_synthesize(memories)`** — Extracts patterns/topics from memory documents, generates insight summaries
- **`generate_proactive_greeting(session_id)`** — Creates context-aware greetings using OpenAI
- **Dependencies:** `Terminal.memup.bank.UnifiedMemoryBank`, `Terminal.logger`, `Terminal.vault` (for API key retrieval)
- **Import path:** `from Terminal.memup.bank import UnifiedMemoryBank`

### neuralfunctions — Cognitive Layer

| Module | Class | Purpose |
|--------|-------|---------|
| `emotions.py` | `EmotionalCore` | Tracks 5 emotions (0.0-1.0), normalizes state, colors memories with emotional context |
| `islands.py` | `PersonalityIslands` | 5 personality traits with core memory associations, trait evolution over experiences |
| `dreams.py` | `DreamProcessor` | Generates dreams from memory queues, tracks dream themes and significance |
| `sleep.py` | `SleepManager` | Idle-time sleep cycles (30min→Light, 1hr→Deep, 2hr+→Crash), triggers dreams, memory consolidation |

### memup — Memory Infrastructure

| Module | Class | Purpose |
|--------|-------|---------|
| `bank.py` | `UnifiedMemoryBank` | Primary memory store: `add_memory()`, `get_recent()`, `query_similar()` via ChromaDB |
| `multi_construct_bank.py` | `MultiConstructMemoryBank` | Per-construct ChromaDB collections with profile signature validation |
| `chroma_config.py` | — | ChromaDB client setup, SentenceTransformer embedding configuration |
| `context.py` | `ConversationContext` | Session tracking, context window management, conversation state |
| `stm.py` | — | Short-term memory import pipeline |
| `ltm.py` | — | Long-term memory import with deduplication |

## Relationship to Chatty

Frame's Python modules are accessed from Chatty's Node.js server via two bridges:

1. **`server/services/memupMemoryService.js`** → spawns `bank.py` as Python subprocess for memory operations
2. **`server/services/orchestrationBridge.js`** → spawns `orchestration/cli.py` for message routing

### Current Status

| Aspect | Status |
|--------|--------|
| Frame directory present | Yes (uploaded 2026-02-11) |
| ChromaDB installed | No — required for bank.py |
| sentence-transformers installed | No — required for embeddings |
| memupMemoryService path correct | No — references `Memup` (capital M), actual dir is `memup` |
| ENABLE_CHROMADB env var | Set to `false` |
| ENABLE_ORCHESTRATION env var | Not set |
| cns.py wired to message pipeline | No |

## Dynamic Chromosome Selection

The `bodilyfunctions/` directory uses a subdirectory pattern (`xx/`, potentially `xy/`) for biological variation. The active variant is determined dynamically based on the construct's configuration, not hardcoded.
