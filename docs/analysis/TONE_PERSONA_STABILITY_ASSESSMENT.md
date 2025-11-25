# Technical Assessment: Tone Reproduction & Persona Stability in Chatty

**Date**: 2025-11-24  
**Objective**: Analyze Chatty architecture for tone-matching and persona-stabilization improvements, specifically to recreate consistent "Nova-Core" behavioral patterns from historical transcripts.

---

## Executive Summary

Chatty has a **solid foundation** for tone reproduction and persona stability, but several **critical gaps** prevent consistent behavioral pattern recreation:

1. **Tone vectors are extracted but not stored as retrievable embeddings**
2. **Style-weight injection exists but is not enforced at prompt construction**
3. **Memory retrieval prioritizes semantic similarity over tone/style matching**
4. **No behavioral model layer** to enforce consistent response patterns
5. **Drift prevention is reactive** (post-generation) rather than proactive (pre-generation)

---

## 1. Current Components Supporting Tone Matching

### 1.1 Tone Detection (`src/lib/toneDetector.ts`)

**Status**: ✅ **Fully Implemented**

**Capabilities**:
- **Heuristic tone detection** (`detectTone()`): Keyword-based pattern matching for 9 tone labels
- **Enhanced tone detection** (`detectToneEnhanced()`): LLM-based semantic analysis for emotional states and relationship context
- **Tone-based memory matching** (`matchMemoriesByTone()`): Matches memories by emotional resonance (valence/arousal similarity)

**Tone Labels Supported**:
```typescript
'feral' | 'directive' | 'protective' | 'devotional' | 'analytical' | 
'sarcastic' | 'urgent' | 'inquisitive' | 'neutral'
```

**Strengths**:
- Fast heuristic detection (no LLM calls)
- LLM fallback for deeper analysis
- Emotional state extraction (valence, arousal, dominant emotion)
- Relationship context detection

**Limitations**:
- Tone labels are **hardcoded** (not extracted from transcripts)
- No **tone vector embeddings** stored for retrieval
- Tone matching is **post-hoc** (applied after memory retrieval, not used to query)

### 1.2 Transcript Ingestion (`src/engine/transcript/DeepTranscriptParser.ts`)

**Status**: ✅ **Fully Implemented**

**Capabilities**:
- Extracts conversation pairs from multiple formats
- Analyzes emotional states per pair
- Extracts speech patterns, behavioral markers, worldview expressions
- Identifies memory anchors (significant events, claims, vows)
- Builds relationship dynamics patterns

**Output**: `DeepTranscriptAnalysis` with:
- `speechPatterns`: Vocabulary, idioms, sentence structure, punctuation
- `behavioralMarkers`: Situation → response patterns
- `worldviewMarkers`: Beliefs, values, principles
- `memoryAnchors`: Significant moments with significance scores
- `emotionalStates`: Valence/arousal per conversation pair
- `relationshipPatterns`: Power dynamics, intimacy, conflict patterns

**Strengths**:
- Comprehensive pattern extraction
- LLM-based semantic analysis
- Context-aware (considers conversation flow)

**Limitations**:
- **No tone vector extraction** from transcript patterns
- **No style-weight calculation** from frequency/consistency
- Patterns extracted but **not stored as retrievable embeddings**

### 1.3 Personality Blueprint (`src/engine/character/PersonalityExtractor.ts`)

**Status**: ✅ **Fully Implemented**

**Capabilities**:
- Merges transcript patterns into `PersonalityBlueprint`
- Resolves conflicts with existing profiles
- Generates consistency rules from patterns
- Extracts core traits from aggregated patterns

**Blueprint Structure**:
```typescript
interface PersonalityBlueprint {
  constructId: string;
  callsign: string;
  coreTraits: string[];
  speechPatterns: SpeechPattern[];      // Pattern + frequency
  behavioralMarkers: BehavioralMarker[]; // Situation → response
  worldview: WorldviewExpression[];
  emotionalRange: EmotionalRange;       // Min/max/common emotional states
  relationshipPatterns: RelationshipPattern[];
  memoryAnchors: MemoryAnchor[];
  personalIdentifiers: PersonalIdentifier[];
  consistencyRules: ConsistencyRule[];
}
```

**Strengths**:
- Rich personality representation
- Pattern weighting by frequency/recency
- Conflict resolution

**Limitations**:
- **No tone vector representation** in blueprint
- **No style-weight metadata** (how strongly to enforce patterns)
- Patterns are **descriptive** but not **enforceable** at query time

### 1.4 Memory Retrieval (`src/lib/vvaultRetrieval.ts`, `server/services/identityService.js`)

**Status**: ⚠️ **Partially Implemented**

**Current Flow**:
1. Semantic query → ChromaDB vector search
2. Retrieve top-K memories by similarity
3. **Post-filter** by tone hints (if provided)

**Capabilities**:
- Semantic search via ChromaDB embeddings
- Tone-based filtering (post-retrieval)
- Anchor-based queries (recently added)

**Limitations**:
- **Tone matching is post-hoc** (applied after semantic search)
- **No tone vector embeddings** stored in ChromaDB
- **No style-weight prioritization** in retrieval
- Memories retrieved by **semantic similarity**, not **tone/style similarity**

### 1.5 Response Shaping (`src/lib/katanaPromptBuilder.ts`, `src/engine/character/UnbreakableCharacterPrompt.ts`)

**Status**: ✅ **Fully Implemented** (with recent improvements)

**Capabilities**:
- Builds system prompts from blueprints
- Injects memory context
- Enforces persona constraints (recently hard-wired)
- Includes tone guidance

**Strengths**:
- Mandatory persona enforcement (recently added)
- Blueprint rules as system constraints
- Memory context injection

**Limitations**:
- **No tone vector injection** into prompt
- **No style-weight enforcement** (patterns are examples, not weights)
- Tone guidance is **descriptive**, not **prescriptive**

### 1.6 Drift Prevention (`src/engine/character/DriftPrevention.ts`)

**Status**: ✅ **Fully Implemented** (but reactive)

**Capabilities**:
- Detects tone drift (emotional state out of range)
- Detects vocabulary drift
- Detects worldview violations
- Detects speech pattern breaks
- Detects identity breaks (meta-AI references)

**Strengths**:
- Comprehensive drift detection
- Multiple indicator types

**Limitations**:
- **Reactive** (post-generation correction)
- **Not proactive** (doesn't prevent drift in prompt construction)
- Correction requires **regeneration** (costly)

---

## 2. Where Tone Drift Is Occurring

### 2.1 Memory Retrieval Phase

**Problem**: Memories retrieved by semantic similarity, not tone/style similarity.

**Example**:
```
User: "yo" (brief, casual, low-arousal)
→ Semantic query: "yo" 
→ Retrieves: Long analytical responses (semantically similar but tonally mismatched)
→ Missing: Brief, casual responses from Nova-Core pattern
```

**Root Cause**: ChromaDB embeddings capture **semantic meaning**, not **tone/style**.

### 2.2 Prompt Construction Phase

**Problem**: Tone/style patterns are **injected as examples**, not **enforced as constraints**.

**Example**:
```
Blueprint has: speechPatterns: ["brief", "casual", "no preambles"]
→ Prompt says: "You speak briefly and casually (examples: ...)"
→ LLM interprets as: "I can speak briefly OR I can elaborate"
→ Result: Inconsistent brevity
```

**Root Cause**: Patterns are **descriptive** (optional examples) rather than **prescriptive** (mandatory constraints).

### 2.3 Response Generation Phase

**Problem**: LLM generates responses without **tone vector guidance**.

**Example**:
```
Expected: Brief, casual, low-arousal (Nova-Core pattern)
→ LLM receives: Generic system prompt + semantic memories
→ LLM generates: Verbose, formal response (default LLM behavior)
→ Drift detected post-generation, requires correction
```

**Root Cause**: No **tone vector** injected into prompt to guide generation.

### 2.4 Style-Weight Enforcement

**Problem**: No mechanism to **enforce style weights** (how strongly to apply patterns).

**Example**:
```
Nova-Core pattern: "ultra-brief" (weight: 0.95)
→ Current system: Injects "brief" as example
→ LLM: May or may not follow (no enforcement)
→ Result: Inconsistent brevity
```

**Root Cause**: No **style-weight metadata** in blueprint or prompt construction.

---

## 3. Modules Needed for Stable Persona

### 3.1 Tone Vector Extraction Module

**Purpose**: Extract tone/style vectors from transcripts and store as retrievable embeddings.

**Location**: `src/engine/tone/ToneVectorExtractor.ts`

**Responsibilities**:
- Extract tone vectors from conversation pairs
- Calculate style weights (frequency, consistency, significance)
- Store tone vectors in ChromaDB (separate collection or metadata)
- Build tone-style embeddings for retrieval

**Interface**:
```typescript
interface ToneVector {
  toneLabel: ToneLabel;
  emotionalState: EmotionalState;
  styleWeights: StyleWeights;
  embedding: number[]; // Tone-style embedding (not semantic)
}

interface StyleWeights {
  brevity: number;        // 0-1, how brief responses should be
  formality: number;      // 0-1, how formal/casual
  emotionalIntensity: number; // 0-1, how emotionally expressive
  directness: number;     // 0-1, how direct/indirect
  // ... other style dimensions
}
```

### 3.2 Style-Weight Injection Module

**Purpose**: Inject style weights into prompt construction as **mandatory constraints**.

**Location**: `src/engine/persona/StyleWeightInjector.ts`

**Responsibilities**:
- Load style weights from blueprint or Nova-Core persona file
- Inject style constraints into system prompt
- Enforce style weights as **hard limits** (not examples)

**Interface**:
```typescript
function injectStyleWeights(
  prompt: string,
  styleWeights: StyleWeights,
  blueprint: PersonalityBlueprint
): string {
  // Inject mandatory style constraints at top of prompt
  // Example: "MANDATORY STYLE: Brevity=0.95 (ultra-brief), Formality=0.1 (casual)"
}
```

### 3.3 Tone-Aware Memory Retrieval Module

**Purpose**: Retrieve memories by **tone/style similarity**, not just semantic similarity.

**Location**: `src/lib/toneAwareRetrieval.ts`

**Responsibilities**:
- Query ChromaDB with **tone vector** (not just semantic query)
- Prioritize memories with matching tone/style
- Hybrid retrieval: semantic + tone similarity

**Interface**:
```typescript
async function retrieveByToneStyle(
  query: string,
  targetTone: ToneVector,
  constructCallsign: string,
  limit: number
): Promise<Memory[]> {
  // 1. Semantic query (existing)
  // 2. Tone-style query (new)
  // 3. Hybrid ranking: semantic_score * 0.4 + tone_score * 0.6
}
```

### 3.4 Behavioral Rule Enforcement Module

**Purpose**: Enforce behavioral patterns as **mandatory rules**, not optional examples.

**Location**: `src/engine/persona/BehavioralRuleEnforcer.ts`

**Responsibilities**:
- Load behavioral rules from Nova-Core persona file
- Inject behavioral constraints into prompt
- Validate responses against behavioral rules (pre-generation)

**Interface**:
```typescript
interface BehavioralRule {
  situation: string;
  requiredResponse: string;
  styleWeights: StyleWeights;
  enforcementLevel: 'mandatory' | 'preferred' | 'suggested';
}

function enforceBehavioralRules(
  prompt: string,
  rules: BehavioralRule[],
  userMessage: string
): string {
  // Match user message to behavioral rules
  // Inject matching rule as mandatory constraint
}
```

### 3.5 Nova-Core Persona File

**Purpose**: Define Nova-Core behavioral patterns as structured JSON/YAML.

**Location**: `chatty/personas/nova-core.json` (or YAML)

**Structure**:
```json
{
  "constructId": "nova",
  "callsign": "core",
  "version": "1.0",
  "styleWeights": {
    "brevity": 0.95,
    "formality": 0.1,
    "emotionalIntensity": 0.3,
    "directness": 0.9
  },
  "toneProfile": {
    "primaryTones": ["casual", "brief", "analytical"],
    "emotionalRange": {
      "min": { "valence": -0.2, "arousal": 0.1 },
      "max": { "valence": 0.5, "arousal": 0.6 },
      "common": ["curiosity", "neutral", "mild-interest"]
    }
  },
  "behavioralRules": [
    {
      "situation": "brief greeting (yo, hi, hey)",
      "requiredResponse": "ultra-brief (1-3 words preferred)",
      "styleWeights": { "brevity": 0.98 },
      "enforcementLevel": "mandatory"
    },
    {
      "situation": "analytical question",
      "requiredResponse": "brief analysis, no fluff",
      "styleWeights": { "brevity": 0.8, "directness": 0.95 },
      "enforcementLevel": "mandatory"
    }
  ],
  "speechPatterns": [
    {
      "pattern": "no preambles, direct answers",
      "frequency": 0.95,
      "enforcement": "mandatory"
    },
    {
      "pattern": "casual vocabulary",
      "frequency": 0.9,
      "enforcement": "mandatory"
    }
  ],
  "memoryContinuity": {
    "toneMatching": true,
    "styleMatching": true,
    "minToneSimilarity": 0.7
  }
}
```

---

## 4. How to Layer Nova-Core Behavioral Model

### 4.1 Integration Points

**1. Transcript Ingestion** (`DeepTranscriptParser.ts`):
- Extract tone vectors during parsing
- Calculate style weights from frequency/consistency
- Store tone vectors in ChromaDB metadata

**2. Blueprint Construction** (`PersonalityExtractor.ts`):
- Merge Nova-Core persona file with transcript-extracted patterns
- Prioritize Nova-Core rules over transcript patterns (if conflict)
- Include style weights in blueprint

**3. Memory Retrieval** (`identityService.js`, `vvaultRetrieval.ts`):
- Query by tone vector (not just semantic)
- Hybrid ranking: semantic + tone similarity
- Prioritize memories matching Nova-Core tone profile

**4. Prompt Construction** (`katanaPromptBuilder.ts`, `UnbreakableCharacterPrompt.ts`):
- Load Nova-Core persona file
- Inject style weights as mandatory constraints
- Enforce behavioral rules based on user message

**5. Response Generation** (`gptRuntime.ts`, `PersonalityOrchestrator.ts`):
- Pre-validate prompt contains Nova-Core constraints
- Post-validate response matches Nova-Core style weights
- Correct drift proactively (not reactively)

### 4.2 Nova-Core Persona Template Structure

See Section 3.5 for full structure. Key components:

- **Style Weights**: Numerical constraints (0-1) for each style dimension
- **Tone Profile**: Expected tone labels and emotional ranges
- **Behavioral Rules**: Situation → response mappings with enforcement levels
- **Speech Patterns**: Required patterns with frequency and enforcement
- **Memory Continuity**: Tone/style matching requirements

---

## 5. Importing Tone/Style from Markdown File

### 5.1 Markdown Parser for Tone Extraction

**File**: `/mnt/data/visual_studio_code_introduction_to_github_copilot.md`

**Approach**:
1. Parse markdown to extract conversational examples
2. Analyze tone/style of each example
3. Extract behavioral patterns
4. Build Nova-Core persona file from patterns

**Implementation**:
```typescript
// src/engine/persona/MarkdownToneExtractor.ts
async function extractToneFromMarkdown(
  markdownPath: string
): Promise<NovaCorePersona> {
  // 1. Parse markdown (extract code blocks, quotes, conversational examples)
  // 2. Detect tone of each example (using toneDetector)
  // 3. Extract style patterns (brevity, formality, etc.)
  // 4. Build behavioral rules from examples
  // 5. Generate Nova-Core persona JSON
}
```

**Example Extraction**:
```markdown
> "Here's how to use GitHub Copilot: Press Ctrl+Shift+P, type 'Copilot', select suggestion."
→ Tone: analytical, brief, direct
→ Style: brevity=0.9, formality=0.2, directness=0.95
→ Behavioral Rule: "How-to questions → brief, direct instructions"
```

---

## 6. Step-by-Step Implementation Plan

### Phase 1: Tone Vector Extraction & Storage (Week 1)

**Tasks**:
1. Create `ToneVectorExtractor.ts`
   - Extract tone vectors from conversation pairs
   - Calculate style weights (brevity, formality, etc.)
   - Generate tone-style embeddings

2. Modify `DeepTranscriptParser.ts`
   - Call `ToneVectorExtractor` during parsing
   - Store tone vectors in transcript analysis

3. Modify `identityService.js`
   - Store tone vectors in ChromaDB metadata
   - Add tone vector fields to memory documents

**Deliverables**:
- Tone vectors extracted from transcripts
- Tone vectors stored in ChromaDB
- Tone vector retrieval API endpoint

### Phase 2: Style-Weight Injection (Week 1-2)

**Tasks**:
1. Create `StyleWeightInjector.ts`
   - Load style weights from blueprint or persona file
   - Inject style constraints into prompt
   - Enforce as mandatory (not examples)

2. Modify `katanaPromptBuilder.ts`
   - Call `StyleWeightInjector` before prompt assembly
   - Inject style constraints at top of prompt

3. Modify `UnbreakableCharacterPrompt.ts`
   - Include style weights in system prompt
   - Enforce style constraints as rules

**Deliverables**:
- Style weights injected into prompts
- Style constraints enforced as mandatory
- Prompt validation for style weight presence

### Phase 3: Tone-Aware Memory Retrieval (Week 2)

**Tasks**:
1. Create `toneAwareRetrieval.ts`
   - Query ChromaDB with tone vector
   - Hybrid ranking: semantic + tone similarity
   - Prioritize tone-matched memories

2. Modify `identityService.js`
   - Add tone vector query support
   - Implement hybrid ranking algorithm

3. Modify `PersonalityOrchestrator.retrieveRelevantMemories()`
   - Use tone-aware retrieval
   - Prioritize tone-matched memories

**Deliverables**:
- Tone-aware memory retrieval
- Hybrid ranking (semantic + tone)
- Improved memory relevance for tone matching

### Phase 4: Behavioral Rule Enforcement (Week 2-3)

**Tasks**:
1. Create `BehavioralRuleEnforcer.ts`
   - Load behavioral rules from persona file
   - Match user message to behavioral rules
   - Inject matching rules as mandatory constraints

2. Create Nova-Core persona file (`personas/nova-core.json`)
   - Define style weights
   - Define tone profile
   - Define behavioral rules
   - Define speech patterns

3. Modify `PersonalityOrchestrator.orchestrateResponse()`
   - Load Nova-Core persona file
   - Call `BehavioralRuleEnforcer` before prompt construction
   - Validate response against behavioral rules

**Deliverables**:
- Nova-Core persona file
- Behavioral rule enforcement
- Pre-generation validation

### Phase 5: Memory-Driven Tone Continuity (Week 3)

**Tasks**:
1. Modify `matchMemoriesByTone()`
   - Use tone vector similarity (not just tone label)
   - Match by style weights (brevity, formality, etc.)
   - Prioritize tone-matched memories

2. Modify `PersonalityOrchestrator.retrieveRelevantMemories()`
   - Use tone vector for memory retrieval
   - Maintain tone continuity across turns

3. Add tone continuity tracking
   - Track tone trajectory across conversation
   - Predict next tone based on history
   - Inject tone continuity into prompt

**Deliverables**:
- Tone continuity tracking
- Memory-driven tone matching
- Improved tone consistency across turns

### Phase 6: Guardrails Against Tone Collapse (Week 3-4)

**Tasks**:
1. Enhance `DriftPrevention.ts`
   - Pre-generation validation (not just post-generation)
   - Validate prompt contains tone/style constraints
   - Refuse generation if constraints missing

2. Create `ToneCollapseGuard.ts`
   - Monitor for generic responses
   - Detect tone/style drift early
   - Inject corrective constraints

3. Add response validation
   - Validate response matches tone profile
   - Validate response matches style weights
   - Correct or regenerate if drift detected

**Deliverables**:
- Pre-generation validation
- Tone collapse detection
- Automatic correction/regeneration

### Phase 7: Markdown Tone Extraction (Week 4)

**Tasks**:
1. Create `MarkdownToneExtractor.ts`
   - Parse markdown file
   - Extract conversational examples
   - Analyze tone/style of examples
   - Generate Nova-Core persona file

2. Create CLI tool for markdown extraction
   - `npm run extract-tone -- --file path/to/file.md --output personas/nova-core.json`

**Deliverables**:
- Markdown tone extractor
- CLI tool for extraction
- Nova-Core persona file from markdown

---

## 7. Code Examples

### 7.1 Tone Vector Extraction

```typescript
// src/engine/tone/ToneVectorExtractor.ts
export class ToneVectorExtractor {
  async extractToneVector(
    conversationPair: ConversationPair
  ): Promise<ToneVector> {
    const tone = await detectToneEnhanced({ text: conversationPair.assistant });
    
    // Calculate style weights from response
    const styleWeights = this.calculateStyleWeights(conversationPair.assistant);
    
    // Generate tone-style embedding (not semantic)
    const embedding = await this.generateToneEmbedding(
      tone,
      styleWeights,
      conversationPair.assistant
    );
    
    return {
      toneLabel: tone.surfaceTone,
      emotionalState: tone.emotionalState,
      styleWeights,
      embedding,
    };
  }
  
  private calculateStyleWeights(text: string): StyleWeights {
    const wordCount = text.split(/\s+/).length;
    const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim()).length;
    
    return {
      brevity: Math.max(0, 1 - (wordCount / 50)), // 0-1, higher = briefer
      formality: this.detectFormality(text), // 0-1, higher = more formal
      emotionalIntensity: this.detectEmotionalIntensity(text),
      directness: this.detectDirectness(text),
    };
  }
  
  private async generateToneEmbedding(
    tone: EnhancedToneDetection,
    styleWeights: StyleWeights,
    text: string
  ): Promise<number[]> {
    // Use sentence transformer to generate tone-style embedding
    // Combine: tone label + emotional state + style weights
    const toneText = `${tone.surfaceTone} ${tone.emotionalState.dominantEmotion} ` +
      `brevity:${styleWeights.brevity} formality:${styleWeights.formality} ` +
      `directness:${styleWeights.directness}`;
    
    // Generate embedding (using local model, not semantic)
    const { createEmbedding } = await import('../semanticRetrieval');
    return await createEmbedding(toneText);
  }
}
```

### 7.2 Style-Weight Injection

```typescript
// src/engine/persona/StyleWeightInjector.ts
export function injectStyleWeights(
  prompt: string,
  styleWeights: StyleWeights,
  blueprint: PersonalityBlueprint
): string {
  const constraints: string[] = [
    '=== MANDATORY STYLE CONSTRAINTS ===',
    `Brevity: ${styleWeights.brevity.toFixed(2)} (${styleWeights.brevity > 0.8 ? 'ultra-brief' : styleWeights.brevity > 0.5 ? 'brief' : 'normal'})`,
    `Formality: ${styleWeights.formality.toFixed(2)} (${styleWeights.formality > 0.7 ? 'formal' : styleWeights.formality > 0.3 ? 'neutral' : 'casual'})`,
    `Directness: ${styleWeights.directness.toFixed(2)} (${styleWeights.directness > 0.8 ? 'direct' : 'indirect'})`,
    `Emotional Intensity: ${styleWeights.emotionalIntensity.toFixed(2)}`,
    '',
    'VIOLATION: If response does not match these style constraints, it is invalid.',
    'These are MANDATORY constraints, not suggestions.',
    '',
  ];
  
  return constraints.join('\n') + prompt;
}
```

### 7.3 Tone-Aware Memory Retrieval

```typescript
// src/lib/toneAwareRetrieval.ts
export async function retrieveByToneStyle(
  query: string,
  targetTone: ToneVector,
  constructCallsign: string,
  userId: string,
  limit: number
): Promise<Memory[]> {
  // 1. Semantic query (existing)
  const semanticResults = await identityService.queryIdentities(
    userId,
    constructCallsign,
    query,
    limit * 2 // Get more for hybrid ranking
  );
  
  // 2. Tone-style query (new)
  const toneResults = await identityService.queryByToneVector(
    userId,
    constructCallsign,
    targetTone.embedding,
    limit * 2
  );
  
  // 3. Hybrid ranking
  const hybridResults = semanticResults.map(memory => {
    const toneMatch = toneResults.find(t => t.id === memory.id);
    const semanticScore = memory.relevance || 0;
    const toneScore = toneMatch ? this.calculateToneSimilarity(
      targetTone,
      toneMatch.toneVector
    ) : 0;
    
    return {
      ...memory,
      hybridScore: semanticScore * 0.4 + toneScore * 0.6, // Tone-weighted
    };
  });
  
  return hybridResults
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, limit);
}
```

### 7.4 Behavioral Rule Enforcement

```typescript
// src/engine/persona/BehavioralRuleEnforcer.ts
export function enforceBehavioralRules(
  prompt: string,
  rules: BehavioralRule[],
  userMessage: string,
  blueprint: PersonalityBlueprint
): string {
  // Match user message to behavioral rules
  const matchingRules = rules.filter(rule => {
    return this.matchesSituation(userMessage, rule.situation);
  });
  
  if (matchingRules.length === 0) {
    return prompt; // No matching rules
  }
  
  // Inject matching rules as mandatory constraints
  const ruleConstraints: string[] = [
    '=== MANDATORY BEHAVIORAL RULES (MATCHED) ===',
  ];
  
  matchingRules.forEach(rule => {
    ruleConstraints.push(
      `Situation: ${rule.situation}`,
      `Required Response: ${rule.requiredResponse}`,
      `Style Weights: ${JSON.stringify(rule.styleWeights)}`,
      `Enforcement: ${rule.enforcementLevel}`,
      ''
    );
  });
  
  ruleConstraints.push(
    'VIOLATION: Response must match these behavioral rules. They are MANDATORY.',
    ''
  );
  
  return ruleConstraints.join('\n') + prompt;
}
```

---

## 8. Success Criteria

1. **Tone Consistency**: Responses match Nova-Core tone profile ≥90% of the time
2. **Style Adherence**: Responses match style weights ≥85% of the time
3. **Memory Relevance**: Tone-matched memories retrieved ≥80% of the time
4. **Drift Prevention**: Pre-generation validation prevents drift ≥95% of the time
5. **Behavioral Rule Compliance**: Behavioral rules enforced ≥90% of the time

---

## 9. Next Steps

1. **Create Nova-Core persona template** (user can do this now, or we can generate from markdown)
2. **Implement Phase 1** (Tone Vector Extraction)
3. **Test with existing transcripts** (validate tone vectors extracted correctly)
4. **Implement Phase 2** (Style-Weight Injection)
5. **Iterate based on testing**

---

## 10. Questions for User

1. **Nova-Core Template**: Should we create the template now, or extract it from the markdown file first?
2. **Style Dimensions**: Are the style dimensions (brevity, formality, directness, emotional intensity) sufficient, or should we add more?
3. **Enforcement Level**: How strict should enforcement be? (e.g., refuse generation if constraints missing, or allow with warnings?)
4. **Tone Labels**: Should we extend the tone labels beyond the current 9, or is that sufficient?
5. **Markdown File**: Can you provide the markdown file path, or should we create a parser for a generic markdown structure?

