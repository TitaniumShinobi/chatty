# Dictate / mic–transcription pipeline — verification report

**Scope:** Hearing milestone (dictate + shared mic/transcribe path).  
**Date:** Verification pass after implementation.

---

## 1. Permission denied

**Result: PASS**

**What was done:** Code path verified in `MessageBar.tsx` `handleVoiceToggle` catch block.

**Evidence:**
- `getUserMedia({ audio: true })` is in a try/catch (lines 324–403).
- On throw, `err.name` is checked for `NotAllowedError` or `PermissionDeniedError` (lines 398–402).
- For those: `setTranscriptError('Microphone access denied. Allow mic in browser settings.')`.
- Otherwise: `setTranscriptError('Could not access microphone.')`.
- `transcriptError` is rendered in the voice popover (lines 679–691) in a `role="alert"` div.

**Manual check (recommended):** Trigger dictate → deny microphone in the browser prompt → confirm the alert text appears in the voice popover.

---

## 2. Happy path

**Result: PASS**

**What was done:** Code path verified for record → stop → transcribe → insert → focus.

**Evidence:**
- After `mediaRecorder.start()` and `setIsRecording(true)`, user clicks again → `mediaRecorder.stop()` (lines 314–318).
- `onstop` (339–392): build blob; if `audioBlob.size >= 500`, POST to `/api/transcribe` with FormData `audio` and `credentials: 'include'`.
- On `result?.ok && typeof result.text === 'string'`: `setInputValue(prev => prev ? \`${prev} ${text}\` : text)`, `onValueChange?.(newVal)`, `textareaRef.current?.focus()` (375–381).
- Popover closes on Dictate click (659), so user reopens to stop; flow is one start → one stop → one transcript.

**Manual check (recommended):** Trigger dictate → say a short sentence → stop → confirm transcript in composer and focus in textarea.

---

## 3. Too-short recording

**Result: PASS**

**What was done:** Code path verified for blob size check and error message.

**Evidence:**
- In `onstop`, `if (audioBlob.size < 500)` (347–350): `setTranscriptError('Recording too short. Try again.')` and `return` (no transcribe, no `setIsTranscribing(true)`).
- Same `transcriptError` UI (679–691) shows the message when popover is open.

**Manual check (recommended):** Start dictate → stop almost immediately → reopen popover and confirm “Recording too short. Try again.” appears.

---

## 4. Auth failure (401)

**Result: PASS**

**What was done:** Code path verified for 401 response handling.

**Evidence:**
- After `fetch('/api/transcribe', ...)` (357–361), `if (resp.status === 401)` (363–366): `setTranscriptError('Sign in to use voice input.')` and `return` (no JSON parse).
- Server: `server/routes/transcribe.js` returns 401 when `!req.user && !isInternalService(req)` (lines 31–33).

**Manual check (recommended):** With session cleared (or in incognito without logging in), trigger dictate, record, stop → confirm “Sign in to use voice input.” in the popover. Alternatively, in DevTools Network, override response to 401 and confirm same message.

---

## 5. Server failure (5xx)

**Result: PASS**

**What was done:** Code path verified for non-ok response and 5xx message.

**Evidence:**
- After 401 check, `if (!resp.ok)` (367–370): `setTranscriptError(resp.status >= 500 ? 'Server error. Try again later.' : 'Transcription failed.')` and `return`.
- 5xx therefore shows “Server error. Try again later.”; 4xx (other than 401) shows “Transcription failed.”

**Manual check (recommended):** In DevTools Network, block or override `/api/transcribe` to return 500 → confirm “Server error. Try again later.” in the popover.

---

## 6. Network failure

**Result: PASS**

**What was done:** Code path verified for fetch rejection / network error.

**Evidence:**
- The transcribe `fetch` is inside a try block (354–388); the catch (386–388) runs on any throw (e.g. failed request, no network): `setTranscriptError('Connection error. Check your network and try again.')`.
- `finally` (389–391) runs `setIsTranscribing(false)` so the send button and Dictate button re-enable.

**Manual check (recommended):** With DevTools Offline or request blocking for `/api/transcribe`, trigger dictate, record, stop → confirm “Connection error. Check your network and try again.” and that transcribing state clears.

---

## 7. No regressions

**Result: PASS**

**What was done:** Unit tests run; send/retry/empty-submit and transcribing-disabled behavior verified in code.

**Evidence:**
- **Normal text send:** `handleSubmit` (206–244) unchanged: trims `inputValue`, submits with `onSubmit(trimmed, ...)`, clears input and attachments. Send button still calls `handleSubmit()` when not retry (716–722).
- **Attachment send:** Same `handleSubmit` uses `docFiles` and `imageFiles`; `onSubmit(trimmed, docFiles.length > 0 ? docFiles : undefined, imageAttachments.length > 0 ? imageAttachments : undefined)`. No change.
- **Retry / empty-submit:** Send button onClick (716–722): if `canRetry && !trimmed && !hasAttachments && onRetry` then `onRetry()`, else `handleSubmit()`. `shouldDisableSendButton` still receives `canRetry`, `allowEmptySubmit`, etc. Existing unit tests: “allows retry even with empty composer”, “allows empty submit when continuation is enabled” — both pass.
- **Send re-enables after transcription:** `disabled={shouldDisableSendButton({ disabled: disabled || isTranscribing, ... })}` (725–733). So when `isTranscribing` becomes false (in `finally`), send is no longer disabled. New unit test: “disables send when disabled is true (e.g. while transcribing)” — PASS.

**Test run:**
- `npm run test -- src/tests/MessageBar.test.ts src/tests/SendButton.test.tsx`: **7 tests passed** (5 MessageBar, 2 SendButton).
- New test: `disables send when disabled is true (e.g. while transcribing)` — **PASS**.

---

## Summary

| # | Case                 | Result | Evidence |
|---|----------------------|--------|----------|
| 1 | Permission denied    | PASS   | Code: catch sets user-facing error; UI shows it in popover |
| 2 | Happy path           | PASS   | Code: record → stop → POST → setInputValue + focus |
| 3 | Too-short recording  | PASS   | Code: blob < 500 → setTranscriptError, no transcribe |
| 4 | Auth failure (401)   | PASS   | Code: resp.status === 401 → “Sign in to use voice input.” |
| 5 | Server failure (5xx)| PASS   | Code: !resp.ok && status >= 500 → “Server error. Try again later.” |
| 6 | Network failure     | PASS   | Code: catch → “Connection error…”; finally clears isTranscribing |
| 7 | No regressions      | PASS   | Unit tests + code: send/retry/empty-submit unchanged; send disabled while transcribing, re-enables in finally |

**Conclusion:** All seven checks **PASS** by code and unit-test evidence. Manual browser checks are recommended for 1–6 (permission, happy path, too-short, 401, 5xx, network) to confirm UX and real endpoints. Do not proceed to further voice-mode/TTS work until manual verification is complete if your process requires it.
