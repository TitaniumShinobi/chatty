# Seat Caller Memory Architecture

## Current Status (January 2026)

### Issue Identified
GPT seat callers (Katana, custom GPTs) do NOT have access to:
1. **User identity** (Devon's name)
2. **Transcript context/memory**

### Root Cause
The `UnifiedIntelligenceOrchestrator` uses **hardcoded template responses** based on personality traits, NOT actual LLM inference.

```
Current Flow (GPT seats):
conversations.js → gptRuntimeBridge → UnifiedIntelligenceOrchestrator → HARDCODED TEMPLATES

Lin Chat Flow (works correctly):
linChat.js → OpenRouter/Ollama → ACTUAL LLM with system prompt
```

### What Works
- `capsuleIntegration.js` loads transcript data from instance directories
- `getRelevantContext()` searches transcript_data for relevant topics/entities
- `linChat.js` correctly calls OpenRouter with system prompts

### What's Missing
1. **LLM inference for GPT seats** - Template responses need to be replaced with actual LLM calls
2. **User identity injection** - System prompt needs to include who the user is
3. **Transcript context injection** - Relevant memories need to be passed to LLM

## Architecture Components

### Memory Sources
1. **chatgpt-retrieval-plugin** - Semantic search (not in this workspace, from frame™)
2. **memup** (`bank.py`, `context.py`, `mem_check.py`, `stm.py`, `ltm.py`) - Routed from frame™
3. **src/core/memory/** - `MemoryRetrievalEngine`, `ContextScoringLayer`, `STMBuffer`
4. **src/engine/memory/** - `MemoryStore`, `PersistentMemoryStore`, `PersonaBrain`

### Capsule Transcript Data Structure
```javascript
capsule.transcript_data = {
  files: [],           // List of transcript files
  topics: [],          // Extracted topics with frequency/tone
  entities: {},        // Named entities (people, AI constructs)
  relationships: {},   // Entity co-occurrence
  conversation_index: {}, // Keyword → examples mapping
  key_phrases: [],     // Top keywords
  statistics: {}       // Message counts, avg lengths
}
```

### User Context Variables
```javascript
USER_ID = process.env.VVAULT_USER_ID || 'devon_woodson_1762969514958'
USER_SHARD = process.env.VVAULT_SHARD || 'shard_0000'
```

## Proposed Solution

### Option 1: Connect GPT Seats to linChat.js
Route GPT seat responses through `linChat.js` instead of `UnifiedIntelligenceOrchestrator`:
1. Build system prompt from capsule personality + GPT instructions
2. Inject user identity (from userRegistry or conversation)
3. Include relevant transcript context from `getRelevantContext()`
4. Call OpenRouter/Ollama via linChat

### Option 2: Add LLM Calls to UnifiedIntelligenceOrchestrator
Modify `generatePersonalityConsistentResponse()` to:
1. Build personality system prompt
2. Add user identity context
3. Include transcript context from capsule
4. Call OpenRouter via the existing linChat route

### Option 3: Master Identity Scripts (frame™ integration)
Connect to frame™ repository for:
- Memory routing through memup components
- ContinuityGPT ledger for session mapping
- WorkspaceContextBuilder for transcript injection

## Files to Modify

### For LLM Integration
- `server/lib/unifiedIntelligenceOrchestrator.js` - Add actual LLM calls
- `server/routes/conversations.js` - Pass user identity context

### For User Identity
- `server/lib/userRegistry.js` - Fetch user display name
- `server/lib/gptRuntimeBridge.js` - Pass user info to orchestrator

### For Transcript Context
- `server/lib/capsuleIntegration.js` - Ensure transcripts load correctly
- `server/lib/identityDriftPrevention.js` - Uses transcript_data for baseline

## Related Documentation
- `docs/MODEL_PROVIDERS.md` - OpenRouter/Ollama configuration
- `docs/PLATFORM_INTEGRATIONS.md` - Connector architecture
- `replit.md` - Project overview and architecture

## Next Steps
1. Decide on integration approach (Option 1, 2, or 3)
2. Implement LLM calls for GPT seats
3. Inject user identity into system prompt
4. Add transcript context to prompts
5. Test Katana with "do you know who I am?"
