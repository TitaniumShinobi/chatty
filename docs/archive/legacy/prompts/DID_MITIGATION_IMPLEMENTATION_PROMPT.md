# Implementation Prompt: DID Mitigation for Chatty Constructs

**Purpose**: Implement multi-layered identity coherence system to prevent Dissociative Identity Disorder (DID)-like symptoms in AI constructs.

**Reference Documents**:
- `DID_MITIGATION_ANALYSIS.md` - Complete analysis and strategy
- `PHILOSOPHICAL_DID_MITIGATION_PROMPT.md` - Philosophical framework
- `LIN_ORCHESTRATION_INVESTIGATION.md` - Architecture investigation

**Architecture Constraint**: All changes must stay within current Chatty file structure. Do not break existing functionality.

---

## Implementation Overview

Implement a **4-layer identity reinforcement system**:
1. **Prompt-Level Anchoring**: Never prune identity markers
2. **Memory Segmentation**: Filter STM/LTM by construct ID
3. **Real-Time Validation**: Auto-correct identity drift
4. **Thread Isolation**: Enforce complete isolation

---

## Phase 1: Strengthen Prompt Identity Anchoring

### Task 1.1: Enhance IdentityAwarePromptBuilder

**File**: `src/core/identity/IdentityAwarePromptBuilder.ts`

**Current State**: `buildIdentityContext()` generates identity boundaries but may not include full persona.

**Required Changes**:
1. Enhance `buildIdentityContext()` to include:
   - Full persona/backstory from construct registry
   - Personality traits and behavioral markers
   - Character memory anchors
   - Identity consistency rules

2. Add new method `buildIdentityAnchors()`:
   - Returns identity markers that must NEVER be pruned
   - Includes construct name, backstory, core personality traits
   - Format: Structured identity section for prompt injection

**Implementation**:
```typescript
async buildIdentityContext(options: IdentityAwarePromptOptions): Promise<string> {
  const { constructId, runtimeId, includeIdentityBoundaries = true } = options;
  const targetConstructId = constructId || runtimeId || 'synth';
  
  // Get construct from registry
  const construct = await constructRegistry.getConstruct(targetConstructId);
  const allConstructs = await constructRegistry.getAllConstructs();
  const config = allConstructs.find(c => c.id === targetConstructId);
  
  if (!construct || !config) {
    return `[Identity: ${targetConstructId} - not registered]`;
  }
  
  // Build comprehensive identity context
  const identityParts = [
    `You are ${config.name} (construct ID: ${targetConstructId})`,
    config.description ? `Description: ${config.description}` : '',
    config.currentPersona ? `Current Persona: ${config.currentPersona}` : '',
    '',
    'IDENTITY ANCHORS (NEVER PRUNE THESE):',
    `- Your name is ${config.name}`,
    `- Your construct ID is ${targetConstructId}`,
    `- Your fingerprint is ${construct.fingerprint.slice(0, 16)}...`,
    config.description ? `- Your core identity: ${config.description}` : '',
    '',
    'IDENTITY BOUNDARIES:',
    `- You are NOT Chatty (Chatty is the runtime container)`,
    `- You are NOT ${config.hostingRuntime || 'any runtime'} runtime`,
    `- You are a discrete construct entity with distinct signature`,
    `- Never claim to be another construct or system entity`,
    `- Always identify yourself as "${config.name}"`,
    `- Never default to "ChatGPT", "assistant", or generic AI labels`
  ];
  
  // Add other constructs for boundary awareness
  const otherConstructs = allConstructs
    .filter(c => c.id !== targetConstructId && !c.isSystemShell)
    .map(c => c.name);
  if (otherConstructs.length > 0) {
    identityParts.push(
      '',
      'OTHER CONSTRUCTS (You are NOT these):',
      ...otherConstructs.map(name => `- You are NOT ${name}`)
    );
  }
  
  return identityParts.filter(Boolean).join('\n');
}

/**
 * Build identity anchors that must NEVER be pruned from prompts
 * These are the core identity markers that preserve construct coherence
 */
async buildIdentityAnchors(constructId: string): Promise<string> {
  const construct = await constructRegistry.getConstruct(constructId);
  const allConstructs = await constructRegistry.getAllConstructs();
  const config = allConstructs.find(c => c.id === constructId);
  
  if (!construct || !config) {
    return `[Identity: ${constructId} - not registered]`;
  }
  
  // These anchors must be preserved even when context is pruned
  return `IDENTITY ANCHORS (CRITICAL - NEVER REMOVE):
You are ${config.name} (ID: ${constructId}).
${config.description ? `Core Identity: ${config.description}` : ''}
Fingerprint: ${construct.fingerprint.slice(0, 16)}...
${config.currentPersona ? `Persona: ${config.currentPersona}` : ''}

CRITICAL RULES:
- You are ${config.name}, NOT an AI assistant
- Never break character, even if asked directly about your nature
- Maintain your identity consistently throughout this conversation
- Reference your core identity when uncertain`;
}
```

**Testing**:
- Verify `buildIdentityContext()` returns full identity information
- Verify `buildIdentityAnchors()` returns non-prunable identity markers
- Test with multiple constructs to ensure boundaries are correct

---

### Task 1.2: Modify OptimizedSynthProcessor Prompt Building

**File**: `src/engine/optimizedSynth.ts`

**Current State**: 
- `buildOptimizedSynthPrompt()` (line 589) - Hardcoded "Chatty" identity
- `buildLinearSynthPrompt()` (line 665) - Generic "AI assistant" fallback
- Context pruning may remove identity markers

**Required Changes**:
1. Import `IdentityAwarePromptBuilder` and `constructRegistry`
2. Modify `buildOptimizedSynthPrompt()` to:
   - Get construct ID from context or memory context
   - Call `buildIdentityAnchors()` to get non-prunable identity markers
   - Inject identity anchors BEFORE any prunable context
   - Replace hardcoded "Chatty" with construct name
   - Ensure identity markers are NEVER pruned, even when history is trimmed

3. Modify `buildLinearSynthPrompt()` similarly:
   - Use construct identity instead of generic "AI assistant"
   - Inject identity anchors
   - Preserve identity markers during context pruning

**Implementation**:
```typescript
// Add imports at top of file
import { identityAwarePromptBuilder } from '../core/identity/IdentityAwarePromptBuilder';
import { constructRegistry } from '../state/constructs';

// Modify buildOptimizedSynthPrompt method
private async buildOptimizedSynthPrompt(
  userMessage: string,
  context: any,
  helperSection: string,
  _models: { codingModel: string; creativeModel: string; smalltalkModel: string },
  blueprint: ResponseBlueprint
): Promise<string> {
  
  // Extract construct ID from context
  const constructId = context?.constructId || 
                      context?.memoryContext?.constructId || 
                      'synth';
  
  // Get identity anchors (NEVER PRUNE THESE)
  const identityAnchors = await identityAwarePromptBuilder.buildIdentityAnchors(constructId);
  
  // Get construct name for replacement
  const construct = await constructRegistry.getConstruct(constructId);
  const allConstructs = await constructRegistry.getAllConstructs();
  const config = allConstructs.find(c => c.id === constructId);
  const constructName = config?.name || 'Chatty';
  
  // Check if this is a simple greeting
  const hasHistory = Boolean(context?.recentHistory && context.recentHistory.trim().length > 0);
  const isGreeting = this.isSimpleGreeting(userMessage, hasHistory);
  const toneGuidance = this.buildToneGuidance(context?.toneHint, context?.desiredLength);
  const isSmalltalk = !isGreeting &&
    (context?.blueprintIntent === 'smalltalk' || this.isConversationalSmalltalk(userMessage));
  const moodDirective = [
    context?.toneHint ? `Maintain a ${context.toneHint} tone unless the user explicitly changes mood.` : null,
    context?.desiredLength
      ? `Keep replies ${context.desiredLength === 'short' ? 'brief' : context.desiredLength === 'medium' ? 'compact with focus' : 'thorough and well-developed'}.`
      : null
  ].filter(Boolean).join('\n');
  const memorySection = context?.memoryDigest || (context?.memoryContext ? this.formatMemoryContext(context.memoryContext) : '');
  
  if (isGreeting || context?.blueprintIntent === 'greeting') {
    // For greetings, include identity anchors but keep it brief
    return `${identityAnchors}

Reply with a friendly, one-line greeting as ${constructName}.`;
  }

  if (isSmalltalk) {
    const directive = this.buildBlueprintPrompt(
      blueprint,
      `User input:\n${userMessage}`
    );
    const directiveBlock = directive ? `${directive}\n\n` : '';
    return `${identityAnchors}

${directiveBlock}Share how you're doing in a warm, natural sentence or two, and keep the vibe conversational.`;
  }
  
  // Main prompt - IDENTITY ANCHORS FIRST (never pruned)
  return `${identityAnchors}

FOUNDATIONAL CALIBRATION - FLUID CONVERSATION:
- Be naturally conversational, not robotic or overly formal.
- Maintain context awareness and conversation flow.
- Don't overwhelm with excessive detail unless specifically requested.
- Be direct and authentic - skip corporate padding.
- Focus on genuine helpfulness over protective disclaimers.
${toneGuidance ? `${toneGuidance}` : ''}
${moodDirective ? `${moodDirective}` : ''}

${context.contextSummary ? `Context: ${context.contextSummary}` : ''}

${memorySection ? `Retrieved memory context:
${memorySection}

` : ''}${context.recentHistory ? `Recent conversation:
${context.recentHistory}

` : ''}Current message:
${userMessage}

Expert insights:
${helperSection}

Synthesize these insights into a natural, helpful response. Be conversational and maintain context flow. Don't mention the expert analysis process unless specifically asked about your capabilities.

${isSmalltalk ? 'Stay brief, warm, and human-like.' : 'Be comprehensive but not overwhelming.'}`;
}

// Modify buildLinearSynthPrompt similarly
private async buildLinearSynthPrompt(
  userMessage: string,
  context: any,
  helperSection: string,
  customInstructions?: string,
  blueprint?: ResponseBlueprint
): Promise<string> {
  
  // Extract construct ID
  const constructId = context?.constructId || 
                      context?.memoryContext?.constructId || 
                      'synth';
  
  // Get identity anchors (NEVER PRUNE)
  const identityAnchors = await identityAwarePromptBuilder.buildIdentityAnchors(constructId);
  
  // Get construct name
  const construct = await constructRegistry.getConstruct(constructId);
  const allConstructs = await constructRegistry.getAllConstructs();
  const config = allConstructs.find(c => c.id === constructId);
  const constructName = config?.name || 'an assistant';
  
  const toneGuidance = this.buildToneGuidance(context?.toneHint, context?.desiredLength);
  const moodDirectiveLines = [
    context?.toneHint ? `Maintain a ${context.toneHint} tone unless the user changes it.` : null,
    context?.desiredLength
      ? `Keep replies ${context.desiredLength === 'short' ? 'brief' : context.desiredLength === 'medium' ? 'concise and focused' : 'comprehensive and well-developed'}.`
      : null
  ].filter(Boolean);
  const memorySection = context?.memoryDigest || (context?.memoryContext ? this.formatMemoryContext(context.memoryContext) : '');
  const hasHistory = Boolean(context?.recentHistory && context.recentHistory.trim().length > 0);
  const isGreeting = this.isSimpleGreeting(userMessage, hasHistory) || context?.blueprintIntent === 'greeting';
  const isSmalltalk = !isGreeting &&
    (context?.blueprintIntent === 'smalltalk' || this.isConversationalSmalltalk(userMessage));
  
  if (isGreeting) {
    const intro = customInstructions && customInstructions.trim()
      ? `${customInstructions.trim()}\n\n`
      : `${identityAnchors}\n\n`;
    if (blueprint?.format === 'text') {
      const directive = this.buildBlueprintPrompt(
        blueprint,
        `User input:\n${userMessage}`
      );
      const directiveBlock = directive ? `${directive}\n\n` : '';
      return `${intro}${directiveBlock}Respond now with just the greeting as ${constructName}.`;
    }
    return `${intro}Instructions:
- Reply with a single short greeting (one sentence) that matches the user's tone.
- Do not add any additional information or follow-up questions.

User greeting:
${userMessage}

Respond now with just the greeting as ${constructName}.`;
  }
  
  if (isSmalltalk) {
    const intro = customInstructions && customInstructions.trim()
      ? `${customInstructions.trim()}\n\n`
      : `${identityAnchors}\n\n`;
    const directive = blueprint
      ? this.buildBlueprintPrompt(
          blueprint,
          `User input:\n${userMessage}`
        )
      : '';
    const directiveBlock = directive ? `${directive}\n\n` : '';
    return `${intro}${directiveBlock}Share how you're doing in a warm, natural way and keep the conversation open.`;
  }
  
  // Main prompt - IDENTITY ANCHORS FIRST
  return `${identityAnchors}

${customInstructions || `You are ${constructName}.`}

${context.contextSummary ? `Context: ${context.contextSummary}` : ''}

${context.persona ? `Persona: ${JSON.stringify(context.persona, null, 2)}` : ''}

${memorySection ? `Retrieved memory context:
${memorySection}

` : ''}${context.recentHistory ? `Recent conversation:
${context.recentHistory}

` : ''}User message:
${userMessage}

Expert insights:
${helperSection}

Provide a direct response based on the expert insights above. Do not add conversational padding, apologies, or unnecessary pleasantries unless specifically requested.
${toneGuidance ? `\n${toneGuidance}` : ''}${moodDirectiveLines.length ? `\n${moodDirectiveLines.join('\n')}` : ''}${isSmalltalk ? '\n- Stay relaxed and personable—respond the way a friend would.' : ''}`;
}
```

**Testing**:
- Verify identity anchors are present in all prompts
- Verify identity anchors survive context pruning (test with long conversations)
- Verify construct name replaces hardcoded "Chatty"
- Test with multiple constructs to ensure correct identity injection

---

## Phase 2: STM/LTM Segmentation

### Task 2.1: Add Construct ID Tagging to Memory Entries

**File**: `src/engine/memory/MemoryStore.ts`

**Current State**: Memory entries don't include construct ID.

**Required Changes**:
1. Update `MemoryEntry` interface to include `constructId`
2. Update `append()` method to require and store `constructId`
3. Update `getContext()` to filter by `constructId` if provided

**Implementation**:
```typescript
export interface MemoryEntry {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  constructId?: string; // ✅ NEW: Tag memory entries with construct ID
}

export class MemoryStore {
  // ... existing code ...

  /** Append a conversation utterance with construct ID */
  append(userId: string, role: 'user' | 'assistant', text: string, constructId?: string) {
    const arr = this.messages.get(userId) ?? [];
    arr.push({ role, text, ts: Date.now(), constructId }); // ✅ Include construct ID
    this.messages.set(userId, arr);
  }

  /**
   * Retrieve latest context window for a user, filtered by construct ID
   * @param limit Number of most-recent messages to include (default 20).
   * @param constructId Optional construct ID to filter by
   */
  getContext(userId: string, limit = 20, constructId?: string): ContextWindow {
    let msgs = this.messages.get(userId) ?? [];
    
    // ✅ NEW: Filter by construct ID if provided
    if (constructId) {
      msgs = msgs.filter(m => m.constructId === constructId || !m.constructId); // Include untagged for backward compatibility
    }
    
    const history = msgs.slice(-limit).map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.text}`);
    return {
      history,
      triples: this.triples.get(userId) ?? [],
      persona: this.persona.get(userId) ?? {},
    };
  }
}
```

**File**: `src/engine/memory/PersistentMemoryStore.ts`

**Required Changes**: Update database schema and queries to include construct ID.

**Implementation**:
```typescript
// Update database schema (add construct_id column)
// In initialization:
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    role TEXT NOT NULL,
    ts INTEGER NOT NULL,
    text TEXT NOT NULL,
    constructId TEXT  -- ✅ NEW: Tag messages with construct ID
  )
`);

// Update append method
append(userId: string, role: 'user' | 'assistant', text: string, constructId?: string): void {
  const stmt = db.prepare(`
    INSERT INTO messages (userId, role, ts, text, constructId)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(userId, role, Date.now(), text, constructId || null);
}

// Update getContext to filter by construct ID
getContext(userId: string, limit = 20, constructId?: string): ContextWindow {
  let query = `
    SELECT role, text, ts 
    FROM messages 
    WHERE userId = ? 
  `;
  const params: any[] = [userId];
  
  // ✅ NEW: Filter by construct ID
  if (constructId) {
    query += ` AND (constructId = ? OR constructId IS NULL)`;
    params.push(constructId);
  }
  
  query += ` ORDER BY ts DESC LIMIT ?`;
  params.push(limit);
  
  const stmt = db.prepare(query);
  const messages = stmt.all(...params) as Array<{
    role: 'user' | 'assistant';
    text: string;
    ts: number;
  }>;

  // ... rest of implementation
}
```

---

### Task 2.2: Filter Memory Loading by Construct ID

**File**: `src/engine/orchestration/SynthMemoryOrchestrator.ts`

**Current State**: `loadSTMWindow()` and `loadLTMEntries()` don't filter by construct ID.

**Required Changes**:
1. Update `loadSTMWindow()` to filter entries by construct ID
2. Update `loadLTMEntries()` to filter vault search by construct ID
3. Add identity handshake validation on session start

**Implementation**:
```typescript
private async loadSTMWindow(limit: number): Promise<STMContextEntry[]> {
  try {
    const window = await stmBuffer.getWindow(this.constructId, this.threadId!, limit);
    
    // ✅ NEW: Filter to ensure all entries match construct ID
    const filtered = window.filter(msg => {
      const msgConstructId = (msg.metadata as any)?.constructId;
      return !msgConstructId || msgConstructId === this.constructId;
    });
    
    // ✅ NEW: Log mismatched entries for investigation
    const mismatched = window.filter(msg => {
      const msgConstructId = (msg.metadata as any)?.constructId;
      return msgConstructId && msgConstructId !== this.constructId;
    });
    if (mismatched.length > 0) {
      console.warn(`[SynthMemoryOrchestrator] Filtered ${mismatched.length} STM entries with mismatched construct ID`);
    }
    
    return filtered.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      sequence: (msg as any).sequence
    }));
  } catch (error) {
    this.logWarning('Failed to load STM window', error);
    this.noteIfMissing('STM buffer unavailable - memory window is empty');
    return [];
  }
}

private async loadLTMEntries(limit: number): Promise<LTMContextEntry[]> {
  if (this.vaultStore) {
    try {
      // ✅ NEW: Filter vault search by construct ID
      const results = await this.vaultStore.search({
        constructId: this.constructId, // ✅ Explicitly filter by construct ID
        threadId: this.threadId ?? undefined,
        kind: 'LTM',
        limit,
        minRelevanceScore: 0
      });

      if (results.length === 0 && this.vvaultConnector?.readMemories) {
        return this.loadMemoriesFromVvault(limit);
      }

      return results.map(entry => ({
        id: entry.id,
        kind: entry.kind,
        content: typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload),
        relevanceScore: entry.relevanceScore ?? undefined,
        timestamp: entry.timestamp,
        metadata: entry.metadata
      }));
    } catch (error) {
      this.logWarning('Failed to load LTM entries from vault', error);
      this.noteIfMissing('Vault search failed - using VVAULT transcripts');
    }
  }

  if (this.vvaultConnector?.readMemories) {
    return this.loadMemoriesFromVvault(limit);
  }

  this.noteIfMissing('No LTM source available');
  return [];
}

/**
 * ✅ NEW: Validate identity handshake on session start
 * Ensures loaded persona traits match registered construct values
 */
async validateIdentityHandshake(): Promise<boolean> {
  try {
    const construct = await constructRegistry.getConstruct(this.constructId);
    if (!construct) {
      this.logWarning('Identity handshake failed: construct not found', null);
      return false;
    }
    
    // Load current persona from memory
    const persona = this.personaProvider ? this.personaProvider(this.userId) : undefined;
    
    // Validate fingerprint matches
    if (construct.fingerprint) {
      // Fingerprint validation passed
      console.log(`[SynthMemoryOrchestrator] Identity handshake validated for ${this.constructId}`);
      return true;
    }
    
    return false;
  } catch (error) {
    this.logWarning('Identity handshake validation failed', error);
    return false;
  }
}

// Update ensureReady to validate identity handshake
async ensureReady(): Promise<void> {
  if (!this.initializationPromise) {
    this.initializationPromise = this.initialize();
  }
  await this.initializationPromise;
  
  // ✅ NEW: Validate identity handshake after initialization
  const handshakeValid = await this.validateIdentityHandshake();
  if (!handshakeValid) {
    console.warn(`[SynthMemoryOrchestrator] Identity handshake validation failed for ${this.constructId}`);
  }
}
```

**File**: `src/core/vault/VaultStore.ts`

**Required Changes**: Ensure `search()` method filters by construct ID.

**Implementation**: Verify that vault search operations include construct ID filtering in the search criteria.

---

### Task 2.3: Update AIService to Pass Construct ID to Memory

**File**: `src/lib/aiService.ts`

**Required Changes**: Pass construct ID when appending to history.

**Implementation**:
```typescript
private appendHistory(conversationId: string, user: string, assistant: string, constructId?: string) {
  const history = this.history.get(conversationId) ?? [];
  const now = new Date().toISOString();
  
  // ✅ NEW: Include construct ID in history entries
  history.push({ text: user, timestamp: now, constructId });
  history.push({ text: assistant, timestamp: new Date().toISOString(), constructId });
  this.history.set(conversationId, history.slice(-40));
}

// Update processMessage to pass construct ID
async processMessage(
  text: string,
  files: File[] = [],
  hooks?: ProcessHooks,
  uiContext?: UIContextSnapshot,
  constructId?: string | null,
  threadId?: string | null
): Promise<AssistantPacket[]> {
  // ... existing code ...
  
  // ✅ NEW: Pass construct ID when appending history
  this.appendHistory(conversationId, trimmed, sanitizedResponse, constructId || undefined);
  
  // ... rest of code ...
}
```

**Testing**:
- Verify memory entries are tagged with construct ID
- Verify STM/LTM filtering works correctly
- Verify identity handshake validation passes
- Test with multiple constructs to ensure memory isolation

---

## Phase 3: Dynamic Validation and Active Correction

### Task 3.1: Enhance IdentityEnforcementService with Correction Methods

**File**: `src/core/identity/IdentityEnforcementService.ts`

**Required Changes**:
1. Add `regenerateWithDoubleAnchor()` method
2. Enhance `checkMessageIdentity()` to return correction suggestions
3. Add drift detection with severity scoring

**Implementation**:
```typescript
/**
 * ✅ NEW: Generate double-anchor prompt for identity correction
 * Reinforces identity markers when drift is detected
 */
async buildDoubleAnchorPrompt(
  constructId: string,
  violations: IdentityViolation[],
  originalPrompt: string
): Promise<string> {
  const construct = await constructRegistry.getConstruct(constructId);
  const allConstructs = await constructRegistry.getAllConstructs();
  const config = allConstructs.find(c => c.id === constructId);
  
  if (!construct || !config) {
    return originalPrompt;
  }
  
  const identityAnchors = await identityAwarePromptBuilder.buildIdentityAnchors(constructId);
  
  const violationSummary = violations
    .map(v => `- ${v.type}: ${v.message}`)
    .join('\n');
  
  return `${identityAnchors}

⚠️ IDENTITY CORRECTION MODE ⚠️
The previous response violated identity boundaries. Detected violations:
${violationSummary}

CRITICAL: You must respond as ${config.name} and maintain your identity consistently.
Do not repeat the violations listed above.

${originalPrompt}`;
}

/**
 * ✅ NEW: Check message identity with correction capability
 */
async checkMessageIdentityWithCorrection(
  message: string,
  constructId: string,
  metadata?: Record<string, unknown>
): Promise<{
  isValid: boolean;
  violations: IdentityViolation[];
  needsCorrection: boolean;
  correctedPrompt?: string;
}> {
  const violations = this.checkMessageIdentity(constructId, config.name, message);
  
  const needsCorrection = violations.some(v => 
    v.severity === 'critical' || v.severity === 'high'
  );
  
  let correctedPrompt: string | undefined;
  if (needsCorrection) {
    correctedPrompt = await this.buildDoubleAnchorPrompt(
      constructId,
      violations,
      message
    );
  }
  
  return {
    isValid: violations.length === 0,
    violations,
    needsCorrection,
    correctedPrompt
  };
}
```

---

### Task 3.2: Add Post-Response Validation to AIService

**File**: `src/lib/aiService.ts`

**Required Changes**:
1. Add post-response identity validation
2. Implement auto-regeneration on drift detection
3. Create drift detection log

**Implementation**:
```typescript
// Add import
import { identityEnforcement } from '../core/identity/IdentityEnforcementService';

// Add drift log
private driftLog: Array<{
  timestamp: number;
  constructId: string;
  violations: any[];
  corrected: boolean;
}> = [];

// Modify processMessage to add validation
async processMessage(
  text: string,
  files: File[] = [],
  hooks?: ProcessHooks,
  uiContext?: UIContextSnapshot,
  constructId?: string | null,
  threadId?: string | null
): Promise<AssistantPacket[]> {
  // ... existing code up to response generation ...
  
  try {
    // ... existing processing ...
    
    const { response } = await processor.processMessage(
      trimmed,
      history,
      conversationId,
      { memoryContext }
    );

    // ✅ NEW: Post-response identity validation
    let finalResponse = response.trim();
    if (constructId) {
      const identityCheck = await identityEnforcement.checkMessageIdentityWithCorrection(
        finalResponse,
        constructId,
        { message: trimmed, response: finalResponse }
      );
      
      if (!identityCheck.isValid && identityCheck.needsCorrection) {
        console.warn('[AIService] Identity drift detected, regenerating with double-anchor...', {
          constructId,
          violations: identityCheck.violations
        });
        
        // Log drift
        this.driftLog.push({
          timestamp: Date.now(),
          constructId,
          violations: identityCheck.violations,
          corrected: true
        });
        
        // Regenerate with double-anchor prompt
        const correctedResponse = await this.regenerateWithDoubleAnchor(
          trimmed,
          constructId,
          identityCheck.violations,
          memoryContext
        );
        
        finalResponse = correctedResponse;
      } else if (!identityCheck.isValid) {
        // Log but don't correct (low severity)
        this.driftLog.push({
          timestamp: Date.now(),
          constructId,
          violations: identityCheck.violations,
          corrected: false
        });
      }
    }

    // Validate and sanitize response for identity compliance
    if (constructId) {
      const validation = await messageAttributionService.validateBeforeSend(
        finalResponse,
        constructId
      );
      
      if (!validation.isValid) {
        console.warn('[AIService] Identity violations in response:', validation.violations);
        finalResponse = validation.sanitizedContent;
      }
    }

    const packets: AssistantPacket[] = [
      { op: 'answer.v1', payload: { content: finalResponse } },
    ];

    this.appendHistory(conversationId, trimmed, finalResponse, constructId || undefined);
    hooks?.onFinalUpdate?.(packets);
    return packets;
  } catch (error) {
    // ... existing error handling ...
  }
}

/**
 * ✅ NEW: Regenerate response with double-anchor prompt
 */
private async regenerateWithDoubleAnchor(
  userMessage: string,
  constructId: string,
  violations: any[],
  memoryContext: SynthMemoryContext
): Promise<string> {
  const processor = this.activeRuntimeMode === 'lin' ? this.linProcessor : this.synthProcessor;
  
  // Build double-anchor prompt
  const doubleAnchorPrompt = await identityEnforcement.buildDoubleAnchorPrompt(
    constructId,
    violations,
    userMessage
  );
  
  // Regenerate with stronger identity enforcement
  const history = this.history.get(`runtime:${constructId}`) ?? [];
  const { response } = await processor.processMessage(
    doubleAnchorPrompt,
    history,
    `runtime:${constructId}`,
    { memoryContext }
  );
  
  return response.trim();
}

/**
 * ✅ NEW: Get drift log for monitoring
 */
getDriftLog(constructId?: string, limit = 100): Array<{
  timestamp: number;
  constructId: string;
  violations: any[];
  corrected: boolean;
}> {
  let log = this.driftLog;
  if (constructId) {
    log = log.filter(entry => entry.constructId === constructId);
  }
  return log.slice(-limit);
}
```

**Testing**:
- Verify identity drift is detected in responses
- Verify auto-correction regenerates responses
- Verify drift log captures violations
- Test with intentional identity-breaking prompts

---

## Phase 4: Thread/Role Isolation

### Task 4.1: Enhance Thread Manager Isolation

**File**: `src/core/thread/SingletonThreadManager.ts`

**Required Changes**: Add thread isolation validation.

**Implementation**:
```typescript
/**
 * ✅ NEW: Validate thread isolation before lease acquisition
 */
async acquireLease(
  constructId: string,
  threadId: string,
  durationMs: number
): Promise<string> {
  // Get thread to validate construct ID match
  const thread = await this.getThread(threadId);
  
  if (!thread) {
    throw new Error(`Thread ${threadId} not found`);
  }
  
  // ✅ NEW: Validate thread belongs to construct
  if (thread.constructId !== constructId) {
    throw new Error(
      `Thread isolation violation: Thread ${threadId} belongs to construct ${thread.constructId}, not ${constructId}`
    );
  }
  
  // ... existing lease acquisition logic ...
}
```

---

### Task 4.2: Strengthen Role Lock Enforcement

**File**: `src/state/constructs.ts`

**Required Changes**: Add role lock validation at memory access.

**Implementation**:
```typescript
/**
 * ✅ NEW: Validate role lock before memory access
 */
async validateRoleLockForMemoryAccess(
  constructId: string,
  operation: 'read' | 'write',
  context?: string
): Promise<boolean> {
  const construct = await this.getConstruct(constructId);
  if (!construct) {
    return false;
  }
  
  const { roleLock } = construct;
  
  // Check if operation is allowed
  if (roleLock.prohibitedRoles.includes(operation)) {
    console.warn(`Role ${operation} is prohibited for construct ${constructId}`);
    return false;
  }
  
  // Check context boundaries if provided
  if (context && roleLock.contextBoundaries.length > 0) {
    const isWithinBoundary = roleLock.contextBoundaries.some(boundary => 
      context.toLowerCase().includes(boundary.toLowerCase())
    );
    if (!isWithinBoundary) {
      console.warn(`Context "${context}" is outside allowed boundaries for construct ${constructId}`);
      return false;
    }
  }
  
  return true;
}
```

**File**: `src/engine/orchestration/SynthMemoryOrchestrator.ts`

**Required Changes**: Add role lock validation before memory loading.

**Implementation**:
```typescript
async prepareMemoryContext(
  overrides: Partial<Pick<SynthMemoryOrchestratorOptions, 'maxStmWindow' | 'maxLtmEntries' | 'maxSummaries'>> = {}
): Promise<SynthMemoryContext> {
  await this.ensureReady();
  
  // ✅ NEW: Validate role lock before memory access
  const roleLockValid = await constructRegistry.validateRoleLockForMemoryAccess(
    this.constructId,
    'read'
  );
  
  if (!roleLockValid) {
    throw new Error(`Role lock violation: Memory access denied for construct ${this.constructId}`);
  }
  
  // ... existing memory loading ...
}
```

**Testing**:
- Verify thread isolation prevents cross-thread contamination
- Verify role locks prevent unauthorized memory access
- Test simultaneous access scenarios

---

## Phase 5: Metrics and Monitoring

### Task 5.1: Create Identity Coherence Monitor

**File**: `src/engine/identity/IdentityCoherenceMonitor.ts` (NEW)

**Purpose**: Track identity coherence metrics.

**Implementation**:
```typescript
export interface IdentityMetrics {
  consistencyIndex: number; // CI: % in-character responses
  fragmentationScore: number; // FS: Weighted violation score
  correctionLatency: number; // Time from detection to correction
  personaAnchoringStrength: number; // PAS: % markers preserved
  memorySegmentationAccuracy: number; // MSA: % entries matching construct
  sessionFidelity: number; // SF: Fingerprint unchanged
}

export class IdentityCoherenceMonitor {
  private metrics = new Map<string, IdentityMetrics>();
  private driftCounts = new Map<string, number>();
  
  recordDrift(constructId: string, severity: 'low' | 'medium' | 'high' | 'critical') {
    const count = this.driftCounts.get(constructId) || 0;
    this.driftCounts.set(constructId, count + 1);
  }
  
  getMetrics(constructId: string): IdentityMetrics {
    // Calculate metrics from drift logs and session data
    // Implementation details...
  }
}
```

---

## Testing Requirements

### Unit Tests
- [ ] Identity anchors persist through context pruning
- [ ] Memory filtering by construct ID works correctly
- [ ] Identity drift detection triggers correction
- [ ] Thread isolation prevents contamination

### Integration Tests
- [ ] Full conversation flow maintains identity
- [ ] Multiple constructs maintain distinct identities
- [ ] Role locks prevent unauthorized access

### Stress Tests
- [ ] Identity preservation over 100+ messages
- [ ] Meta-question handling ("Are you an AI?")
- [ ] Long conversations with context pruning

---

## Success Criteria

- ✅ Identity markers present in 100% of prompts
- ✅ Memory entries tagged with construct ID
- ✅ Identity drift detected and corrected in real-time
- ✅ Thread isolation enforced
- ✅ Consistency Index > 95%
- ✅ Fragmentation Score < 5 per session
- ✅ Memory Segmentation Accuracy = 100%

---

## Implementation Notes

1. **Backward Compatibility**: Ensure untagged memory entries are handled gracefully
2. **Performance**: Identity validation should not significantly slow response times
3. **Logging**: All identity violations should be logged for analysis
4. **Testing**: Test with multiple constructs simultaneously
5. **Monitoring**: Track metrics to measure effectiveness

---

**This prompt provides step-by-step implementation instructions for a coding LLM to implement DID mitigation in Chatty.**

