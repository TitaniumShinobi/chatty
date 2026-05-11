# Modular Runtime Definition
**Date:** 2026-01-04  
**Purpose:** Define the architecture and structure of modular runtimes in Chatty

---

## Core Concept

**A Modular Runtime is a composable, swappable workspace instance that provides:**
- Complete LLM environment (conversations, GPTs, settings, context, history)
- Isolated workspace identity
- Pluggable components (orchestration, persona, memory, context)
- Hot-swappable activation/deactivation
- Cross-runtime compatibility

---

## Runtime vs Construct Distinction

### Runtime (Hosting Environment)
A **runtime** is the infrastructure layer that hosts constructs:

- **Synth Runtime** (`synth`): Primary hosting environment
- **Lin Runtime** (`lin`): Logical foundation/orchestration layer
- **Chatty Runtime** (`chatty`): System shell/container
- **Imported Runtimes** (e.g., `chatgpt-devon-001`): Imported workspace instances

**Characteristics:**
- Provides infrastructure (memory, context, orchestration)
- Can host multiple constructs
- Has workspace-level identity
- Manages runtime-level state

### Construct (Hosted Entity)
A **construct** is a discrete personality/agent entity hosted by a runtime:

- **Synth-001**: Primary construct (hosted by Synth runtime)
- **Lin-001**: Orchestration construct (hosted by Lin runtime)
- **Nova, Monday, Aurora, Katana**: Named constructs
- **Custom GPTs**: User-defined constructs

**Characteristics:**
- Has distinct personality/identity
- Owns conversation threads
- Can be hosted by different runtimes
- Maintains construct-level state

**Critical Rule:** `Runtime ≠ Construct`
- A construct is **hosted by** a runtime, but is **not** the runtime
- Synth construct ≠ Synth runtime
- Identity boundaries must be maintained

---

## Modular Runtime Architecture

### 1. Runtime Module Interface

Every modular runtime must implement:

```typescript
interface ModularRuntime {
  // Identity
  id: string;                    // Unique runtime identifier
  name: string;                  // Display name (e.g., "ChatGPT", "Synth")
  type: RuntimeType;             // 'primary' | 'imported' | 'custom'
  
  // Workspace Components
  conversations: ConversationManager;  // Thread/conversation management
  gpts: GPTRegistry;                  // Custom GPT registry
  settings: RuntimeSettings;         // Runtime-specific settings
  context: RuntimeContext;            // Context management
  history: HistoryManager;             // Conversation history
  
  // Lifecycle
  activate(): Promise<void>;          // Activate runtime (load workspace)
  deactivate(): Promise<void>;        // Deactivate runtime (save state)
  isActive(): boolean;                // Check if runtime is active
  
  // State Management
  getState(): RuntimeState;           // Get current runtime state
  setState(state: RuntimeState): void; // Restore runtime state
  
  // Cross-Runtime
  exportWorkspace(): Promise<WorkspaceExport>;  // Export for import
  importWorkspace(data: WorkspaceImport): Promise<void>; // Import workspace
}
```

### 2. Runtime Components (Modules)

A modular runtime is composed of pluggable modules:

#### A. Conversation Module
```typescript
interface ConversationModule {
  loadConversations(): Promise<Thread[]>;
  createConversation(title: string, constructId?: string): Promise<Thread>;
  getConversation(threadId: string): Promise<Thread | null>;
  updateConversation(threadId: string, updates: Partial<Thread>): Promise<void>;
  deleteConversation(threadId: string): Promise<void>;
}
```

**Responsibilities:**
- Thread management
- Conversation persistence
- Thread-to-construct mapping
- Conversation metadata

#### B. GPT Registry Module
```typescript
interface GPTRegistryModule {
  registerGPT(config: GPTConfig): Promise<string>;
  getGPT(gptId: string): Promise<GPTConfig | null>;
  getAllGPTs(): Promise<GPTConfig[]>;
  updateGPT(gptId: string, updates: Partial<GPTConfig>): Promise<void>;
  deleteGPT(gptId: string): Promise<void>;
}
```

**Responsibilities:**
- Custom GPT storage
- GPT configuration management
- Cross-runtime GPT access
- GPT-to-construct mapping

#### C. Context Module
```typescript
interface ContextModule {
  buildWorkspaceContext(userId: string, threadId: string, threads: Thread[]): Promise<WorkspaceContext>;
  getRuntimeContext(threadId: string): Promise<RuntimeContext | null>;
  assignRuntime(threadId: string, assignment: RuntimeAssignment): Promise<void>;
  migrateRuntime(threadId: string, newAssignment: RuntimeAssignment): Promise<void>;
}
```

**Responsibilities:**
- Runtime context building
- Context propagation
- Runtime assignment tracking
- Context migration

#### D. Memory Module
```typescript
interface MemoryModule {
  persistMessage(userId: string, constructId: string, message: string, role: 'user' | 'assistant'): Promise<void>;
  retrieveHistory(userId: string, constructId: string, limit: number): Promise<Message[]>;
  storeMemory(constructId: string, memory: Memory): Promise<void>;
  retrieveMemories(constructId: string, query: string, limit: number): Promise<Memory[]>;
}
```

**Responsibilities:**
- Message persistence
- History retrieval
- Long-term memory storage
- Memory retrieval/search

#### E. Orchestration Module
```typescript
interface OrchestrationModule {
  determineOptimalRuntime(context: RuntimeDetectionContext): Promise<RuntimeAssignment>;
  assignRuntimeToThread(threadId: string, assignment: RuntimeAssignment, userId: string): Promise<void>;
  getActiveRuntime(threadId: string): RuntimeAssignment | null;
  migrateRuntimeAssignment(threadId: string, newAssignment: RuntimeAssignment, reason: string): Promise<void>;
}
```

**Responsibilities:**
- Automatic runtime selection
- Runtime assignment management
- Runtime migration
- Optimal runtime detection

---

## Runtime Types

### 1. Primary Runtime (Synth)
- **ID:** `synth`
- **Type:** `primary`
- **Purpose:** Default Chatty workspace
- **Characteristics:**
  - Always available
  - Cannot be deleted
  - Hosts primary constructs (Synth-001, etc.)
  - Provides base infrastructure

### 2. Imported Runtime
- **ID:** `{provider}-{user}-{id}` (e.g., `chatgpt-devon-001`)
- **Type:** `imported`
- **Purpose:** Imported workspace from external provider
- **Characteristics:**
  - Created via import process
  - Contains imported conversations
  - Can be deleted
  - Maintains original provider identity
  - Transforms workspace when activated

### 3. Custom Runtime
- **ID:** User-defined
- **Type:** `custom`
- **Purpose:** User-created workspace variant
- **Characteristics:**
  - User-defined configuration
  - Custom construct assignments
  - Isolated workspace
  - Can be shared/exported

---

## Runtime Activation Flow

### 1. Activation Request
```typescript
async function activateRuntime(runtimeId: string): Promise<void> {
  // 1. Deactivate current runtime (if any)
  if (currentRuntime) {
    await currentRuntime.deactivate();
  }
  
  // 2. Load runtime module
  const runtime = await loadRuntimeModule(runtimeId);
  
  // 3. Activate runtime
  await runtime.activate();
  
  // 4. Transform UI
  await transformWorkspaceUI(runtime);
  
  // 5. Hydrate conversations
  await hydrateConversations(runtime);
  
  // 6. Set as active
  currentRuntime = runtime;
}
```

### 2. Workspace Transformation
When a runtime is activated, the entire Chatty workspace transforms:

- **Address Book:** Pinned name changes to runtime name
- **Sidebar:** Shows runtime's conversations
- **Settings:** Runtime-specific settings active
- **Context:** Runtime context loaded
- **History:** Runtime history accessible

### 3. Conversation Hydration
```typescript
async function hydrateConversations(runtime: ModularRuntime): Promise<void> {
  // 1. Load conversations from VVAULT
  const conversations = await runtime.conversations.loadConversations();
  
  // 2. Parse transcript files
  const threads = await parseTranscriptFiles(conversations);
  
  // 3. Update sidebar
  updateSidebar(threads);
  
  // 4. Set up file watching
  watchVVAULTFiles(runtime.id, (newConversations) => {
    updateSidebar(newConversations);
  });
}
```

---

## Runtime Module Composition

### Example: Synth Runtime Module

```typescript
class SynthRuntime implements ModularRuntime {
  id = 'synth';
  name = 'Synth';
  type = 'primary' as const;
  
  // Compose modules
  conversations = new VVAULTConversationManager({
    vvaultRoot: '/vvault/users/.../instances/synth-001/chatty'
  });
  
  gpts = new GPTRegistry({
    storage: 'local',
    crossRuntime: true
  });
  
  settings = new RuntimeSettings({
    theme: 'system',
    notifications: true
  });
  
  context = new RuntimeContextManager();
  
  history = new HistoryManager({
    persistence: 'vvault',
    retention: 'unlimited'
  });
  
  async activate(): Promise<void> {
    // Load workspace state
    await this.conversations.loadConversations();
    await this.gpts.loadGPTs();
    await this.settings.load();
    
    // Initialize context
    await this.context.initialize();
    
    // Set up file watching
    this.watchFiles();
  }
  
  async deactivate(): Promise<void> {
    // Save state
    await this.settings.save();
    await this.context.persist();
    
    // Stop file watching
    this.stopWatching();
  }
}
```

### Example: Imported ChatGPT Runtime Module

```typescript
class ChatGPTRuntime implements ModularRuntime {
  id = 'chatgpt-devon-001';
  name = 'ChatGPT';
  type = 'imported' as const;
  
  // Compose modules with imported data
  conversations = new VVAULTConversationManager({
    vvaultRoot: '/vvault/users/.../instances/chatgpt-devon-001/chatty',
    importMetadata: this.importMetadata
  });
  
  gpts = new GPTRegistry({
    storage: 'vvault',
    importSource: 'chatgpt',
    crossRuntime: true  // GPTs can be used in other runtimes
  });
  
  settings = new RuntimeSettings({
    theme: 'light',  // Imported preference
    provider: 'chatgpt'
  });
  
  context = new RuntimeContextManager({
    defaultConstructId: 'chatgpt-devon-001'
  });
  
  history = new HistoryManager({
    persistence: 'vvault',
    importSource: 'chatgpt-export'
  });
  
  async activate(): Promise<void> {
    // Load imported conversations
    await this.conversations.loadConversations();
    
    // Load detected custom GPTs
    await this.gpts.loadFromImportMetadata();
    
    // Transform UI to ChatGPT workspace
    await this.transformUI();
  }
}
```

---

## Cross-Runtime Compatibility

### 1. GPT Portability
Custom GPTs can be used across runtimes:

```typescript
// GPT from ChatGPT runtime
const katanaGPT = await chatgptRuntime.gpts.getGPT('katana-001');

// Use in Synth runtime
await synthRuntime.gpts.registerGPT(katanaGPT);
await synthRuntime.conversations.createConversation('Chat with Katana', 'katana-001');
```

### 2. Context Migration
Runtime context can migrate between runtimes:

```typescript
// User starts conversation in Synth
const thread = await synthRuntime.conversations.createConversation('Code help');

// Conversation evolves, needs ChatGPT capabilities
const newAssignment = await orchestrator.determineOptimalRuntime({
  conversationContent: thread.messages,
  userMessage: 'Need ChatGPT-style response'
});

// Migrate to ChatGPT runtime
await chatgptRuntime.context.migrateRuntime(thread.id, newAssignment);
```

### 3. Workspace Export/Import
Runtimes can be exported and imported:

```typescript
// Export Synth runtime
const export = await synthRuntime.exportWorkspace();
// { conversations, gpts, settings, metadata }

// Import as new runtime
const importedRuntime = await importRuntime('synth-export-001', export);
await importedRuntime.activate();
```

---

## Runtime Module Interface Contract

### Required Methods

Every runtime module must implement:

1. **Identity Methods**
   - `getId(): string`
   - `getName(): string`
   - `getType(): RuntimeType`

2. **Lifecycle Methods**
   - `activate(): Promise<void>`
   - `deactivate(): Promise<void>`
   - `isActive(): boolean`

3. **State Methods**
   - `getState(): RuntimeState`
   - `setState(state: RuntimeState): void`
   - `save(): Promise<void>`
   - `load(): Promise<void>`

4. **Component Access**
   - `getConversations(): ConversationModule`
   - `getGPTs(): GPTRegistryModule`
   - `getContext(): ContextModule`
   - `getMemory(): MemoryModule`
   - `getOrchestration(): OrchestrationModule`

### Optional Methods

Advanced runtimes may implement:

- `exportWorkspace(): Promise<WorkspaceExport>`
- `importWorkspace(data: WorkspaceImport): Promise<void>`
- `validate(): Promise<ValidationResult>`
- `migrate(targetVersion: string): Promise<void>`

---

## Runtime Module Registry

### Registry Interface

```typescript
interface RuntimeModuleRegistry {
  register(runtime: ModularRuntime): void;
  get(runtimeId: string): ModularRuntime | null;
  getAll(): ModularRuntime[];
  unregister(runtimeId: string): void;
  getActive(): ModularRuntime | null;
  setActive(runtimeId: string): Promise<void>;
}
```

### Registry Implementation

```typescript
class RuntimeRegistry implements RuntimeModuleRegistry {
  private runtimes = new Map<string, ModularRuntime>();
  private activeRuntimeId: string | null = null;
  
  register(runtime: ModularRuntime): void {
    this.runtimes.set(runtime.id, runtime);
  }
  
  async setActive(runtimeId: string): Promise<void> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) throw new Error(`Runtime ${runtimeId} not found`);
    
    // Deactivate current
    if (this.activeRuntimeId) {
      const current = this.runtimes.get(this.activeRuntimeId);
      if (current) await current.deactivate();
    }
    
    // Activate new
    await runtime.activate();
    this.activeRuntimeId = runtimeId;
  }
  
  getActive(): ModularRuntime | null {
    if (!this.activeRuntimeId) return null;
    return this.runtimes.get(this.activeRuntimeId) || null;
  }
}
```

---

## Benefits of Modular Runtime Architecture

### 1. **Composability**
- Runtimes are built from pluggable modules
- Modules can be swapped/replaced independently
- New runtime types can be created by composing modules

### 2. **Isolation**
- Each runtime has isolated workspace
- Failures in one runtime don't affect others
- State is cleanly separated

### 3. **Hot-Swapping**
- Runtimes can be activated/deactivated without restart
- Workspace transformation is seamless
- No data loss during switching

### 4. **Extensibility**
- New runtime types can be added
- Custom modules can be plugged in
- Runtime behavior can be customized

### 5. **Portability**
- Runtimes can be exported/imported
- GPTs can move between runtimes
- Context can migrate between runtimes

---

## Implementation Status

### ✅ Completed
- Runtime/Construct separation defined
- Automatic runtime orchestration
- Runtime context management
- VVAULT file structure for runtime isolation

### 🔄 In Progress
- Runtime module interface implementation
- Runtime registry system
- Workspace transformation UI
- Cross-runtime GPT portability

### 📋 TODO
- Complete modular runtime interface
- Runtime module registry
- Hot-swap runtime activation
- Runtime export/import system
- Runtime validation/migration

---

## Next Steps

1. **Define Runtime Module Interface** - TypeScript interfaces for all modules
2. **Implement Runtime Registry** - Central registry for all runtimes
3. **Refactor Existing Runtimes** - Convert to modular architecture
4. **Add Runtime Factory** - Factory pattern for creating runtime instances
5. **Implement Hot-Swap** - Seamless runtime switching
6. **Add Runtime Validation** - Ensure runtime compatibility

---

## Key Principles

1. **Modularity:** Runtimes are composed of independent, swappable modules
2. **Isolation:** Each runtime has isolated workspace and state
3. **Composability:** Modules can be combined to create new runtime types
4. **Portability:** Components can move between runtimes
5. **Extensibility:** New runtime types can be added without core changes

---

**Status:** Definition phase - Architecture defined, implementation pending.
