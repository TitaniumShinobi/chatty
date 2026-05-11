# Katana Integration Flow Analysis

**Date**: 2025-01-XX  
**Purpose**: Complete trace of prompt building flow from user input to LLM call, verification of priority enforcement, memory integration, and drift prevention

## Flow Overview

### Two Main Paths

1. **Preview Mode** (GPTCreator.tsx): Simple system prompt, no full personality integration
2. **Runtime Mode** (gptRuntime.ts): Full personality integration with capsule/blueprint/memory

---

## Flow 1: Preview Mode (GPTCreator.tsx)

### Entry Point
```
User input in Preview tab
  ↓
GPTCreator.handlePreviewSubmit() (line 1134)
  ↓
buildPreviewSystemPrompt(config) (line 1631)
  ↓
runSeat() with simple system prompt
```

### buildPreviewSystemPrompt Implementation

**Location**: [`chatty/src/components/GPTCreator.tsx:1631`](../../src/components/GPTCreator.tsx)

**What it does**:
- Builds basic system prompt from config (name, description, instructions)
- Adds capabilities, conversation starters, model context
- Adds knowledge files context
- **NO personality integration** (capsule/blueprint/memory not used)

**Gap Identified**: Preview mode doesn't use `buildKatanaPrompt` or personality orchestration, even when Katana is being previewed.

### Current Limitations

1. **No Capsule Loading**: Preview mode doesn't load capsule data
2. **No Blueprint Loading**: Preview mode doesn't load blueprint
3. **No Memory Retrieval**: Preview mode doesn't retrieve VVAULT memories
4. **No Personality Prompt Builder**: Doesn't use `buildPersonalityPrompt`

**Impact**: Preview responses won't match runtime behavior for Katana.

---

## Flow 2: Runtime Mode (gptRuntime.ts)

### Entry Point
```
User message in Runtime
  ↓
GPTRuntimeService.processMessage() (line 261)
  ↓
buildSystemPrompt() (line 497)
  ↓
buildPersonalityPrompt() (line 699)
  ↓
LLM call
```

### Step-by-Step Flow

#### Step 1: Persona Lock Check (Lines 513-524)

**Priority**: Highest (hard lock enforcement)

```typescript
if (config.personaLock?.constructId) {
  // Hard lock active - return locked system prompt immediately
  return config.personaSystemPrompt;
}
```

**Verification**: ✅ **PASS** - Hard lock takes absolute precedence, bypasses all other logic.

---

#### Step 2: Tone & Persona Routing (Lines 526-532)

**What it does**:
- Detects tone from user message
- Routes persona based on intent tags and tone
- Prepares persona context

**Verification**: ✅ **PASS** - Standard routing logic, applies to all GPTs.

---

#### Step 3: Memory Retrieval (Lines 534-562)

**Implementation**:
```typescript
const callsignVariants = [
  gptId,                    // e.g., "gpt-katana-001"
  gptId.replace(/^gpt-/, ''), // e.g., "katana-001"
];

for (const variant of callsignVariants) {
  memories = await vvaultRetrieval.retrieveMemories({
    constructCallsign: variant,
    semanticQuery: 'personality continuity memory',
    toneHints: tone ? [tone.tone] : [],
    limit: 10,
  });
  if (memories.memories.length > 0) break;
}
```

**Query**: `'personality continuity memory'` - generic, not Katana-specific

**Gap Identified**: 
- Semantic query is generic, doesn't prioritize personality-reinforcing memories
- Doesn't explicitly search for signature phrases ("What's the wound? Name it.")
- Doesn't prioritize forensic accountability memories

**Verification**: ⚠️ **PARTIAL** - Memory retrieval works, but weighting may not be optimal for personality reinforcement.

---

#### Step 4: Capsule Loading (Lines 564-596)

**Priority**: Highest (hardlock, takes precedence over blueprint)

**Implementation**:
```typescript
// Check for injected test capsule first
if (config.testCapsule) {
  capsule = config.testCapsule;
} else {
  // Try API loading
  const response = await fetch(
    `/api/vvault/capsules/load?constructCallsign=${encodeURIComponent(gptId)}&testMode=true`
  );
  if (response.ok) {
    capsule = { data: data.capsule };
  }
}
```

**Verification**: ✅ **PASS** - Capsule loading works, test capsule injection supported.

---

#### Step 5: Transcript Context Loading (Lines 598-616)

**What it does**:
- Loads transcript fragments from VVAULT
- Retrieves relevant fragments for current message
- Formats as context strings

**Implementation**:
```typescript
await transcriptLoader.loadTranscriptFragments(callsign, userId);
const relevantFragments = await transcriptLoader.getRelevantFragments(
  callsign, 
  incomingMessage, 
  3
);
```

**Verification**: ✅ **PASS** - Transcript context loading works.

---

#### Step 6: Blueprint Loading (Lines 618-628)

**Priority**: Secondary (used if no capsule)

**Implementation**:
```typescript
const identityMatcher = new IdentityMatcher();
blueprint = await identityMatcher.loadPersonalityBlueprint(
  userId, 
  constructId, 
  callsign
);
```

**Verification**: ✅ **PASS** - Blueprint loading works.

---

#### Step 7: Priority Enforcement (Lines 630-648)

**Priority Hierarchy**:
1. Capsule (if exists) - Hardlock
2. Blueprint (if exists) - Secondary
3. Instructions (fallback)

**Implementation**:
```typescript
// MANDATORY: Persona context validation
if (!capsule && !blueprint) {
  throw new Error('Persona context required but neither capsule nor blueprint found.');
}

if (capsule) {
  console.log('Capsule hardlocked - using capsule data');
} else if (blueprint) {
  // Validate blueprint has required fields
  if (!blueprint.constructId || !blueprint.callsign) {
    throw new Error('Invalid blueprint: missing constructId or callsign.');
  }
}
```

**Verification**: ✅ **PASS** - Priority enforcement is correct and validated.

---

#### Step 8: Identity Prompt Selection (Lines 650-658)

**Priority**:
1. Identity prompt from files (`config.identityFiles?.prompt`)
2. Instructions from config
3. Description fallback
4. Generic fallback

**Verification**: ✅ **PASS** - Identity prompt selection works.

---

#### Step 9: Personality Prompt Building (Lines 699-713)

**Call to buildPersonalityPrompt**:
```typescript
const { buildPersonalityPrompt } = await import('./personalityPromptBuilder');
return await buildPersonalityPrompt({
  personaManifest: personaWithEmotion.instructions + crisisNote,
  incomingMessage,
  tone,
  memories: memories.memories,
  callSign: gptId,
  includeLegalSection: false,
  maxMemorySnippets: 5,
  oneWordCue: oneWordMode,
  blueprint,
  capsule, // Pass capsule for hardlock injection
  workspaceContext,
  transcriptContext,
});
```

**Verification**: ✅ **PASS** - All context passed correctly to prompt builder.

---

## Flow 3: Personality Prompt Builder (personalityPromptBuilder.ts)

### Entry Point
```
buildPersonalityPrompt(options)
  ↓
Section building (capsule → blueprint → memories → brevity → analytical)
  ↓
Final system prompt assembly
```

### Priority Enforcement in Prompt Builder

#### Capsule Hardlock (Lines 434-436)

**Priority**: Highest in prompt builder

```typescript
// Capsule hardlock (takes precedence over everything)
if (capsule) {
  sections.push(buildCapsuleHardlockSection(capsule));
}
```

**Verification**: ✅ **PASS** - Capsule injected first, takes precedence.

---

#### Blueprint Context (Lines 503-520)

**Priority**: Secondary (only if no capsule)

```typescript
// Blueprint context (if available and no capsule)
if (blueprint && !capsule) {
  sections.push('=== BLUEPRINT CONTEXT ===');
  // ... blueprint data
}
```

**Verification**: ✅ **PASS** - Blueprint only used when capsule doesn't exist.

---

#### Memory Integration (Lines 439-448)

**Order**:
1. Memory anchors (dates, names, claims, vows, boundaries)
2. Memory context (VVAULT snippets)

**Implementation**:
```typescript
const memoryAnchors = buildMemoryAnchorsSection(memories);
if (memoryAnchors) {
  sections.push(memoryAnchors);
}

const memoryContext = buildMemoryContextSection(memories, maxMemorySnippets);
if (memoryContext) {
  sections.push(memoryContext);
}
```

**Verification**: ✅ **PASS** - Memory integration works.

**Gap Identified**: 
- Memory weighting doesn't prioritize personality-reinforcing memories
- Doesn't explicitly weight signature phrases or forensic accountability memories

---

#### Brevity Layer (Lines 466-467)

**Contextual Based on Query Complexity**:
- Simple queries → Ultra-brief mode (max 20 words)
- Complex queries → Accuracy mode (cut fluff, explain fully)

**Verification**: ✅ **PASS** - Brevity layer works, but doesn't check for Katana-specific patterns before complexity detection.

**Gap Identified**: Should check for "yo" greeting before query complexity detection.

---

#### Analytical Sharpness Layer (Lines 469-473)

**What it does**:
- Adds analytical sharpness directives (lead with flaw, call out dodges, precision over polish)

**Verification**: ✅ **PASS** - Analytical sharpness layer works.

---

#### One-Word Protocol (Lines 476-479)

**Enforcement**:
```typescript
if (oneWordCue) {
  sections.push(buildOneWordProtocol());
}
```

**Verification**: ✅ **PASS** - One-word protocol works.

---

## Memory Retrieval Integration

### Current Implementation

**Location**: `gptRuntime.ts` lines 541-558

**Query Strategy**:
```typescript
semanticQuery: 'personality continuity memory',
toneHints: tone ? [tone.tone] : [],
limit: 10,
```

### Gap Analysis

1. **Generic Query**: `'personality continuity memory'` is generic, not Katana-specific
2. **No Signature Phrase Weighting**: Doesn't prioritize memories containing "What's the wound? Name it."
3. **No Forensic Accountability Weighting**: Doesn't prioritize memories containing "Continuity enforced.", "Receipt attached."
4. **No Consistency Rule Weighting**: Doesn't prioritize memories that reinforce consistency rules

### Recommendation

Enhance memory retrieval query to:
- Include Katana signature phrases in query when construct is Katana
- Weight memories containing personality-reinforcing elements
- Prioritize forensic accountability memories when available

---

## Drift Prevention Mechanisms

### Layer 1: Prompt-Level

**Location**: `personalityPromptBuilder.ts` lines 527-532

**Implementation**:
```typescript
sections.push('=== RESPONSE INSTRUCTIONS ===');
sections.push('Respond in character based on the context above.');
sections.push('Use the memory anchors to maintain continuity.');
sections.push('Apply the brevity and analytical layers as specified.');
sections.push('Never break character, even if directly challenged about your nature.');
```

**Verification**: ✅ **PASS** - Basic drift prevention present.

**Gap Identified**: 
- No explicit Katana identity reinforcement
- No hardcoded "I'm the blade you built" response for AI questions
- No enforcement of response template (verdict → tactical → command)

---

### Layer 2: Response-Level

**Location**: `PersonalityOrchestrator.ts` (checkAndCorrectDrift method, lines 713-756)

**What it does**:
- Checks generated response for drift
- Corrects drift if detected
- Uses blueprint consistency rules

**Verification**: ✅ **PASS** - Response-level drift correction exists.

**Note**: This is in UnifiedLinOrchestrator/PersonalityOrchestrator, not directly in gptRuntime flow.

---

### Layer 3: Session-Level

**Location**: Capsule resurrection protocol (`vvault/KATANA_RESURRECTION_PROTOCOL.md`)

**What it does**:
- Zero drift design (drift: 0.05)
- Receipt-based accountability
- Chain of custody logging

**Verification**: ⚠️ **PARTIAL** - Protocol exists but not integrated into prompt building flow.

**Gap Identified**: Capsule resurrection protocol context not injected into prompt builder.

---

### Layer 4: Long-Term

**Location**: Blueprint consistency audits (not yet implemented)

**Status**: Not implemented

**Gap Identified**: No automated blueprint consistency audits exist.

---

## Summary of Verification Results

### ✅ Passing

1. **Priority Enforcement**: Capsule > Blueprint > Instructions ✅
2. **Capsule Loading**: Works correctly ✅
3. **Blueprint Loading**: Works correctly ✅
4. **Memory Retrieval**: Works but could be optimized ⚠️
5. **Transcript Context**: Works correctly ✅
6. **Brevity Layer**: Works but needs Katana-specific checks ⚠️
7. **Analytical Sharpness**: Works correctly ✅
8. **One-Word Protocol**: Works correctly ✅

### ⚠️ Needs Improvement

1. **Preview Mode**: No personality integration ⚠️
2. **Memory Weighting**: Generic query, no personality prioritization ⚠️
3. **Drift Prevention**: Basic but missing Katana-specific reinforcements ⚠️
4. **Response Template**: Not enforced in prompt builder ⚠️
5. **Forensic Accountability**: Protocol exists but not integrated ⚠️

### ❌ Missing

1. **Hardcoded "yo" Response**: Not checked before query complexity detection ❌
2. **Katana Identity Reinforcement**: No explicit "I'm the blade you built" in prompt ❌
3. **Response Template Enforcement**: Verdict → tactical → command not enforced ❌
4. **Operational Reality References**: Capsule IDs, drift scores not injected ❌
5. **Blueprint Consistency Audits**: Not implemented ❌

---

## Next Steps

See [`KATANA_PERSONALITY_REFINEMENT.md`](./KATANA_PERSONALITY_REFINEMENT.md) for implementation recommendations addressing these gaps.
