# Implement Preview Panel Orchestration Mode Selection

## Problem Statement

The preview panel in `GPTCreator.tsx` currently ignores the "Tone & Orchestration" selection in the Configure tab. When users switch between "Chatty Lin" and "Custom Models", the preview should change to use the appropriate models, but it currently always uses default models regardless of the selection.

**Critical Issue**: The model selection dropdowns are purely cosmetic - they don't actually call the selected Ollama models. The preview always uses default models from `loadSeatConfig()`.

## Current Behavior

- Preview always calls `OptimizedSynthProcessor.processMessageWithLinMode()` (line 980)
- Ignores the `orchestrationMode` state variable (line 105)
- Doesn't use `config.conversationModel`, `config.creativeModel`, or `config.codingModel` when "Custom Models" is selected
- `processMessageWithLinMode` internally uses `loadSeatConfig()` which returns default models, not the custom selections
- Selected models in dropdowns are never passed to Ollama API calls

## Required Behavior

1. **When "Chatty Lin" mode is selected** (`orchestrationMode === 'lin'`):
   - Use default models: `phi3:latest` (conversation), `mistral:latest` (creative), `deepseek-coder:latest` (coding)
   - Continue using `processMessageWithLinMode()` with default model routing
   - This is the current behavior and should remain unchanged

2. **When "Custom Models" mode is selected** (`orchestrationMode === 'custom'`):
   - Use `config.conversationModel`, `config.creativeModel`, `config.codingModel`
   - **CRITICAL**: Pass these as `modelOverride` to `runSeat` calls to actually call the selected Ollama models
   - Apply Lin infrastructure (`applyConversationalLogic`) for tone adaptation
   - Route to appropriate models based on task type (conversation vs creative vs coding)

## Implementation Details

### File to Modify
- `chatty/src/components/GPTCreator.tsx`
- Function: `handlePreviewSubmit` (lines 933-1017)

### Key Components

1. **`orchestrationMode` state** (line 105):
   - Type: `'lin' | 'custom'`
   - Controls which mode is active

2. **Model configuration** (lines 69-72):
   - `config.conversationModel` - Model for conversation tasks
   - `config.creativeModel` - Model for creative tasks
   - `config.codingModel` - Model for coding tasks

3. **`runSeat` function** (`chatty/src/lib/browserSeatRunner.ts`):
   - Accepts `modelOverride` parameter (line 69)
   - Makes real HTTP calls to Ollama's `/api/generate` endpoint (lines 94-115)
   - When `modelOverride` is provided, it actually calls that specific Ollama model

4. **`applyConversationalLogic` function** (`chatty/src/engine/characterLogic.ts`):
   - Applies tone adaptation based on GPT instructions
   - Returns `modifiedPrompt`, `systemDirectives`, and `postProcessHooks`
   - Should be used for both modes to maintain tone

### Implementation Approach

#### Option A: Modify `processMessageWithLinMode` to Accept Model Overrides
- Check if `processMessageWithLinMode` can be extended to accept model overrides
- If yes, pass custom models when `orchestrationMode === 'custom'`

#### Option B: Use `runSeat` Directly with Custom Models (Recommended)
- When `orchestrationMode === 'custom'`, bypass `processMessageWithLinMode`
- Use `runSeat` directly with `modelOverride` for each seat type
- Apply `applyConversationalLogic` before calling `runSeat`
- Route to appropriate model based on task type or use all three and synthesize

### Code Pattern for Custom Models Mode

```typescript
if (orchestrationMode === 'custom') {
  // Apply Lin tone adaptation
  const { applyConversationalLogic } = await import('../engine/characterLogic');
  
  const characterState = {
    identity: config.name || 'GPT',
    emotionalContext: {
      currentMood: inferMoodFromInstructions(config.instructions),
      arousalLevel: 0.85,
      memoryWeight: 0.8
    },
    conversationalRules: {
      neverBreakCharacter: true,
      metaAwarenessLevel: 'none',
      identityChallengeResponse: 'embody'
    }
  };
  
  const linResult = await applyConversationalLogic({
    userMessage,
    conversationHistory: previewMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    characterState
  });
  
  // Build full prompt with system directives
  const fullPrompt = `${systemPrompt}\n\n${linResult.systemDirectives.join('\n')}\n\n${linResult.modifiedPrompt}`;
  
  // Route to conversation model (for general responses)
  const { runSeat } = await import('../lib/browserSeatRunner');
  const response = await runSeat({
    seat: 'smalltalk',
    prompt: fullPrompt,
    modelOverride: config.conversationModel || 'phi3:latest'
  });
  
  // Apply post-processing hooks
  let finalResponse = response;
  for (const hook of linResult.postProcessHooks) {
    finalResponse = hook(finalResponse);
  }
  
  return finalResponse;
}
```

### Task Type Detection (Optional Enhancement)

For more sophisticated routing, you could detect task type and route accordingly:

```typescript
function detectTaskType(message: string): 'conversation' | 'creative' | 'coding' {
  const codingKeywords = ['code', 'function', 'class', 'variable', 'debug', 'error', 'syntax'];
  const creativeKeywords = ['story', 'poem', 'creative', 'imagine', 'design', 'artistic'];
  
  const lowerMessage = message.toLowerCase();
  
  if (codingKeywords.some(kw => lowerMessage.includes(kw))) {
    return 'coding';
  }
  if (creativeKeywords.some(kw => lowerMessage.includes(kw))) {
    return 'creative';
  }
  return 'conversation';
}
```

## Requirements

1. **Respect `orchestrationMode` state**: Check the mode before processing
2. **Use custom models when selected**: Pass `modelOverride` to `runSeat` calls
3. **Apply Lin tone adaptation**: Use `applyConversationalLogic` for both modes
4. **Make real Ollama calls**: Ensure selected models are actually called via `modelOverride`
5. **Maintain backward compatibility**: "Chatty Lin" mode should work exactly as before
6. **Error handling**: Provide clear error messages if selected models are unavailable

## Testing Checklist

- [ ] Switching to "Custom Models" mode changes preview behavior
- [ ] Selected models in dropdowns are actually called (verify via network tab)
- [ ] "Chatty Lin" mode still uses default models (phi3, mistral, deepseek-coder)
- [ ] Tone adaptation works correctly in both modes
- [ ] Error messages appear if selected model is unavailable
- [ ] Preview responses reflect different model characteristics when models are changed

## Files to Reference

- `chatty/src/components/GPTCreator.tsx` - Main file to modify
- `chatty/src/lib/browserSeatRunner.ts` - `runSeat` function that calls Ollama
- `chatty/src/engine/characterLogic.ts` - `applyConversationalLogic` for tone adaptation
- `chatty/src/engine/optimizedSynth.ts` - Current `processMessageWithLinMode` implementation

## Expected Outcome

After implementation:
- Users can switch between "Chatty Lin" and "Custom Models" in Configure tab
- Preview immediately reflects the selected mode
- Custom model selections actually call the selected Ollama models
- Different model combinations produce different response characteristics
- Tone adaptation works correctly in both modes

## Notes

- The `orchestrationMode` state is already managed (line 105)
- Default models are already set when "Chatty Lin" is selected (lines 145-154)
- The preview system prompt is already built (line 952)
- File content processing is already implemented (lines 955-960)
- The main change needed is in the model routing logic (lines 970-985)

