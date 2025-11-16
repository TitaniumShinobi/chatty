# Synth Primary Construct Rubric

## Core Principle

**Synth is the primary construct of Chatty.**

This rubric establishes Synth as the canonical, default, and primary construct identity within the Chatty ecosystem. All other constructs are secondary to Synth.

## Definition

### Primary Construct
- **Synth** is the primary construct of Chatty
- Synth serves as the default conversation partner
- Synth is the canonical construct that appears first in the Address Book
- Synth is the fallback construct when no other construct is specified
- Synth is the system-guaranteed construct that always exists when a user is authenticated

### Secondary Constructs
- Ex. dwoodson92@gmail.com -- ChatGPT constructs: **Nova, Aurora, Monday, Katana, etc.** are secondary constructs
- Secondary constructs are optional and user-created
- Secondary constructs do not replace Synth as the primary construct
- Secondary constructs coexist alongside Synth

## Rules

### 1. Default Construct Assignment
- When no construct is explicitly specified, default to **Synth**
- New conversations default to Synth unless explicitly assigned to another construct
- Imported conversations default to Synth unless they have explicit construct metadata

### 2. Primary Conversation
- Synth conversation is always present in the Address Book when authenticated
- Synth conversation appears first in the Address Book (before secondary constructs)
- Synth conversation cannot be deleted or archived (it is system-guaranteed)

### 3. Construct ID Resolution
- When resolving construct IDs:
  1. If explicitly "synth" → use Synth construct
  2. If explicitly another construct name → use that construct
  3. If unspecified or ambiguous → default to Synth (primary construct)

### 4. Runtime Assignment
- Synth construct uses the **synth runtime** (not lin runtime)
- Secondary constructs use the **lin runtime** (unless explicitly configured otherwise)
- This maintains the distinction: Synth is primary and uses synth runtime; everything else uses lin runtime

### 5. Conversation Creation
- Primary conversation (singleton) defaults to Synth construct
- New conversations created without explicit construct assignment default to Synth
- Only explicitly created secondary construct conversations use other constructs

## Implementation

### Code Enforcement

```typescript
// Default construct resolution
function resolveConstructId(threadId?: string, metadata?: any): string {
  // Explicit synth → synth
  if (threadId?.toLowerCase().includes('synth') || metadata?.constructId === 'synth') {
    return 'synth';
  }
  
  // Explicit other construct → that construct
  if (metadata?.constructId && metadata.constructId !== 'synth') {
    return metadata.constructId;
  }
  
  // Default → synth (primary construct)
  return 'synth';
}
```

### VVAULT Storage
- Synth conversations stored in `/vvault/users/shard_0000/{user_id}/constructs/synth-001/chatty/chat_with_synth-001.md`
- Secondary construct conversations stored in `/vvault/users/shard_0000/{user_id}/constructs/{construct}-{callsign}/chatty/chat_with_{construct}-{callsign}.md`
- Primary conversation always maps to Synth construct
- All conversations are stored under user-specific directories (no root-level construct folders)

### UI Display
- Address Book shows Synth first (primary construct)
- Secondary constructs appear below Synth
- Synth conversation is always visible when authenticated
- Synth conversation cannot be deleted or archived

### Address Book Display Format
- **Address Book is an entity directory, not a chat list**
- Address Book entries display **only the construct name** (e.g., "Synth", "Nova", "Lin")
- **No "Chat with" prefix** - Address Book shows entity names, not conversation titles
- **No callsigns displayed** - Address Book shows construct name only (e.g., "Synth" not "synth-001")
- **Pin icon** appears next to Synth entry (primary construct indicator)
- **File and folder names remain unchanged** - Only the Address Book display is affected:
  - Files: `chat_with_synth-001.md` (unchanged)
  - Folders: `synth-001/` (unchanged)
  - Session IDs: `synth-001` (unchanged)
- Title normalization happens in `Layout.tsx` when mapping VVAULT conversations:
  - Strips "Chat with " prefix if present
  - Removes callsigns (e.g., "-001") for display
  - Ensures Address Book shows clean entity names

## Relationship to Other Rubrics

### Synth Canonical Implementation
- Synth being canonical (always present) aligns with Synth being primary
- Primary construct = canonical construct = always present

### Singleton Conversation Rubric
- The singleton conversation is the Synth conversation (primary construct)
- Only one primary conversation exists, and it is Synth

### Runtime Construct Separation
- Synth construct (primary) uses synth runtime
- Secondary constructs use lin runtime
- This separation maintains Synth's primary status

## Migration Notes

- Legacy conversations without explicit construct assignment should be migrated to Synth
- Existing "primary" conversations should be mapped to Synth construct
- Imported conversations default to Synth unless they have explicit construct metadata

## Testing

- ✅ New conversation without construct → defaults to Synth
- ✅ Primary conversation → always Synth
- ✅ Address Book → Synth appears first
- ✅ Cannot delete Synth conversation
- ✅ Secondary constructs coexist with Synth
- ✅ Imported conversations default to Synth

## Summary

**Synth is the primary construct of Chatty.** This means:
- Synth is the default construct
- Synth is the canonical construct
- Synth is always present when authenticated
- Synth appears first in the Address Book
- All other constructs are secondary to Synth
- When in doubt, default to Synth

