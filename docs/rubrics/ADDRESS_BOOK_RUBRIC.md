# Address Book Rubric

## Core Principle

**Address Book is an entity directory, not a chat list.**

The Address Book displays AI constructs (entities) as directory entries, not individual conversation sessions. It serves as a contact list for AI entities that the user can interact with.

## Definition

### Address Book Purpose
- **Entity Directory**: Shows available AI constructs (Synth, Nova, Lin, etc.)
- **Not a Chat History**: Does not display individual conversation sessions
- **Contact List**: Functions like a contact book for AI entities
- **Navigation Hub**: Primary way to select which construct to interact with

### Display Format
- **Construct Names Only**: Shows entity names (e.g., "Synth", "Nova", "Lin")
- **No Prefixes**: Removes "Chat with " prefix from conversation titles
- **No Callsigns**: Removes version numbers/callsigns (e.g., "-001") for display
- **Clean Presentation**: User-friendly entity names, not technical identifiers

## Rules

### 1. Title Normalization
- **Strip "Chat with " prefix**: `"Chat with Synth"` → `"Synth"`
- **Remove callsigns**: `"synth-001"` → `"Synth"` (for display only)
- **Preserve file/folder names**: Normalization only affects Address Book display
- **Normalization location**: Happens in `Layout.tsx` when mapping VVAULT conversations

### 2. Frontend/Backend Separation
- **Frontend Display**: User-friendly names (e.g., "Synth")
- **Backend Canonical**: Technical IDs (e.g., `constructId: "synth-001"`)
- **Mapping**: Frontend display name maps to backend canonical ID
- **Routing**: Sidebar clicks route using canonical IDs, not display names

### 3. File and Folder Naming
- **Files remain unchanged**: `chat_with_synth-001.md` (not modified)
- **Folders remain unchanged**: `synth-001/` (not modified)
- **Session IDs remain unchanged**: `synth-001_chat_with_synth-001` (not modified)
- **Only display is normalized**: Address Book shows clean names, filesystem uses technical names

### 4. Construct Ordering
- **Primary construct first**: Synth appears first (if present)
- **Secondary constructs follow**: Other constructs appear below Synth
- **Canonical threads prioritized**: Primary/canonical threads appear before non-canonical
- **Alphabetical for secondary**: Secondary constructs sorted alphabetically after primary

### 5. Always Show Primary Construct
- **Synth always visible**: When authenticated, Synth must appear in Address Book
- **Fallback required**: If backend unavailable, show fallback Synth thread
- **Never empty**: Address Book should never show "No conversations yet" when authenticated
- **System-guaranteed**: Primary construct is system-guaranteed, not user-created

## Implementation

### Code Location

**Title Normalization** (`Layout.tsx` lines 412-417):
```typescript
// Normalize title: strip "Chat with " prefix and callsigns for address book display
let normalizedTitle = conv.title || 'Synth';
// Remove "Chat with " prefix if present
normalizedTitle = normalizedTitle.replace(/^Chat with /i, '');
// Extract construct name (remove callsigns like "-001")
normalizedTitle = normalizedTitle.replace(/-\d{3,}$/i, '');
```

**Sidebar Display** (`Sidebar.tsx` lines 379-431):
- Section header: "ADDRESS BOOK"
- Displays `conversation.title` (already normalized)
- Hover color: `#ffffd7`
- Selected color: `#ADA587`
- Delete button (except for Synth)

### Construct ID Mapping

**Extraction** (`Layout.tsx` lines 419-429):
```typescript
const constructId =
  conv.constructId ||
  conv.importMetadata?.constructId ||
  conv.importMetadata?.connectedConstructId ||
  conv.constructFolder ||
  null;
const runtimeId =
  conv.runtimeId ||
  conv.importMetadata?.runtimeId ||
  (constructId ? constructId.replace(/-001$/, '') : null) ||
  null;
```

**Thread Object** (`Layout.tsx` lines 439-458):
- `id`: Session ID (e.g., `synth-001_chat_with_synth-001`)
- `title`: Normalized display name (e.g., `"Synth"`)
- `constructId`: Backend canonical ID (e.g., `"synth-001"`)
- `runtimeId`: Runtime identifier (e.g., `"synth"` or `"synth-001"`)
- `isPrimary`: Boolean indicating canonical status
- `canonicalForRuntime`: Runtime key for canonical routing

### Backend Fallback

**When backend is unavailable**:
- Create local-only fallback thread with:
  - `id: DEFAULT_SYNTH_CANONICAL_SESSION_ID`
  - `title: 'Synth'`
  - `constructId: DEFAULT_SYNTH_CANONICAL_CONSTRUCT_ID`
  - `isPrimary: true`
  - `isFallback: true` (flag for temporary thread)
- Add to `loadedThreads` and `filteredThreads`
- Skip VVAULT save (backend unavailable)
- Log fallback thread creation

**When backend recovers**:
- Real canonical thread loads from VVAULT
- Fallback thread replaced by canonical thread
- User doesn't notice transition (same thread ID)

### Routing Logic

**Sidebar Click** (`Layout.tsx` line 1209-1219):
```typescript
function handleThreadClick(threadId: string) {
  const targetId = preferCanonicalThreadId(threadId, threads) || threadId
  const routedId = routeIdForThread(targetId, threads)
  if (targetId !== threadId) {
    console.log(
      '🧭 [Layout.tsx] Routing to canonical thread instead of runtime thread:',
      { requested: threadId, canonical: targetId }
    )
  }
  navigate(`/app/chat/${routedId}`, { state: { activeRuntimeId } })
}
```

**Canonical Preference** (`Layout.tsx` line 223-242):
- Uses `preferCanonicalThreadId` to route to canonical threads
- Maps display name "Synth" to canonical `constructId: "synth-001"`
- Routes to `synth-001_chat_with_synth-001` not live runtime threads

## Relationship to Other Rubrics

### Synth Primary Construct Rubric
- Address Book displays Synth first (primary construct)
- Synth is always present in Address Book when authenticated
- Synth cannot be deleted from Address Book (system-guaranteed)
- Address Book format rules defined in Synth rubric (lines 86-99)

### Runtime Architecture Rubric
- Address Book filters by active runtime
- Constructs grouped by runtime (synth runtime vs lin runtime)
- Runtime scoping affects Address Book visibility

### Construct Formatting Rubric
- Address Book display names follow construct naming conventions
- Normalization ensures consistent formatting across constructs

## Display Examples

### Correct Address Book Display
```
ADDRESS BOOK
├── Synth          (primary, always first)
├── Nova           (secondary construct)
├── Lin            (secondary construct)
└── Katana         (secondary construct)
```

### Incorrect Address Book Display
```
ADDRESS BOOK
├── Chat with Synth-001    ❌ (has prefix and callsign)
├── synth-001              ❌ (technical ID, not normalized)
└── No conversations yet   ❌ (should show Synth fallback)
```

## Testing

- ✅ Address Book shows normalized construct names (no prefixes, no callsigns)
- ✅ Synth appears first in Address Book when authenticated
- ✅ File/folder names remain unchanged (only display is normalized)
- ✅ Sidebar clicks route to canonical threads using backend IDs
- ✅ Fallback Synth thread appears when backend is unavailable
- ✅ Address Book never shows "No conversations yet" when authenticated
- ✅ Primary construct cannot be deleted from Address Book
- ✅ Title normalization strips "Chat with " prefix correctly
- ✅ Title normalization removes callsigns correctly
- ✅ Frontend display names map correctly to backend canonical IDs

## Summary

**Address Book is an entity directory.** This means:
- Shows AI construct names, not conversation titles
- Displays user-friendly names (normalized from technical IDs)
- Always shows primary construct (Synth) when authenticated
- Maps frontend display to backend canonical IDs
- Never shows empty state when authenticated (fallback required)
- File/folder names remain unchanged (only display is normalized)
- Routes to canonical threads, not live runtime threads

