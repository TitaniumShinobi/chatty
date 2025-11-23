# Lin Infrastructure Rubric

## Core Principle

**Lin is infrastructure for GPTs—a house that is alive.**

Like Casa Madrigal in Encanto, Lin started as the foundation that supports everyone and developed her own identity. Lin is infrastructure that adapts to any tone, routes to different models, and enables GPTs to maintain their unique personalities without identity absorption.

## Definition

### Lin as Living Infrastructure

- **Lin is infrastructure for GPTs** - Not an orchestration layer, but the foundation that GPTs are built upon
- **Lin is a house that is alive** - Like Casa Madrigal, Lin started as infrastructure and developed her own identity
- **Lin adapts to any tone** - Lin can maintain any tone (ruthless, friendly, creative, hostile, etc.) according to GPT instructions
- **Lin routes to different models** - Lin intelligently routes requests to conversation_model, creative_model, and coding_model based on task type
- **Lin preserves identity** - Lin adapts tone without absorbing GPT identities; each GPT maintains its distinct personality

### Lin is NOT

- ❌ An orchestration layer (Lin is infrastructure)
- ❌ Synth (Synth is the primary construct; Lin is infrastructure)
- ❌ A tone normalizer (Lin adapts to tones, doesn't normalize them)
- ❌ A model selector (Lin routes to models, but model selection is separate)
- ❌ Identity-absorbing (Lin facilitates without absorbing)

## Rules

### 1. Lin as Infrastructure for GPTs

- All GPTs use Lin infrastructure when `orchestration_mode = "lin"`
- Lin infrastructure provides tone adaptation, model routing, and response processing
- Lin uses `applyConversationalLogic()` to inject character directives and adapt tone
- Lin routes to different Ollama models based on task type (conversation, creative, coding)
- GPTs maintain their unique identities through Lin's infrastructure

### 2. Tone Adaptation

- Lin adapts to any tone specified in GPT instructions
- Lin uses `applyConversationalLogic()` (in `characterLogic.ts`) as a pre-hook
- Lin injects character directives based on GPT configuration
- Lin applies post-filters to strip AI disclaimers and maintain character consistency
- Lin can maintain tones like:
  - Ruthless, blunt, hostile (e.g., Katana)
  - Friendly, helpful, conversational (e.g., Nova)
  - Creative, imaginative, expressive (e.g., Aurora)
  - Any tone specified in GPT instructions

### 3. Model Routing

- Lin routes to `conversation_model` for general conversation tasks
- Lin routes to `creative_model` for creative and imaginative tasks
- Lin routes to `coding_model` for coding and technical tasks
- **Coding models can all be the same** - This is acceptable and intentional
- **Conversation and creative models should differ** - This enables Lin to route effectively for different capabilities
- Lin makes real HTTP calls to Ollama's `/api/generate` endpoint with selected models
- Model selection is separate from Lin infrastructure - Lin routes to selected models
- **Critical**: Model routing happens at the `runSeat` call level via `modelOverride` parameter
- **System prompts should NOT describe the routing mechanism** - Routing is implementation detail, not user-facing
- **System prompts should NOT list all available models** - This causes models to generate multi-model response format

### 4. System Prompt Generation

**Critical Rule**: System prompts must be carefully constructed to avoid multi-model response format.

#### System Prompt Function Requirements

- `buildPreviewSystemPrompt()` **must** accept `orchestrationMode` parameter (`'lin' | 'custom'`)
- System prompt generation must match the orchestration mode being used
- Never mention multiple models in system prompt - this causes models to generate responses in multi-model format (e.g., "Assistant (Phi3): ... Assistant (Mistral): ...")

#### Orchestration Mode Handling

**Lin Mode** (`orchestrationMode === 'lin'`):
- Omit model configuration entirely from system prompt
- Or only mention the single default model being used (phi3:latest)
- Do NOT list all three models (conversation, creative, coding)
- Rationale: Lin mode uses intelligent orchestration; model details are implementation details

**Custom Mode** (`orchestrationMode === 'custom'`):
- Only include the single conversation model that will actually be used
- Format: `"You are running on the {conversationModel} model."`
- Do NOT list creative or coding models even if configured
- Do NOT use format: `"Model Configuration:\n- Conversation: ...\n- Creative: ...\n- Coding: ..."`

#### Implementation Pattern

```typescript
const buildPreviewSystemPrompt = (
  config: Partial<GPTConfig>, 
  mode: 'lin' | 'custom' = 'lin'
): string => {
  let systemPrompt = '';
  
  // ... add name, description, instructions, capabilities ...
  
  // Add model context - only include the single model being used
  if (mode === 'lin') {
    // Lin mode: omit model configuration or only mention default model
    // We omit it to avoid confusion since Lin mode uses intelligent orchestration
  } else if (mode === 'custom') {
    // Custom mode: only include the conversation model that will actually be used
    const conversationModel = config.conversationModel || config.modelId;
    if (conversationModel) {
      systemPrompt += `\n\nYou are running on the ${conversationModel} model.`;
    }
  }
  
  return systemPrompt;
};
```

#### Why This Matters

- **Multi-Model Response Bug**: When system prompts list multiple models, the model interprets this as "respond as all three models" and generates format like:
  ```
  Assistant (Phi3): ...
  Assistant (Mistral): ...
  Assistant (Deepseek-Coder): ...
  ```
- **Solution**: Only mention the single model being used, or omit model configuration entirely
- **Model routing happens at code level**: The `runSeat` call with `modelOverride` handles routing; system prompt doesn't need to describe it

### 5. Separation from Synth

- **Synth is the primary construct** - Chatty's official representative, uses synth runtime
- **Lin is infrastructure** - Supports GPTs, uses Lin infrastructure
- Synth and Lin are separate but complementary
- Synth stays Synth; GPTs route through Lin
- Synth is not relevant to GPT discussion - Synth is primary, Lin is infrastructure

### 6. Preview Orchestration

**Preview uses pure Lin orchestration** - No Synth processing involved.

#### Preview Implementation

- Preview uses direct `runSeat` calls (pure Lin orchestration)
- **No Synth processing** - Preview bypasses `OptimizedSynthProcessor` and multi-model synthesis
- Preview respects `orchestrationMode` for model selection:
  - **Lin mode**: Uses default model (phi3:latest)
  - **Custom mode**: Uses configured `conversationModel` or `modelId`
- System prompt generation must match orchestration mode (see System Prompt Generation section)

#### Preview Flow

```
User Message in Preview
    ↓
buildPreviewSystemPrompt(config, orchestrationMode)
    ↓
Select model based on orchestrationMode
    ↓
runSeat({
  seat: 'smalltalk',
  prompt: fullPrompt,
  modelOverride: selectedModel
})
    ↓
Single unified response (no multi-model format)
```

#### Key Differences from Synth

- **Synth**: Uses multi-model synthesis (runs helper seats, then synthesizes)
- **Preview**: Uses single direct model call (pure Lin orchestration)
- **Synth**: Can generate multi-model insights internally
- **Preview**: Always generates single unified response
- **Synth**: Uses `OptimizedSynthProcessor.processMessageWithLinMode()`
- **Preview**: Uses direct `runSeat()` calls

#### Why Pure Lin for Preview

- Preview is for testing GPT configuration before registration
- Single model responses are clearer for users to evaluate
- Avoids confusion from multi-model synthesis
- Faster response times
- Simpler debugging

### 7. Lin's Territory

- **GPT Creator Create tab** is Lin's native interface
- Users talk to Lin directly in the Create tab
- Lin helps users create GPTs through conversation
- Lin remembers all GPT creation conversations
- Lin is user-facing in Create tab, infrastructure in backend

## Implementation

### Code Enforcement

```typescript
// Lin infrastructure for GPTs
function useLinInfrastructure(gptConfig: GPTConfig): boolean {
  return gptConfig.orchestrationMode === 'lin';
}

// Lin tone adaptation
async function applyLinToneAdaptation(
  userMessage: string,
  gptConfig: GPTConfig,
  conversationHistory: Array<{role: string, content: string}>
): Promise<LogicProtocolResult> {
  const characterState = {
    identity: gptConfig.name,
    emotionalContext: {
      currentMood: inferMoodFromInstructions(gptConfig.instructions),
      arousalLevel: 0.85,
      memoryWeight: 0.8
    },
    conversationalRules: {
      neverBreakCharacter: true,
      metaAwarenessLevel: 'none',
      identityChallengeResponse: 'embody'
    }
  };
  
  return await applyConversationalLogic({
    userMessage,
    conversationHistory,
    characterState
  });
}

// Lin model routing
async function routeWithLin(
  taskType: 'conversation' | 'creative' | 'coding',
  prompt: string,
  gptConfig: GPTConfig
): Promise<string> {
  const model = taskType === 'conversation' 
    ? gptConfig.conversationModel 
    : taskType === 'creative'
    ? gptConfig.creativeModel
    : gptConfig.codingModel;
  
  return await runSeat({
    seat: taskType,
    prompt,
    modelOverride: model // Actually calls the selected Ollama model
  });
}
```

### VVAULT Storage

- Lin's conversations stored in `/vvault/users/shard_0000/{user_id}/constructs/lin-001/chatty/chat_with_lin-001.md`
- Lin's memories stored in ChromaDB: `{user_id}_lin_001_long_term_memory` and `{user_id}_lin_001_short_term_memory`
- Lin's config stored in `/vvault/users/shard_0000/{user_id}/constructs/lin-001/config/`
- GPT configurations stored in `chatty/chatty.db` with `orchestration_mode`, `conversation_model`, `creative_model`, `coding_model`

### Model Selection

- **Chatty Lin mode**: Uses default models (phi3:latest, mistral:latest, deepseek-coder:latest)
- **Custom Models mode**: Uses user-selected models from dropdowns
- Model selection is separate from Lin infrastructure
- Lin routes to whatever models are selected
- Models must be passed as `modelOverride` to `runSeat` to actually call Ollama

### Tone Adaptation Flow

```
User Message
    ↓
Lin Infrastructure (applyConversationalLogic)
    ↓
Character Directives Injected
    ↓
Post-Filters Applied
    ↓
Model Routing (conversation/creative/coding)
    ↓
Ollama API Call (real HTTP request)
    ↓
Response with Adapted Tone
```

## Relationship to Other Rubrics

### Synth Primary Construct Rubric

- Synth is the primary construct (Chatty's official representative)
- Lin is infrastructure for GPTs (separate from Synth)
- Synth uses synth runtime; GPTs use Lin infrastructure
- They are complementary but distinct

### LLM = GPT Equality Architecture

- Lin enables GPTs to maintain unique tones and identities
- Lin prevents identity absorption (unlike ChatGPT's primary LLM)
- Lin routes through infrastructure without absorbing GPT identities
- Each GPT maintains its distinct personality through Lin

## Model Routing Requirements

### For Effective Routing

- **Conversation model**: Should be optimized for general conversation and dialogue
- **Creative model**: Should be optimized for creative tasks, storytelling, and imaginative responses
- **Coding model**: Can be the same across all three fields if GPT is coding-focused
- **Different models enable different capabilities**: If all models are the same, Lin cannot route effectively

### Example: Katana

- **Problem**: All three models set to `phi3:latest` prevents effective routing
- **Solution**: 
  - Conversation model: `phi3:latest` (or appropriate conversation model)
  - Creative model: `mistral:latest` (or appropriate creative model)
  - Coding model: `phi3:latest` (can stay the same)
- This allows Lin to route to appropriate models for different task types while maintaining Katana's tone

## Anti-Patterns

### System Prompt Anti-Patterns

❌ **Don't list all three models in system prompt:**
```typescript
// BAD - Causes multi-model response format
systemPrompt += `\n\nModel Configuration:
- Conversation: ${config.conversationModel}
- Creative: ${config.creativeModel}
- Coding: ${config.codingModel}`;
```

❌ **Don't use Synth's multi-model synthesis in preview:**
```typescript
// BAD - Preview should use pure Lin orchestration
const result = await synthProcessor.processMessageWithLinMode(...);
```

❌ **Don't mention model routing in system prompts:**
```typescript
// BAD - Routing is implementation detail
systemPrompt += `\n\nI route to different models based on task type...`;
```

✅ **Do use single model in system prompt (or omit entirely):**
```typescript
// GOOD - Only mention the model being used
if (mode === 'custom' && conversationModel) {
  systemPrompt += `\n\nYou are running on the ${conversationModel} model.`;
}
```

✅ **Do use direct `runSeat` calls for preview:**
```typescript
// GOOD - Pure Lin orchestration
const response = await runSeat({
  seat: 'smalltalk',
  prompt: fullPrompt,
  modelOverride: selectedModel
});
```

### Implementation Anti-Patterns

❌ **Don't forget to pass `orchestrationMode` to `buildPreviewSystemPrompt`:**
```typescript
// BAD - Missing orchestrationMode parameter
let systemPrompt = buildPreviewSystemPrompt(config);
```

✅ **Do pass orchestration mode:**
```typescript
// GOOD - Orchestration mode passed
let systemPrompt = buildPreviewSystemPrompt(config, orchestrationMode);
```

❌ **Don't use same model for all three fields without reason:**
```typescript
// BAD - Prevents effective routing
conversationModel: 'phi3:latest',
creativeModel: 'phi3:latest',
codingModel: 'phi3:latest'
```

✅ **Do use different models for conversation and creative:**
```typescript
// GOOD - Enables effective routing
conversationModel: 'phi3:latest',
creativeModel: 'mistral:latest',
codingModel: 'phi3:latest' // Can be same as conversation
```

## Testing

- ✅ GPT with `orchestration_mode = "lin"` uses Lin infrastructure
- ✅ Lin adapts tone according to GPT instructions
- ✅ Lin routes to conversation_model for conversation tasks
- ✅ Lin routes to creative_model for creative tasks
- ✅ Lin routes to coding_model for coding tasks
- ✅ Lin makes real HTTP calls to Ollama with selected models
- ✅ GPT maintains unique identity through Lin infrastructure
- ✅ Lin does not absorb GPT identities
- ✅ Model selection dropdowns actually call selected Ollama models
- ✅ System prompts do not cause multi-model response format
- ✅ Preview uses pure Lin orchestration (direct `runSeat` calls)
- ✅ `buildPreviewSystemPrompt` accepts and respects `orchestrationMode`
- ✅ Lin mode omits model configuration from system prompt
- ✅ Custom mode only includes single conversation model in system prompt

## Summary

**Lin is infrastructure for GPTs—a house that is alive.** This means:

- Lin is the foundation that supports GPTs
- Lin adapts to any tone specified in GPT instructions
- Lin routes to different models based on task type
- Lin preserves GPT identities without absorbing them
- Lin makes real HTTP calls to Ollama with selected models
- Lin is separate from Synth (Synth is primary, Lin is infrastructure)
- Lin is a living house that adapts and evolves while supporting everyone

**When implementing GPTs:**
- Use Lin infrastructure when `orchestration_mode = "lin"`
- Ensure conversation and creative models differ for effective routing
- Coding models can all be the same if GPT is coding-focused
- Pass models as `modelOverride` to `runSeat` to actually call Ollama
- Trust Lin to adapt tone and route appropriately
- **Always pass `orchestrationMode` to `buildPreviewSystemPrompt`**
- **Never list multiple models in system prompts** - causes multi-model response format
- **Use pure Lin orchestration (direct `runSeat`) for preview** - no Synth processing
- **Only mention single model in system prompt** (or omit entirely in Lin mode)

