# Orchestration Surface Inventory

Status: canonical live contract

Source-of-truth inputs:
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-canon-rubric.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/src/lib/aiService.ts`

Use this file as the explicit repo map that sits underneath the rubric. It answers "what is live now, what is transitional, and what is residue?" without pretending every live-looking surface is canonical.

## Canonical Live

### `/api/vvault/message` construct-quality turn path

- **Class**: `canonical live contract`
- **What it does now**: Owns construct-quality inference for main chat and GPTCreator preview, returning `runtime_receipt` and `orchestration_checklist`, and it can still expose proxy or fallback backend modes without surrendering route ownership.
- **Why it is not lower**: Live standards explicitly assign construct-quality turns to this route and its receipt contract.
- **Proof anchors**:
  - [orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md)
  - [src/lib/aiService.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/aiService.ts)
  - [server/routes/vvault.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js)

### `runtime_receipt` and `orchestration_checklist`

- **Class**: `canonical live contract`
- **What it does now**: Carries runtime truth for identity, seat plan, provider/model, preview state, persistence owner, and guard results.
- **Why it is not lower**: Current canon requires runtime proof to live here rather than in chat explanation.
- **Proof anchors**:
  - [orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md)
  - [server/lib/orchestrationChecklist.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/orchestrationChecklist.js)
  - [server/routes/vvault.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js)

### `chatty-cli` backend operator surface

- **Class**: `canonical live contract`
- **What it does now**: Provides the canonical terminal operator surface, construct picker, Lin-first backend policy, and receipt/checklist inspection while delegating construct-quality turns to `/api/vvault/message`.
- **Why it is not lower**: Backend mode is the default operator path, it uses the current receipt-backed turn route, and it exposes orchestration truth instead of inventing a parallel runtime.
- **Proof anchors**:
  - [package.json](/Users/devonwoodson/Documents/GitHub/chatty/package.json)
  - [src/cli/chatty-cli.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/cli/chatty-cli.ts)
  - [src/cli/apiClient.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/cli/apiClient.ts)
  - [src/cli/settingsManager.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/cli/settingsManager.ts)

### `memoryContextBuilder`

- **Class**: `canonical live contract`
- **What it does now**: Assembles construct memory, preview overlay rules, live needle retrieval, and capsule enrichment for the canonical turn path.
- **Why it is not lower**: It is part of the actual construct-quality runtime seam, not just a helper library.
- **Proof anchors**:
  - [server/lib/memoryContextBuilder.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/memoryContextBuilder.js)
  - [docs/reference/constructs-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md)

### JS selfprompt path

- **Class**: `canonical live contract`
- **What it does now**: Owns live proactive initiation through the JS runtime and `/api/selfprompt`.
- **Why it is not lower**: Current canon explicitly assigns proactive behavior here, not to Python legacy scripts.
- **Proof anchors**:
  - [server/lib/selfpromptEngine.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/selfpromptEngine.js)
  - [server/routes/selfprompt.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/selfprompt.js)
  - [docs/reference/constructs-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md)

### JS needle and capsule context path

- **Class**: `canonical live contract`
- **What it does now**: Runs live retrieval and capsule enrichment inside the canonical context builder path.
- **Why it is not lower**: These are no longer fallback myths or manual utilities; they are part of normal runtime context assembly.
- **Proof anchors**:
  - [server/lib/masterScriptsBridge.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/masterScriptsBridge.js)
  - [server/lib/capsuleIntegration.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/capsuleIntegration.js)
  - [server/lib/memoryContextBuilder.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/memoryContextBuilder.js)

### Runtime policy and fail-closed gates

- **Class**: `canonical live contract`
- **What it does now**: Enforces runtime policy, identity-bundle preflight, assignment QA, and identity/coherence blocking before a construct-quality turn can persist as canonical.
- **Why it is not lower**: These are live checklist stages and blocking gates, not prompt folklore.
- **Proof anchors**:
  - [server/lib/constructRuntimePolicy.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/constructRuntimePolicy.js)
  - [server/lib/orchestrationChecklist.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/orchestrationChecklist.js)
  - [server/routes/vvault.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js)

### Canonical construct ownership and persistence semantics

- **Class**: `canonical live contract`
- **What it does now**: Rewrites canonical ownership for protected construct threads and marks canonical Supabase persistence separately from fallback or blocked write states.
- **Why it is not lower**: Ownership and persistence outcomes are part of live orchestration truth, not just storage plumbing.
- **Proof anchors**:
  - [server/lib/canonicalConstructOwner.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/canonicalConstructOwner.js)
  - [server/routes/vvault.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js)
  - [server/tests/zen-canonical-owner.test.js](/Users/devonwoodson/Documents/GitHub/chatty/server/tests/zen-canonical-owner.test.js)

### Research workflow receipt protocol

- **Class**: `canonical live contract`
- **What it does now**: Gives `/research` turns dedicated receipt and checklist semantics for web search, source balance, citation posture, and report structure.
- **Why it is not lower**: These are live, test-backed orchestration stages inside the canonical route.
- **Proof anchors**:
  - [server/lib/researchWorkflowReceipt.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/researchWorkflowReceipt.js)
  - [server/lib/orchestrationChecklist.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/orchestrationChecklist.js)
  - [server/tests/research-workflow-receipt.test.js](/Users/devonwoodson/Documents/GitHub/chatty/server/tests/research-workflow-receipt.test.js)

## Implemented Transitional

### `/api/orchestration` bridge wrappers

- **Class**: `implemented transitional`
- **What it does now**: Provides real mounted bridge routes and wrappers for optional orchestration experiments when explicit flags are on.
- **Why it is not higher**: It is not the construct-quality route and does not define live receipt-backed canon.
- **Why it is not lower**: It is genuinely implemented and mounted, so it must be classified rather than ignored.
- **Proof anchors**:
  - [server/routes/orchestration.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/orchestration.js)
  - [server/services/orchestrationBridge.js](/Users/devonwoodson/Documents/GitHub/chatty/server/services/orchestrationBridge.js)
  - [src/lib/orchestrationBridge.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/orchestrationBridge.ts)

### `masterScriptsBridge`

- **Class**: `implemented transitional`
- **What it does now**: Carries older VVAULT master-script concepts into the current JS runtime, including live needle and bootstrap helpers.
- **Why it is not higher**: It is still an adapter layer, not the clean promoted contract.
- **Why it is not lower**: Real live behavior depends on it in places.
- **Proof anchors**:
  - [server/lib/masterScriptsBridge.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/masterScriptsBridge.js)
  - [server/server.js](/Users/devonwoodson/Documents/GitHub/chatty/server/server.js)
  - [src/components/Layout.tsx](/Users/devonwoodson/Documents/GitHub/chatty/src/components/Layout.tsx)

### `chatty-cli` local runtime fallback

- **Class**: `implemented transitional`
- **What it does now**: Preserves the explicit local-only seat runtime, local memory stack, and shell-like file operations when the operator chooses `--local`, `--local-model`, or `--fallback`.
- **Why it is not higher**: It is not the receipt-backed construct-quality turn route and does not define canonical runtime truth on its own.
- **Why it is not lower**: It is still real, callable, and useful as explicit fallback/operator utility behavior.
- **Proof anchors**:
  - [src/cli/chatty-cli.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/cli/chatty-cli.ts)
  - [src/engine/ConversationCore.js](/Users/devonwoodson/Documents/GitHub/chatty/src/engine/ConversationCore.js)
  - [src/cli/fileOpsCommands.js](/Users/devonwoodson/Documents/GitHub/chatty/src/cli/fileOpsCommands.js)

### Construct-backed conversation storage

- **Class**: `implemented transitional`
- **What it does now**: Defines the canonical construct transcript path shape and uses VVAULT-backed browser persistence for live conversations.
- **Why it is not higher**: Canonical storage shape exists, but merged legacy rows and dual-write residue still mean transcript ownership is not as clean as the target canon.
- **Why it is not lower**: This is the real storage lane the browser runtime is already trying to honor.
- **Proof anchors**:
  - [server/lib/conversationRepository.js](/Users/devonwoodson/Documents/GitHub/chatty/server/lib/conversationRepository.js)
  - [server/routes/conversations.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/conversations.js)
  - [src/lib/vvaultConversationManager.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/vvaultConversationManager.ts)

### GPTCreator seams that are real but not fully canonicalized

- **Class**: `implemented transitional`
- **What it does now**: Uses canonical preview through `/api/vvault/message`, surfaces runtime receipts, and provides the active forge-facing construct authoring UI.
- **Why it is not higher**: Parallel save and older create-tab/editor seams still diverge from the clean canon.
- **Why it is not lower**: This is the real routed forge surface today.
- **Proof anchors**:
  - [src/components/GPTCreator.tsx](/Users/devonwoodson/Documents/GitHub/chatty/src/components/GPTCreator.tsx)
  - [server/routes/simForge.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/simForge.js)
  - [src/pages/SimForge.tsx](/Users/devonwoodson/Documents/GitHub/chatty/src/pages/SimForge.tsx)

### Broad model-provider catalog and selector surfaces

- **Class**: `implemented transitional`
- **What it does now**: Exposes live provider/model catalogs, Lin defaults, and model-selection utilities across Chatty UI surfaces.
- **Why it is not higher**: The current provider catalog still speaks more like a swappable model menu than the promoted direction of enduring construct-grade runtimes that get smarter over time.
- **Why it is not lower**: These surfaces are live and materially shape how runtime choices are described and selected today.
- **Proof anchors**:
  - [src/lib/modelProviders.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/modelProviders.ts)
  - [docs/reference/model-providers.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/model-providers.md)
  - [src/config/linModelDefaults.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/config/linModelDefaults.ts)

### `/api/ais` saved mode/model normalization

- **Class**: `implemented transitional`
- **What it does now**: Normalizes saved AI mode and model metadata before canonical conversation routing runs.
- **Why it is not higher**: It materially shapes runtime truth, but it is a preprocessing stabilization seam rather than the final construct-quality route itself.
- **Why it is not lower**: It is mounted, live, and directly relevant to stale provider/model cleanup.
- **Proof anchors**:
  - [server/routes/ais.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/ais.js)
  - [server/server.js](/Users/devonwoodson/Documents/GitHub/chatty/server/server.js)
  - [server/tests/canonical-conversation-engine.test.js](/Users/devonwoodson/Documents/GitHub/chatty/server/tests/canonical-conversation-engine.test.js)

## Unwired Design Intent Worth Preserving

### Zen mode envelope and product registry scaffold

- **Class**: `unwired design intent worth preserving`
- **What it does now**: Preserves a future-facing mode envelope for one Zen thread across products and a registry that defines boundary, scope, and approval posture per product.
- **Why it is not higher**: It is direction-setting and partially scaffolded, but not yet universal live canon.
- **Proof anchors**:
  - [docs/standards/zen-mode-surfaces.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/zen-mode-surfaces.md)
  - [src/lib/zenProductRegistry.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/zenProductRegistry.ts)

### Create-tab vs preview-tab identity split

- **Class**: `unwired design intent worth preserving`
- **What it does now**: Preserves the rule that Lin may help create a GPT while preview must speak as the target construct.
- **Why it is not higher**: The direction is still relevant, but the repo has parallel forge/editor seams that do not fully honor it yet.
- **Proof anchors**:
  - [docs/archive/legacy/implementation/CREATE_VS_PREVIEW_IDENTITY.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/archive/legacy/implementation/CREATE_VS_PREVIEW_IDENTITY.md)
  - [src/components/GPTCreator.tsx](/Users/devonwoodson/Documents/GitHub/chatty/src/components/GPTCreator.tsx)

### Memory, capsule, and needle target architecture

- **Class**: `unwired design intent worth preserving`
- **What it does now**: Preserves the intended always-on memory, capsule, retrieval, and anti-roleplay architecture that still shapes current canon discussions.
- **Why it is not higher**: Some historical "current state" claims drifted, but the target architecture still matters to what Chatty is becoming.
- **Proof anchors**:
  - [docs/archive/legacy/architecture/MEMORY_ORCHESTRATION_PLAN.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/archive/legacy/architecture/MEMORY_ORCHESTRATION_PLAN.md)
  - [docs/archive/legacy/architecture/CAPSULE_INTEGRATION_PIPELINE.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/archive/legacy/architecture/CAPSULE_INTEGRATION_PIPELINE.md)
  - [docs/archive/legacy/architecture/MASTER_SCRIPTS_ENSEMBLE.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/archive/legacy/architecture/MASTER_SCRIPTS_ENSEMBLE.md)

### Agent Squad as optional experimental branch

- **Class**: `unwired design intent worth preserving`
- **What it does now**: Preserves the idea of an optional multi-agent layer above existing processors without replacing current memory or identity ownership.
- **Why it is not higher**: This remains experimental branch direction, not current runtime truth.
- **Proof anchors**:
  - [orchestration/README.md](/Users/devonwoodson/Documents/GitHub/chatty/orchestration/README.md)
  - [orchestration/agent_squad_manager.py](/Users/devonwoodson/Documents/GitHub/chatty/orchestration/agent_squad_manager.py)

### Orchestrator-owned persona path

- **Class**: `unwired design intent worth preserving`
- **What it does now**: Preserves a concrete direction for persona routing, undertone capsule stabilization, triad recovery, and injected memories under an orchestrator-owned path.
- **Why it is not higher**: This is still direction code and preserved architecture, not the clean final promoted runtime. Its file-level `Lin = Synth` language is superseded and must not be treated as current identity canon.
- **Proof anchors**:
  - [src/lib/ai.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/ai.ts)
  - [src/engine/orchestration/UnifiedLinOrchestrator.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/engine/orchestration/UnifiedLinOrchestrator.ts)

## Helper-Only Live

### Browser seat runner and `/api/lin/generate`

- **Class**: `helper-only live surface`
- **What it does now**: Supports browser-compatible seat calls, Lin helper generation, and seat experiments outside the construct-quality route.
- **Why it is not higher**: The helper itself says construct-quality conversation must use `/api/vvault/message`, not this path.
- **Proof anchors**:
  - [src/lib/browserSeatRunner.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/browserSeatRunner.ts)
  - [server/routes/linChat.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/linChat.js)
  - [docs/reference/model-providers.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/model-providers.md)

### `/api/orchestration/identity`

- **Class**: `helper-only live surface`
- **What it does now**: Loads identity-file data for helper flows and bridge experiments.
- **Why it is not higher**: It does not prove conversation, memory, receipt, or persistence truth by itself.
- **Proof anchors**:
  - [server/routes/orchestration.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/orchestration.js)
  - [src/lib/linConversation.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/linConversation.ts)
  - [src/engine/optimizedZen.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/engine/optimizedZen.ts)

### Capsule helper and generation surfaces

- **Class**: `helper-only live surface`
- **What it does now**: Supports capsule generation, loading, preview, and bridge tooling around the canonical runtime.
- **Why it is not higher**: These helpers do not own active construct voice or turn canon by themselves.
- **Proof anchors**:
  - [server/routes/vvault.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js)
  - [server/services/capsuleForgeBridge.py](/Users/devonwoodson/Documents/GitHub/chatty/server/services/capsuleForgeBridge.py)

## Legacy / Reference

### `orchestration/` Python bridge owner docs

- **Class**: `legacy/reference`
- **What it does now**: Preserves the optional Agent Squad Python bridge architecture and placeholder manager shape.
- **Why it is not higher**: It is not the current construct-quality route and the Python manager is not the live owner of orchestration truth.
- **Proof anchors**:
  - [orchestration/README.md](/Users/devonwoodson/Documents/GitHub/chatty/orchestration/README.md)
  - [orchestration/agent_squad_manager.py](/Users/devonwoodson/Documents/GitHub/chatty/orchestration/agent_squad_manager.py)

### `vvault_scripts/master/self_prompt.py`

- **Class**: `legacy/reference`
- **What it does now**: Preserves historical proactive-initiation logic.
- **Why it is not higher**: Live proactive behavior belongs to the JS selfprompt runtime and `/api/selfprompt`.
- **Proof anchors**:
  - [vvault_scripts/master/self_prompt.py](/Users/devonwoodson/Documents/GitHub/chatty/vvault_scripts/master/self_prompt.py)
  - [docs/reference/constructs-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md)

### `vvault_scripts/master/needle.py`

- **Class**: `legacy/reference`
- **What it does now**: Preserves historical manual retrieval logic.
- **Why it is not higher**: Live retrieval ownership is the JS path used by the canonical context builder.
- **Proof anchors**:
  - [vvault_scripts/master/needle.py](/Users/devonwoodson/Documents/GitHub/chatty/vvault_scripts/master/needle.py)
  - [orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md)

## Dangerous Residue

### `orchestration/cli.py`

- **Class**: `dangerous residue / misleading surface`
- **What it does now**: Preserves a legacy Python bridge CLI with hidden debug-log behavior outside the repo.
- **Why it is not lower**: It is still runnable enough to mislead future work.
- **Why it is not archive-only**: A future agent can still mistake it for the promoted CLI direction.
- **Proof anchors**:
  - [orchestration/cli.py](/Users/devonwoodson/Documents/GitHub/chatty/orchestration/cli.py)
  - [orchestration/README.md](/Users/devonwoodson/Documents/GitHub/chatty/orchestration/README.md)

### stale `src/lib/masterScripts.ts` client wrapper surface

- **Class**: `dangerous residue / misleading surface`
- **What it does now**: Looks like a current client SDK for master scripts, but most of its exported route assumptions no longer match live server shapes.
- **Why it is dangerous**: It can redirect future work into non-canonical client behavior while still looking modern enough to trust.
- **Proof anchors**:
  - [src/lib/masterScripts.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/masterScripts.ts)
  - [server/routes/masterScripts.js](/Users/devonwoodson/Documents/GitHub/chatty/server/routes/masterScripts.js)

### `vvault_scripts/README_INITIALIZE_DEFAULT_INSTANCES.md`

- **Class**: `dangerous residue / misleading surface`
- **What it does now**: Preserves historical default-instance bootstrap assumptions, including stale auto-wiring and file-layout claims.
- **Why it is dangerous**: It sits in a live-looking repo location and can easily be mistaken for current orchestration/storage truth.
- **Proof anchors**:
  - [README_INITIALIZE_DEFAULT_INSTANCES.md](/Users/devonwoodson/Documents/GitHub/chatty/vvault_scripts/README_INITIALIZE_DEFAULT_INSTANCES.md)
  - [vvaultConnector/index.js](/Users/devonwoodson/Documents/GitHub/chatty/vvaultConnector/index.js)

### separate legacy-ish `src/components/SimForge.tsx` path

- **Class**: `dangerous residue / misleading surface`
- **What it does now**: Preserves an older forge/editor surface that still uses non-canonical preview and runtime assumptions.
- **Why it is dangerous**: It looks like a live forge UI even though GPTCreator is the routed forge surface now.
- **Proof anchors**:
  - [src/components/SimForge.tsx](/Users/devonwoodson/Documents/GitHub/chatty/src/components/SimForge.tsx)
  - [src/components/GPTCreator.tsx](/Users/devonwoodson/Documents/GitHub/chatty/src/components/GPTCreator.tsx)

### `replit.md`

- **Class**: `dangerous residue / misleading surface`
- **What it does now**: Acts like a broad current-state doctrine file with strong claims about storage, provider model, and orchestration behavior.
- **Why it is dangerous**: It reads authoritative enough to outrank live standards while mixing preserved truth with repo-drifting claims.
- **Proof anchors**:
  - [replit.md](/Users/devonwoodson/Documents/GitHub/chatty/replit.md)
  - [docs/standards/orchestration-canon-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-canon-rubric.md)

### `vvaultConnector/README.md`

- **Class**: `dangerous residue / misleading surface`
- **What it does now**: Presents an automatic local connector integration and filesystem-backed transcript/capsule story as if it were the active orchestration/storage path.
- **Why it is dangerous**: It conflicts with the current receipt-backed `/api/vvault/message` canon and can send future work back toward local auto-enable lore.
- **Proof anchors**:
  - [vvaultConnector/README.md](/Users/devonwoodson/Documents/GitHub/chatty/vvaultConnector/README.md)
  - [docs/reference/constructs-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md)

### legacy generic `src/lib/ai.ts` response generator

- **Class**: `dangerous residue / misleading surface`
- **What it does now**: Preserves a generic response-builder surface that explicitly rejects persona-locked flows and says an orchestrator system prompt should own them instead.
- **Why it is dangerous**: The file name reads like a central AI owner even though it is not current orchestration canon.
- **Proof anchors**:
  - [src/lib/ai.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/ai.ts)
  - [src/engine/orchestration/UnifiedLinOrchestrator.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/engine/orchestration/UnifiedLinOrchestrator.ts)

## Archive Continuity Evidence

### Archive architecture and history docs

- **Class**: `archive continuity evidence`
- **What it does now**: Preserves prior design intent, prior failures, prior bootstrap stories, and historical architecture snapshots.
- **Why it is not lower**: Archive material still matters for reconciliation, provenance, and implementation-drift analysis.
- **Why it is not higher**: Archive evidence does not outrank live runtime receipts or live standards by default.
- **Proof anchors**:
  - [archive-continuity-evidence.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/archive-continuity-evidence.md)
  - [docs/archive/legacy/architecture](/Users/devonwoodson/Documents/GitHub/chatty/docs/archive/legacy/architecture)

## Current High-Confusion Traps

These surfaces need to stay visibly downgraded in repo entrypoints:

- `orchestration/cli.py`
- `src/lib/masterScripts.ts`
- `vvault_scripts/README_INITIALIZE_DEFAULT_INSTANCES.md`
- separate legacy-ish `src/components/SimForge.tsx`
- `replit.md`
- `vvaultConnector/README.md`
- legacy generic `src/lib/ai.ts`
- frontend/server `constructMemoryPolicy` disagreement on Lin-orchestrated constructs
- broad provider catalog UX outranking the construct-grade runtime story

If a future reader can hit any of those before the canonical rubric, runtime checklist, or this inventory, the repo is still too easy to misread.

## Tracked Live Contradictions

### Frontend and server `constructMemoryPolicy` drift

- **What it does now**: The browser helper currently over-classifies Lin-orchestrated constructs, while the server helper uses the actual allowlist.
- **Why it matters**: Frontend assumptions can still misdescribe routing truth even when backend routing is selective.
- **Proof anchors**:
  - [src/lib/constructMemoryPolicy.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/constructMemoryPolicy.ts)
  - [src/lib/constructMemoryPolicy.js](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/constructMemoryPolicy.js)

### Broad provider catalog vs enduring-runtime direction

- **What it does now**: Live selector surfaces still foreground large provider catalogs and public-model naming.
- **Why it matters**: The promoted product direction is toward enduring construct-grade runtimes like Lin or Zen that grow smarter over time, not Chatty-branded release-train model marketing.
- **Proof anchors**:
  - [src/lib/modelProviders.ts](/Users/devonwoodson/Documents/GitHub/chatty/src/lib/modelProviders.ts)
  - [docs/reference/model-providers.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/model-providers.md)
