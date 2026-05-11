# Repo Documentation Audit Ledger

Date: April 5, 2026

This ledger audits the repo in four sections against the documentation named in the audit plan. Each section follows the same four passes:

1. Documentation baseline
2. Code trace
3. Evidence pass
4. Reconciliation

Subagent ownership used during the audit:

- `Hypatia`: Section A
- `Wegener`: Section B
- `Pascal`: Section C
- Main agent: Section D and final reconciliation

## Evidence Harness

Targeted commands run during this audit:

- `node --test server/tests/gpt-manager-precedence.test.js`
  - Result: pass
- `npm test -- src/lib/gptCreatorSpeaker.test.ts src/lib/gptCreatorSanitizer.test.ts --runInBand`
  - Result: pass
- `npm test -- src/engine/__tests__/seatRunner.test.ts --runInBand`
  - Result: pass
- `npm run build`
  - Result: pass with warnings only
- `sqlite3 chatty.db "<targeted construct query>"`
  - Result: confirmed duplicate `nova-001` ownership across `ais` and `gpts`

Important note:

- This audit adds documentation only. No product code, schema, or runtime behavior was changed.

## Section A: Construct Ownership and System Boundaries

### Documentation Baseline

- [`docs/plans/MULTI_USER_ISOLATION.md`](../plans/MULTI_USER_ISOLATION.md) says new-user bootstrap should create user-scoped `zen-001` and `lin-001`, and bootstrap with `["zen-001", "lin-001"]`.
- [`docs/architecture/HOUSE_RULES_ZEN_LIN.md`](../architecture/HOUSE_RULES_ZEN_LIN.md) defines Zen as the primary guaranteed construct and Lin as the persistent construct plus orchestrator.
- [`docs/implementation/CAPSULE_HARDLOCK_INTEGRATION.md`](../implementation/CAPSULE_HARDLOCK_INTEGRATION.md) explicitly labels `Nova (nova-001)` as a user-created GPT.
- [`docs/DOCUMENTS_TREE_DIGEST.md`](../DOCUMENTS_TREE_DIGEST.md) lists `zen-001` and `lin-001` as the default/core constructs.

### Code Trace

- [`server/server.js`](../../server/server.js) bootstraps `['zen-001', 'lin-001', 'sera-001', 'nova-001']` as system constructs and seeds `nova-001` into both `gpts` and `ais` with `user_id = 'system'`.
- [`server/lib/identityLoader.js`](../../server/lib/identityLoader.js) comments that embedded fallback is for system constructs and says `Zen, Lin only`, but still includes an embedded `nova-001`.
- [`server/lib/aiManager.js`](../../server/lib/aiManager.js) merges `ais` rows before `gpts` rows and deduplicates by `construct_callsign`, so a placeholder `ais` row can win the list/summary path.

### Evidence Pass

- `sqlite3 chatty.db` returned:
  - `ais|nova-001|Nova|nova-001|lin|system|openrouter/auto`
  - `gpts|gpt-nova-001-seed|Nova|nova-001|lin|devon_woodson_1762969514958|openrouter:meta-llama/llama-3.3-70b-instruct`
- `server/lib/aiManager.js` contains `// Merge: ais table rows take priority, then gpts, then Supabase rows`.
- `server/lib/identityLoader.js` contains both:
  - `system constructs only`
  - `System constructs (Zen, Lin only): Have embedded fallback for resilience`
  - plus an actual `nova-001` embedded fallback object.

### Findings

#### A1. System construct boundary drift

- Section: A
- Classification: `code wrong / docs right`
- Doc claim: Only `zen-001` and `lin-001` are the platform/system pair; `nova-001` is a user-created GPT.
- Code reality: Startup bootstrap promotes `nova-001` and `sera-001` into the system construct set and seeds a system-owned `nova-001`.
- Evidence:
  - [`docs/plans/MULTI_USER_ISOLATION.md`](../plans/MULTI_USER_ISOLATION.md)
  - [`docs/implementation/CAPSULE_HARDLOCK_INTEGRATION.md`](../implementation/CAPSULE_HARDLOCK_INTEGRATION.md)
  - [`server/server.js`](../../server/server.js)
  - `sqlite3 chatty.db` query showing `ais.nova-001` owned by `system`
- Severity: `P0`
- Fix scope: Remove `nova-001` and `sera-001` from system bootstrap logic and stop seeding a system-owned `nova-001`.
- Confidence: High

#### A2. User Nova can be shadowed by a system placeholder row

- Section: A
- Classification: `code wrong / docs right`
- Doc claim: Constructs are user-scoped, and the documented defaults are user-owned `Zen` and `Lin`, not a global system `Nova`.
- Code reality: `aiManager` list/summary merge gives `ais` precedence over `gpts` by `construct_callsign`, which lets the system `nova-001` row outrank the user-owned `Nova` row.
- Evidence:
  - [`server/lib/aiManager.js`](../../server/lib/aiManager.js)
  - `sqlite3 chatty.db` query showing both a system `ais.nova-001` and a user `gpts.nova-001`
- Severity: `P0`
- Fix scope: Apply the existing runtime-row precedence logic to `AIManager` list and callsign lookup paths so placeholder `ais` rows cannot shadow real user rows.
- Confidence: High

#### A3. Embedded identity fallback contradicts documented ownership rules

- Section: A
- Classification: `code wrong / docs right`
- Doc claim: Embedded fallback is reserved for the protected platform pair.
- Code reality: `identityLoader` says fallback is for `Zen, Lin only` but ships an embedded `nova-001` anyway.
- Evidence:
  - [`server/lib/identityLoader.js`](../../server/lib/identityLoader.js)
- Severity: `P1`
- Fix scope: Remove `nova-001` from the embedded fallback map or formalize the policy in docs if that behavior is actually intended.
- Confidence: High

## Section B: Lin Routing, Seats, and Provider Defaults

### Documentation Baseline

- [`docs/README_LIN.md`](../README_LIN.md) defines Lin as the Chatty-side construct for GPT creation, continuity, and VVAULT/Supabase work.
- [`docs/modules/lin-001.md`](../modules/lin-001.md) describes Lin as always-on undertone infrastructure and references `UnifiedLinOrchestrator`.
- [`docs/MODEL_PROVIDERS.md`](../MODEL_PROVIDERS.md) describes a hybrid provider model, presents Ollama usage directly, and says Chatty routes seat traffic through `server/routes/linChat.js`.
- The documentation set does not establish one unambiguous canonical seat-default source. `docs/MODEL_PROVIDERS.md` and `models.json` point to different defaults.

### Code Trace

- [`server/routes/linChat.js`](../../server/routes/linChat.js) defaults seats to OpenRouter-backed models.
- [`src/engine/seatRunner.ts`](../../src/engine/seatRunner.ts) contains OpenRouter seat defaults near the top, but local fallback defaults lower down.
- [`src/lib/browserSeatRunner.ts`](../../src/lib/browserSeatRunner.ts) posts to `/api/lin/generate` and carries its own local fallback tags.
- [`models.json`](../../models.json) contains local tags `phi3:latest`, `deepseek-coder:latest`, and `mistral:latest`.

### Evidence Pass

- `npm test -- src/engine/__tests__/seatRunner.test.ts --runInBand` passed, confirming the seat-runner harness works and reads `models.json`.
- `server/routes/linChat.js` sets:
  - `creative: openrouter:google/gemma-3-27b-it:free`
  - `coding: openrouter:deepseek/deepseek-chat`
  - `smalltalk: openrouter:${DEFAULT_OPENROUTER_MODEL}`
- `src/engine/seatRunner.ts` contains:
  - OpenRouter defaults near the top
  - local fallback defaults `phi3:latest`, `deepseek-coder-v2`, `mistral:instruct`
- `src/lib/browserSeatRunner.ts` contains local fallback tags `phi-3`, `deepseek-coder`, `mistral`.

### Findings

#### B1. Browser-accessible Lin routing is OpenRouter-default, not Ollama-primary

- Section: B
- Classification: `code wrong / docs right`
- Doc claim: The provider docs present a hybrid system where Ollama is a first-class path and the routing surface is `linChat`.
- Code reality: The effective browser path goes through `/api/lin/generate`, and `linChat` defaults every seat to OpenRouter unless the caller explicitly asks for an `ollama:` model.
- Evidence:
  - [`docs/MODEL_PROVIDERS.md`](../MODEL_PROVIDERS.md)
  - [`src/lib/browserSeatRunner.ts`](../../src/lib/browserSeatRunner.ts)
  - [`server/routes/linChat.js`](../../server/routes/linChat.js)
- Severity: `P1`
- Fix scope: Decide whether Lin is meant to be Ollama-primary or explicitly hybrid-default, then make `linChat` and browser seat resolution obey that single policy.
- Confidence: High

#### B2. Seat defaults have no single source of truth

- Section: B
- Classification: `both ambiguous`
- Doc claim: The audit docs do not converge on one canonical table for Lin seat defaults.
- Code reality: `models.json`, `browserSeatRunner`, `seatRunner`, and `linChat` each carry different default seat values.
- Evidence:
  - [`models.json`](../../models.json)
  - [`src/lib/browserSeatRunner.ts`](../../src/lib/browserSeatRunner.ts)
  - [`src/engine/seatRunner.ts`](../../src/engine/seatRunner.ts)
  - [`server/routes/linChat.js`](../../server/routes/linChat.js)
- Severity: `P1`
- Fix scope: Choose one authoritative default-seat source and derive every other layer from it.
- Confidence: High

#### B3. Creative-seat documentation and runtime have drifted apart

- Section: B
- Classification: `both ambiguous`
- Doc claim: `docs/MODEL_PROVIDERS.md` names a different creative default than the runtime files.
- Code reality: `linChat` and `seatRunner` both use `gemma-3-27b-it:free`, while `models.json` points to local `mistral:latest`.
- Evidence:
  - [`docs/MODEL_PROVIDERS.md`](../MODEL_PROVIDERS.md)
  - [`server/routes/linChat.js`](../../server/routes/linChat.js)
  - [`src/engine/seatRunner.ts`](../../src/engine/seatRunner.ts)
  - [`models.json`](../../models.json)
- Severity: `P2`
- Fix scope: Pick the intended creative default, update the docs, and remove the other contradictory defaults.
- Confidence: Medium-High

## Section C: GPT Creator, Create Tab, and Preview Identity

### Documentation Baseline

- [`docs/plans/GPT_CREATION_THROUGH_LIN.md`](../plans/GPT_CREATION_THROUGH_LIN.md) says Lin is the Create-tab conversational interface.
- [`docs/implementation/CREATE_VS_PREVIEW_IDENTITY.md`](../implementation/CREATE_VS_PREVIEW_IDENTITY.md) says:
  - Create Tab = Lin
  - Preview Tab = the GPT being created
- [`docs/implementation/LIN_COPILOT_IMPLEMENTATION.md`](../implementation/LIN_COPILOT_IMPLEMENTATION.md) says Lin should remain Lin, answer natively, and not break character.
- [`docs/guides/GPT_CREATOR_GUIDE.md`](../guides/GPT_CREATOR_GUIDE.md) advertises dynamic model routing and live preview behavior.

### Code Trace

- [`src/components/GPTCreator.tsx`](../../src/components/GPTCreator.tsx) contains a large create-tab Lin system prompt that hard-locks Lin identity.
- The same component uses a stale `isLinDefault` check when reopening existing configs.
- Create-tab live chat hardcodes `openrouter:mistralai/mistral-7b-instruct`.
- Preview text chat uses only `conversationModel` or `modelId`, while preview UI copy claims configured-model behavior.

### Evidence Pass

- `npm test -- src/lib/gptCreatorSpeaker.test.ts src/lib/gptCreatorSanitizer.test.ts --runInBand` passed.
- Those tests confirm:
  - assistant speaker label is `Lin:`
  - prompt-dump sanitization is present for create-tab history
- `GPTCreator.tsx` contains:
  - `const isLinDefault = !savedModel || savedModel === "openrouter:microsoft/phi-3-mini-128k-instruct";`
  - `const selectedModel = "openrouter:mistralai/mistral-7b-instruct";`
  - preview text selection from `conversationModel` or `modelId`
  - preview copy: `This is a live preview using the configured models.`

### Findings

#### C1. Create-tab Lin identity is implemented correctly

- Section: C
- Classification: `docs right / code right`
- Doc claim: Lin should speak natively in Create and remain Lin.
- Code reality: GPT Creator uses Lin-specific prompt and speaker labeling, and the targeted tests pass.
- Evidence:
  - [`docs/plans/GPT_CREATION_THROUGH_LIN.md`](../plans/GPT_CREATION_THROUGH_LIN.md)
  - [`docs/implementation/LIN_COPILOT_IMPLEMENTATION.md`](../implementation/LIN_COPILOT_IMPLEMENTATION.md)
  - [`src/components/GPTCreator.tsx`](../../src/components/GPTCreator.tsx)
  - `npm test -- src/lib/gptCreatorSpeaker.test.ts src/lib/gptCreatorSanitizer.test.ts --runInBand`
- Severity: `OK`
- Fix scope: None for identity baseline.
- Confidence: High

#### C2. Persisted Lin configs can reopen as `custom`

- Section: C
- Classification: `code wrong / docs right`
- Doc claim: Lin-mode constructs should remain identifiable as Lin-mode constructs in the creator flow.
- Code reality: Reopen-mode detection only recognizes one old Phi-3 OpenRouter value as the Lin default, so legitimate Lin-configured records can be inferred as `custom`.
- Evidence:
  - [`docs/plans/GPT_CREATION_THROUGH_LIN.md`](../plans/GPT_CREATION_THROUGH_LIN.md)
  - [`src/components/GPTCreator.tsx`](../../src/components/GPTCreator.tsx)
- Severity: `P1`
- Fix scope: Replace the stale single-model check with a shared Lin-default resolver or explicit mode persistence rule.
- Confidence: High

#### C3. GPT Creator does not consistently use the configured models it advertises

- Section: C
- Classification: `code wrong / docs right`
- Doc claim: Preview and creator behavior should respect the documented model configuration and dynamic routing story.
- Code reality:
  - Create-tab live Lin chat hardcodes one creative OpenRouter model.
  - Preview text chat uses only `conversationModel` or `modelId`.
  - Preview UI says it is using the configured models.
- Evidence:
  - [`docs/guides/GPT_CREATOR_GUIDE.md`](../guides/GPT_CREATOR_GUIDE.md)
  - [`src/components/GPTCreator.tsx`](../../src/components/GPTCreator.tsx)
- Severity: `P1`
- Fix scope: Route create-tab and preview model selection through one shared resolver that reflects actual configuration and seat intent.
- Confidence: High

## Section D: Persistence, User Scoping, and Evidence Harness

### Documentation Baseline

- [`docs/plans/MULTI_USER_ISOLATION.md`](../plans/MULTI_USER_ISOLATION.md) says queries should always scope to `user_id`.
- [`docs/guides/FIX_GPT_RUNTIME_TYPE_SEPARATION.md`](../guides/FIX_GPT_RUNTIME_TYPE_SEPARATION.md) says GPTs and runtimes need explicit type separation instead of heuristic filtering.
- [`docs/implementation/CONSTRUCT_DETECTION_MATCHING_PERSISTENCE_SYSTEM.md`](../implementation/CONSTRUCT_DETECTION_MATCHING_PERSISTENCE_SYSTEM.md) frames construct persistence and drift prevention as a production system, not best-effort heuristics.

### Code Trace

- [`server/lib/aiManager.js`](../../server/lib/aiManager.js) has scoped callsign lookups when `userId` is provided, but also has unscoped callsign lookups when it is omitted.
- [`server/lib/gptManager.js`](../../server/lib/gptManager.js) ships a correct `mergeRuntimeRowsForCallsign()` helper for placeholder-hydration precedence.
- [`server/lib/gptManager.js`](../../server/lib/gptManager.js) `getGPTByCallsign()` is unscoped and reads `ais` first.
- [`server/lib/aiManager.js`](../../server/lib/aiManager.js) `getAllAIs()` still performs raw `ais`-first deduplication instead of using the precedence helper.

### Evidence Pass

- `node --test server/tests/gpt-manager-precedence.test.js` passed.
- That test proves the intended precedence rule already exists:
  - hydrate from `gpts` when `ais` uses placeholders like `openrouter/auto`
  - keep `ais` authoritative when its values are explicit
- `sqlite3 chatty.db` confirmed duplicate `nova-001` ownership across `ais` and `gpts`.
- `npm run build` passed, so the current drift is not blocked by compile failures.

### Findings

#### D1. Some callsign lookups still bypass user scoping

- Section: D
- Classification: `code wrong / docs right`
- Doc claim: Queries should always scope to the requesting user.
- Code reality: `getRawAIRowByCallsign()` and `getGPTByCallsign()` both support unscoped callsign reads when no `userId` is passed.
- Evidence:
  - [`docs/plans/MULTI_USER_ISOLATION.md`](../plans/MULTI_USER_ISOLATION.md)
  - [`server/lib/aiManager.js`](../../server/lib/aiManager.js)
  - [`server/lib/gptManager.js`](../../server/lib/gptManager.js)
- Severity: `P1`
- Fix scope: Require scoped callsign lookups for user-owned constructs and reserve unscoped behavior only for an explicit protected-system path.
- Confidence: High

#### D2. The precedence rule exists in tests but is not applied consistently in live merge paths

- Section: D
- Classification: `code wrong / docs right`
- Doc claim: Persistence and matching behavior should be deterministic and safe for user-owned constructs.
- Code reality: `mergeRuntimeRowsForCallsign()` is tested and correct in `gptManager`, but `AIManager` list and summary paths still use raw `ais`-first dedupe.
- Evidence:
  - [`server/tests/gpt-manager-precedence.test.js`](../../server/tests/gpt-manager-precedence.test.js)
  - [`server/lib/gptManager.js`](../../server/lib/gptManager.js)
  - [`server/lib/aiManager.js`](../../server/lib/aiManager.js)
  - `sqlite3 chatty.db` duplicate `nova-001` rows
- Severity: `P0`
- Fix scope: Reuse the precedence helper in `AIManager` list, summary, and callsign lookup flows.
- Confidence: High

#### D3. Runtime type separation remains documented but not enforced

- Section: D
- Classification: `code wrong / docs right`
- Doc claim: GPTs and runtimes need explicit type separation.
- Code reality: The audited storage layer still relies on overlapping `gpts` and `ais` behavior without the documented explicit type boundary.
- Evidence:
  - [`docs/guides/FIX_GPT_RUNTIME_TYPE_SEPARATION.md`](../guides/FIX_GPT_RUNTIME_TYPE_SEPARATION.md)
  - [`server/lib/gptManager.js`](../../server/lib/gptManager.js)
  - [`server/lib/aiManager.js`](../../server/lib/aiManager.js)
- Severity: `P2`
- Fix scope: Add explicit ownership/type metadata after the P0/P1 construct-boundary fixes land.
- Confidence: Medium

## Ranked Fix Backlog

### P0 platform-boundary bugs

- Remove `nova-001` and `sera-001` from system bootstrap and stop seeding a system-owned `nova-001`.
- Apply runtime-row precedence logic to `AIManager` so a placeholder `ais` row cannot shadow a user-owned construct.

### P1 Lin routing and GPT Creator drift

- Choose and enforce one authoritative Lin seat-default source.
- Make browser-accessible Lin routing obey the chosen provider-default policy.
- Fix GPT Creator reopen-mode inference for persisted Lin configs.
- Stop hardcoding creator/preview model selection outside the shared resolver.
- Require scoped callsign lookups for user-owned constructs.

### P2 doc cleanup and longer-term persistence hardening

- Reconcile `docs/MODEL_PROVIDERS.md`, `models.json`, `seatRunner`, and `linChat` once one default-seat policy is chosen.
- Remove or document the `identityLoader` embedded `nova-001` fallback.
- Implement explicit GPT/runtime or system/user type separation after immediate construct-boundary issues are fixed.

## Final Reconciliation

Highest-confidence conclusion:

- The documentation is materially more coherent than the implementation for construct ownership.
- The implementation drift is strongest in bootstrap, ownership precedence, and creator/runtime model resolution.
- The most urgent issue is not that all constructs are system-level; it is that a few system/bootstrap shortcuts allow a system placeholder row to impersonate a user construct.
