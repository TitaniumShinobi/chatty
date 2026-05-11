# Persistence Path Investigation (UI Messages Not Saving)

**Date**: March 12, 2026
**Status**: Root cause identified — direct backend sends confirmed working; UI path partially unresolved

---

## Problem

Messages sent from the Chatty UI (browser) were not appearing in backend transcript reads from Supabase, even after receiving valid AI responses.

---

## Two Chatty Codebases — Critical Distinction

There are two copies of the Chatty codebase. Only one is live:

| Copy        | Path                                                                                                         | Status                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **Running** | `/Users/devon/Documents/GitHub/chatty`                                                                       | Live on :5173 (frontend) / :5050 (backend)                         |
| **Mirror**  | `/Users/devon/Library/Mobile Documents/com~apple~CloudDocs/Vault/nova-001/documents/Documents/GitHub/chatty` | iCloud Vault mirror — edits here have no effect on the running app |

All code changes must target the **running copy**.

---

## Auth Scopes

| Method                      | Email                  | Notes                                        |
| --------------------------- | ---------------------- | -------------------------------------------- |
| Browser UI (dev auto-login) | `dev@chatty.local`     | Used by Nova/Zen tabs in the browser         |
| Direct API probes           | `dwoodson92@gmail.com` | Used for curl-based persistence verification |

Both map to the same `zen-001` transcript file in Supabase.

---

## Transcript Storage

Transcripts are stored in Supabase `vault_files` table at:

```
instances/{constructId}/chatty/chat_with_{constructId}.md
```

Read via `SupabaseStore` in the backend.

---

## Root Cause 1: `skipPersistence: true` (Resolved)

**File**: `src/lib/aiService.ts`
**Lines affected**: 704, 771

The frontend originally sent `skipPersistence: true` in the message payload, causing the backend's `writeTranscript()` call (in `server/routes/vvault.js` ~line 6664) to be skipped.

**Fix applied**: Both occurrences set to `false`.

**Proof of fix working**: Direct curl send of `COPILOT_ZEN_VERIFY_1773309000_PERSIST_CHECK` persisted and appeared in the `/api/vvault/conversations/zen-001_chat_with_zen-001/summary` response at timestamp `2026-03-12T16:19:52.030Z`, `messageCount: 31`.

---

## Root Cause 2: UI Messages Still Not Persisting (Partially Unresolved)

After fixing `skipPersistence`, UI-sent markers still did not appear in transcript reads.

**Two candidates identified:**

### Candidate A — Orchestration Route Bypass

For `zen-001` and `lin-001`, `aiService.ts` routes through `orchestrationBridge.routeMessageWithFallback()` first, which POSTs to `/api/orchestration/route`. If that route returns a successful response, the code never falls through to `/api/vvault/message` (where `writeTranscript` is called).

Vite proxy logs showed **no POST to `/api/vvault/message` or `/api/orchestration/route`** during the window when UI markers were sent — only `selfprompt/pending` polling every 10 seconds. This suggests the UI message path may be using SSE, WebSocket, or a component-level route not proxied in standard Vite logs.

### Candidate B — Identity Drift Fallback Path

Zen's reply to the third verification marker was exactly:

> "I'm here with you. Ask that again and I'll answer directly."

This matches `buildIdentityDriftFallback()` at line 1257 of `server/routes/vvault.js`, which replaces the LLM response when the post-processor flags identity drift. This substitution happens before the `if (!skipPersistence)` persistence check at line 6664 — so the fallback text _should_ still be persisted if the route is reached, but this was not confirmed.

---

## What Works (Confirmed)

- Direct `POST /api/vvault/message` with `skipPersistence: false` → persists and is readable via `/api/vvault/conversations/zen-001_chat_with_zen-001/summary`.
- Backend transcript reads work for both `dev@chatty.local` and `dwoodson92@gmail.com` auth scopes.
- The `writeTranscript` gate at line ~6664 of `vvault.js` is the canonical persistence call.

---

## Verified Working Example

```bash
BASE="http://127.0.0.1:5050"
JAR="/tmp/sid.jar"
curl -sS -c "$JAR" -H 'Content-Type: application/json' \
  -d '{"email":"dwoodson92@gmail.com"}' "$BASE/api/auth/dev-login"

curl -sS -b "$JAR" -H 'Content-Type: application/json' \
  -d '{"constructId":"zen-001","threadId":"zen-001_chat_with_zen-001","sessionId":"zen-001_chat_with_zen-001","message":"YOUR_MSG","skipPersistence":false}' \
  "$BASE/api/vvault/message"
```

---

## Outstanding Work

- Trace the actual HTTP method/route used by the Zen UI tab in `Chat.tsx` / `ChatArea.tsx` when a message is submitted.
- Confirm whether `/api/orchestration/route` calls `writeTranscript` internally or bypasses it.
- Confirm whether the identity-drift fallback path at line ~6580 of `vvault.js` reaches the persistence gate.
