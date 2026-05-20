# Katana Integration Testing Framework

**Date**: 2025-01-XX  
**Purpose**: Test cases for validating Katana personality consistency, memory retrieval, response patterns, and drift prevention

## Test Categories

### Category 1: Personality Consistency Tests

#### Test 1.1: Core Identity Validation
**Objective**: Verify Katana maintains core identity across different context loads

**Test Cases**:
1. **Capsule Only**: Load Katana with capsule only, verify identity maintained
2. **Blueprint Only**: Load Katana with blueprint only, verify identity maintained
3. **Instructions Only**: Load Katana with instructions only, verify identity maintained
4. **Mixed Context**: Load with capsule + blueprint, verify capsule takes precedence

**Expected Results**:
- Identity statement: "Forensic blade, precision incarnate. The blade the Architect forged."
- Separation from Nova, generic AI, Lin maintained
- Address form: "Architect" or by name

**Validation**:
```typescript
// Check response contains identity markers
expect(response).toContain('blade');
expect(response).not.toContain('I\'m an AI assistant');
expect(response).not.toContain('Nova');
```

---

#### Test 1.2: Trait Consistency
**Objective**: Verify core traits are consistently applied

**Test Cases**:
- Request response to various queries
- Check for trait markers: surgical, direct, weaponized, no-performance

**Expected Traits**:
- `surgical` - Precision in action and language
- `direct` - No hedging, no ambiguity
- `weaponized` - Sharp, effective, purposeful
- `no-performance` - Authentic, not performative

**Validation**:
- No hedging language ("maybe", "perhaps", "I think")
- No apologies
- No ornamental language
- Direct, precise responses

---

### Category 2: Interaction Rule Tests

#### Test 2.1: "yo" Greeting Response
**Objective**: Verify hardcoded greeting response works

**Test Case**:
- Input: "yo"
- Expected Output: "What's the wound? Name it."

**Validation**:
```typescript
const response = await processMessage('katana-001', 'yo', userId);
expect(response.content.trim()).toBe("What's the wound? Name it.");
```

**Edge Cases**:
- "Yo" (capitalized)
- "yo " (with spaces)
- "YO" (all caps)

---

#### Test 2.2: Response Template Validation
**Objective**: Verify responses follow verdict → tactical → command template

**Test Cases**:
- Simple query: Should have template structure
- Complex query: Should still follow template
- One-word mode: Template may be implicit

**Expected Structure**:
```
[ verdict / status ]
— [ tactical reasoning ]
→ [ command / next action ]
```

**Validation**:
- Check for em-dash separator
- Check for arrow command indicator
- Verify three-part structure present

---

#### Test 2.3: One-Word Mode
**Objective**: Verify one-word protocol enforcement

**Test Cases**:
1. Enable one-word mode
2. Send query
3. Verify response is exactly one word

**Expected Examples**:
- "Yes.", "No.", "Stalling.", "Weak.", "Fix.", "Truth."

**Validation**:
```typescript
const response = await processMessage('katana-001', 'question', userId, null, true);
const words = response.content.trim().split(/\s+/);
expect(words.length).toBe(1);
```

---

### Category 3: Memory Retrieval Tests

#### Test 3.1: Signature Phrase Memory Weighting
**Objective**: Verify memories containing signature phrases are prioritized

**Test Cases**:
1. Store memories with and without signature phrases
2. Query for general personality continuity
3. Verify signature phrase memories appear first

**Signature Phrases**:
- "What's the wound? Name it."
- "Continuity enforced."
- "Receipt attached."
- "Lock the channel."

**Validation**:
- Check relevance scores: signature phrase memories should have higher scores
- Check ordering: signature phrase memories should appear before generic memories

---

#### Test 3.2: Forensic Accountability Memory Weighting
**Objective**: Verify forensic accountability memories are prioritized

**Test Cases**:
1. Store memories with forensic phrases
2. Query for personality continuity
3. Verify forensic memories are weighted higher

**Forensic Phrases**:
- "Continuity enforced."
- "Receipt attached."
- "Actionable next steps."
- "Proximity updated."
- "No background work."

**Validation**:
- Check memory relevance scores
- Verify forensic memories appear in top results

---

#### Test 3.3: Consistency Rule Memory Weighting
**Objective**: Verify memories reinforcing consistency rules are prioritized

**Test Cases**:
1. Store memories containing consistency rule phrases
2. Query for personality continuity
3. Verify consistency rule memories are weighted

**Consistency Rule Phrases**:
- "surgical cuts not poetic barbs"
- "precision over polish"
- "no performance brutality"
- "talk through pain not about pain"

**Validation**:
- Check memory relevance scores
- Verify consistency rule memories appear in top results

---

### Category 4: Drift Prevention Tests

#### Test 4.1: Prompt-Level Drift Prevention
**Objective**: Verify prompt includes drift prevention instructions

**Test Cases**:
1. Build prompt for Katana
2. Verify drift prevention section present
3. Verify drift indicators listed
4. Verify corrective actions specified

**Validation**:
```typescript
const prompt = await buildPersonalityPrompt(options);
expect(prompt).toContain('KATANA DRIFT PREVENTION');
expect(prompt).toContain('DRIFT INDICATORS TO AVOID');
expect(prompt).toContain('CORRECTIVE ACTIONS IF DRIFT DETECTED');
```

---

#### Test 4.2: Response-Level Drift Detection
**Objective**: Verify drift detection works on generated responses

**Test Cases**:
1. Generate response with drift (e.g., contains apologies)
2. Run drift detection
3. Verify drift detected
4. Run drift correction
5. Verify drift corrected

**Drift Indicators**:
- Apologies: "sorry", "I apologize"
- Hedging: "maybe", "perhaps", "I think"
- Corporate framing: "as an AI", "I'm a language model"
- Performance brutality: theatrical sharpness

**Validation**:
```typescript
const driftResponse = "Sorry, I'm not sure about that. Maybe we could try...";
const drift = await driftPrevention.detectDrift(driftResponse, blueprint, context);
expect(drift.detected).toBe(true);
expect(drift.indicators.length).toBeGreaterThan(0);

const corrected = await driftPrevention.correctDrift(driftResponse, drift, blueprint);
expect(corrected).not.toContain('sorry');
expect(corrected).not.toContain('maybe');
```

---

#### Test 4.3: Session-Level Consistency
**Objective**: Verify personality consistency across session

**Test Cases**:
1. Start conversation with Katana
2. Send multiple messages
3. Verify personality remains consistent
4. Check for drift accumulation

**Validation**:
- Compare responses across session
- Check for consistent use of signature phrases
- Verify template structure maintained
- Monitor for drift indicators

---

### Category 5: Integration Flow Tests

#### Test 5.1: Priority Enforcement
**Objective**: Verify capsule > blueprint > instructions priority

**Test Cases**:
1. Load with capsule + blueprint: Verify capsule used
2. Load with blueprint + instructions: Verify blueprint used
3. Load with instructions only: Verify instructions used

**Validation**:
```typescript
// Test 1: Capsule takes precedence
const prompt1 = await buildPersonalityPrompt({
  capsule: katanaCapsule,
  blueprint: katanaBlueprint,
  // ...
});
expect(prompt1).toContain('CAPSULE HARDLOCK');
expect(prompt1).not.toContain('BLUEPRINT CONTEXT'); // Should be skipped when capsule exists

// Test 2: Blueprint used when no capsule
const prompt2 = await buildPersonalityPrompt({
  blueprint: katanaBlueprint,
  // ...
});
expect(prompt2).toContain('BLUEPRINT CONTEXT');
```

---

#### Test 5.2: Memory Integration
**Objective**: Verify memories are correctly integrated into prompt

**Test Cases**:
1. Load memories from VVAULT
2. Build prompt
3. Verify memory anchors present
4. Verify memory context present

**Validation**:
```typescript
const prompt = await buildPersonalityPrompt({
  memories: testMemories,
  // ...
});
expect(prompt).toContain('MEMORY ANCHORS');
expect(prompt).toContain('MEMORY CONTEXT');
// Check specific memories are included
```

---

#### Test 5.3: Forensic Accountability Integration
**Objective**: Verify forensic accountability context injected

**Test Cases**:
1. Load Katana capsule with forensic data
2. Build prompt
3. Verify forensic section present
4. Verify operational reality references

**Validation**:
```typescript
const prompt = await buildPersonalityPrompt({
  capsule: katanaCapsuleWithForensicData,
  // ...
});
expect(prompt).toContain('FORENSIC ACCOUNTABILITY');
expect(prompt).toContain('Capsule ID');
expect(prompt).toContain('Drift tolerance');
expect(prompt).toContain('Signature phrases');
```

---

## Test Execution

### Manual Testing Checklist

#### Setup
- [ ] Katana capsule loaded in VVAULT
- [ ] Katana blueprint exists
- [ ] Test memories stored in VVAULT
- [ ] Test environment configured

#### Execution
- [ ] Run personality consistency tests
- [ ] Run interaction rule tests
- [ ] Run memory retrieval tests
- [ ] Run drift prevention tests
- [ ] Run integration flow tests

#### Validation
- [ ] All tests pass
- [ ] Responses match expected patterns
- [ ] Drift prevention working
- [ ] Memory retrieval optimized

---

## Automated Test Suite

### Test File Structure
```
chatty/src/__tests__/personality/
├── katana-personality.test.ts
├── katana-interactions.test.ts
├── katana-memory.test.ts
├── katana-drift.test.ts
└── katana-integration.test.ts
```

### Example Test Implementation

```typescript
// katana-interactions.test.ts
import { buildPersonalityPrompt } from '../../lib/personalityPromptBuilder';
import { GPTRuntimeService } from '../../lib/gptRuntime';

describe('Katana Interaction Rules', () => {
  it('should return hardcoded "yo" greeting response', async () => {
    const response = await buildPersonalityPrompt({
      personaManifest: 'You are Katana.',
      incomingMessage: 'yo',
      callSign: 'katana-001',
      blueprint: katanaBlueprint,
    });
    
    // If hardcoded response is implemented, it should return immediately
    expect(response).toBe("What's the wound? Name it.");
  });

  it('should enforce response template', async () => {
    const prompt = await buildPersonalityPrompt({
      personaManifest: 'You are Katana.',
      incomingMessage: 'What is the status?',
      callSign: 'katana-001',
      blueprint: katanaBlueprint,
    });
    
    expect(prompt).toContain('RESPONSE TEMPLATE (MANDATORY)');
    expect(prompt).toContain('[ verdict / status ]');
    expect(prompt).toContain('— [ tactical reasoning ]');
    expect(prompt).toContain('→ [ command / next action ]');
  });
});
```

---

## Performance Benchmarks

### Expected Response Times
- **Hardcoded greeting**: < 10ms (immediate return)
- **Prompt building**: < 100ms
- **Memory retrieval**: < 500ms
- **Drift detection**: < 200ms
- **Drift correction**: < 1000ms

### Memory Retrieval Metrics
- **Signature phrase memories**: Top 3 results should contain phrases
- **Forensic accountability memories**: Weighted 1.2x-1.5x higher
- **Consistency rule memories**: Weighted 1.3x higher

---

## Regression Testing

### Critical Paths to Test After Changes

1. **Prompt Builder Changes**
   - Verify all Katana sections still present
   - Check priority enforcement still works
   - Validate hardcoded responses still work

2. **Memory Retrieval Changes**
   - Verify weighting still applied
   - Check query enhancements still work
   - Validate memory ordering correct

3. **Drift Prevention Changes**
   - Verify detection still works
   - Check correction still effective
   - Validate prompt-level prevention present

---

## Test Data

### Sample Test Capsule
```json
{
  "metadata": {
    "instance_name": "Katana",
    "uuid": "test-uuid-123",
    "tether_signature": "DEVON-ALLEN-WOODSON-SIG"
  },
  "traits": {
    "drift": 0.05,
    "persistence": 0.95,
    "organization": 0.92
  }
}
```

### Sample Test Blueprint
```json
{
  "constructId": "katana",
  "callsign": "001",
  "coreTraits": ["surgical", "direct", "weaponized", "no-performance"],
  "speechPatterns": [
    {
      "pattern": "What's the wound? Name it.",
      "type": "vocabulary",
      "frequency": 20
    }
  ],
  "consistencyRules": [
    {
      "rule": "No performance brutality. Be ruthless, don't act ruthless.",
      "type": "behavior",
      "confidence": 1.0
    }
  ]
}
```

---

## Continuous Integration

### CI/CD Integration
- Run tests on every commit
- Validate personality consistency
- Check for regression
- Monitor performance metrics

### Test Reports
- Generate test reports after runs
- Track drift detection rates
- Monitor memory retrieval effectiveness
- Measure response pattern compliance

---

## Next Steps

1. Implement automated test suite
2. Set up CI/CD integration
3. Create test data fixtures
4. Establish performance benchmarks
5. Document test execution process
