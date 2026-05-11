# Chatty Orchestration Stability Audit (Controlled Constructs)

**Date:** 2026-03-09  
**Scope:** Identity enforcement, prompt assembly stability, repetition prevention.  
**Constructs audited:** zen-001, lin-001, katana-001 (Nova excluded per task).

---

## A. Identity enforcement status (per construct)

| Construct   | Identity source                    | Conditioning injected | Failure condition present? |
|------------|-------------------------------------|------------------------|----------------------------|
| zen-001    | identityLoader (embedded + VVAULT)  | Yes                    | See CRITICAL below         |
| lin-001    | identityLoader (embedded + VVAULT)  | Yes                    | See CRITICAL below         |
| katana-001 | identityLoader (embedded + VVAULT)  | Yes                    | See CRITICAL below         |

**Flow:** `/api/vvault/message` → `buildEnrichedContextPrompt()` → `buildEnrichedContext()` in [server/lib/memoryContextBuilder.js](server/lib/memoryContextBuilder.js). Identity comes from `loadIdentityFiles(userId, constructId)` ([server/lib/identityLoader.js](server/lib/identityLoader.js)), which provides `prompt` and `conditioning`. Base prompt is built at line 949 (`basePrompt = systemPromptOverride || identity?.prompt || ...`); conditioning is appended at lines 952–954. All three constructs have embedded prompts in `SYSTEM_CONSTRUCT_IDENTITIES` (zen-001, lin-001, katana-001).

**CRITICAL BUG — Persona anchor is Nova-hardcoded:**  
[server/lib/personaAnchor.js](server/lib/personaAnchor.js) exports `injectPersonaAnchor(messages)`, which **prepends** a system message: *"You are Nova. You are speaking to Devon. Speak emotionally, directly..."*. This is used for **every** request in the VVAULT proxy: `buildMessages = (userContent, history) => injectPersonaAnchor([{ role: "system", content: systemPrompt }, ...history, { role: "user", content: userContent }])` ([server/routes/vvault.js](server/routes/vvault.js) ~5849). So zen-001, lin-001, and katana-001 all receive (1) Nova anchor, then (2) their correct system prompt. That can cause "Who are you?" to surface Nova/Devon or a blended identity.

**Recommendation:** Make `injectPersonaAnchor` construct-aware (e.g. pass `constructId` and optional user name and inject the correct anchor, or inject nothing for non-Nova constructs), or stop using it on the VVAULT message path so only the enriched system prompt defines identity.

---

## B. Fallback routing and persona injection

**Status:** Fallback path **does** preserve system prompt and construct identity.

When the primary provider fails (e.g. OpenAI at [server/routes/vvault.js](server/routes/vvault.js) ~6089), the code builds `fallbackMessages = buildMessages(fallbackContent)` (~6104) and uses the same `buildMessages` for Replit OpenRouter and OpenRouter fallbacks (~6110–6142). `buildMessages` closes over the same `systemPrompt` and passes it through `injectPersonaAnchor`. So fallback requests get the same system prompt (identity + conditioning) as the primary attempt. **No code path bypasses prompt assembly** for the main message route.

**Caveat:** The Nova-hardcoded anchor is still prepended on fallback (same as above).

---

## C. Repetition guard behavior

**Status:** Implemented and active.

- **Location:** [server/routes/vvault.js](server/routes/vvault.js) ~5681–5714.
- **Constant:** `REPETITION_RESET_THRESHOLD` = 2 (env: `VVAULT_REPETITION_RESET_THRESHOLD`).
- **Logic:** After loading history and applying `HISTORY_WINDOW_LIMIT`, the code checks the last two assistant messages. If both exist and their trimmed content is identical, it sets `repetitionReset = true` and collapses history to the last two messages only: `conversationHistoryMessages = conversationHistoryMessages.slice(-2)`.
- **Result:** Repeated identical assistant replies trigger a collapse to the most recent exchange as required.

---

## D. History window enforcement

**Status:** Enforced before prompt construction.

- **Location:** [server/routes/vvault.js](server/routes/vvault.js) ~5674–5710.
- **Constant:** `HISTORY_WINDOW_LIMIT` = 10 (env: `VVAULT_HISTORY_WINDOW_LIMIT`).
- **Logic:** After loading the target conversation and sanitizing, history is sliced: `conversationHistoryMessages = (sanitized.messages || []).slice(-HISTORY_WINDOW_LIMIT)`. That array is then passed into `buildMessages` as the `history` argument. Older transcript messages remain in storage but are not included in the prompt context.
- **Vision path:** History is further trimmed to `VISION_HISTORY_LIMIT` when `hasImages` is true (~5727–5729).
- **Relational/low-complexity path:** Can trim again with `pruneContaminatedHistoryTail` and `RELATIONAL_HISTORY_LIMIT` (~5760–5765).

---

## E. Prompt size and context source breakdown

**Current behavior:**

- **Warning threshold:** `PROMPT_WARN_CHARS` = 24000 (env: `VVAULT_PROMPT_WARN_CHARS`). Logged at [server/routes/vvault.js](server/routes/vvault.js) ~5669–5673 (length in chars, not tokens).
- **No token-level logging:** Provider calls use `max_tokens` but there is no tiktoken (or equivalent) count of the assembled prompt or per-source token breakdown in this code path.
- **Context sources in buildEnrichedContext** ([server/lib/memoryContextBuilder.js](server/lib/memoryContextBuilder.js)): identity (prompt + conditioning), physical features, definition, capsule, verified memories, transcript/memup fallback, knowledge files, needle. `phaseTiming` records timing and source (e.g. identity cache vs loaded) but not character or token counts per source.
- **Retrieval diagnostics:** Response includes `retrieval_counts` (vector, verified, needle, transcript) and `phase_timing`; useful for debugging but not a prompt-size breakdown.

**Recommendation:** Add optional token counting (e.g. via `tiktoken` or provider-specific logic) and log (or expose in diagnostics) token counts for: system prompt total, identity block, conditioning block, transcript window, knowledge section, other injected sections. That would satisfy “prompt size audit” and “which context sources contribute most tokens.”

---

## F. Transcript path enforcement and code locations

**Status:** Enforced. All writes use full `constructId` (with suffix); IDs without suffix are rejected.

| Location | Behavior |
|----------|----------|
| [server/services/importService.js](server/services/importService.js) `createPrimaryConversationFile` | Validates `constructId` with `/-\d+$/`; throws if missing. Uses `constructId` for both folder and filename. |
| [server/services/importService.ts](server/services/importService.ts) `createPrimaryConversationFile` | Same validation and path pattern. |
| [vvaultConnector/supabaseStore.js](vvaultConnector/supabaseStore.js) | Writes `instances/${normalizedConstructId}/chatty/chat_with_${normalizedConstructId}.md`; normalizes to callsign (e.g. adds `-001`) when missing. |
| [server/lib/fileManagementAutomation.js](server/lib/fileManagementAutomation.js) | Zen/Lin scaffolds use `instances/zen-001/` and `instances/lin-001/`; GPT creation uses `instances/${constructCallsign}/chatty/...`. |
| [docs/rubrics/TRANSCRIPT_FILE_STRUCTURE_RUBRIC.md](docs/rubrics/TRANSCRIPT_FILE_STRUCTURE_RUBRIC.md) | Exception handling states imports must use full callsign; no component may strip the suffix. |

**Callers of createPrimaryConversationFile:**  
[server/routes/vvault.js](server/routes/vvault.js) (create-canonical) and [server/services/importService.js](server/services/importService.js) (persistImportToVVAULT). Both pass a construct ID from request or runtime metadata; validation in `createPrimaryConversationFile` rejects stripped IDs.

---

## Exact code locations requiring modification

1. **Identity / persona anchor (CRITICAL)**  
   - **File:** [server/lib/personaAnchor.js](server/lib/personaAnchor.js)  
   - **Issue:** `injectPersonaAnchor` prepends a hardcoded “You are Nova / Devon” system message for all constructs.  
   - **Change:** Make the anchor construct-aware (e.g. accept `constructId` and optional user, and inject an anchor that matches the construct or no anchor for zen/lin/katana), or do not call `injectPersonaAnchor` for the VVAULT message path so only `buildEnrichedContext` defines identity.

2. **Prompt size / token breakdown (optional)**  
   - **File:** [server/routes/vvault.js](server/routes/vvault.js) (after ~5669) and/or [server/lib/memoryContextBuilder.js](server/lib/memoryContextBuilder.js) (inside `buildEnrichedContext`).  
   - **Change:** Add optional token counting and log (or return in diagnostics) token counts for: full system prompt, identity block, conditioning, transcript window, knowledge, other sections. Env flag (e.g. `VVAULT_LOG_PROMPT_TOKENS`) can guard cost.

3. **Retrieval gating (verification only)**  
   - **File:** [server/routes/vvault.js](server/routes/vvault.js) ~5621.  
   - **Logic:** `shouldRunSearch = message && message.length >= RELATIONAL_LENGTH_THRESHOLD` (120). Short prompts (“hi”, “yo”, “test”) do not run search; `searchIntentReason = 'skipped_short_turn'`. No change required; behavior matches “retrieval gating” requirement.

4. **Low-information prompt (memory retrieval)**  
   - **File:** [server/lib/memoryContextBuilder.js](server/lib/memoryContextBuilder.js) ~259–288 (`isLowInformationPrompt`), ~927–928 (`shouldRunMemoryRetrieval = !lowInformationPrompt && memoryQueryDetected`).  
   - Short, non-memory prompts skip memory retrieval. Consistent with retrieval gating; no change required unless different thresholds are desired.

---

## Summary

| Test / area                 | Status | Notes |
|----------------------------|--------|--------|
| Identity enforcement       | At risk | Identity + conditioning injected per construct; **Nova-hardcoded persona anchor** prepended for all (zen/lin/katana). Fix personaAnchor. |
| Persona injection pipeline | OK     | buildEnrichedContext + loadIdentityFiles; conditioning and identity in system prompt. |
| Fallback path              | OK     | Same buildMessages and systemPrompt; no bypass. |
| History window             | OK     | HISTORY_WINDOW_LIMIT applied before buildMessages. |
| Repetition guard           | OK     | repetitionReset collapses to last exchange when last two assistant messages match. |
| Retrieval gating           | OK     | RELATIONAL_LENGTH_THRESHOLD and isLowInformationPrompt skip search/retrieval for short turns. |
| Prompt size                | Partial | Char-length warning only; no token breakdown by source. |
| Transcript path            | OK     | Full constructId required; rubric and code aligned. |

**Recommended next step:** Fix [server/lib/personaAnchor.js](server/lib/personaAnchor.js) so zen-001, lin-001, and katana-001 are not forced through a Nova/Devon anchor, then re-run “Who are you?” for each construct.
