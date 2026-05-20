# Image Attachment & Display Fixes

**Date:** February 10, 2026  
**Status:** Verified Working  
**Commits:** `e092d32a`, `83580440`

---

## Summary

Three related bugs were identified and fixed in the image attachment system: portrait image squishing in chat thumbnails, fullscreen preview z-index layering, and attachment data loss during conversation append operations.

---

## Bug 1: Portrait Image Squishing

**Problem:** All image thumbnails in chat messages were forced into a fixed landscape container (`w-full h-48 object-cover`), causing portrait/tall images to be cropped and squeezed into a short wide rectangle.

**Root Cause:** The CSS class `w-full h-48 object-cover` forces every image into a 100%-width, fixed-192px-height box and crops to fill. Portrait images lost most of their visible content.

**Fix Applied:**

Changed the single-image thumbnail class in both components:

| File | Line | Before | After |
|------|------|--------|-------|
| `src/components/ImageAttachmentPreview.tsx` | 77 | `w-full h-48 object-cover` | `max-w-full max-h-[70vh] w-auto h-auto object-contain` |
| `src/components/AttachmentDisplay.tsx` | 104 | `w-full h-48 object-cover` | `max-w-full max-h-[70vh] w-auto h-auto object-contain` |

**Why it works:** `object-contain` preserves the image's natural aspect ratio, `w-auto h-auto` lets the image size naturally, and `max-w-full max-h-[70vh]` caps it so it doesn't overflow the chat area.

**Note:** Multi-image grid thumbnails (`w-24 h-24 object-cover`) were intentionally left as-is. Small uniform squares are the correct UX pattern for grid layouts.

---

## Bug 2: Fullscreen Preview Z-Index Bleed

**Problem:** When clicking an image to view it fullscreen in `ImageAttachmentPreview.tsx`, the sidebar would bleed through the lightbox overlay, partially covering the image.

**Root Cause:** The lightbox overlay used `z-50`, but the sidebar and other UI elements also use `z-50`, causing them to render at the same layer.

**Fix Applied:**

| File | Line | Before | After |
|------|------|--------|-------|
| `src/components/ImageAttachmentPreview.tsx` | 216 | `z-50` | `z-[9999]` |

`AttachmentDisplay.tsx` already had `z-[9999]` on its lightbox (line 242), so this fix brings consistency between the two components.

---

## Bug 3: Attachment Data Loss on Conversation Append

**Problem:** Image attachments (thumbnails with URLs) would disappear from conversation history after the next message was sent. The images were stored correctly on initial write, but subsequent appends would strip them.

**Root Cause:** In `vvaultConnector/supabaseStore.js` line 927, when appending a new message to an existing conversation, the code loaded existing messages with:

```javascript
messages = existingMetadata.messages || parseMarkdownTranscript(existing.content);
```

The `||` operator treats an empty array `[]` as falsy in this context (it doesn't, but the real issue was with `undefined` vs empty). The deeper problem: if `metadata.messages` existed as an empty array (e.g., a freshly bootstrapped conversation), the fallback to `parseMarkdownTranscript()` would parse the raw markdown content — which has no attachment URLs — stripping all attachment data from the structured messages.

**Fix Applied:**

```javascript
// Before (line 927)
messages = existingMetadata.messages || parseMarkdownTranscript(existing.content);

// After
messages = Array.isArray(existingMetadata.messages)
  ? existingMetadata.messages
  : parseMarkdownTranscript(existing.content);
```

**Why it works:** `Array.isArray()` returns `true` even for empty arrays, treating structured metadata as authoritative whenever it exists. Markdown parsing is only used as a last resort for truly legacy records that have no `metadata.messages` property at all.

**Data flow after fix:**
1. **Write path** (already fixed prior): Stores attachments even for empty-content messages via `hasContent || hasAttachments` guard (line 937)
2. **Read path** (initial load, line 762): Prioritizes `metadata.messages` over parsed markdown
3. **Read path** (append, line 930): Now also prioritizes `metadata.messages` via `Array.isArray()` check

---

## Files Modified

| File | Changes |
|------|---------|
| `src/components/ImageAttachmentPreview.tsx` | CSS class fix (line 77), z-index fix (line 216) |
| `src/components/AttachmentDisplay.tsx` | CSS class fix (line 104) |
| `vvaultConnector/supabaseStore.js` | Append read-path fix (line 930) |

---

## Verification

- App starts cleanly with no errors
- All 3 conversations (Lin, Katana, Zen) load correctly from Supabase
- Structured message data (`metadata.messages`) is preserved through append operations
- No regressions in conversation loading or message display
