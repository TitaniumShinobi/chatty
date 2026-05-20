# Create Tab vs Preview Tab Identity

## Problem

The user correctly identified that **Create Tab** and **Preview Tab** should NOT be the same person:

- **Create Tab** = **Lin** (lin-001) - GPT creation assistant
- **Preview Tab** = **The GPT being created** (e.g., Katana, katana-001)

## Current Implementation

### Create Tab ✅ CORRECT
- Uses `buildCreateTabSystemPrompt()` 
- Loads memories from `lin-001`
- Identity: "You are Lin (construct ID: lin-001)"
- Purpose: Help users create GPTs

### Preview Tab ⚠️ POTENTIALLY CONFUSED
- Uses `buildPreviewSystemPrompt()` 
- If mode === 'lin', uses `UnifiedLinOrchestrator`
- Should load memories from the GPT's constructCallsign (e.g., `katana-001`)
- Should load the GPT's capsule/blueprint (Katana's, not Lin's)
- Identity should be the GPT being created (Katana), not Lin

## Issue

The `UnifiedLinOrchestrator` is correctly called with the GPT's `constructCallsign` (e.g., `katana-001`), but:

1. **Name confusion**: "UnifiedLinOrchestrator" sounds like it's for Lin, but it's actually for ANY GPT in Lin mode
2. **Identity clarity**: The prompt might not be clear enough about WHO the GPT is
3. **Memory loading**: Should load the GPT's memories (katana-001), not Lin's (lin-001) ✅ (This is correct)
4. **Capsule loading**: Should load the GPT's capsule (katana-001.capsule), not Lin's ✅ (This is correct)

## Verification

Check that:
- Preview Tab uses `config.constructCallsign` (e.g., `katana-001`) ✅
- Preview Tab loads capsule from `katana-001.capsule` ✅
- Preview Tab loads blueprint for `katana-001` ✅
- Preview Tab loads memories from `katana-001` ChromaDB collection ✅
- Preview Tab prompt says "You ARE Katana" not "You ARE Lin" ✅

## Fix Needed

Ensure the prompt clearly identifies the GPT being created:

```typescript
// In buildUnifiedLinPrompt()
if (capsule && capsule.data) {
  sections.push(`Your name: ${data.metadata.instance_name}`); // "Katana"
  sections.push(`You ARE ${data.metadata.instance_name}.`); // "You ARE Katana."
}

// OR if blueprint exists:
if (context.blueprint) {
  sections.push(`You ARE ${context.blueprint.constructId}-${context.blueprint.callsign}.`); // "You ARE katana-001."
}
```

## Expected Behavior

### Create Tab (Lin)
- User: "Let's create your GPT together"
- Lin: "I'll help you build your custom AI assistant. Just tell me what you want it to do!"
- Identity: Lin (lin-001)
- Memories: From lin-001 ChromaDB

### Preview Tab (Katana)
- User: "yo"
- Katana: "Yo. What do you need?" (in character as Katana)
- Identity: Katana (katana-001)
- Memories: From katana-001 ChromaDB
- Capsule: katana-001.capsule

## Status

- ✅ Create Tab correctly uses Lin identity
- ⚠️ Preview Tab should use GPT identity (needs verification)
- ✅ UnifiedLinOrchestrator correctly uses constructCallsign parameter
- ⚠️ Prompt clarity needs verification

