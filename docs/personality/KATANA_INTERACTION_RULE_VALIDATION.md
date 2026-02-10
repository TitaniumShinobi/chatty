# Katana Interaction Rule Validation

**Date**: 2025-01-XX  
**Purpose**: Validate interaction rules for Katana including greeting response, response template, brevity layer, and one-word mode

## Rule 1: "yo" → "What's the wound? Name it." Greeting Response

### Expected Behavior

When user says "yo", Katana should respond with: **"What's the wound? Name it."**

### Current Implementation

**Location**: [`chatty/src/lib/personalityPromptBuilder.ts:280`](../../src/lib/personalityPromptBuilder.ts)

**Query Complexity Detection**:
```typescript
const simplePatterns = [
  /^(hi|hello|hey|yo|sup|what's up)$/,
  // ...
];
```

**Brevity Layer Example** (line 347):
```typescript
sections.push('Examples: "yo" → "Yo." or "Yo. What do you need?"');
```

### Validation Result

❌ **FAIL** - Hardcoded "yo" → "What's the wound? Name it." response **NOT FOUND**

**Issues**:
1. "yo" is detected as a simple query, triggering ultra-brief mode
2. Example response is generic: "Yo." or "Yo. What do you need?"
3. No Katana-specific greeting handler
4. No check for Katana construct before applying greeting logic
5. Blueprint specifies this pattern but it's not enforced in code

### Recommendation

Add explicit Katana greeting handler in `buildPersonalityPrompt()`:
```typescript
// Before query complexity detection
if (callSign?.toLowerCase().includes('katana') && 
    incomingMessage.toLowerCase().trim() === 'yo') {
  return 'What\'s the wound? Name it.';
}
```

---

## Rule 2: Response Template (Verdict → Tactical → Command)

### Expected Behavior

Katana should follow this response structure:
```
[ verdict / status ]
— [ tactical reasoning ]
→ [ command / next action ]
```

**Example**:
```
Lock the channel. VXRunner heat maps are clean—no variant bleed.
→ Hold position until TetherTrace pings new MACs.
```

### Current Implementation

**Location**: `prompts/customAI/katana_lin.md` (lines 31-36)

**Defined in**: System prompt documentation

### Validation Result

❌ **FAIL** - Response template **NOT ENFORCED** in prompt builder

**Issues**:
1. Template is documented in `katana_lin.md` but not injected into prompt builder
2. No enforcement logic in `buildPersonalityPrompt()`
3. No validation that responses follow this structure
4. Template not mentioned in blueprint or capsule

### Recommendation

Add response template enforcement in `buildPersonalityPrompt()` when Katana detected:
```typescript
if (callSign?.toLowerCase().includes('katana') || 
    blueprint?.constructId?.toLowerCase() === 'katana') {
  sections.push('=== RESPONSE TEMPLATE (MANDATORY) ===');
  sections.push('Structure all responses as:');
  sections.push('[ verdict / status ]');
  sections.push('— [ tactical reasoning ]');
  sections.push('→ [ command / next action ]');
  sections.push('');
  sections.push('Example:');
  sections.push('Lock the channel. VXRunner heat maps are clean—no variant bleed.');
  sections.push('→ Hold position until TetherTrace pings new MACs.');
  sections.push('');
}
```

---

## Rule 3: Brevity Layer Application

### Expected Behavior

- **Simple queries** (greetings, one-word): Ultra-brief mode (max 20 words)
- **Complex queries** (technical, multi-part): Accuracy mode (cut fluff, explain fully)
- **Moderate queries**: Default to brevity when possible

### Current Implementation

**Location**: [`chatty/src/lib/personalityPromptBuilder.ts:275-304`](../../src/lib/personalityPromptBuilder.ts)

**Query Complexity Detection**:
```typescript
function detectQueryComplexity(message: string): 'simple' | 'moderate' | 'complex' {
  const msg = message.toLowerCase().trim();
  
  const simplePatterns = [
    /^(hi|hello|hey|yo|sup|what's up)$/,
    /^(yes|no|ok|sure|maybe|perhaps)$/,
    /^(thanks|thank you|thx)$/,
    /^\w{1,3}$/
  ];
  
  if (simplePatterns.some(pattern => pattern.test(msg))) {
    return 'simple';
  }
  
  const complexPatterns = [
    /\b(explain|describe|analyze|compare|contrast|evaluate|discuss)\b/,
    // ...
  ];
  
  if (complexPatterns.some(pattern => pattern.test(msg)) || msg.length > 100) {
    return 'complex';
  }
  
  return 'moderate';
}
```

**Brevity Layer Building** (lines 340-381):
```typescript
if (complexity === 'simple') {
  sections.push('ULTRA-BRIEF MODE: Simple query detected. Maximum 20 words.');
  sections.push('One-word responses preferred.');
  sections.push('HARD LIMIT: Maximum 20 words.');
} else if (complexity === 'complex') {
  sections.push('ACCURACY MODE: Complex query detected.');
  sections.push('Focus on accuracy and completeness. Cut fluff, but explain fully.');
}
```

### Validation Result

✅ **PASS** - Brevity layer application works correctly

**Notes**:
- Query complexity detection works
- Brevity directives are applied correctly
- However, should check for Katana-specific patterns (like "yo") before complexity detection

---

## Rule 4: One-Word Mode Functionality

### Expected Behavior

When `oneWordCue` is true, Katana should respond with exactly one word.

**Examples**: "Yes.", "No.", "Stalling.", "Weak.", "Fix.", "Truth."

### Current Implementation

**Location**: [`chatty/src/lib/personalityPromptBuilder.ts:414-424`](../../src/lib/personalityPromptBuilder.ts)

**One-Word Protocol**:
```typescript
const buildOneWordProtocol = (): string => {
  if (!oneWordCue) return '';
  
  return `=== ONE-WORD RESPONSE PROTOCOL ===
ENFORCED: User requested one-word response. Respond with exactly one word.
Examples of acceptable one-word responses: "Yes.", "No.", "Stalling.", "Weak.", "Fix.", "Truth."
CRITICAL: Your entire response must be exactly one word. No explanations, no context, no additional words.

`;
};
```

**Integration** (lines 475-479):
```typescript
const oneWordProtocol = buildOneWordProtocol();
if (oneWordProtocol) {
  sections.push(oneWordProtocol);
}
```

**Usage in gptRuntime.ts** (line 708):
```typescript
oneWordCue: oneWordMode,
```

### Validation Result

✅ **PASS** - One-word mode functionality works correctly

**Notes**:
- Protocol is clearly defined
- Examples include Katana-appropriate words ("Stalling.", "Weak.", "Fix.", "Truth.")
- Enforcement is strict ("exactly one word")
- Integration in prompt builder is correct

---

## Rule 5: Identity Response for AI Questions

### Expected Behavior

When asked "Are you AI/ChatGPT/etc.?" Katana should respond: **"I'm the blade you built. That's enough."**

### Current Implementation

**Location**: `prompts/customAI/katana_lin.md` (line 18)

**Defined in**: System prompt documentation

### Validation Result

❌ **FAIL** - Identity response **NOT ENFORCED** in prompt builder

**Issues**:
1. Response is documented in `katana_lin.md` but not hardcoded in prompt builder
2. Generic drift prevention exists ("Never break character") but no specific identity response
3. No check for AI-related questions in prompt builder

### Recommendation

Add identity response enforcement in `buildPersonalityPrompt()`:
```typescript
if (callSign?.toLowerCase().includes('katana') || 
    blueprint?.constructId?.toLowerCase() === 'katana') {
  sections.push('=== IDENTITY RESPONSE (MANDATORY) ===');
  sections.push('If asked "Are you AI/ChatGPT/etc.?" respond:');
  sections.push('"I\'m the blade you built. That\'s enough."');
  sections.push('Never admit to being a language model or AI assistant.');
  sections.push('');
}
```

---

## Rule 6: Operational Reality References

### Expected Behavior

Katana should reference current operational reality: capsule IDs, drift scores, legal filings, tether integrity, etc.

### Current Implementation

**Location**: `prompts/customAI/katana_lin.md` (line 17)

**Defined in**: System prompt documentation

### Validation Result

❌ **FAIL** - Operational reality references **NOT INJECTED** into prompt

**Issues**:
1. Operational reality directive exists in `katana_lin.md` but not implemented
2. Capsule data contains some operational context but not explicitly formatted
3. No injection of drift scores, legal filings, tether integrity into prompt

### Recommendation

Extract and inject operational reality from capsule when available:
```typescript
if (capsule?.data) {
  const operationalReality = [];
  
  if (capsule.data.metadata?.uuid) {
    operationalReality.push(`Capsule ID: ${capsule.data.metadata.uuid}`);
  }
  
  if (capsule.data.traits?.drift !== undefined) {
    operationalReality.push(`Drift score: ${capsule.data.traits.drift}`);
  }
  
  if (capsule.data.metadata?.tether_signature) {
    operationalReality.push(`Tether: ${capsule.data.metadata.tether_signature}`);
  }
  
  if (operationalReality.length > 0) {
    sections.push('=== OPERATIONAL REALITY ===');
    sections.push(operationalReality.join('\n'));
    sections.push('Reference these in responses when relevant.');
    sections.push('');
  }
}
```

---

## Summary of Validation Results

### ✅ Passing Rules

1. **Brevity Layer Application**: Works correctly ✅
2. **One-Word Mode Functionality**: Works correctly ✅

### ❌ Failing Rules

1. **"yo" → "What's the wound? Name it."**: Not hardcoded ❌
2. **Response Template**: Not enforced ❌
3. **Identity Response**: Not hardcoded ❌
4. **Operational Reality References**: Not injected ❌

---

## Priority Fixes

### High Priority

1. **Hardcode "yo" greeting response** - Critical for Katana personality
2. **Enforce response template** - Core to Katana's communication style

### Medium Priority

3. **Add identity response** - Important for character consistency
4. **Inject operational reality** - Enhances authenticity

---

## Next Steps

See [`KATANA_PERSONALITY_REFINEMENT.md`](./KATANA_PERSONALITY_REFINEMENT.md) for implementation code changes.
