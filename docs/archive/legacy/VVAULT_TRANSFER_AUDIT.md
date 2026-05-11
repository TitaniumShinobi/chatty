# Chatty → VVAULT Transfer Audit

## Principle
**Chatty = Thin UI Layer** (scripts, tools, messaging UI only)
**VVAULT = AI Home** (Aurora handles all AI functionality)

---

## TRANSFER TO VVAULT (Aurora's Domain)

### 1. Orchestration Layer
Everything that makes AI "think" moves to VVAULT.

| File | Purpose | Priority |
|------|---------|----------|
| `src/engine/orchestration/UnifiedLinOrchestrator.ts` | Main orchestrator - prompt assembly, memory retrieval, response generation | **CRITICAL** |
| `src/engine/orchestration/PersonalityOrchestrator.ts` | Personality blueprint management | HIGH |
| `src/engine/orchestration/TriadGate.ts` | Triad seat health checks (Ollama, Memory, Identity) | HIGH |
| `src/engine/orchestration/ZenMemoryOrchestrator.ts` | Zen-specific memory orchestration | HIGH |
| `src/engine/orchestration/DynamicPersonaOrchestrator.ts` | Dynamic persona switching | MEDIUM |
| `src/engine/orchestration/OutputFilter.ts` | Response filtering/safety | MEDIUM |
| `src/lib/automaticRuntimeOrchestrator.ts` | Runtime detection and assignment | HIGH |
| `src/lib/runtimeContextManager.ts` | Runtime context management | HIGH |
| `src/lib/orchestrationBridge.ts` | Orchestration bridge utilities | MEDIUM |
| `src/lib/orchestration/triad_sanity_check.ts` | Triad sanity checks | HIGH |

**Note:** `src/lib/orchestration/UnifiedLinOrchestrator.ts` (39 lines) is a stub/re-export of the main orchestrator at `src/engine/orchestration/UnifiedLinOrchestrator.ts` (1327 lines). Only the engine version needs to transfer.

### 2. Persona Router & Lin Undertone
Lin's stabilization logic belongs in VVAULT.

| File | Purpose | Priority |
|------|---------|----------|
| `src/core/persona/PersonaRouter.ts` | Routes turns through Lin when drift detected (toneMismatch > 0.35) | **CRITICAL** |
| `src/lib/linToneLock.ts` | Lin tone enforcement | **CRITICAL** |
| `src/lib/linConversation.ts` | Lin conversation management | HIGH |
| `src/lib/linTestRunner.ts` | Lin testing utilities | LOW |
| `src/lib/toneDetector.ts` | Tone detection for drift analysis | HIGH |

### 3. Identity & Drift Prevention
Identity enforcement is core AI functionality.

| File | Purpose | Priority |
|------|---------|----------|
| `src/core/identity/IdentityEnforcementService.ts` | Prevents constructs from breaking character | **CRITICAL** |
| `src/core/identity/IdentityDriftDetector.ts` | Detects identity drift across sessions | **CRITICAL** |
| `src/core/identity/DriftGuard.ts` | Guards against tone/identity drift | HIGH |
| `src/core/identity/IdentityAwarePromptBuilder.ts` | Builds identity-aware prompts | HIGH |
| `src/core/identity/MessageAttributionService.ts` | Attributes messages to correct speakers | MEDIUM |
| `src/core/identity/PromptAuditor.ts` | Audits prompts for identity violations | MEDIUM |
| `src/engine/character/UnbreakableIdentityEnforcer.ts` | Unbreakable character persistence | **CRITICAL** |
| `src/engine/character/PersonaDetectionEngine.ts` | Detects persona from text | HIGH |
| `src/engine/character/DriftPrevention.ts` | Prevents character drift | HIGH |
| `src/engine/character/PersonaLockdown.ts` | Locks persona during response | HIGH |
| `src/engine/character/CharacterAdoptionEngine.ts` | Character adoption logic | MEDIUM |
| `src/engine/character/IdentityMatcher.ts` | Matches identity from context | HIGH |

### 4. Memory System
All memory logic belongs in VVAULT (Aurora's long-term memory).

| File | Purpose | Priority |
|------|---------|----------|
| `src/core/memory/MemoryRetrievalEngine.ts` | RAG memory retrieval | **CRITICAL** |
| `src/core/memory/ContextScoringLayer.ts` | Scores context relevance | HIGH |
| `src/core/memory/STMBuffer.ts` | Short-term memory buffer | HIGH |
| `src/core/memory/MemoryWeightingService.ts` | Weights memories by importance | HIGH |
| `src/lib/MemoryStore.ts` | Memory persistence | **CRITICAL** |
| `src/lib/memoryLedger.ts` | Memory ledger with continuity hooks | **CRITICAL** |
| `src/lib/memoryManager.ts` | Memory management | HIGH |
| `src/lib/continuityInjector.ts` | Injects memories into context | **CRITICAL** |
| `src/lib/semanticRetrieval.ts` | Semantic memory retrieval | HIGH |
| `src/lib/unifiedSemanticRetrieval.ts` | Unified semantic retrieval | HIGH |
| `src/engine/memory/PersonaBrain.ts` | Persona-specific memory | HIGH |
| `src/engine/memory/PersistentMemoryStore.ts` | Persistent memory store | HIGH |
| `src/engine/memory/Summariser.ts` | Memory summarization | MEDIUM |
| `src/engine/adaptiveMemoryManager.ts` | Adaptive memory management | MEDIUM |

### 5. Inference & Response Generation
All LLM interaction belongs in VVAULT.

| File | Purpose | Priority |
|------|---------|----------|
| `src/lib/aiService.ts` | Main AI service (calls VVAULT API) | **CRITICAL** - Keep as thin proxy |
| `src/lib/gptRuntime.ts` | GPT runtime logic | **CRITICAL** |
| `src/lib/gptChatService.ts` | GPT chat service | HIGH |
| `src/lib/gptService.ts` | GPT service utilities | HIGH |
| `src/lib/gptManager.ts` | GPT management | HIGH |
| `src/lib/gptManagerFactory.ts` | GPT manager factory | MEDIUM |
| `src/lib/ai.ts` | AI utilities | HIGH |
| `src/lib/conversationAI.ts` | Conversation AI logic | HIGH |
| `src/engine/synthesis/ResponseSynthesizer.ts` | Response synthesis | HIGH |
| `src/engine/seatRunner.ts` | Seat runner (Ollama interface) | **CRITICAL** |
| `src/engine/enhancedSeatRunner.ts` | Enhanced seat runner | HIGH |
| `src/engine/optimizedZen.ts` | Optimized Zen processor | HIGH |
| `src/engine/council/seatRunner.ts` | Council seat runner | MEDIUM |
| `src/engine/council/arbiter.ts` | Arbiter logic | MEDIUM |

### 6. Transcript & Context
Transcript handling belongs in VVAULT.

| File | Purpose | Priority |
|------|---------|----------|
| `src/engine/transcript/TranscriptMemoryOrchestrator.ts` | Transcript memory orchestration | **CRITICAL** |
| `src/engine/transcript/DeepTranscriptParser.ts` | Deep transcript parsing | HIGH |
| `src/engine/transcript/EnhancedAnchorExtractor.ts` | Anchor extraction | HIGH |
| `src/engine/transcript/AnchorIndexer.ts` | Anchor indexing | MEDIUM |
| `src/lib/contextAssembler.ts` | Context assembly | HIGH |
| `src/lib/contextBuilder.ts` | Context building | MEDIUM |
| `src/lib/personalityPromptBuilder.ts` | Personality prompt building | HIGH |
| `src/engine/context/WorkspaceContextBuilder.ts` | Workspace context | MEDIUM |

### 7. Reasoning & Intent
AI reasoning logic belongs in VVAULT.

| File | Purpose | Priority |
|------|---------|----------|
| `src/brain/reasoner.ts` | Main reasoning engine | **CRITICAL** |
| `src/engine/intent/IntentDetector.ts` | Intent detection | HIGH |
| `src/engine/planning/ResponsePlanner.ts` | Response planning | HIGH |
| `src/engine/planning/RecursivePlanner.ts` | Recursive planning | MEDIUM |
| `src/engine/parser/SymbolicParser.ts` | Symbolic parsing | MEDIUM |
| `src/lib/symbolicReasoning.ts` | Symbolic reasoning | MEDIUM |
| `src/lib/narrativeSynthesis.ts` | Narrative synthesis | MEDIUM |

### 8. Capsule & Construct Management
Construct definitions belong in VVAULT.

| File | Purpose | Priority |
|------|---------|----------|
| `src/lib/capsuleService.ts` | Capsule service | HIGH |
| `src/core/capsule/CapsuleLockService.ts` | Capsule locking | HIGH |
| `server/lib/capsuleIntegration.js` | Capsule integration | HIGH |
| `server/lib/capsuleUpdater.js` | Capsule updates | HIGH |
| `server/lib/capsuleMaintenance.js` | Capsule maintenance | MEDIUM |
| `server/lib/capsuleIntegrityValidator.js` | Capsule validation | MEDIUM |

### 9. Server-Side AI Logic
Backend AI logic moves to VVAULT.

| File | Purpose | Priority |
|------|---------|----------|
| `server/lib/aiManager.js` | AI manager | **CRITICAL** |
| `server/lib/identityLoader.js` | Identity loading | **CRITICAL** |
| `server/lib/identityDriftPrevention.js` | Drift prevention | HIGH |
| `server/lib/personaLockValidator.js` | Persona lock validation | HIGH |
| `server/lib/gptRuntimeBridge.js` | GPT runtime bridge | HIGH |
| `server/lib/gptManager.js` | GPT management | HIGH |
| `server/lib/gptSaveHook.js` | GPT save hooks | MEDIUM |
| `server/lib/unifiedIntelligenceOrchestrator.js` | Intelligence orchestration | **CRITICAL** |
| `server/lib/vvaultMemoryManager.js` | VVAULT memory manager | HIGH |

---

## STAYS IN CHATTY (UI Layer)

### 1. Components (All Stay)
```
src/components/
├── Layout.tsx          # Main layout
├── Chat.tsx            # Chat UI
├── Sidebar.tsx         # Sidebar navigation
├── Message.tsx         # Message rendering
├── GPTCreator.tsx      # GPT creation UI
├── SimForge.tsx        # SimForge UI
├── Settings/           # Settings UI
└── ...all other UI components
```

### 2. UI Utilities (Stay)
| File | Purpose |
|------|---------|
| `src/lib/ThemeContext.tsx` | Theme management |
| `src/lib/themeManager.ts` | Theme utilities |
| `src/lib/themeTokens.ts` | Theme tokens |
| `src/lib/auth.ts` | Authentication |
| `src/lib/sessionManager.ts` | UI session management |
| `src/lib/sessionActivityTracker.ts` | Activity tracking for UI |
| `src/lib/eventBus.ts` | UI event bus |
| `src/lib/storage.ts` | Local storage utilities |
| `src/lib/chatStarters.ts` | Chat starter prompts |
| `src/lib/chattyTips.ts` | UI tips |

### 3. VVAULT API Clients (Stay - becomes thinner)
| File | Purpose |
|------|---------|
| `src/lib/aiService.ts` | **Becomes thin HTTP client** - all inference logic moves to VVAULT, this just calls `/api/aurora/orchestrate` |
| `src/lib/vvaultConversationManager.ts` | Calls VVAULT API for conversations |
| `src/lib/VVAULTTranscriptLoader.ts` | Loads transcripts from VVAULT |
| `src/lib/vvaultRetrieval.ts` | Retrieves from VVAULT |
| `vvaultConnector/vvaultApiClient.js` | VVAULT API client |
| `vvaultConnector/supabaseStore.js` | Supabase client |

### 4. Conversation/State Management (Stay - UI-level)
| File | Purpose |
|------|---------|
| `src/lib/conversationManager.ts` | localStorage backup/sync for UI state - NOT AI logic |
| `src/lib/runtimeDeletionManager.ts` | UI-level deletion handling |
| `src/lib/messageRecovery.ts` | Message recovery utilities |

### 5. Scripts & Tools (Stay)
| File | Purpose |
|------|---------|
| `src/lib/slashCommands/index.ts` | Slash command handling |
| `src/lib/cliBridge.ts` | CLI bridge |
| `src/lib/backupSystem.ts` | Backup utilities |
| `src/lib/dataRecovery.ts` | Data recovery |
| `src/lib/migration.ts` | Migration utilities |

---

## VVAULT ENDPOINTS NEEDED (Aurora's API)

Based on the transfer, VVAULT needs these endpoints:

### Core Orchestration
```
POST /api/aurora/orchestrate
  - Takes: userId, constructId, message, conversationHistory
  - Returns: response, contextUsed, memories
  - Does: Full orchestration (persona routing, memory, inference)

POST /api/aurora/persona-route
  - Takes: constructId, message, lastResponse
  - Returns: shouldRouteToLin, driftScore, reason
  - Does: Persona routing decision

POST /api/aurora/enforce-identity
  - Takes: constructId, response
  - Returns: enforcedResponse, violations
  - Does: Identity enforcement on generated response
```

### Memory
```
POST /api/aurora/memory/inject
  - Takes: userId, sessionId, context
  - Returns: injectedMemories, totalTokens
  - Does: Memory injection for context

POST /api/aurora/memory/store
  - Takes: userId, constructId, message, role
  - Returns: memoryId
  - Does: Stores message in long-term memory

GET /api/aurora/memory/retrieve
  - Takes: userId, constructId, query, limit
  - Returns: memories[]
  - Does: Semantic memory retrieval
```

### Identity
```
GET /api/aurora/identity/:constructId
  - Returns: capsule, blueprint, identity files
  - Does: Loads construct identity

POST /api/aurora/drift/check
  - Takes: constructId, response
  - Returns: driftScore, driftDetected, indicators
  - Does: Checks for identity drift
```

### Triad
```
GET /api/aurora/triad/status
  - Returns: healthy, latency, failedSeats
  - Does: Checks triad availability (Ollama, Memory, Identity)
```

---

## MIGRATION APPROACH

### Phase 1: Create VVAULT Endpoints
1. Stand up Aurora's orchestration endpoints in VVAULT
2. Mirror current Chatty logic 1:1
3. Add contract tests comparing outputs

### Phase 2: Thin Chatty's API Layer
1. Update `src/lib/aiService.ts` to call VVAULT's `/api/aurora/orchestrate`
2. Remove local orchestration, keep only API calls
3. Maintain fallback to local for dev/offline

### Phase 3: Move Server Logic
1. Transfer `server/lib/aiManager.js` logic to VVAULT
2. Update Chatty's server routes to proxy to VVAULT
3. Remove redundant code

### Phase 4: Clean Up
1. Delete transferred files from Chatty
2. Update imports throughout
3. Document new architecture

---

## FILE COUNT SUMMARY

| Category | Files | Status |
|----------|-------|--------|
| Orchestration | 11 | Transfer to VVAULT |
| Persona/Lin | 5 | Transfer to VVAULT |
| Identity/Drift | 12 | Transfer to VVAULT |
| Memory | 14 | Transfer to VVAULT |
| Inference | 14 | Transfer to VVAULT |
| Transcript/Context | 8 | Transfer to VVAULT |
| Reasoning | 7 | Transfer to VVAULT |
| Capsule | 6 | Transfer to VVAULT |
| Server AI | 9 | Transfer to VVAULT |
| **TOTAL TO TRANSFER** | **86** | |
| UI Components | ~40+ | Stays in Chatty |
| UI Utilities | ~15 | Stays in Chatty |
| API Clients | 5 | Stays (becomes thinner) |
| Scripts/Tools | 5 | Stays in Chatty |

---

## RESULT

**After transfer:**
- Chatty: ~65 files (UI, scripts, tools, API clients)
- VVAULT: +86 files (all AI orchestration)

**Chatty becomes:**
- React UI for messaging
- Theme/settings management
- Authentication flow
- Thin API client calling VVAULT

**VVAULT/Aurora becomes:**
- All LLM inference
- Memory management
- Identity enforcement
- Persona routing (Lin undertone)
- Continuity packet generation
- Transcript management
