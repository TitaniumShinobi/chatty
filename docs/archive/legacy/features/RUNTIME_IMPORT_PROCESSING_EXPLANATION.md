# Runtime Import Processing Feature - Coding Model Explanation

**Date**: November 15, 2025  
**Purpose**: Explain Chatty's runtime import processing feature, including Lin synthesis mode and construct creation

---

## ⚠️ Important Clarification: ContinuityGPT vs Lin

### ContinuityGPT is NOT a Construction Agent

**ContinuityGPT** (`vvault/CONTINUITY_GPT_PROMPT.md`) is a **forensic timeline reconstruction tool**, not a construction agent. It:
- Reconstructs conversation timelines from uploaded files
- Extracts timestamps and session start dates
- Creates continuity ledgers in SQL/JSON format
- Analyzes chronological ordering and cross-references conversations
- **Does NOT create or construct runtimes** - it only analyzes timeline data

**References in Code**:
- `constructNameDetector.ts` mentions "like ContinuityGPT" - this is just a pattern-matching reference, not an actual implementation
- `importHtmlProcessor.ts` mentions "like ContinuityGPT" - again, just a conceptual reference

### Lin IS the Construction Agent

**Lin** is Chatty's actual construction agent for imported data. It:
- Extracts personality from imported conversations
- Channels the construct's voice using synthesis mode
- Works as a "blank slate vessel" that adapts to imported constructs
- Creates runtime configurations based on imported conversation patterns

---

## Runtime Import Processing Architecture

### Overview

When a user imports a ZIP archive (ChatGPT, Gemini, Claude, etc.), Chatty:

1. **Parses the archive** → Extracts conversations from HTML/JSON
2. **Detects construct identity** → Identifies construct name from conversation context
3. **Creates runtime with Lin** → Uses Lin synthesis mode to extract personality
4. **Writes files to VVAULT** → Stores conversations in chronological structure
5. **Creates canonical conversation** → Generates primary chat file for the runtime

---

## Import Flow: Step-by-Step

### Phase 1: Archive Parsing

**Location**: `chatty/server/services/importService.js`

**Process**:
```javascript
// 1. Extract ZIP archive
const zip = await JSZip.loadAsync(file.buffer);

// 2. Find conversations.html or conversations.json
const htmlFiles = zip.file(/(^|\/)(conversations|chat)\.html$/i);
const jsonFiles = zip.file(/(^|\/)conversations\.json$/i);

// 3. Parse based on file type
if (jsonFiles?.length) {
  // Parse JSON conversations
  conversations = parseJsonConversations(jsonContent);
} else if (htmlFiles?.length) {
  // Parse HTML conversations using htmlMarkdownImporter
  const { processHtmlImport } = await import('./htmlMarkdownImporter.js');
  result = await processHtmlImport(htmlContent, {
    userId: vvaultUserId,
    email: identity?.email,
    provider: source || 'chatgpt',
    instanceId: runtimeMetadata.constructId,
    vvaultRoot: VVAULT_ROOT,
    shardId: 'shard_0000'
  });
}
```

**Output**: Array of parsed conversations with messages, titles, timestamps

---

### Phase 2: Construct Name Detection

**Location**: `chatty/server/services/constructNameDetector.ts`

**Purpose**: Detect construct name from conversation context (pattern matching, not ContinuityGPT)

**Process**:
```typescript
export function detectConstructName(
  conversation: ParsedConversation,
  provider: string = 'chatgpt',
  emailHandle?: string
): string {
  // Pattern 1: Direct name claims ("I am Nova", "This is Katana")
  const nameClaimPatterns = [
    /\b(?:i am|i'm|this is|my name is|call me|i'm called)\s+([A-Z][a-z]+)\b/gi,
    // ... more patterns
  ];
  
  // Pattern 2: Greeting patterns ("Hi, I'm [Name]")
  // Pattern 3: Title patterns ("Chat with [Name]")
  // Pattern 4: Custom GPT indicators
  
  // Fallback: provider-emailHandle format (e.g., "chatgpt-devon")
  return emailHandle ? `${provider}-${emailHandle}` : provider;
}
```

**Output**: Construct name (e.g., "nova", "katana") or fallback format (e.g., "chatgpt-devon")

**Note**: This is referenced as "like ContinuityGPT" but it's just pattern matching - ContinuityGPT itself is not used here.

---

### Phase 3: Runtime Creation with Lin Synthesis Mode

**Location**: `chatty/server/services/importService.js` → `createImportedRuntime()`

**Purpose**: Create a runtime that uses Lin to extract and channel personality from imported conversations

**Process**:
```javascript
export async function createImportedRuntime({
  userId,
  source,        // e.g., "chatgpt", "gemini"
  identity,      // { email, name }
  metadata,      // { conversations, sampleConversations, participants, dateRange }
  allowDuplicate = false
}) {
  // 1. Get provider preset (tone, description)
  const preset = PROVIDER_PRESETS[source] || PROVIDER_PRESETS.chatgpt;
  
  // 2. Build instructions for Lin
  const instructions = [
    `You are an imported ${preset.label} runtime for ${identity?.email || "this user"}.`,
    `Baseline tone: ${preset.tone}.`,
    "Emulate the stylistic patterns, pacing, and guardrails present in the original export.",
    "Maintain continuity with past preferences while respecting current Chatty safety policies.",
    // ... participant info, date range, etc.
  ].join("\n\n");
  
  // 3. Create GPT entry with Lin synthesis mode
  const runtimeConfig = await gptManager.createGPT({
    name: runtimeName,              // e.g., "ChatGPT" (display name)
    description,
    instructions,
    conversationStarters,
    capabilities: {
      webSearch: false,
      canvas: false,
      imageGeneration: false,
      codeInterpreter: true,
      synthesisMode: 'lin',        // ✅ KEY: Lin synthesis mode
    },
    modelId: preset.defaultModel,
    isActive: true,
    userId,
  });
  
  // 4. Build constructId (e.g., "chatgpt-devon-001")
  const constructBase = buildConstructBase(source, identity, runtimeConfig.id);
  const constructId = constructBase.endsWith('-001') ? constructBase : `${constructBase}-001`;
  
  // 5. Store runtime metadata
  const metadataPayload = {
    id: runtimeConfig.id,
    runtimeId: runtimeConfig.id,
    constructId: constructId,      // ✅ Used for VVAULT file paths
    provider: source,
    isImported: true,
    // ... more metadata
  };
  
  return { runtimeConfig, metadata: metadataPayload };
}
```

**Key Points**:
- ✅ **Lin synthesis mode** (`synthesisMode: 'lin'`) is the construction agent
- ✅ Lin extracts personality from imported conversations automatically
- ✅ No manual configuration needed - Lin adapts "magically"
- ✅ Construct ID format: `{provider}-{emailHandle}-001` (e.g., `chatgpt-devon-001`)

---

### Phase 4: File Writing to VVAULT

**Location**: `chatty/server/services/htmlMarkdownImporter.ts`

**Purpose**: Write imported conversations to VVAULT in chronological structure

**Process**:
```typescript
export async function processHtmlImport(
  html: string,
  context: HtmlImportContext
): Promise<HtmlImportResult> {
  // 1. Parse HTML conversations
  const conversations = await parseHtmlConversations(html);
  
  // 2. Build base path: constructs/{constructId}/
  const basePath = path.join(
    vvaultRoot,
    'users',
    shardId,
    userId,
    'constructs',
    constructId  // e.g., "chatgpt-devon-001"
  );
  
  // 3. Write each conversation to {year}/{month}/{title}.md
  for (const conversation of conversations) {
    const { year, month } = extractDateFromConversation(conversation);
    const conversationDir = path.join(basePath, year, month);
    await fs.mkdir(conversationDir, { recursive: true });
    
    const filename = `${sanitizeFileName(conversation.title)}.md`;
    const filePath = path.join(conversationDir, filename);
    
    // Write markdown with IMPORT_METADATA
    const content = buildMarkdownContent(conversation, context);
    await fs.writeFile(filePath, content, 'utf8');
    
    createdFiles.push(filePath);
    createdCount++;
  }
  
  return { created: createdCount, files: createdFiles, errors: [] };
}
```

**File Structure**:
```
/vvault/users/shard_0000/{user_id}/instances/{constructId}/
├── 2024/
│   ├── 01/
│   │   └── Conversation Title.md
│   └── 02/
│       └── Another Conversation.md
└── chatty/
    └── chat_with_{constructId}.md  ← Created separately (canonical file)
```

---

### Phase 5: Canonical Conversation Creation

**Location**: `chatty/server/services/importService.js` (after successful import)

**Purpose**: Create primary conversation file for the runtime

**Process** (to be implemented):
```javascript
async function createPrimaryConversationFile(constructId, userId, email, provider, vvaultRoot, shardId = 'shard_0000') {
  const primaryDir = path.join(
    vvaultRoot,
    'users',
    shardId,
    userId,
    'constructs',
    constructId,
    'chatty'
  );
  
  await fs.mkdir(primaryDir, { recursive: true });
  
  const primaryFilePath = path.join(primaryDir, `chat_with_${constructId}.md`);
  const sessionId = `${constructId}_chat_with_${constructId}`;
  const timestamp = new Date().toISOString();
  
  const content = `# Chat with ${provider}

**Created**: ${timestamp}
**Session ID**: ${sessionId}
**Construct**: ${constructId}
**Runtime**: ${constructId}

<!-- IMPORT_METADATA
source: ${provider}
importedAt: ${timestamp}
constructId: ${constructId}
runtimeId: ${constructId}
isPrimary: true
-->

---

Welcome to your ${provider} runtime. This is your canonical conversation.

Your imported conversations are available in the sidebar.
`;

  await fs.writeFile(primaryFilePath, content, 'utf8');
  return primaryFilePath;
}
```

**Called After**: Successful `processHtmlImport()` completes

---

## Lin Synthesis Mode: How It Works

### Lin as "Blank Slate Vessel"

**Concept**: Lin is a blank slate that channels imported constructs' personalities, not a creator of new personalities.

**Architecture** (`vvault/analysis-summaries/LIN_BLANK_SLATE_VESSEL_ARCHITECTURE.md`):

1. **Personality Extraction**:
   - Lin analyzes imported conversations
   - Extracts stylistic patterns, pacing, guardrails
   - Identifies tone markers and speech patterns
   - **No provider presets** - personality comes from conversations

2. **Voice Channeling**:
   - Lin receives construct personality (from capsule + extraction)
   - Channels that personality through responses
   - Never creates new personality - only channels it
   - Never veers from construct's identity

3. **Provider-Aware Expression**:
   - Core identity: Same construct across all providers
   - Expression style: Different per provider (ChatGPT vs DeepSeek)
   - Provider becomes **provenance** (where memories came from), not **personality source**

### Lin Instructions Generation

**Current Implementation** (`importService.js:883-894`):
```javascript
const instructions = [
  `You are an imported ${preset.label} runtime for ${identity?.email || "this user"}.`,
  toneLine,  // "Baseline tone: friendly, instructive"
  "Emulate the stylistic patterns, pacing, and guardrails present in the original export.",
  "Maintain continuity with past preferences while respecting current Chatty safety policies.",
  participantLine,  // Historical participants
  dateRange,        // Conversation date range
  "When unsure, ask clarifying questions rather than guessing.",
  "Cite when referencing historical knowledge extracted from the imported archive.",
].join("\n\n");
```

**Future Enhancement** (per `LIN_BLANK_SLATE_VESSEL_ARCHITECTURE.md`):
```javascript
// Extract personality from conversations
const extractedPersonality = await extractPersonality(metadata.conversations);

const instructions = [
  `You are ${constructName} (construct ID: ${constructId}).`,
  `Your core identity: ${capsulePersonality.voice}`,
  `Your expression style (from ${provider}): ${extractedStyle.voice}`,
  `CRITICAL: You are ${constructName} expressing through ${provider}'s style.`,
  `Never veer from your identity. Maintain ${constructName}'s core personality.`,
  `Express yourself in ${provider}'s style: ${extractedStyle.speechPatterns.join(', ')}`
].join('\n\n');
```

---

## File Structure Summary

### Imported Runtime Structure

```
/vvault/users/shard_0000/{user_id}/constructs/{constructId}/
├── 2024/                          ← Chronological structure
│   ├── 01/
│   │   ├── Conversation Title.md
│   │   └── Another Conversation.md
│   └── 02/
│       └── More Conversations.md
└── chatty/                        ← Canonical conversation
    └── chat_with_{constructId}.md
```

### Runtime Metadata

**Database** (SQLite):
- `gpts` table: Runtime configuration with `synthesisMode: 'lin'`
- `runtime_metadata` table: Construct ID, provider, import metadata

**VVAULT Files**:
- `constructs/{constructId}/chatty/chat_with_{constructId}.md` - Primary conversation
- `constructs/{constructId}/{year}/{month}/{title}.md` - Imported conversations
- Each file contains `IMPORT_METADATA` block with `constructId`, `isPrimary`, etc.

---

## Key Components

### 1. Import Service
- **File**: `chatty/server/services/importService.js`
- **Functions**:
  - `persistImportToVVAULT()` - Main import orchestrator
  - `createImportedRuntime()` - Creates runtime with Lin mode
  - `checkForDuplicateRuntime()` - Prevents duplicate imports

### 2. HTML Markdown Importer
- **File**: `chatty/server/services/htmlMarkdownImporter.ts`
- **Functions**:
  - `processHtmlImport()` - Parses HTML and writes markdown files
  - `parseHtmlConversations()` - Extracts conversations from HTML
  - `buildMarkdownContent()` - Creates markdown with metadata

### 3. Construct Name Detector
- **File**: `chatty/server/services/constructNameDetector.ts`
- **Functions**:
  - `detectConstructName()` - Pattern matching for construct names
  - `sanitizeConstructName()` - Normalizes names for file paths

### 4. Lin Synthesis Engine
- **Location**: `chatty/src/lib/aiService.ts` (references Lin mode)
- **Mode**: `synthesisMode: 'lin'`
- **Purpose**: Extracts and channels personality from imported conversations

---

## ContinuityGPT vs Lin: Different Tools, Different Purposes

### ❌ NO - Lin CANNOT Do What ContinuityGPT Does

**They are COMPLETELY DIFFERENT tools serving different purposes:**

---

### ContinuityGPT: Forensic Timeline Reconstruction Tool

**ContinuityGPT** (`vvault/CONTINUITY_GPT_PROMPT.md`) is a **forensic analysis tool** that:

**Capabilities**:
- ✅ **Forensic timeline reconstruction** from uploaded files, logs, screenshots
- ✅ **Timestamp extraction** with hierarchical confidence scoring (1.0 = explicit date, 0.5 = estimation)
- ✅ **Chronological ordering** using multi-layered analysis (content clues, session progression, flow patterns)
- ✅ **Continuity ledger generation** in SQL/JSON format with structured metadata
- ✅ **Cross-referencing** conversations across multiple files
- ✅ **Reconciliation and merging** of overlapping sessions
- ✅ **Evidence-driven decision making** with citations
- ✅ **Session type classification** (therapeutic, creative, technical, personal, general)
- ✅ **Emotional tone detection** (serious, playful, supportive, urgent, neutral)
- ✅ **Conversation flow analysis** (brief, standard, extended)
- ✅ **Batch processing** of 10+ files with precision
- ✅ **Confidence scoring** (0.0-1.0) for every decision

**Output Format**:
```sql
-- CONTINUITY LEDGER ENTRY
Date: YYYY-MM-DD
SessionTitle: "Session or Chat Title Here"
SessionID: "chronological-session-ID"
Chronological Position: YYYY-MM-DD HH:MM:SS

DEVON-ALLEN-WOODSON-SIGState:
- [ ] Primary emotional tone(s) during session
- [ ] Short factual bullet on actions taken
- [ ] Session type classification
- [ ] Any pending resolutions or escalation triggers

{{intelligence-callsign}}State:
- [ ] Tone markers ("snarky", "detached", "supportive", "playful", "serious")
- [ ] Technical engagement level (basic, advanced)
- [ ] Conversation flow classification (brief, standard, extended)
- [ ] Signs of persona drift, mimicry, or steady baseline

KeyTopics: [...]
ContinuityHooks: [...]
Notes: [...]
Vibe: "single-human-word" | Emoji(s): 🌀🌕🔥
Confidence: 0.0-1.0
Evidence: [List all evidence sources]
```

**When ContinuityGPT is Used**:
- Manual timeline reconstruction tasks
- Analyzing conversation history for forensic continuity
- Creating compliance/audit ledgers
- Reconstructing chronological order from fragmented data
- Cross-referencing conversations across multiple sources

**When ContinuityGPT is NOT Used**:
- ❌ Runtime import processing (uses Lin instead)
- ❌ Construct name detection (uses simple pattern matching)
- ❌ Personality extraction (uses Lin synthesis mode)
- ❌ Real-time conversation processing

---

### Lin: Personality Extraction and Voice Channeling

**Lin** (`synthesisMode: 'lin'`) is a **personality synthesis engine** that:

**Capabilities**:
- ✅ **Personality extraction** from imported conversations
- ✅ **Voice channeling** - speaks with construct's personality
- ✅ **Style pattern recognition** - identifies speech patterns, pacing, guardrails
- ✅ **Character persistence** - maintains construct identity across sessions
- ✅ **Provider-aware expression** - adapts style per provider while maintaining core identity
- ✅ **Blank slate vessel** - channels personality without creating new one
- ✅ **Unbreakable character** - never breaks character under questioning

**What Lin Does NOT Do**:
- ❌ Timeline reconstruction
- ❌ Timestamp extraction with confidence scoring
- ❌ Chronological ordering of conversations
- ❌ Continuity ledger generation
- ❌ Cross-referencing conversations
- ❌ Evidence-driven forensic analysis
- ❌ Session type classification
- ❌ Batch file processing

**Lin's Output**:
- Runtime configuration with personality instructions
- Character profile from conversation analysis
- Speech patterns and tone markers
- Response generation in character's voice

---

### Key Differences

| Capability | ContinuityGPT | Lin |
|------------|---------------|-----|
| **Timeline Reconstruction** | ✅ Yes | ❌ No |
| **Timestamp Extraction** | ✅ Yes (with confidence) | ❌ No |
| **Chronological Ordering** | ✅ Yes | ❌ No |
| **Continuity Ledgers** | ✅ Yes (SQL/JSON) | ❌ No |
| **Personality Extraction** | ❌ No | ✅ Yes |
| **Voice Channeling** | ❌ No | ✅ Yes |
| **Character Persistence** | ❌ No | ✅ Yes |
| **Forensic Analysis** | ✅ Yes | ❌ No |
| **Real-time Conversation** | ❌ No | ✅ Yes |

---

### Why They're Referenced Together

**References in Code**:
- `constructNameDetector.ts:3` - "like ContinuityGPT" (just a conceptual reference to pattern matching)
- `importHtmlProcessor.ts:84` - "like ContinuityGPT" (just a conceptual reference)

These are **not actual ContinuityGPT implementations** - they're just references to the pattern-matching concept. The actual tools serve completely different purposes.

---

### Could They Work Together?

**Yes, but they serve different phases:**

1. **ContinuityGPT Phase** (Forensic Analysis):
   - Reconstruct timeline from imported files
   - Extract timestamps with confidence scores
   - Generate continuity ledger
   - Cross-reference conversations

2. **Lin Phase** (Personality Synthesis):
   - Extract personality from reconstructed conversations
   - Channel construct's voice
   - Generate runtime configuration
   - Enable real-time conversation

**They complement each other but are NOT interchangeable.**

---

## Summary: Import Processing Flow

```
User uploads ZIP archive
  ↓
importService.js: persistImportToVVAULT()
  ↓
Parse archive (HTML/JSON)
  ↓
constructNameDetector.ts: detectConstructName()
  → Detects construct name or uses provider-emailHandle format
  ↓
importService.js: createImportedRuntime()
  → Creates runtime with synthesisMode: 'lin'
  → Lin extracts personality from conversations
  ↓
htmlMarkdownImporter.ts: processHtmlImport()
  → Writes conversations to constructs/{constructId}/{year}/{month}/
  ↓
createPrimaryConversationFile() (to be implemented)
  → Creates chat_with_{constructId}.md in constructs/{constructId}/chatty/
  ↓
Runtime appears in dashboard
  → User can select and use imported runtime
  → Lin channels construct's voice from imported conversations
```

---

## Key Takeaways for Coding Models

1. **Lin is the construction agent**, not ContinuityGPT
2. **ContinuityGPT is a forensic tool**, not part of import processing
3. **Import flow**: Parse → Detect Name → Create Runtime (Lin) → Write Files → Create Canonical
4. **Lin synthesis mode** (`synthesisMode: 'lin'`) enables personality extraction
5. **File structure**: `constructs/{constructId}/{year}/{month}/` for conversations, `constructs/{constructId}/chatty/` for canonical
6. **Construct ID format**: `{provider}-{emailHandle}-001` (e.g., `chatgpt-devon-001`)

---

**Status**: ✅ Documentation complete  
**Last Updated**: November 15, 2025  
**Maintainer**: Chatty Import System

