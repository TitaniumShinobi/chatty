# Runtime Selection Debugging Analysis

## Answers to Perplexity's Questions

### 1. Runtime Selection UI ✅ PARTIALLY WORKING

**Current Implementation:**
- Location: `chatty/src/components/Layout.tsx` (lines 1348-1363)
- When runtime is selected, it correctly dispatches runtime context:
```typescript
navigate('/app', {
  state: {
    selectedRuntime: {
      runtimeId: runtime.runtimeId,
      name: runtime.name,
      provider: runtime.provider,
      metadata: runtime.metadata
    }
  }
})
```

**Issue:** Runtime context is only passed via navigation state, not persisted or accessible globally.

---

### 2. API Request/Backend Logic ❌ NOT WORKING

**Current Implementation:**
- Location: `chatty/src/components/Layout.tsx` → `newThread()` (line 552)
- **Problem:** When creating new conversations, the runtime context is **NOT** passed to the backend:

```typescript
// Line 577 - Always uses 'lin', ignores runtime context
const newConversation = await conversationManager.createConversation(
  userId, 
  initialTitle, 
  undefined, 
  'lin'  // ❌ Hardcoded to 'lin', not using selectedRuntime
);
```

**Backend receives:** Always `constructId: 'lin'` regardless of selected runtime.

**Missing:** No mechanism to pass `selectedRuntime.runtimeId` or `selectedRuntime.metadata.gptId` to `createConversation()`.

---

### 3. Session Initialization ❌ NOT WORKING

**Current Implementation:**
- Location: `chatty/src/lib/vvaultConversationManager.ts` → `createConversation()` (line 127)
- **Problem:** Backend always uses default construct ID:

```typescript
async createConversation(
  userId: string,
  sessionOrTitle: string,
  titleOverride?: string,
  constructId = 'lin'  // ❌ Defaults to 'lin', no runtime context passed
)
```

**Fallback Logic:** Yes, there is a fallback - it always defaults to 'lin' if no constructId is provided.

**Missing:**
- No lookup of runtime by ID
- No fetching of runtime configuration
- No mapping of runtimeId → constructId

---

### 4. Storage/Import Logic ❌ NOT WORKING

**Current Implementation:**
- Location: `chatty/vvaultConnector/writeTranscript.js` → `appendToConstructTranscript()` (line 35)
- **Problem:** VVAULT storage uses constructId from `createConversation()`, which is always 'lin':

```typescript
// File path always uses the constructId passed to createConversation
const constructFolder = `${constructId}-${paddedCallsign}`;
// Result: Always creates 'lin-001', 'lin-002', etc., regardless of runtime
```

**VVAULT Structure Created:**
```
/vvault/users/{shard}/{user_id}/constructs/lin-001/chatty/chat_with_lin-001.md
```

**Should Be (for imported runtime):**
```
/vvault/users/{shard}/{user_id}/constructs/{runtime-construct}-001/chatty/chat_with_{runtime-construct}-001.md
```

**Missing:**
- No mapping from runtimeId → constructId
- No storage of runtime metadata in conversation
- No connection between runtime selection and VVAULT structure

---

### 5. Frontend State Update ⚠️ PARTIALLY WORKING

**Current Implementation:**
- Location: `chatty/src/pages/Home.tsx` (lines 323-331, 554-560)

**Issues:**

1. **`handleInputSend` always uses synthThread:**
```typescript
const handleInputSend = (value: string) => {
  if (synthThread?.id) {
    navigate(`/app/chat/${synthThread.id}`, {  // ❌ Always synth, ignores selectedRuntime
      state: { pendingMessage: value }
    })
  }
}
```

2. **`handleCTAClick` has incomplete runtime handling:**
```typescript
// Lines 521-533 - Attempts to handle runtime but doesn't actually create thread
if (suggestion.runtimeId && selectedRuntime) {
  navigate('/app', {
    state: {
      selectedRuntime: selectedRuntime,
      pendingMessage: suggestion.text,
      createNewThread: true  // ❌ Flag exists but Layout.tsx doesn't check it
    }
  })
  return  // ❌ Doesn't actually create thread with runtime
}
```

3. **Runtime context is stored but not used:**
- `selectedRuntime` state exists in Home.tsx
- But `newThread()` in Layout.tsx doesn't read it
- No global context or state management for selected runtime

---

## Root Cause Analysis

### Primary Issues

1. **No Runtime Context Propagation:**
   - Runtime selected → Stored in Home.tsx local state only
   - Not accessible to `newThread()` function
   - Not passed to `createConversation()` API calls
   - Not stored in conversation metadata

2. **Hardcoded Construct IDs:**
   - `newThread()` always uses `'lin'`
   - No mapping from `runtimeId` → `constructId`
   - No lookup of runtime configuration

3. **Missing Runtime → Construct Mapping:**
   - Imported runtimes have `runtimeId` (GPT ID)
   - But no mechanism to map `runtimeId` → `constructId` for VVAULT storage
   - Need to determine construct ID from runtime metadata

4. **No AIService Runtime Setting:**
   - `AIService.setRuntime()` exists but is never called when runtime is selected
   - Messages always processed with default runtime

---

## Required Fixes

### Fix 1: Pass Runtime Context to Thread Creation

**Location:** `chatty/src/components/Layout.tsx`

**Change `newThread()` to accept runtime context:**
```typescript
async function newThread(options?: ThreadInitOptions & { runtimeId?: string; runtimeMetadata?: any }) {
  // ...
  const constructId = options?.runtimeMetadata?.constructId || 
                      options?.runtimeId || 
                      'lin';  // Use runtime's constructId if available
  
  const newConversation = await conversationManager.createConversation(
    userId, 
    initialTitle, 
    undefined, 
    constructId  // ✅ Use runtime's constructId
  );
}
```

### Fix 2: Read Runtime Context in Layout.tsx

**Location:** `chatty/src/components/Layout.tsx`

**Add useEffect to read runtime from navigation state:**
```typescript
const [selectedRuntime, setSelectedRuntime] = useState<any>(null);

useEffect(() => {
  const runtimeState = (location.state as any)?.selectedRuntime;
  if (runtimeState) {
    setSelectedRuntime(runtimeState);
  }
}, [location.state]);
```

**Update `newThread` to use selectedRuntime:**
```typescript
async function newThread(options?: ThreadInitOptions) {
  // Use selectedRuntime if available
  const runtimeConstructId = selectedRuntime?.metadata?.constructId || 
                              selectedRuntime?.runtimeId || 
                              'lin';
  
  const newConversation = await conversationManager.createConversation(
    userId, 
    initialTitle, 
    undefined, 
    runtimeConstructId
  );
}
```

### Fix 3: Set AIService Runtime

**Location:** `chatty/src/components/Layout.tsx` or `chatty/src/pages/Home.tsx`

**When runtime is selected, set AIService:**
```typescript
useEffect(() => {
  if (selectedRuntime?.runtimeId) {
    const { AIService } = await import('../lib/aiService');
    const aiService = AIService.getInstance();
    
    // Determine mode: 'synth' for core, 'lin' for imported runtimes
    const mode = selectedRuntime.runtimeId === 'synth' ? 'synth' : 'lin';
    aiService.setRuntime(selectedRuntime.runtimeId, mode);
  }
}, [selectedRuntime]);
```

### Fix 4: Fix handleInputSend to Use Runtime

**Location:** `chatty/src/pages/Home.tsx`

**Update to create new thread with runtime:**
```typescript
const handleInputSend = async (value: string) => {
  if (selectedRuntime) {
    // Create new thread with runtime context
    const threadId = await newThread({
      title: `New conversation with ${selectedRuntime.name}`,
      starter: value,
      runtimeId: selectedRuntime.runtimeId,
      runtimeMetadata: selectedRuntime.metadata
    });
    
    if (threadId) {
      navigate(`/app/chat/${threadId}`, {
        state: { pendingMessage: value }
      });
    }
  } else if (synthThread?.id) {
    navigate(`/app/chat/${synthThread.id}`, {
      state: { pendingMessage: value }
    });
  }
}
```

### Fix 5: Map RuntimeId → ConstructId

**Location:** `chatty/src/components/Layout.tsx` or new utility function

**Create mapping function:**
```typescript
function getConstructIdFromRuntime(runtime: RuntimeDashboardOption): string {
  // For imported runtimes, use GPT ID as construct base
  if (runtime.metadata?.isImported && runtime.runtimeId !== 'synth') {
    // Extract construct name from runtime name or use runtimeId
    const constructName = runtime.name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 20) || runtime.runtimeId.substring(0, 20);
    return `${constructName}-001`;
  }
  
  // For Synth, use 'synth'
  if (runtime.runtimeId === 'synth') {
    return 'synth-001';
  }
  
  // Default fallback
  return 'lin-001';
}
```

---

## Network/API Logging Recommendations

To verify fixes, add logging at these points:

1. **Runtime Selection:**
```typescript
console.log('🔵 [Runtime] Selected:', {
  runtimeId: runtime.runtimeId,
  name: runtime.name,
  metadata: runtime.metadata
});
```

2. **Thread Creation:**
```typescript
console.log('🔵 [Thread] Creating with:', {
  userId,
  title: initialTitle,
  constructId: runtimeConstructId,  // ✅ Should show runtime's constructId
  runtimeId: selectedRuntime?.runtimeId
});
```

3. **VVAULT Storage:**
```typescript
console.log('💾 [VVAULT] Storing conversation:', {
  constructId,
  callsign,
  filePath: transcriptFile,
  runtimeId: metadata?.runtimeId
});
```

4. **AIService Processing:**
```typescript
console.log('🤖 [AIService] Processing message:', {
  runtimeId: this.activeRuntimeId,
  constructId: targetConstructId,
  conversationId
});
```

---

## Summary

**Current State:**
- ✅ Runtime selection UI dispatches correctly
- ❌ Runtime context NOT passed to backend
- ❌ Backend always uses default 'lin' constructId
- ❌ VVAULT storage always creates 'lin-001' structure
- ⚠️ Frontend state exists but not used for thread creation

**Required Changes:**
1. Pass runtime context from Home.tsx → Layout.tsx → newThread()
2. Map runtimeId → constructId for VVAULT storage
3. Set AIService runtime when runtime is selected
4. Update handleInputSend to use runtime context
5. Store runtime metadata in conversation records

**Priority:** HIGH - Runtime selection is currently non-functional for imported runtimes.

