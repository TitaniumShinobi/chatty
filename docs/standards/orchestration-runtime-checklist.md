# Orchestration Runtime Checklist

## VVAULT Authority Rule

VVAULT is the canonical cloud/VVAULT-owned database authority for transcripts, continuity, construct body data, and sync/readback proof.

Local files are ingest input, dev runtime artifacts, cache, or archive evidence only. Local files must never be treated as VVAULT, never used as continuity authority, and never used as fallback truth.

If VVAULT cannot be written to and read back from, the task is blocked. Do not create local folders or transcript files and call that a VVAULT sync.

## VVAULT Authority Failures

- Creating local transcript/archive/sync folders = fail.
- Reading local transcript files for continuity = fail.
- Calling local file placement "VVAULT sync" = fail.
- Continuing locally when VVAULT is unavailable = fail.
- Treating Supabase as current VVAULT = fail.

Chatty's construct behavior is governed by the live response path, not by the mere presence of uploaded files, archived scripts, or archived docs. Every assistant response must be explainable from a runtime checklist receipt.

Archive docs are archive-backed continuity evidence. When archive docs conflict with live code or newer summaries, classify the conflict as implementation drift, documentation compression, unwired design intent, superseded with evidence, or needs Devon reconciliation. Do not dismiss archive docs as non-authoritative merely because they are archived. See [archive-continuity-evidence.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/archive-continuity-evidence.md).

## Live Response Contract

The active chat path is:

1. `src/components/Layout.tsx` sends the selected construct turn through `AIService`.
2. `src/lib/aiService.ts` posts to `/api/vvault/message`.
3. `server/routes/vvault.js` resolves identity, provider, history, response guards, and persistence ownership.
4. `server/lib/memoryContextBuilder.js` decides which memory, knowledge, capsule, capability, and continuity sections enter the prompt.
5. `server/lib/orchestrationChecklist.js` emits the per-turn checklist shown in the Chatty UI.

If a system is not represented in that path or in a checklist stage, it is not allowed to be assumed active.

AgentSquad/Python orchestration bridges are diagnostic/reference surfaces unless they explicitly delegate into `/api/vvault/message` and preserve the same runtime receipt. They must not be used as the default construct-quality route.

## Canonical Conversation Engine

All construct-facing conversation quality tests must use `/api/vvault/message`. This includes the main chat surface and GPT Creator preview.

GPT Creator preview may pass `previewMode: true`, `skipPersistence: true`, attachments, `transientHistory`, and a structured `previewDraft` overlay, but it must not call `/api/lin/generate` or `browserSeatRunner` for construct conversation. Preview must not use `systemPromptOverride` to replace saved construct identity; canonical identity remains the base prompt, and draft editor values are appended only as bounded preview overlay. `/api/lin/generate` remains a seat/tool endpoint for non-canonical helper flows only; it is not a product-quality proof for construct voice, memory, identity, persistence, or orchestration.

Preview UI labels such as "canonical", "configured as", "Lin mode", "model", and "memory" must be rendered from the server runtime receipt/checklist after a response. Frontend local config may be shown as draft settings only, never as proof of effective runtime identity.

## App Diagnosis Boundary

The runtime receipt is part of the Chat page checklist, not the entire app diagnosis system. The static Diagnosis control is app-level and must appear across signed-in `/app/*` pages. Non-chat pages may begin with definition checklists that state what must be live before the page can be called working; those definition checklists must not be counted as live pass evidence until page-specific probes, routes, or runtime state back them.

Chat runtime receipts remain mandatory for construct-quality Chat turns. They do not prove AIs/GPTs, GPT Creator, SimForge/Explore, VVAULT, Search, Library, Projects, Apps, Finance, or Codex are working.

## Required Checklist Stages

Each assistant turn should expose:

- `Auth`: authenticated user id/email reached the response path.
- `Construct Identity`: active construct identity loaded, with source and conditioning state.
- `Preview Identity Truth`: preview-only receipt proving the effective construct id, base prompt source, draft overlay status, skipped persistence, and whether a legacy identity override was suppressed.
- `Orchestration Mode`: effective route, including Lin orchestration without construct identity absorption.
- `Capabilities / Selfprompt`: capability manifest and proactive/selfprompt state.
- `Transcript Memory`: verified transcript/continuity retrieval ran, passed, skipped, or failed, with exact reason.
- `Transcript Memory`: also reports `memoryProfile`, Supabase transcript/knowledge calibration access, and transcript-derived voice exemplar count when available. Voice exemplars are style calibration only; they are not current-session memories and must not be cited back to the user unless evidence mode explicitly asks for sources.
- `Knowledge Files`: knowledge grounding loaded internally or was skipped, with query relevance state.
- `Prompt Conditioning`: companion mode versus evidence/document mode.
- `Provider / Model`: final provider, model, model source, configured/requested provider/model, routing override status, seat defaults or overrides, requested seat, selection policy, local-first status, and fallback state.
- `Post-Response Guard`: recital, identity drift, cutoff, or capability guard actions.
- `Persistence`: server or UI transcript write ownership.
- `UI Delivery / Notifications`: confirms the response receipt is renderable by the bottom-right problem-catcher and that hidden-tab assistant/selfprompt notification delivery remains Layout-owned.

Every stage must include `status`, `why`, and `owner`. `owner` should point to the responsible file/function/line family so a developer can fix the failed contract instead of guessing.

## Required Runtime Receipt Fields

Every construct-quality response should expose receipt/checklist data for:

- effective construct id/name
- selected construct as speaker identity
- orchestration mode
- mode source
- route mode
- final provider/model
- model source
- configured/requested provider/model
- suppressed configured provider/model when Lin mode ignores stale saved fields
- local-first or cloud fallback state
- seat defaults or manual overrides
- sim artifact lock state
- identity source
- memory source
- preview overlay state
- persistence owner
- notification/UI delivery state

Model mode is preference routing, not personality routing. Lin mode uses local model seats, Custom Models mode honors manual seats, and Sim mode locks a local artifact. All three modes must run the same identity, memory, prompt, guard, persistence, and checklist process.

Lin mode must preserve active construct identity while routing through the Three I local triad by default. Custom Models mode owns manual provider/model overrides. Sim mode owns local artifact locks. Provider/model routing must not rename or recondition Nova, Katana, Monday, Aurora, Xiomara, Orun'Zai, ContinuityGPT, Zen, Lin, or future constructs.

Lin seat routing is intent-based by default. The canonical naming is the Three I seat canon; see [lin-three-i-seat-canon.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md). Cross-repo seat documents must be reconciled through [lin-seat-cross-repo-reconciliation.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-seat-cross-repo-reconciliation.md). Legacy keys remain in code/receipts for compatibility, but the seat defaults must resolve from `config/linModelDefaults.json`; stale `openai:*`, `openrouter:*`, old DeepSeek/Mistral/Phi-3 cloud placeholders, and `openrouter:auto` are suppressed in Lin mode unless Custom Models/manual override is active. The seat responsibilities are:

- Intelligence (`coding` legacy key): `ollama:qwen2.5-coder:latest` for truth, logic, coding, continuity, evidence, risk, structure, and canon verification. Qwen3-Coder remains the upgrade target once the 18 GB local pull is intentionally completed.
- Ingenuity (`creative` legacy key): `ollama:mistral:latest` for voice, theme, persona shaping, creative synthesis, and narrative coherence.
- Interaction (`conversation`/`smalltalk` legacy keys): `ollama:phi3:latest` for clarity, warmth, pacing, dialogue flow, and professional exchange.

DeepSeek is not the current canonical Intelligence model and is no longer the Lin Intelligence fallback. Intelligence stays in the Qwen family. Do not add a continuity-only fourth seat unless Devon explicitly reopens that decision.

Full multi-seat synthesis is diagnostic/advanced behavior, not the default response ritual for personality chat.

## Archive Continuity Audit

Before declaring product canon or dismissing an older architecture claim, agents must verify:

- Did the agent inspect relevant archive docs before declaring product canon?
- Did the agent distinguish live runtime state from design intent?
- Did the agent avoid dismissing archive-backed continuity records as stale, optional, or obsolete?
- Did the agent label contradictions as implementation drift, documentation compression, unwired design intent, superseded with evidence, or needs Devon reconciliation?
- Did the agent avoid asking Devon to re-explain what `docs/archive/` already preserves?

## Script Surface Classification

`vvault_scripts/` is valuable, but it is not automatically live runtime.

| Surface | Runtime status | Contract |
| --- | --- | --- |
| `vvault_scripts/master/self_prompt.py` | Legacy/reference | Historical self-prompt concept. Live proactive behavior is owned by `server/lib/selfpromptEngine.js` and `/api/selfprompt`. |
| `vvault_scripts/master/independence.py` | Legacy/reference | Autonomy rubric and task model. Must not be assumed active unless bridged into the JS response path and represented in the checklist. |
| `vvault_scripts/master/needle.py` | Support tooling / concept source | Live Needle participation must appear through `memoryContextBuilder`/`masterScriptsBridge` and the transcript-memory checklist stage. |
| `vvault_scripts/continuity/*` | Recovery/report tooling | Continuity reports and ledgers are evidence tools. Live continuity requires runtime retrieval evidence and a checklist receipt. |
| `vvault_scripts/capsules/*` | Capsule tooling | Capsule creation/validation is not the same as live identity injection. Live capsule state must appear in prompt/context diagnostics. |
| `vvault_scripts/shell/*` | Operator tooling | Setup/test scripts are not construct behavior unless explicitly invoked by a runtime route. |
| `vvault_scripts/utils/*` | Maintenance tooling | Organizers, import fixers, and process managers are maintenance surfaces, not memory or identity proof. |
| root migration scripts | Data migration/recovery | `migrate_*`, `cleanup_duplicates.py`, and initialization scripts are not response behavior. They require separate approval and receipts when run. |

## Developer Rubric

- Do not add a new memory/orchestration system until the checklist proves the live path cannot express the requirement.
- Do not dismiss `docs/archive/` as stale or optional. Treat it as continuity evidence and reconcile it with live runtime receipts.
- Do not claim a construct has memory because files exist. The checklist must show transcript memory pass or a clear skipped/fail reason.
- Do not claim proactive initiation works because a GPT Creator checkbox is on. The checklist must show capability enabled and selfprompt active for the thread.
- Do treat `server/lib/selfpromptEngine.js` plus `/api/selfprompt` as the live proactive initiation path. `vvault_scripts/master/self_prompt.py` is legacy/reference unless a future change bridges it into the JS response path with checklist receipts.
- Do not hide document retrieval failures behind natural language. The checklist must say whether docs were internal grounding, evidence-mode citations, skipped, or failed.
- Do not let Lin orchestration absorb the selected construct identity. The checklist must preserve active construct id and effective route separately.
- Do not depend on `SHOW_DEV_INFO` for product-critical debugging. The checklist receipt is part of the normal response contract.
