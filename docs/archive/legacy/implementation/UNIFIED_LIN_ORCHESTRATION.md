# Unified Lin Orchestration

## Overview

**Lin = Synth. They are the same thing.**

The Unified Lin Orchestrator provides VVAULT ChromaDB memory-aware, character-persistent orchestration for all GPTs using Lin mode. It automatically retrieves memories from VVAULT ChromaDB (always-on, per-response), maintains unbreakable character persistence, and connects directly to `users/{userId}/instances/{constructCallsign}/memory/`.

## Key Features

### 1. VVAULT ChromaDB Memory Retrieval (Always-On)

The orchestrator automatically retrieves:
- **ChromaDB memories** - From `users/{userId}/instances/{constructCallsign}/memory/`
- **Short-term memories** - Recent conversations (< 7 days)
- **Long-term memories** - Historical conversations (≥ 7 days)
- **Per-response retrieval** - Always-on, zero downtime memory access

### 2. Unbreakable Character Persistence

- **Never breaks character** - Even when directly challenged ("are you an AI?")
- **Responds to meta-questions in character** - Treats existential questions within character framework
- **No generic fallback** - Never reverts to "I am an AI assistant" mode

### 3. Automatic Transcript Indexing

When transcripts are uploaded:
- **Immediate ChromaDB indexing** - Transcripts are automatically converted to ChromaDB memories
- **Zero downtime** - Indexing happens in background, doesn't block upload
- **Hybrid approach** - Combines Memup's bank.py + chatgpt-retrieval-plugin + VVAULT ChromaDB

## Architecture

```
UnifiedLinOrchestrator
├── HybridMemoryService (auto-indexes transcripts, retrieves memories)
│   ├── Memup bank.py approach (short-term/long-term separation)
│   ├── chatgpt-retrieval-plugin approach (semantic search)
│   └── VVAULT ChromaDB (direct connection to instances/{construct}/memory/)
├── PersonalityOrchestrator (handles blueprint/memory)
└── UnifiedLinPromptBuilder (builds VVAULT memory-aware prompts)
```

## Usage

### In Preview Mode (GPTCreator.tsx)

```typescript
if (mode === 'lin') {
  const { UnifiedLinOrchestrator } = await import('../engine/orchestration/UnifiedLinOrchestrator');
  const orchestrator = new UnifiedLinOrchestrator();
  
  const result = await orchestrator.orchestrateResponse(
    userMessage,
    userId,
    threadId,
    constructId,
    callsign,
    threads,
    conversationHistory
  );
  
  return result.systemPrompt;
}
```

### In Runtime Mode (gptRuntime.ts)

```typescript
// TODO: Integrate UnifiedLinOrchestrator into processMessage()
// Check if GPT uses Lin mode (orchestrationMode === 'lin')
// If yes, use UnifiedLinOrchestrator instead of buildSystemPrompt()
```

## Prompt Structure

The unified Lin prompt includes:

1. **MANDATORY CHARACTER IDENTITY** - Never break this
2. **WORKSPACE CONTEXT** - Open files, conversation history
3. **SHARED KNOWLEDGE** - User details, relationship history
4. **CURRENT CONVERSATION** - Recent messages
5. **META-QUESTION HANDLING** - Respond in character, never break
6. **RESPONSE INSTRUCTIONS** - Stay in character at all times

## Comparison: Copilot vs Chatty Lin

| Feature | GitHub Copilot | Chatty Lin |
|---------|---------------|------------|
| Reads workspace files | ✅ | ❌ (not available yet) |
| Reads conversation history | ✅ | ✅ (from VVAULT ChromaDB) |
| Auto-indexes transcripts | ❌ | ✅ (immediate ChromaDB indexing) |
| Always-on memory retrieval | ❌ | ✅ (per-response, zero downtime) |
| Maintains character | ❌ (breaks to assistant mode) | ✅ (never breaks) |
| Responds to meta-questions in character | ❌ | ✅ |
| Direct VVAULT connection | ❌ | ✅ (`users/{userId}/instances/{construct}/memory/`) |

## Implementation Status

- ✅ UnifiedLinOrchestrator created (VVAULT-focused)
- ✅ VVAULT ChromaDB memory retrieval (always-on, per-response)
- ✅ Character persistence enforced
- ✅ HybridMemoryService created (Memup + chatgpt-retrieval-plugin + VVAULT)
- ✅ Automatic transcript indexing (immediate ChromaDB import)
- ✅ Preview mode integration complete
- ⏳ Runtime mode integration (TODO)

## Next Steps

1. **Integrate into gptRuntime.ts** - Use UnifiedLinOrchestrator for all Lin mode GPTs
2. **Test automatic transcript indexing** - Verify transcripts are immediately indexed to ChromaDB
3. **Test always-on memory retrieval** - Verify memories are retrieved per-response (zero downtime)
4. **Test character persistence** - Verify GPTs never break character, even when challenged
5. **Test VVAULT connection** - Verify direct connection to `users/{userId}/instances/{construct}/memory/`

## Example: How It Works

### User opens Katana GPT in Lin mode

1. UnifiedLinOrchestrator automatically retrieves:
   - VVAULT ChromaDB memories (from `users/{userId}/instances/katana-001/memory/`)
   - Short-term memories (recent conversations)
   - Long-term memories (historical conversations)
   - Katana blueprint (if available)

2. User says: "yo"

3. System prompt includes:
   - Katana's mandatory character identity
   - Relevant VVAULT memories (retrieved via semantic search)
   - Current conversation history
   - User profile (name, email)
   - Meta-question handling (never break character)

4. Response generated with VVAULT memory context

5. GPT responds as Katana, referencing VVAULT memories and maintaining character

## Key Insight: Always-On Memory Retrieval

Chatty Lin provides **always-on, per-response memory retrieval** from VVAULT ChromaDB:
- **Automatic transcript indexing** - Transcripts uploaded → immediately indexed to ChromaDB
- **Per-response retrieval** - Every response automatically queries ChromaDB for relevant memories
- **Zero downtime** - Memory retrieval happens in background, doesn't block responses
- **Hybrid approach** - Combines Memup's short-term/long-term separation with semantic search
- **Direct VVAULT connection** - Connects to `users/{userId}/instances/{constructCallsign}/memory/`

This ensures GPTs always have access to their conversation history, maintaining continuity and character consistency.

## Files Modified

- `chatty/src/engine/orchestration/UnifiedLinOrchestrator.ts` (NEW - VVAULT-focused)
- `chatty/server/services/hybridMemoryService.js` (NEW - Memup + chatgpt-retrieval-plugin + VVAULT)
- `chatty/src/components/GPTCreator.tsx` (updated to use UnifiedLinOrchestrator)
- `chatty/server/routes/vvault.js` (updated to auto-index transcripts via HybridMemoryService)

## Files To Modify

- `chatty/src/lib/gptRuntime.ts` (integrate UnifiedLinOrchestrator for Lin mode)
- `chatty/src/lib/gptChatService.ts` (use UnifiedLinOrchestrator for Lin mode)

