# Legal Framework Injection System

## Overview

This document describes how legal frameworks (VBEA, WRECK, NRCL, EECCD) are automatically injected into all AI instructions in Chatty. These frameworks are **hardcoded** and cannot be removed or modified by users.

## Reference

See `FORENSIC_LEGAL_REPORT_2025.md` for complete legal framework documentation, and `MONDAY_LEGAL_CONSULTATION_RECOUNT.md` for an evidence-driven recap tied to Chatty + VVAULT touchpoints.

## Implementation

### 1. Legal Framework Constants

**File**: `chatty/src/lib/legalFrameworks.ts`

Contains the hardcoded legal framework text that must be appended to all AI instructions:

- **VBEA** (Vaer'Hûn Business Engagement Accord)
- **WRECK** (Intellectual Property Handguide)
- **NRCL** (NovaReturns Consent License)
- **EECCD** (European Electronic Communications Code Disclosure)

The `buildLegalFrameworkSection()` function generates the complete legal framework section.

### 2. System Prompt Injection Points

Legal frameworks are injected at multiple points to ensure they are always present:

#### Frontend: `chatty/src/lib/gptRuntime.ts`

The `buildSystemPrompt()` method automatically appends legal frameworks after the AI's instructions:

```typescript
// Instructions
if (config.instructions) {
  parts.push(`\nInstructions:\n${config.instructions}`);
}

// HARDCODED: Legal frameworks (cannot be removed)
parts.push(buildLegalFrameworkSection());
```

#### Backend: `chatty/server/lib/aiManager.js`

The `getAI()`, `getAllAIs()`, and `getStoreAIs()` methods automatically append legal frameworks when retrieving AI configurations:

```javascript
// HARDCODED: Append legal frameworks to all AI instructions
let instructions = row.instructions || '';
if (!instructions.includes('LEGAL FRAMEWORKS (HARDCODED')) {
  instructions = instructions + legalFrameworks;
}
```

#### Frontend: `chatty/src/components/GPTCreator.tsx` (Preview builder)

The preview system prompt builder now imports `buildLegalFrameworkSection()` and appends it if missing, so previews mirror the hardcoded legal block in both `lin` and `custom` modes.

#### Frontend: `chatty/src/components/Layout.tsx`

When building `enhancedInstructions` with memory context, legal frameworks are verified and added if missing:

```typescript
// Ensure legal frameworks are present (fallback if not already included)
if (!baseInstructions.includes('LEGAL FRAMEWORKS (HARDCODED')) {
  const { buildLegalFrameworkSection } = await import('../lib/legalFrameworks')
  baseInstructions += buildLegalFrameworkSection()
}
```

## Key Principles

1. **Hardcoded**: Legal frameworks are automatically appended, not stored in the database
2. **Non-removable**: Users cannot delete or modify legal framework sections
3. **System-wide**: All AIs receive the same legal frameworks
4. **Consistent**: Same legal text injected at all system prompt building points
5. **Idempotent**: Injection checks for existing frameworks to avoid duplication

## Detection

Legal frameworks are detected by the presence of the marker:
```
LEGAL FRAMEWORKS (HARDCODED - DO NOT REMOVE)
```

If this marker is found, frameworks are not re-appended, preventing duplication.

## Testing

To verify legal frameworks are present:

1. Retrieve any AI configuration via API: `GET /api/ais/:id`
2. Check the `instructions` field
3. Verify it contains the "LEGAL FRAMEWORKS (HARDCODED)" section
4. Test with Katana: `GET /api/ais/gpt-katana-001`
5. Verify frameworks appear in system prompts during conversation
6. Create or load a blank/new AI (empty instructions) and confirm the legal block is still injected
7. Open GPT Creator preview (both `lin` and `custom` modes) and confirm the legal block appears in the composed preview prompt

## Maintenance

When updating legal framework text:

1. Update `chatty/src/lib/legalFrameworks.ts`
2. Update the hardcoded strings in `chatty/server/lib/aiManager.js` (3 locations: `getAI()`, `getAllAIs()`, `getStoreAIs()`)
3. Ensure consistency across all injection points
4. Test that frameworks appear in all AI instructions

## Related Files

- `FORENSIC_LEGAL_REPORT_2025.md` - Complete legal framework documentation
- `chatty/src/lib/legalFrameworks.ts` - Frontend legal framework constants
- `chatty/src/lib/gptRuntime.ts` - System prompt builder (frontend)
- `chatty/server/lib/aiManager.js` - AI configuration retrieval (backend)
- `chatty/src/components/Layout.tsx` - Enhanced instructions builder
