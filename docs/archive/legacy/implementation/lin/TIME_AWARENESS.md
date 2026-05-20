# Time Awareness for Lin and GPTs

## Current Status: ⚠️ PARTIALLY IMPLEMENTED

Time awareness infrastructure exists in `chatty/server/services/awarenessService.js` but is **NOT currently integrated** into Lin or GPT prompts.

## What Exists

### `awarenessService.js` Functions

1. **`createTimeContextSnapshot()`** - Creates comprehensive time context:
   - Current date/time (local and UTC)
   - Timezone
   - Day of week
   - Part of day (morning, afternoon, evening, night)
   - Weekend/weekday status
   - Business hours status
   - Greeting based on time of day

2. **`buildTimePromptLines()`** - Formats time context for prompts:
   ```
   Current temporal context:
   - Date: Monday, January 15, 2025
   - Time: 2:30 PM EST
   - Time of day: afternoon
   - Day: Monday
   - Timezone: America/New_York
   - It is a weekday.
   - Outside local business hours.
   
   You are aware of the current time and can reference it naturally in conversation.
   ```

## What's Missing

### ❌ Not Integrated Into:
1. **Lin's Create Tab** - No time awareness
2. **GPT Preview Tab** - No time awareness  
3. **UnifiedLinOrchestrator** - No time context injection
4. **GPT Runtime** - No time awareness

### ❌ No Documentation On:
1. How Lin/GPTs should use time awareness
2. How to reference dates from memories
3. How to handle relative time ("yesterday", "last week")
4. How to extract dates from transcripts

## Required Implementation

### 1. Frontend Time Context API

Create endpoint to get time context:

```typescript
// chatty/src/lib/timeAwareness.ts
export async function getTimeContext(): Promise<TimeContext> {
  const response = await fetch('/api/awareness/time', {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('Failed to get time context');
  }
  return response.json();
}

export interface TimeContext {
  server: string; // ISO8601 UTC
  localISO: string; // ISO8601 local
  display: string;
  timezone: string;
  weekday: string;
  partOfDay: string;
  fullDate: string;
  shortDate: string;
  localTime: string;
  isWeekend: boolean;
  isBusinessHours: boolean;
  greeting: string;
  hour: number;
  timestampMs: number;
}
```

### 2. Backend Time Context Endpoint

```javascript
// chatty/server/routes/awareness.js
router.get('/time', requireAuth, async (req, res) => {
  const { createTimeContextSnapshot } = require('../services/awarenessService');
  const timeContext = createTimeContextSnapshot({
    timeZone: req.user?.timezone || undefined
  });
  res.json(timeContext);
});
```

### 3. Inject Time Context into Lin's Prompt

```typescript
// chatty/src/components/GPTCreator.tsx - buildCreateTabSystemPrompt()
const timeContext = await getTimeContext();
const timeSection = buildTimePromptSection(timeContext);

// Add to prompt:
sections.push('=== CURRENT TIME AWARENESS ===');
sections.push(timeSection);
sections.push('You can reference the current date/time naturally in conversation.');
sections.push('Example: "It\'s Monday afternoon, perfect time to work on your GPT."');
```

### 4. Inject Time Context into GPT Prompts

```typescript
// chatty/src/engine/orchestration/UnifiedLinOrchestrator.ts
async orchestrateResponse(...) {
  // Get time context
  const timeContext = await getTimeContext();
  
  // Inject into prompt
  const systemPrompt = this.buildUnifiedLinPrompt(
    userMessage,
    unifiedContext,
    constructId,
    callsign,
    tone,
    capsule,
    timeContext // Add time context
  );
}
```

### 5. Memory Timestamp Awareness

```typescript
// When displaying memories, include relative time:
if (memory.timestamp) {
  const memoryDate = new Date(memory.timestamp);
  const now = new Date();
  const daysAgo = Math.floor((now.getTime() - memoryDate.getTime()) / (1000 * 60 * 60 * 24));
  
  let relativeTime = '';
  if (daysAgo === 0) {
    relativeTime = 'today';
  } else if (daysAgo === 1) {
    relativeTime = 'yesterday';
  } else if (daysAgo < 7) {
    relativeTime = `${daysAgo} days ago`;
  } else if (daysAgo < 30) {
    relativeTime = `${Math.floor(daysAgo / 7)} weeks ago`;
  } else {
    relativeTime = memoryDate.toLocaleDateString();
  }
  
  sections.push(`Date: ${memory.timestamp} (${relativeTime})`);
}
```

## Usage Examples

### Lin with Time Awareness

**User**: "When did we last work on Katana?"

**Lin**: "Looking at Katana's conversation history, the last entry was on August 31st, 2025 - that's about 4 months ago. Today is Monday, January 15th, 2025, so it's been a while since we worked on her. Want to continue refining her?"

**Analysis**:
- ✅ References current date (January 15th, 2025)
- ✅ Calculates relative time (4 months ago)
- ✅ Uses time naturally in conversation

### GPT with Time Awareness

**User**: "What's the date?"

**Katana**: "Monday, January 15th, 2025. 2:30 PM. Why?"

**Analysis**:
- ✅ Knows current date/time
- ✅ Responds in character (brief, direct)
- ✅ Uses time naturally

### Date Extraction from Memories

**User**: "What dates are in the transcripts?"

**Lin/GPT**: "Dates found in uploaded transcripts:
- August 31st, 2025: Continuity hardening design accepted
- August 31st, 2025: Clipboard watcher integrated
- September 27th, 2025: Test conversation
- [etc.]"

**Analysis**:
- ✅ Extracts dates from memory timestamps
- ✅ Formats dates naturally
- ✅ Provides context for each date

## Implementation Priority

### Priority 1: Critical
1. ✅ Create frontend time awareness service
2. ✅ Create backend time context endpoint
3. ✅ Inject time context into Lin's Create Tab prompt
4. ✅ Inject time context into GPT Preview Tab prompt

### Priority 2: Important
1. ✅ Add relative time calculation for memories
2. ✅ Add date extraction instructions (already exists)
3. ✅ Add time awareness to UnifiedLinOrchestrator

### Priority 3: Nice to Have
1. ✅ User timezone preference storage
2. ✅ Time-based greeting variations
3. ✅ Business hours awareness for responses

## Files to Create/Modify

### New Files
- `chatty/src/lib/timeAwareness.ts` - Frontend time awareness service

### Modified Files
- `chatty/server/routes/awareness.js` - Add time context endpoint (or create if doesn't exist)
- `chatty/src/components/GPTCreator.tsx` - Inject time context into Lin's prompt
- `chatty/src/engine/orchestration/UnifiedLinOrchestrator.ts` - Inject time context into GPT prompts
- `chatty/server/routes/vvault.js` - Ensure timestamps are stored with memories

## Testing Checklist

- [ ] Lin knows current date/time
- [ ] Lin can reference dates from memories
- [ ] Lin can calculate relative time ("3 days ago")
- [ ] GPT knows current date/time
- [ ] GPT can reference dates from memories
- [ ] Date extraction from transcripts works
- [ ] Timezone handling works correctly
- [ ] Weekend/weekday awareness works
- [ ] Business hours awareness works

## Status

- ⚠️ Infrastructure exists but not integrated
- ❌ No time awareness in Lin prompts
- ❌ No time awareness in GPT prompts
- ❌ No relative time calculations
- ✅ Date extraction instructions exist (but need time context to work)

