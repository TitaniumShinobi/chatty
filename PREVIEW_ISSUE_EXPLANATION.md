# Preview Interface Issue

## The Problem
You're seeing verbose meta-commentary instead of clean Katana responses because you're using the **preview interface**, not the main Chatty interface.

## The File That Controls This
**File**: `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/preview.js`

**What it does**: 
- Lines 87-162: The `/api/preview/run` endpoint
- Lines 118-132: Direct call to Ollama without any persona lockdown
- Lines 146-150: Returns raw Ollama response with no filtering

## Why This Happens
The preview interface bypasses ALL of our signature response systems:
- ❌ No signature response bypass
- ❌ No persona lockdown
- ❌ No stripLinHedges function
- ❌ No transcript-backed responses

It just sends your prompt directly to Ollama and returns whatever verbose response the model generates.

## The Solution
**Use the main Chatty interface instead of preview:**

1. **Current**: You're in GPTCreator/SimForge preview mode
2. **Switch to**: Main Chatty interface at `http://localhost:5173/`
3. **Result**: You'll get the clean "Yo." responses with signature bypass

## Quick Fix for Preview
If you need the preview to work properly, add signature response bypass to `/server/routes/preview.js` line 146:

```javascript
// Before returning response
if (data.response.includes('Ultra-Brief Mode') || data.response.includes('analytical sharpness')) {
  data.response = "Yo.";
}
```

But the real solution is using the main interface where all the persona systems are active.
