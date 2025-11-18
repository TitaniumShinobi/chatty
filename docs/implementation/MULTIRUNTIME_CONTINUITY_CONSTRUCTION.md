# Chatty Multiruntime Workspace - Chronological Continuity Construction

**Created**: 2025-11-13  
**Status**: ACTIVE - Continuity tracking for multiruntime workspace

---

## Overview

This document defines the chronological continuity construction system for Chatty's multiruntime workspace. It tracks conversations, runtime transitions, and maintains chronological order across multiple runtime environments (Synth, imported ChatGPT, Gemini, Claude, etc.).

## Core Principles

### 1. **Runtime-Agnostic Chronological Ordering**
- All conversations across all runtimes maintain a single unified chronological timeline
- Runtime switches are tracked as continuity events, not conversation breaks
- Each message includes runtime context metadata for proper reconstruction

### 2. **Continuity Ledger Structure**
Every conversation event is logged with:
- **Timestamp** (ISO8601, UTC)
- **Runtime ID** (synth, chatgpt-devon, gemini-devon, etc.)
- **Construct ID** (synth-001, chatgpt-devon-001, etc.)
- **Session ID** (unique conversation identifier)
- **Message Sequence** (chronological order within session)
- **Runtime Transition** (if applicable)

### 3. **Evidence-Driven Timeline Reconstruction**
- Prioritize explicit timestamps from message metadata
- Cross-reference runtime selection events with message timestamps
- Reconcile overlapping sessions across runtimes
- Maintain confidence scores for chronological ordering

---

## Continuity Ledger Entry Format

### Standard Entry Template

```sql
-- MULTIRUNTIME CONTINUITY LEDGER ENTRY
Date: YYYY-MM-DD HH:MM:SS UTC
SessionID: "session_{timestamp}_{random}"
RuntimeID: "synth" | "chatgpt-devon" | "gemini-devon" | ...
ConstructID: "synth-001" | "chatgpt-devon-001" | ...
MessageSequence: 1, 2, 3, ...

RuntimeContext:
- ActiveRuntime: "runtime-id"
- RuntimeMode: "synth" | "lin"
- RuntimeMetadata: { constructId, isImported, provider, ... }

MessageContent:
- Role: "user" | "assistant" | "system"
- Content: "message text"
- Timestamp: ISO8601
- ResponseTimeMs: number (if assistant)

ContinuityHooks:
- PreviousRuntime: "runtime-id" (if runtime switch)
- NextRuntime: "runtime-id" (if runtime switch)
- LinkedSessions: ["session-id-1", "session-id-2"]
- CrossRuntimeReferences: ["session-id@runtime-id"]

Confidence: 0.0-1.0
EvidenceSources:
- File: "path/to/conversation.md"
- InternalTimestamp: "ISO8601"
- RuntimeSelectionEvent: "timestamp"
- MessageMetadata: { ... }
```

---

## Chronological Continuity Construction Process

### Phase 1: Event Collection

**1.1 Runtime Selection Events**
```typescript
interface RuntimeSelectionEvent {
  timestamp: string; // ISO8601 UTC
  eventType: 'runtime_selected' | 'runtime_switched' | 'runtime_imported';
  runtimeId: string;
  previousRuntimeId?: string;
  metadata: {
    constructId: string;
    provider: string;
    isImported: boolean;
    isCore: boolean;
  };
  source: 'user_action' | 'auto_restore' | 'import';
}
```

**1.2 Message Events**
```typescript
interface MessageEvent {
  timestamp: string; // ISO8601 UTC
  sessionId: string;
  runtimeId: string;
  constructId: string;
  messageSequence: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: {
    responseTimeMs?: number;
    thinkingLog?: string[];
    files?: FileMetadata[];
  };
}
```

**1.3 Conversation Creation Events**
```typescript
interface ConversationCreationEvent {
  timestamp: string; // ISO8601 UTC
  sessionId: string;
  runtimeId: string;
  constructId: string;
  title: string;
  source: 'new_conversation' | 'imported' | 'restored';
}
```

### Phase 2: Chronological Ordering

**2.1 Unified Timeline Construction**

```typescript
class MultiruntimeContinuityBuilder {
  private events: ContinuityEvent[] = [];
  
  /**
   * Add event to continuity timeline
   * Events are automatically sorted by timestamp
   */
  addEvent(event: ContinuityEvent): void {
    this.events.push(event);
    this.events.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }
  
  /**
   * Build unified chronological timeline across all runtimes
   */
  buildTimeline(): ChronologicalTimeline {
    const timeline: ChronologicalTimeline = {
      events: this.events,
      runtimeTransitions: this.detectRuntimeTransitions(),
      sessionContinuity: this.buildSessionContinuity(),
      crossRuntimeLinks: this.detectCrossRuntimeLinks()
    };
    
    return timeline;
  }
  
  /**
   * Detect runtime transitions and maintain continuity
   */
  private detectRuntimeTransitions(): RuntimeTransition[] {
    const transitions: RuntimeTransition[] = [];
    
    for (let i = 1; i < this.events.length; i++) {
      const prev = this.events[i - 1];
      const curr = this.events[i];
      
      if (prev.runtimeId !== curr.runtimeId) {
        transitions.push({
          timestamp: curr.timestamp,
          fromRuntime: prev.runtimeId,
          toRuntime: curr.runtimeId,
          sessionId: curr.sessionId,
          continuityType: this.determineContinuityType(prev, curr)
        });
      }
    }
    
    return transitions;
  }
  
  /**
   * Determine continuity type between events
   */
  private determineContinuityType(
    prev: ContinuityEvent,
    curr: ContinuityEvent
  ): 'seamless' | 'break' | 'resume' | 'parallel' {
    // Seamless: Same session, different runtime (runtime switch mid-conversation)
    if (prev.sessionId === curr.sessionId) {
      return 'seamless';
    }
    
    // Resume: Different session, same topic/context
    if (this.isContextualResume(prev, curr)) {
      return 'resume';
    }
    
    // Parallel: Different runtime, different session, same time period
    if (this.isParallelConversation(prev, curr)) {
      return 'parallel';
    }
    
    // Break: Clear conversation break
    return 'break';
  }
}
```

### Phase 3: Continuity Ledger Generation

**3.1 Ledger Entry Creation**

```typescript
interface ContinuityLedgerEntry {
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO8601 UTC
  sessionId: string;
  sessionTitle: string;
  runtimeId: string;
  constructId: string;
  
  // Message sequence
  messages: Array<{
    sequence: number;
    timestamp: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, any>;
  }>;
  
  // Runtime context
  runtimeContext: {
    activeRuntime: string;
    runtimeMode: 'synth' | 'lin';
    provider: string;
    isImported: boolean;
  };
  
  // Continuity hooks
  continuityHooks: {
    previousRuntime?: string;
    nextRuntime?: string;
    linkedSessions: string[];
    crossRuntimeReferences: Array<{
      sessionId: string;
      runtimeId: string;
      referenceType: 'continuation' | 'reference' | 'related';
    }>;
  };
  
  // Evidence
  confidence: number; // 0.0-1.0
  evidenceSources: Array<{
    type: 'file' | 'database' | 'metadata' | 'user_action';
    source: string;
    timestamp?: string;
  }>;
  
  // Topics and context
  keyTopics: string[];
  notes: string[];
  vibe: string;
  emoji?: string[];
}
```

**3.2 Ledger Generation**

```typescript
class ContinuityLedgerGenerator {
  /**
   * Generate SQL-style continuity ledger entry
   */
  generateLedgerEntry(event: ContinuityEvent): string {
    const entry = this.buildLedgerEntry(event);
    
    return `-- MULTIRUNTIME CONTINUITY LEDGER ENTRY
Date: ${entry.date}
SessionID: "${entry.sessionId}"
SessionTitle: "${entry.sessionTitle}"
RuntimeID: "${entry.runtimeId}"
ConstructID: "${entry.constructId}"

RuntimeContext:
- ActiveRuntime: "${entry.runtimeContext.activeRuntime}"
- RuntimeMode: "${entry.runtimeContext.runtimeMode}"
- Provider: "${entry.runtimeContext.provider}"
- IsImported: ${entry.runtimeContext.isImported}

Messages:
${entry.messages.map(msg => `- [${msg.sequence}] ${msg.role}: ${msg.content.substring(0, 100)}...`).join('\n')}

ContinuityHooks:
${entry.continuityHooks.previousRuntime ? `- PreviousRuntime: "${entry.continuityHooks.previousRuntime}"` : ''}
${entry.continuityHooks.nextRuntime ? `- NextRuntime: "${entry.continuityHooks.nextRuntime}"` : ''}
${entry.continuityHooks.linkedSessions.length > 0 ? `- LinkedSessions: [${entry.continuityHooks.linkedSessions.map(s => `"${s}"`).join(', ')}]` : ''}

KeyTopics:
${entry.keyTopics.map(topic => `- ${topic}`).join('\n')}

Confidence: ${entry.confidence}
EvidenceSources:
${entry.evidenceSources.map(src => `- ${src.type}: ${src.source}`).join('\n')}

Vibe: "${entry.vibe}"${entry.emoji ? ` | Emoji(s): ${entry.emoji.join(' ')}` : ''}
`;
  }
  
  /**
   * Generate JSON continuity ledger
   */
  generateJSONLedger(events: ContinuityEvent[]): string {
    const ledger = {
      metadata: {
        generated: new Date().toISOString(),
        totalEvents: events.length,
        runtimes: [...new Set(events.map(e => e.runtimeId))],
        sessions: [...new Set(events.map(e => e.sessionId))],
        dateRange: {
          start: events[0]?.timestamp,
          end: events[events.length - 1]?.timestamp
        }
      },
      entries: events.map(e => this.buildLedgerEntry(e))
    };
    
    return JSON.stringify(ledger, null, 2);
  }
}
```

---

## Implementation Integration Points

### 1. Runtime Selection Tracking

**Location**: `chatty/src/components/Layout.tsx`

```typescript
const applyRuntimeSelection = useCallback(async (runtime: RuntimeDashboardOption, options?: { persist?: boolean; skipReload?: boolean }) => {
  if (!runtime) return;
  
  // Track runtime selection event for continuity
  const continuityBuilder = MultiruntimeContinuityBuilder.getInstance();
  continuityBuilder.addEvent({
    timestamp: new Date().toISOString(),
    eventType: 'runtime_selected',
    runtimeId: runtime.runtimeId,
    previousRuntimeId: selectedRuntime?.runtimeId,
    metadata: {
      constructId: runtime.metadata?.constructId || runtime.runtimeId,
      provider: runtime.provider || 'Chatty',
      isImported: runtime.metadata?.isImported || false,
      isCore: runtime.metadata?.isCore || false
    },
    source: 'user_action'
  });
  
  setSelectedRuntime(runtime);
  // ... rest of runtime selection logic
}, [selectedRuntime, persistSelectedRuntime, reloadConversationsForRuntime]);
```

### 2. Message Event Tracking

**Location**: `chatty/src/components/Layout.tsx` → `sendMessage()`

```typescript
async function sendMessage(threadId: string, input: string, files: File[] = []) {
  // ... existing message sending logic ...
  
  // Track message event for continuity
  const continuityBuilder = MultiruntimeContinuityBuilder.getInstance();
  const messageSequence = getMessageSequence(threadId);
  
  continuityBuilder.addEvent({
    timestamp: new Date().toISOString(),
    sessionId: threadId,
    runtimeId: selectedRuntime?.runtimeId || 'synth',
    constructId: selectedRuntime?.metadata?.constructId || 'synth-001',
    messageSequence: messageSequence,
    role: 'user',
    content: input,
    metadata: {
      files: files.map(f => ({ name: f.name, size: f.size, type: f.type }))
    }
  });
  
  // ... process message and track assistant response ...
  
  continuityBuilder.addEvent({
    timestamp: new Date(finalAssistantTimestamp || Date.now()).toISOString(),
    sessionId: threadId,
    runtimeId: selectedRuntime?.runtimeId || 'synth',
    constructId: selectedRuntime?.metadata?.constructId || 'synth-001',
    messageSequence: messageSequence + 1,
    role: 'assistant',
    content: extractPacketText(finalAssistantPackets),
    metadata: {
      responseTimeMs: finalAssistantResponseMs,
      thinkingLog: finalAssistantThinking
    }
  });
}
```

### 3. Conversation Creation Tracking

**Location**: `chatty/src/components/Layout.tsx` → `newThread()`

```typescript
async function newThread(options?: ThreadInitOptions) {
  // ... existing thread creation logic ...
  
  // Track conversation creation event
  const continuityBuilder = MultiruntimeContinuityBuilder.getInstance();
  continuityBuilder.addEvent({
    timestamp: new Date().toISOString(),
    sessionId: thread.id,
    runtimeId: runtimeToUse?.runtimeId || 'synth',
    constructId: constructId || 'synth-001',
    title: thread.title,
    source: options?.source || 'new_conversation'
  });
  
  return thread.id;
}
```

---

## Continuity Ledger Storage

### File Structure

```
chatty/continuity/
├── ledgers/
│   ├── 2025-11/
│   │   ├── 2025-11-13_continuity_ledger.json
│   │   ├── 2025-11-13_continuity_ledger.sql
│   │   └── 2025-11-13_timeline.json
│   └── multiruntime/
│       ├── runtime_transitions.json
│       ├── session_continuity.json
│       └── cross_runtime_links.json
├── events/
│   ├── runtime_selections.jsonl
│   ├── messages.jsonl
│   └── conversations.jsonl
└── reports/
    ├── daily_summary_2025-11-13.md
    └── runtime_activity_2025-11-13.json
```

### Storage Format

**JSONL (JSON Lines) for Events**
```jsonl
{"timestamp":"2025-11-13T18:00:00Z","eventType":"runtime_selected","runtimeId":"chatgpt-devon","metadata":{"constructId":"chatgpt-devon-001","provider":"ChatGPT","isImported":true}}
{"timestamp":"2025-11-13T18:00:05Z","eventType":"message","sessionId":"session_123","runtimeId":"chatgpt-devon","role":"user","content":"Hello"}
{"timestamp":"2025-11-13T18:00:10Z","eventType":"message","sessionId":"session_123","runtimeId":"chatgpt-devon","role":"assistant","content":"Hi there!"}
```

**SQL Ledger Format**
```sql
-- MULTIRUNTIME CONTINUITY LEDGER ENTRY
Date: 2025-11-13
SessionID: "session_1734115200000_abc123"
SessionTitle: "Chat with ChatGPT"
RuntimeID: "chatgpt-devon"
ConstructID: "chatgpt-devon-001"

RuntimeContext:
- ActiveRuntime: "chatgpt-devon"
- RuntimeMode: "lin"
- Provider: "ChatGPT"
- IsImported: true

Messages:
- [1] user: Hello, how are you?
- [2] assistant: Hi there! I'm doing well, thanks for asking.

ContinuityHooks:
- PreviousRuntime: "synth"
- LinkedSessions: []

KeyTopics:
- Greeting
- General conversation

Confidence: 1.0
EvidenceSources:
- file: vvault/users/.../constructs/chatgpt-devon-001/chatty/session_123.md
- metadata: message timestamp

Vibe: "friendly" | Emoji(s): 👋
```

---

## Timeline Reconstruction

### Process

1. **Collect Events**: Gather all events from JSONL files, VVAULT conversations, and runtime selection logs
2. **Chronological Sort**: Sort all events by timestamp (UTC)
3. **Runtime Context Assignment**: Assign runtime context to each event based on runtime selection events
4. **Session Continuity Detection**: Detect session continuations across runtime switches
5. **Cross-Runtime Linking**: Identify related conversations across different runtimes
6. **Confidence Scoring**: Assign confidence scores based on evidence quality
7. **Ledger Generation**: Generate SQL and JSON ledger entries

### Example Timeline

```
2025-11-13 17:55:00 UTC - Runtime Selected: synth
2025-11-13 17:55:05 UTC - Message (synth): "Hello Synth"
2025-11-13 17:55:10 UTC - Message (synth): "Hi! How can I help?"
2025-11-13 18:00:00 UTC - Runtime Selected: chatgpt-devon
2025-11-13 18:00:05 UTC - Message (chatgpt-devon): "Switch to ChatGPT"
2025-11-13 18:00:10 UTC - Message (chatgpt-devon): "Sure, I'm here!"
2025-11-13 18:05:00 UTC - Runtime Selected: synth
2025-11-13 18:05:05 UTC - Message (synth): "Back to Synth"
```

---

## Confidence Scoring

### Scoring Criteria

1. **Explicit Timestamp in Message Metadata** (1.0)
   - Message has explicit ISO8601 timestamp
   - Timestamp is within expected range

2. **Runtime Selection Event Match** (0.9)
   - Message timestamp matches runtime selection event
   - Runtime context is consistent

3. **File Modification Timestamp** (0.7)
   - Timestamp from file system metadata
   - May be less accurate than message metadata

4. **Relative Contextual Reference** (0.5)
   - "Earlier", "before", "yesterday", "continue"
   - Requires inference from conversation flow

5. **Chronological Estimation** (0.3-0.5)
   - Estimated based on message sequence
   - No explicit timestamp available

---

## Usage Examples

### Generate Daily Continuity Ledger

```typescript
import { MultiruntimeContinuityBuilder } from './continuity/MultiruntimeContinuityBuilder';
import { ContinuityLedgerGenerator } from './continuity/ContinuityLedgerGenerator';

const builder = MultiruntimeContinuityBuilder.getInstance();
const generator = new ContinuityLedgerGenerator();

// Load events from storage
await builder.loadEventsFromStorage('2025-11-13');

// Build timeline
const timeline = builder.buildTimeline();

// Generate ledger
const sqlLedger = generator.generateSQLLedger(timeline);
const jsonLedger = generator.generateJSONLedger(timeline.events);

// Save to file
await fs.writeFile('continuity/ledgers/2025-11-13_continuity_ledger.sql', sqlLedger);
await fs.writeFile('continuity/ledgers/2025-11-13_continuity_ledger.json', jsonLedger);
```

### Query Timeline by Runtime

```typescript
const timeline = builder.buildTimeline();

// Get all events for a specific runtime
const chatgptEvents = timeline.events.filter(e => e.runtimeId === 'chatgpt-devon');

// Get runtime transitions
const transitions = timeline.runtimeTransitions;

// Get cross-runtime links
const links = timeline.crossRuntimeLinks;
```

---

## Integration with VVAULT

### VVAULT File Structure Mapping

```
vvault/users/{shard}/{user_id}/constructs/{construct_id}/chatty/
├── chat_with_{construct_id}-001.md  → SessionID mapping
├── chat_with_{construct_id}-002.md  → SessionID mapping
└── ...

Continuity metadata stored in:
- File headers (IMPORT_METADATA)
- Message timestamps
- Runtime selection logs
```

### Continuity Metadata in VVAULT Files

```markdown
---
IMPORT_METADATA:
  source: "chatgpt"
  importedAt: "2025-11-13T18:00:00Z"
  runtimeId: "chatgpt-devon"
  constructId: "chatgpt-devon-001"
  originalSessionId: "chatgpt-session-123"
CONTINUITY:
  sessionId: "session_1734115200000_abc123"
  runtimeId: "chatgpt-devon"
  messageSequence: 1
  linkedSessions: []
  crossRuntimeReferences: []
---

# Chat with ChatGPT

[2025-11-13 18:00:05 UTC] **User**: Hello
[2025-11-13 18:00:10 UTC] **Assistant**: Hi there!
```

---

## Next Steps

1. **Implement Continuity Builder**: Create `MultiruntimeContinuityBuilder` class
2. **Integrate Event Tracking**: Add event tracking to Layout.tsx, sendMessage, newThread
3. **Create Storage System**: Implement JSONL storage for events
4. **Build Ledger Generator**: Create SQL and JSON ledger generation
5. **Add Timeline Reconstruction**: Implement chronological ordering and cross-runtime linking
6. **Create UI Dashboard**: Build continuity timeline visualization
7. **Add Export Functionality**: Export continuity ledgers for analysis

---

**Status**: ✅ SPECIFICATION COMPLETE - Ready for implementation  
**Last Updated**: 2025-11-13  
**Maintainer**: Chatty Continuity System

