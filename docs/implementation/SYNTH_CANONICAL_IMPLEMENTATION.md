# Synth Canonical Entity Implementation

**Last Updated**: January 15, 2025

## Problem Statement

Synth disappears from the Address Book during hydration because it's treated as data-dependent (loaded from VVAULT) rather than system-guaranteed (part of the application's environment).

## Executive Summary

**Problem:** Synth conversation disappears from Address Book during hydration, causing user trust issues and flickering UI.

**Root Cause:** Synth is treated as data-dependent (loaded from VVAULT API) rather than system-guaranteed (part of application environment).

**Solution:** Implement canonical entity pattern where Synth exists immediately upon login, independent of async hydration. Hydration merges but never removes canonical threads.

## Philosophical Shift

**From:** Synth is a conversation thread that must be loaded from storage  
**To:** Synth is a canonical persona entity guaranteed by the system, independent of storage

### Current Architecture (Broken)
```
Login → threads = [] → Hydration starts → Async load → threads = [Synth]
                     ↑ Flicker happens here
```

**Issues:**
1. Synth thread creation is async (depends on VVAULT API)
2. `threads` array starts empty during hydration
3. Address Book filter returns empty during async loading
4. User sees flicker as Synth appears/disappears

### Proposed Architecture (Fixed)
```
Login → threads = [canonicalSynth] → Hydration merges → threads = [canonicalSynth, ...other]
      ↑ Immediate, synchronous           ↑ Preserves canonical
```

**Benefits:**
1. Synth appears immediately (no async dependency)
2. Address Book always has canonical entry
3. No flicker during hydration
4. User trust maintained

---

## Implementation Steps

### Step 1: Add Canonical Flag to Thread Type

```typescript
type Thread = {
  id: string;
  title: string;
  messages: Message[];
  createdAt?: number;
  updatedAt?: number;
  archived?: boolean;
  isCanonical?: boolean; // NEW: Marks system-guaranteed threads
}
```

### Step 2: Create Canonical Synth Immediately on Login

In the auth effect (Layout.tsx), BEFORE any async calls:

```typescript
// Immediately create canonical Synth thread (client-state first)
const canonicalSynthId = `synth-001_chat_with_synth-001`; // Use actual VVAULT session ID
const canonicalSynth: Thread = {
  id: canonicalSynthId,
  title: 'Synth',
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  archived: false,
  isCanonical: true,
};

synthIdRef.current = canonicalSynthId;
synthThreadCacheRef.current = canonicalSynth;
setThreads([canonicalSynth]); // Set immediately, no async
setActiveRuntimeKey(SYNTH_RUNTIME_KEY);
```

### Step 3: Modify mergeThreads to Preserve Canonical Threads

Update mergeThreads callback to:
- Always preserve threads with `isCanonical: true`
- When merging, prefer server-side Synth if it exists, but mark it as canonical
- Never remove canonical threads during merge

```typescript
const mergeThreads = React.useCallback(
  (prev: Thread[], updates: Thread[]): Thread[] => {
    // Extract canonical threads from prev (must be preserved)
    const canonicalThreads = prev.filter(t => t.isCanonical);
    
    const mergedMap = new Map<string, Thread>();
    
    // First, ensure canonical Synth exists
    const synthCanonical = canonicalThreads.find(t => 
      (t.title || '').trim().toLowerCase() === 'synth' || t.isCanonical
    );
    if (synthCanonical) {
      mergedMap.set(synthCanonical.id, synthCanonical);
    }
    
    // Add all prev threads
    prev.forEach((thread) => {
      if (!thread.isCanonical) { // Skip canonical, already added
        mergedMap.set(thread.id, thread);
      }
    });
    
    // Merge updates, but preserve canonical status
    updates.forEach((thread) => {
      const existing = mergedMap.get(thread.id);
      if (existing?.isCanonical) {
        // Preserve canonical, but update with server data
        mergedMap.set(thread.id, { ...thread, isCanonical: true });
      } else {
        mergedMap.set(thread.id, thread);
      }
    });
    
    // Ensure exactly one canonical Synth exists
    const hasCanonicalSynth = Array.from(mergedMap.values()).some(t => 
      t.isCanonical && (t.title || '').trim().toLowerCase() === 'synth'
    );
    
    if (!hasCanonicalSynth && synthIdRef.current) {
      // Re-inject canonical Synth if missing
      const canonicalSynth: Thread = {
        id: synthIdRef.current,
        title: 'Synth',
        messages: synthThreadCacheRef.current?.messages || [],
        createdAt: synthThreadCacheRef.current?.createdAt || Date.now(),
        updatedAt: synthThreadCacheRef.current?.updatedAt || Date.now(),
        archived: false,
        isCanonical: true,
      };
      mergedMap.set(canonicalSynth.id, canonicalSynth);
    }
    
    let merged = Array.from(mergedMap.values());
    
    // Sort: canonical first, then by updatedAt
    merged.sort((a, b) => {
      if (a.isCanonical && !b.isCanonical) return -1;
      if (!a.isCanonical && b.isCanonical) return 1;
      const aSynth = isSynthThread(a);
      const bSynth = isSynthThread(b);
      if (aSynth && !bSynth) return -1;
      if (!aSynth && bSynth) return 1;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
    
    return merged;
  },
  [isSynthThread]
);
```

### Step 4: Update addressBookThreads to Always Include Canonical

```typescript
const addressBookThreads = useMemo(() => {
  // Always include canonical threads first
  const canonical = threads.filter(t => t.isCanonical);
  if (canonical.length > 0) return canonical;
  
  // Fallback to cached Synth
  if (synthThreadCacheRef.current) {
    return [{ ...synthThreadCacheRef.current, isCanonical: true }];
  }
  
  // Last resort: create minimal canonical Synth
  if (synthIdRef.current && user) {
    return [{
      id: synthIdRef.current,
      title: 'Synth',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
      isCanonical: true,
    }];
  }
  
  return [];
}, [threads, user]);
```

### Step 5: Update Hydration to Never Remove Canonical

In hydrateThreads, ensure:
- Never call `setThreads(() => [])` - always preserve existing canonical
- When merging, always preserve canonical threads from prev state
- Server-side Synth should be merged with canonical flag

---

## Expected Behavior

**Before (Current):**
1. User logs in → threads = []
2. Hydration starts → threads still []
3. Synth appears → threads = [Synth]
4. **Flicker:** Synth may disappear during hydration

**After (Canonical):**
1. User logs in → threads = [canonicalSynth] (immediate)
2. Hydration starts → threads still includes canonicalSynth
3. Hydration completes → threads = [canonicalSynth, ...other] (merged)
4. **No flicker:** Canonical Synth always present

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Duplicate Synth entries | Deduplication in mergeThreads, prefer server-side if exists |
| Canonical flag lost during save/load | VVAULT manager preserves isCanonical in normalization |
| Race conditions during hydration | Functional setState, preserve canonical in all merges |
| User switch loses canonical | Recreate canonical Synth on user change |

---

## Success Metrics

### Before Implementation
- ❌ Synth appears 500ms-2s after login
- ❌ Flicker visible during hydration
- ❌ Address Book empty during loading
- ❌ User uncertainty about system state

### After Implementation
- ✅ Synth appears immediately on login (0ms)
- ✅ No flicker during hydration
- ✅ Address Book always populated
- ✅ Consistent user experience

---

## Dependencies

### Files Modified
1. `src/components/Layout.tsx`
   - Thread type extension
   - Auth effect (immediate canonical creation)
   - mergeThreads callback (canonical preservation)
   - addressBookThreads (canonical guarantee)

### Files Reviewed (No Changes Required)
- `src/components/Sidebar.tsx` (consumes addressBookThreads)
- `src/lib/vvaultConversationManager.ts` (preserves canonical in normalization)

---

## Testing Checklist

- [ ] Login shows Synth immediately (no delay)
- [ ] Refresh preserves Synth throughout hydration
- [ ] Hydration merges server-side Synth but keeps canonical flag
- [ ] Address Book always shows Synth when user logged in
- [ ] No duplicate Synth entries after hydration
- [ ] User switch clears previous but creates new canonical Synth

---

## Philosophical Foundation

This solution implements the **Canonical Entity Pattern**:
- **Environment vs Content:** Synth is part of the app environment (like desktop), not user content
- **Trust Through Consistency:** System guarantees match user expectations
- **Predictability Over Performance:** Immediate presence more valuable than async optimization
- **State Coherence:** Local state reflects system model, not just server data

This reframes the problem from "How do we load Synth quickly?" to "How do we ensure Synth is always present?" — a fundamental architectural shift.

---

## UI/UX Implementation Details

### Visual Indicators
- **Pin Icon**: Synth conversation displays a pin icon in the sidebar to indicate it's a special/protected conversation
- **Delete Protection**: No delete button appears in the context menu for Synth conversations
- **Top Sorting**: Synth conversation is always sorted to the top of the sidebar

### Navigation Behavior
- **Auto-Navigation**: On login, if no active conversation exists, automatically navigates to Synth conversation
- **Runtime Selection**: Synth runtime is automatically selected when using Synth conversation
- **Routing**: `/app/chat/:id` routes to the singleton Synth ID

### Deletion Protection
- `deleteThread()` checks if conversation title is 'Synth' and blocks deletion
- When navigating after other deletions, prefers Synth conversation
- When clearing all threads, creates a new Synth conversation as fallback

## Singleton Pattern Principles

### First Principles
- **Invariant**: Exactly one canonical conversation exists in UI state at any time
- **Invariant**: The conversation is addressed as "Synth"; it is not user-titled or duplicated
- **Invariant**: Runtime selection changes the active environment only; it never creates threads
- **Hydration is idempotent**: Multiple runs (including React Strict Mode double-invokes) do not create or duplicate conversations
- **Persistence operations never mutate the number of conversations**: They only sync content/metadata

### State Model
- `activeConversationId`: The single canonical conversation ID (e.g., Synth). Always present when authenticated
- `activeRuntimeKey`: Currently selected runtime (switchable; does not spawn threads)
- `runtimeOptions`: Available runtimes and awareness metadata
- `threadRuntimeMap`: Legacy; migrate toward a no-op or fixed mapping keyed by the singleton conversation

### Allowed Transitions
- `login → hydrate singleton → show "Synth"`
- `runtime select → update activeRuntimeKey` (no new thread)
- `logout → clear state` (no persistence artifacts that create threads on next login)
- **Idempotency**: All transitions must be safe to execute multiple times without creating threads

## Migration Plan (Multi-thread → Singleton)

### Short Term
- Gate all code paths that create new threads (e.g., "Welcome to Chatty", "Fresh Chat")
- Coalesce loaded sessions into a single in-memory view; preserve messages but show only the canonical conversation
- Freeze `threadRuntimeMap` to a single key (the singleton ID) or replace with a derived selector from `activeRuntimeKey`

### Medium Term
- Introduce a canonical conversation ID resolver in `VVAULTConversationManager.ensureFreshSynthConversation` and always reuse it
- Add idempotent storage markers to prevent duplicate session creation

### Long Term
- Sunset legacy keys: `chatty:*:runtime-threads`, per-thread runtime assignments; replace with `active-runtime` only
- Provide a one-time migration script to merge legacy sessions into the canonical conversation history

## Testing Checklist

### Deterministic Tests
- [ ] Login/hydrate under Strict Mode: zero duplicate conversations
- [ ] Runtime select: no thread creation, `activeRuntimeKey` toggles correctly
- [ ] Repeated hydrations/network retries: no additional conversations
- [ ] Storage unavailable → available: still exactly one conversation
- [ ] Legacy users with many sessions: UI shows one conversation; history persists

### Invariant Checks
- "never more than one thread rendered"
- "no user-editable title for singleton"
- "no creation on repeated hydrations"

### Acceptance Criteria
- After 100 login/hydration cycles, the sidebar shows exactly one item labeled "Synth"
- Selecting/removing/importing runtimes never increases conversation count
- Legacy data does not produce duplicate threads; migration leaves UI singleton intact
- All tests for idempotency and invariants pass consistently

## Related Documentation

- `SYNTH_PRIMARY_CONSTRUCT_RUBRIC.md` - Core principle/rubric for Synth
- `SYNTH_CONVERSATION_DEPENDENCIES.md` - File dependencies and integration points
