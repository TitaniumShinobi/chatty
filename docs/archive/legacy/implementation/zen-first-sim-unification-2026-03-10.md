# Zen-First Sim Unification (2026-03-10)

## Scope Implemented
- Unified construct inference around Chatty's existing authoritative `/api/vvault/message` handler.
- Added first-class authenticated construct endpoint: `POST /api/construct/:callsign`.
- Enforced strict identity/capsule preflight before all LLM calls.
- Aligned memory retrieval ordering in `memoryContextBuilder` as:
  1. Recent STM (thread history)
  2. Memup semantic retrieval (LTM)
  3. Needle transcript recall (memory-intent turns)
- Switched Quantum Zen runtime default from local OpenAI/agent path to Chatty construct runtime.
- Added non-stream runtime adapter abstraction for future server streaming migration.

## API Contract

### New endpoint
- `POST /api/construct/:callsign`
- Auth: same auth path as `vvault` route (`requireAuthOrServiceToken`)
- Request body:
  - `message` (required)
  - `threadId?`
  - `sessionId?`
  - `attachments?`
  - `continueTurn?`
  - `systemPromptOverride?`

### Response body
- Success:
  - `ok: true`
  - `constructId`
  - `response`
  - `provider_used`
  - `model`
  - `tool_trace?`
  - `deferred?`
- Failure:
  - `ok: false`
  - `constructId`
  - `code`
  - `error`
  - `details?`
  - `deferred?`

## Strict Identity Preflight
- Added `server/lib/identityBundlePreflight.js`.
- Required bundle before inference:
  - `prompt`
  - `conditioning`
  - loaded capsule via `capsuleIntegration`
- Fail-closed behavior:
  - `IDENTITY_BUNDLE_MISSING`
  - `IDENTITY_BUNDLE_INVALID`
- Returned with HTTP `503` and no provider fallback when preflight fails.

## Chatty Routing
- Converted `/api/vvault/message` handler into exported shared function:
  - `handleConstructInference(req, res)` in `server/routes/vvault.js`
- Route still mounted as:
  - `POST /api/vvault/message`
- New construct router delegates to the same shared handler and normalizes response shape:
  - `server/routes/construct.js`
- Mounted in `server/server.js` as:
  - `app.use('/api/construct', requireAuthOrServiceToken, constructRoutes)`

## Memory Pipeline Changes
- `server/lib/memoryContextBuilder.js`
  - Added STM section from recent thread history (`buildRecentStmSection`).
  - Added Memup semantic section (`buildMemupMemorySection`).
  - Added Memup retrieval phase via `memupMemoryService.queryMemories`.
  - Reused cached conversation messages for transcript fallback extraction.
  - Updated evidence counting and prompt assembly ordering to include STM + Memup.

## Memup Bridge Contract
- Added Python CLI adapter:
  - `frame/Terminal/memup/cli_adapter.py`
- Exposes stable commands:
  - `add_memory`
  - `query_memories`
  - `health`
- Updated Node bridge to call adapter:
  - `server/services/memupMemoryService.js`
- Added `health()` helper to service.
- Adapter includes fallback store in `/tmp` when Chroma operations are unavailable.

## Quantum Runtime Integration
- Added runtime adapter service:
  - `quantum/apps/electron-shell/src/main/services/zenRuntimeService.ts`
  - `ChattyConstructRuntime` (default)
  - `LocalAgentRuntime` (fallback, opt-in via `ZEN_RUNTIME_MODE=local`)
- Updated Zen IPC handler in:
  - `quantum/apps/electron-shell/src/main/main.ts`
- `zen:sendMessage` now:
  - persists user message via existing append endpoint,
  - calls runtime adapter (default Chatty `/api/construct/zen`),
  - emits `zen:done` with full response,
  - persists assistant message via existing append endpoint.

## Tests Added
- Quantum:
  - `quantum/apps/electron-shell/src/main/services/zenRuntimeService.test.ts`
- Chatty (manual-target tests outside current Jest root):
  - `chatty/server/tests/identity-bundle-preflight.test.ts`
  - `chatty/server/tests/memup-cli-adapter.test.ts`

## Verification Run
- `python3 -m py_compile chatty/frame/Terminal/memup/cli_adapter.py`
- `node --check` on changed Chatty JS files
- `npm run test -- src/main/services/zenRuntimeService.test.ts` in `quantum/apps/electron-shell`
- `npm run typecheck` in `quantum/apps/electron-shell`

## Notes
- Zen transcript endpoints were unchanged:
  - `GET /api/vvault/zen/thread`
  - `POST /api/vvault/zen/thread/append`
- Streaming remains non-server-stream for this pass; adapter boundary is in place for future stream upgrade.
