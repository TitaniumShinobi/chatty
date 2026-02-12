# Memory & Orchestration Component Inventory

**Date:** 2026-02-11
**Status:** Reference documentation
**Purpose:** Complete inventory of all memory, orchestration, and identity components across the Python, Node.js, and TypeScript layers.

## Status Legend

- **ACTIVE** — Currently called in the message pipeline
- **DISCONNECTED** — Code exists and works but is not wired into the pipeline
- **DISABLED** — Gated by env var or missing dependency
- **TOOLING** — Standalone utility, not part of message flow
- **STUB** — Class/module skeleton with no implementation

---

## Python Layer (Frame)

### frame/Terminal/memup/

| File | Class/Function | Status | Purpose |
|------|---------------|--------|---------|
| `bank.py` | `UnifiedMemoryBank` | DISABLED | Primary ChromaDB-backed STM/LTM store. `add_memory()`, `get_recent()`, `query_similar()`. Requires ChromaDB + sentence-transformers. |
| `multi_construct_bank.py` | `MultiConstructMemoryBank` | DISABLED | Per-construct isolated ChromaDB collections with profile signature validation. Extends bank.py with VVAULT profile support. |
| `chroma_config.py` | `get_long_term_collection()`, `get_short_term_collection()` | DISABLED | ChromaDB client setup. Configures SentenceTransformer embedding model. Requires `chromadb` and `sentence-transformers` packages. |
| `context.py` | `ConversationContext` | DISABLED | Session tracking, context window management, conversation state tracking with timestamps. |
| `stm.py` | — | TOOLING | Short-term memory import from ChatGPT transcript exports. Batch import utility. |
| `ltm.py` | — | TOOLING | Long-term memory import with content-based deduplication. Batch import utility. |
| `memory_short_import.py` | `ShortTermMemoryBank` | TOOLING | ChatGPT export processor. Reads `conversations.json`, deduplicates, imports to ChromaDB. |
| `memcheck.py` | — | TOOLING | Quick diagnostic: ChromaDB collection status check. |
| `memory_check.py` | `main()` | TOOLING | Full diagnostic: lists ChromaDB collections, counts recent vs old memories. |

### frame/bodilyfunctions/xx/

| File | Class/Function | Status | Purpose |
|------|---------------|--------|---------|
| `cns.py` | `CentralNervousSystem` | DISCONNECTED | Memory reflection + insight synthesis. Retrieves memories from UnifiedMemoryBank, synthesizes via OpenAI GPT-4-turbo, stores reflections as LTM. `generate_proactive_greeting()` for context-aware greetings. |
| `pns.py` | `PeripheralNervousSystem` | DISCONNECTED | Sensory input simulation. Detects environmental stimuli from predefined set. |
| All others | Various | STUB | Biological system placeholders (heart, lungs, kidneys, etc.). Empty classes or `pass` stubs. |

### frame/neuralfunctions/

| File | Class/Function | Status | Purpose |
|------|---------------|--------|---------|
| `emotions.py` | `EmotionalCore` | DISCONNECTED | Tracks 5 core emotions (joy, sadness, anger, fear, disgust). Normalizes state. Colors memories with emotional context. |
| `islands.py` | `PersonalityIslands` | DISCONNECTED | 5 personality traits (curiosity, empathy, creativity, resilience, wisdom). Core memory associations. Trait evolution over experiences. |
| `dreams.py` | `DreamProcessor` | DISCONNECTED | Generates dreams from memory queues. Extracts themes. Tracks dream significance. |
| `sleep.py` | `SleepManager` | DISCONNECTED | Idle-time sleep cycles (30min→Light, 1hr→Deep, 2hr+→Crash). Triggers dream generation. Memory consolidation during sleep. |

---

## Python Scripts (VVAULT)

### vvault_scripts/capsules/

| File | Status | Purpose |
|------|--------|---------|
| `capsuleforge.py` (1810 lines) | TOOLING | CapsuleForge: generates `.capsule` files with MBTI, Big Five, emotional baselines, memory snapshots, environment state. Run manually or on construct creation. |
| `capsule_validator.py` | TOOLING | Validates capsule integrity (schema, signatures, required fields). |
| `capsule_viewer.py` | TOOLING | CLI tool to inspect capsule contents. |
| `capsule_migrator.py` | TOOLING | Migrates capsules between versions. |
| `capsule_blockchain_integration.py` | TOOLING | Blockchain-based capsule verification (experimental). |

### vvault_scripts/continuity/

| File | Status | Purpose |
|------|--------|---------|
| `collect_timeline_entries.py` | TOOLING | Collects timeline entries from transcripts for continuity analysis. |
| `CONTINUITYGPT_scoring.py` | TOOLING | Scores continuity quality across sessions. |
| `timeline_report.py` | TOOLING | Generates timeline reports from collected entries. |
| `hypotheses_and_report.py` | TOOLING | Generates hypotheses from timeline data. |
| `evidence_validator.py` | TOOLING | Validates evidence highlights (filters by word count). |

### vvault_scripts/master/

| File | Status | Purpose |
|------|--------|---------|
| `needle.py` | TOOLING | Fast transcript search via ripgrep. Searches chatgpt/, github_copilot/, character.ai/ transcripts. JSON output mode. Python fallback if rg unavailable. **Candidate for pipeline integration.** |
| `construct_identity_loader.py` | TOOLING | Loads ALL identity files for a construct: prompt.txt, .capsule, conditioning.txt, personality.json, config.json. Searches workspace for additional identity files. |
| `state_manager.py` | TOOLING | StateManager class for JSON state persistence. STM pool queries. Centralized logging. |
| `identity_guard.py` | TOOLING | Monitors identity files for integrity. Updates STM with identity data on changes. |
| `folder_monitor.py` | TOOLING | Watches directories for file changes. |
| `self_prompt.py` | TOOLING | Self-prompting system for constructs. |
| `orbit.py` | TOOLING | Orbital scheduling for background tasks. |
| `navigator.py` | TOOLING | Navigation/routing for multi-construct systems. |
| `nautilus.py` | TOOLING | Deep exploration/search system. |
| `aviator.py` | TOOLING | High-level construct management. |
| `independence.py` | TOOLING | Construct autonomy management. |
| `self_improvement.py` | TOOLING | Self-improvement learning loops. |
| `unstuck_helper.py` | TOOLING | Helps constructs recover from stuck states. |

---

## Node.js Server Layer

### server/services/

| File | Status | Purpose | Blocker |
|------|--------|---------|---------|
| `orchestrationBridge.js` | DISABLED | Node→Python bridge. Spawns `orchestration/cli.py` as subprocess. `routeViaOrchestration()`, `routeMessageWithFallback()`. | Gated by `ENABLE_ORCHESTRATION` env var (not set). |
| `memupMemoryService.js` | DISABLED | Node wrapper for `bank.py`. Spawns Python subprocess for memory operations. `executePythonCommand()`, `addMemory()`, `queryRelevant()`. | Path mismatch: references `Memup` (capital M), actual dir is `memup`. ChromaDB not installed. |

### server/lib/

| File | Status | Purpose |
|------|--------|---------|
| `capsuleIntegration.js` (1597 lines) | DISCONNECTED (fallback only) | Loads capsules from filesystem/Supabase. `buildEnrichedSystemPrompt()` assembles full identity prompt. **Only fires when VVAULT API returns 401/503.** |
| `identityLoader.js` | ACTIVE | Loads construct identity files (prompt.txt, conditioning.txt) from Supabase vault_files. Used in primary vvault.js message path. |
| `identityDriftPrevention.js` | DISCONNECTED | `IdentityDriftPrevention` class. Server-side drift detection and prevention. Not wired into primary message flow. |
| `unifiedIntelligenceOrchestrator.js` | DISCONNECTED | Server-side intelligence orchestration. References orchestrationBridge. |
| `userRegistry.js` | ACTIVE | User registration, LIFE format ID generation, profile.json management. |
| `aiManager.js` | ACTIVE | AI provider management (OpenAI, OpenRouter, Ollama). |

### server/routes/

| File | Status | Purpose |
|------|--------|---------|
| `vvault.js` (~4858 lines) | ACTIVE | Primary message route. **Only loads prompt.txt in primary path.** Capsule injection in fallback path only. |
| `orchestration.js` | DISABLED | Express routes for orchestration API. Not mounted when orchestration disabled. |
| `linChat.js` | ACTIVE | Lin chat routes with transcript saving to Supabase. |

---

## Client-Side TypeScript

### src/engine/orchestration/

| File | Class | Status | Purpose |
|------|-------|--------|---------|
| `ZenMemoryOrchestrator.ts` (453 lines) | `ZenMemoryOrchestrator` | DISCONNECTED | Full STM/LTM orchestrator. `captureMessage()` records to STM + LTM + VVAULT. `prepareMemoryContext()` builds memory context with STM window, LTM entries, summaries. VVAULT connector support. Thread management via `SingletonThreadManager`. |
| `UnifiedLinOrchestrator.ts` (1327 lines) | `UnifiedLinOrchestrator` | DISCONNECTED | Lin's orchestration layer. Workspace context, personality blueprints, time awareness, drift detection, memory retrieval, tone detection. Uses PersonalityOrchestrator, TriadGate, PersonaRouter, ContextScoringLayer. |
| `PersonalityOrchestrator.ts` (930 lines) | `PersonalityOrchestrator` | DISCONNECTED | Fuses personality blueprint + transcript memories + current context. `orchestrateResponse()` with full personality context. Identity matching, drift prevention, greeting synthesis. |
| `DynamicPersonaOrchestrator.ts` (316 lines) | `DynamicPersonaOrchestrator` | DISCONNECTED | Dynamic persona detection from workspace context. Fusion weights for relationship anchors, speech patterns, behavioral markers. Context lock management. |
| `TriadGate.ts` (156 lines) | `TriadGate` | DISCONNECTED | Checks Ollama model availability (DeepSeek, Phi-3, Mistral). Blocks response if any model unavailable. Only relevant with local Ollama models. |

### src/core/identity/

| File | Class | Status | Purpose |
|------|-------|--------|---------|
| `IdentityAwarePromptBuilder.ts` | `IdentityAwarePromptBuilder` | DISCONNECTED | Builds prompts with identity context and boundaries. System entity boundaries (Chatty, Synth-system, Lin). Identity anchors that must never be pruned. |
| `DriftGuard.ts` | `DriftGuard` | DISCONNECTED | Detects identity drift in responses. Scores drift magnitude (0.0-1.0). |
| `IdentityDriftDetector.ts` | `IdentityDriftDetector` | DISCONNECTED | Advanced drift detection with multiple analysis dimensions. |
| `IdentityEnforcementService.ts` | `IdentityEnforcementService` | DISCONNECTED | Generates identity context for prompts. Manages system entity definitions. |
| `MessageAttributionService.ts` | `MessageAttributionService` | DISCONNECTED | Attributes messages to correct construct identity. |
| `PromptAuditor.ts` | `PromptAuditor` | DISCONNECTED | Audits prompts for identity violations. |
| `RoleScoreCalculator.ts` | `RoleScoreCalculator` | DISCONNECTED | Calculates role adherence scores. |
| `IdentityMarkers.ts` | `IdentityMarkers` | DISCONNECTED | Defines identity markers for constructs. |

### src/core/memory/

| File | Class | Status | Purpose |
|------|-------|--------|---------|
| `STMBuffer.ts` | `STMBuffer` | DISCONNECTED | In-memory short-term message buffer. Fast per-construct, per-thread message window. |
| `ContextScoringLayer.ts` | `ContextScoringLayer` | DISCONNECTED | Scores memory relevance to current query. Used by UnifiedLinOrchestrator. |
| `MemoryRetrievalEngine.ts` | `MemoryRetrievalEngine` | DISCONNECTED | Retrieves memories from multiple sources. |
| `MemoryWeightingService.ts` | `MemoryWeightingService` | DISCONNECTED | Weights memories by type, recency, relevance. |
| `BrowserSTMBuffer.ts` | `BrowserSTMBuffer` | DISCONNECTED | Browser-side STM buffer (localStorage-based). |
| `RoleKeywords.ts` | `RoleKeywords` | DISCONNECTED | Keywords for role-based memory filtering. |

### src/core/persona/

| File | Class | Status | Purpose |
|------|-------|--------|---------|
| `PersonaRouter.ts` | `PersonaRouter` | DISCONNECTED | Routes through Lin's undertone capsule when drift detected. Always-active background observer. Drift threshold: 0.15 (15%). Triad drift threshold: 0.35. |

### src/core/capsule/

| File | Class | Status | Purpose |
|------|-------|--------|---------|
| `CapsuleLockService.ts` | `CapsuleLockService` | DISCONNECTED | Capsule locking for concurrent access prevention. |

### src/lib/

| File | Status | Purpose |
|------|--------|---------|
| `orchestrationBridge.ts` | DISCONNECTED | Client-side orchestration bridge (calls server orchestration API). |

---

## Summary Statistics

| Layer | Total Components | Active | Disconnected | Disabled | Tooling | Stub |
|-------|-----------------|--------|--------------|----------|---------|------|
| Python (Frame) | 18 | 0 | 5 | 4 | 5 | 4+ |
| Python (VVAULT Scripts) | 20+ | 0 | 0 | 0 | 20+ | 0 |
| Node.js Server | 10 | 4 | 4 | 2 | 0 | 0 |
| TypeScript Client | 20+ | 0 | 20+ | 0 | 0 | 0 |
| **Total** | **70+** | **4** | **29+** | **6** | **25+** | **4+** |

Only 4 components are actively wired into the message pipeline. 29+ components exist as working code but are not connected. 6 are disabled by missing dependencies or env vars.

## Prerequisites to Activate

| Prerequisite | Components Unblocked |
|-------------|---------------------|
| Install `chromadb` Python package | bank.py, multi_construct_bank.py, chroma_config.py, stm.py, ltm.py |
| Install `sentence-transformers` Python package | chroma_config.py (embedding model) |
| Set `ENABLE_CHROMADB=true` | All memup components |
| Set `ENABLE_ORCHESTRATION=true` | orchestrationBridge.js, orchestration.js |
| Fix path in memupMemoryService.js (`Memup` → `memup`) | memupMemoryService.js |
| Create `MemoryContextBuilder` server module | All client-side orchestrators (via server-side equivalent) |
| Move capsuleIntegration to primary path | capsuleIntegration.js (from fallback to always-on) |
