# Orchestration Canon Rubric

Status: canonical live contract

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

Source-of-truth inputs:
- `/Users/devonwoodson/Documents/GitHub/chatty/README.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/README.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/docs-governance.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-seat-cross-repo-reconciliation.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-surface-inventory.md`

Superseded or clarified surfaces:
- `/Users/devonwoodson/Documents/GitHub/chatty/orchestration/README.md` is legacy/reference bridge documentation. It does not own construct-quality orchestration.
- `/Users/devonwoodson/Documents/GitHub/chatty/vvault_scripts/README_INITIALIZE_DEFAULT_INSTANCES.md` is dangerous residue for orchestration truth. It preserves historical bootstrap assumptions, not current runtime ownership.

## Executive Framing

Chatty orchestration now has to be read in two live layers on purpose.

- **Canonical orchestration and operator surface** is `chatty-cli`.
- **Canonical receipt-backed construct runtime** is the route that flows through `Layout -> AIService -> /api/vvault/message -> memoryContextBuilder -> orchestrationChecklist`.

Those layers are related and complementary. `chatty-cli` is the product-core/operator truth. `/api/vvault/message` is the construct-quality turn-execution truth. Chatty UI remains the visible Three I orchestration surface. Code remains the one-seat operator shell with explicit subagents. Lin remains runtime routing substrate unless the selected construct is actually Lin. Orchestration canon must now govern identity, receipt truth, persistence truth, capability boundaries, and verified mutation behavior, not just response synthesis.

## Current Implemented Canon

The current implemented orchestration truth is:

- `chatty-cli` is the canonical operator surface and orchestration/product core
- construct-quality conversation is owned by `/api/vvault/message`, not by helper routes, Python bridge surfaces, or CLI folklore
- the live path is `Layout -> AIService -> /api/vvault/message -> memoryContextBuilder -> orchestrationChecklist`
- `chatty-cli` backend mode delegates into that route by default and surfaces the resulting runtime truth to the operator
- runtime proof comes from `runtime_receipt` plus `orchestration_checklist`
- the Three I canon remains:
  - Intelligence
  - Ingenuity
  - Interaction
- continuity stays inside Intelligence unless Devon explicitly reopens that decision
- selected construct identity stays separate from Lin routing and provider/model selection
- `/api/lin/generate`, Agent Squad/Python bridge paths, capsule helpers, and similar surfaces may be live or useful, but they are not construct-quality proof unless they delegate into the same canonical path and emit the same receipt contract
- `chatty-cli` local mode remains explicit fallback/operator utility behavior; it is not the canonical construct-quality turn route

## One-Word Operator Trigger

When a worker receives the exact prompt `orchestration`, the expected action is to prove and tighten the live loop:

`chatty-cli -> /api/vvault/message -> runtime_receipt -> orchestration_checklist -> visible output -> persistence truth`.

The worker must not turn the prompt into transcript intake, local-file routing, architecture explanation, or a new orchestration system. The required proof is a receipt-backed construct turn showing construct identity, provider/model truth, memory/persistence owner, visible output, and the failed stage if any.

Primary anchors:
- [orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md)
- [lin-three-i-seat-canon.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md)
- [constructs-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md)

## Canonical Product-Core Split

The canonical split is:

- `chatty-cli` is the canonical orchestration and product-core direction
- Chatty UI remains the visible Three I orchestration surface over that shared runtime truth
- Code remains a one-seat operator shell with explicit spawned subagents, not a second visible Three I theater
- Lin becomes a real callable runtime/model choice, not just a hidden backend phrase
- construct-grade local runtimes are enduring intelligences or sims that get smarter over time; they are not meant to be a public release train of numbered product-model launches
- construct identity remains separate from runtime/provider/model routing even after Lin promotion
- review vs inspect remain presentations over one runtime truth, not different systems
- orchestration in the file-editor era must support explicit targeting, preview, verification, rollback/recovery, and honest failure reporting

This canon split does **not** flatten everything into one file or one process. The receipt-backed construct turn route remains `/api/vvault/message`, and local CLI fallback behavior remains transitional until it delegates into the same receipt/checklist contract or is retired.

## Repo-Truth Examples This Rubric Must Score

These examples must stay explicit in canon work:

- **canonical operator/core**: `chatty-cli`
- **canonical runtime route**: `/api/vvault/message` receipt-backed orchestration
- **known transition gaps**:
  - CLI local mode is still a fallback path outside the receipt/checklist contract
  - CLI settings persistence is only partially wired into every runtime behavior
  - CLI file operations are shell-like, not zero-trust editor operations
  - frontend and server do not fully agree on Lin-orchestrated construct detection
  - older SimForge/editor surfaces still diverge from GPTCreator plus canonical preview behavior
  - broad provider catalogs still speak more like interchangeable model menus than enduring construct-grade runtime choices

Use [orchestration-surface-inventory.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-surface-inventory.md) as the concrete map when applying this rubric.

## Canonical Rubric

Scoring:
- `1` = bad / misleading / unsafe
- `3` = acceptable but incomplete
- `5` = excellent / canonical-ready

Critical categories:
- `Current Implemented Canon Truth`
- `Construct Identity Preservation`
- `Receipt / Checklist Visibility`
- `Capability and Agent-Mode Boundaries`
- `File Editing Trustworthiness`
- `Legacy / Archive Classification Discipline`

Any critical category below `3` blocks a `Trustworthy Canon` verdict.

### 1. Current Implemented Canon Truth

What this scores:
- whether one live runtime route clearly owns construct-quality orchestration today
- whether docs and wrappers describe that route truthfully

`1` Bad:
- multiple routes read as equal owners of construct-quality turns
- helper bridges or CLI paths are presented as if they already emit canonical receipts

`3` Acceptable:
- one live route is named canonical, but parallel surfaces still require careful forensic reading

`5` Excellent:
- the repo states plainly that `/api/vvault/message` owns current construct-quality orchestration
- wrappers and helpers are described in relation to that route, not in competition with it

Anti-patterns:
- route pluralism presented as flexibility
- helper docs reading like runtime ownership
- implying that CLI promotion already happened

### 2. Target Canon Promotion Discipline

What this scores:
- whether the promoted next phase is explicit without being passed off as already implemented

`1` Bad:
- target direction is hidden, muddy, or quietly presented as finished

`3` Acceptable:
- next-phase direction is named, but current-vs-target boundaries still blur

`5` Excellent:
- the repo states clearly that `chatty-cli` is the promoted orchestration direction
- the docs also state clearly what is still missing before that becomes implemented canon

Anti-patterns:
- promotion language with no gap accounting
- claiming a canonical CLI runtime without receipts, mutation boundaries, or transcript truth

### 3. Construct Identity Preservation

What this scores:
- whether selected construct identity stays separate from Lin routing, model selection, and preview overlays

`1` Bad:
- routing or provider/model choice changes who the construct is
- Lin, preview overlays, or model labels absorb identity

`3` Acceptable:
- identity usually survives, but some helper or preview seams still blur the line

`5` Excellent:
- construct identity remains stable across main chat, GPTCreator preview, persistence, receipts, and wrapper surfaces

Anti-patterns:
- "Lin is the speaker" instead of "Lin is routing substrate"
- model labels replacing construct names
- preview-only instructions replacing canonical identity truth

### 4. Seat Routing Clarity

What this scores:
- whether the Three I canon is stable, named correctly, and easy to verify

`1` Bad:
- stale triads or old seat language still read like current defaults
- DeepSeek or legacy cloud placeholders read as the Intelligence default or fallback
- continuity is treated as a secret fourth seat

`3` Acceptable:
- Three I canon exists, but residue still causes routine confusion

`5` Excellent:
- Intelligence, Ingenuity, and Interaction are the only live seat canon
- responsibilities are stable and continuity remains inside Intelligence
- Intelligence/coding is Qwen-backed through `config/linModelDefaults.json`; DeepSeek is not the Intelligence default or fallback

Anti-patterns:
- calling Intelligence "coding only"
- treating provider/model names as seat identity
- adding a continuity seat without an explicit canon change

### 5. Runtime / Provider / Model Truth

What this scores:
- whether runtime/provider/model selection is explicit and separable from construct identity

`1` Bad:
- saved fields or UI copy claim a provider/model that did not actually run
- a Lin route lets `openrouter:auto`, old DeepSeek/Mistral/Phi-3, or stale `openai:*`/`openrouter:*` fields outrank shared Lin defaults

`3` Acceptable:
- effective runtime/provider/model is recoverable, but not surfaced cleanly everywhere

`5` Excellent:
- requested, configured, suppressed, and effective runtime/provider/model state is receipt-backed
- stale cloud placeholders are suppressed in Lin mode and surfaced as configured/suppressed model truth
- Lin can be promoted as a first-class runtime choice without turning into identity cosplay
- construct-grade local runtimes can mature over time without being framed like public release-train SKUs

Anti-patterns:
- treating runtime choice as personality
- stale saved provider/model truth outranking live routing
- letting legacy cloud placeholders outrank Lin defaults
- hiding real fallback behavior behind friendly copy
- letting provider catalog UX define the product identity

### 6. Receipt / Checklist Visibility

What this scores:
- whether orchestration can be inspected from runtime receipts instead of folklore

`1` Bad:
- behavior is explained only in prose or chat
- construct-quality turns leave no usable receipt trail

`3` Acceptable:
- receipts exist, but some important stages or wrapper semantics remain opaque

`5` Excellent:
- construct-quality turns expose enough receipt and checklist state to prove identity, routing, memory, provider/model, preview state, and persistence behavior

Anti-patterns:
- `SHOW_DEV_INFO` treated as the proof system
- helper-only routes used as if they prove canonical behavior
- hidden fallback paths with no evidence

### 7. Transcript and Persistence Ownership

What this scores:
- whether transcript state and persistence ownership are explicit

`1` Bad:
- multiple surfaces write as if they own the same transcript truth
- wrappers claim storage authority they do not actually have

`3` Acceptable:
- a canonical owner exists, but helper flows still produce some ambiguity

`5` Excellent:
- transcript, storage, and persistence ownership are explicit
- receipts or standards say who writes what and under what mode

Anti-patterns:
- side-storage realities treated as canon
- helper saves presented as final truth
- wrapper-specific storage lore overriding runtime contracts

### 8. Capability and Agent-Mode Boundaries

What this scores:
- whether capabilities and agent mode are bounded and truthful

`1` Bad:
- "agent" or "editor" appears enabled without real boundaries
- runtime implies execution authority it does not actually own

`3` Acceptable:
- capability truth exists, but user-facing behavior still overstates what is real

`5` Excellent:
- capabilities are explicit
- agent mode is a bounded operational contract
- Chatty and Code wrapper differences are clear without splitting runtime truth

Anti-patterns:
- treating a toggle as proof of authority
- hidden escalation
- invisible worker delegation presented as a single-seat answer

### 9. File Editing Trustworthiness

What this scores:
- whether orchestration can support the file-editor era without blind trust

`1` Bad:
- mutation can happen without structured targeting, preview, verification, rollback, or honest receipts

`3` Acceptable:
- some guardrails exist, but the mutation path is still not zero-trust

`5` Excellent:
- verified mutation is part of the orchestration contract
- natural conversation remains separate from mutation authority

Anti-patterns:
- shell-like mutation passed off as editor trust
- "I changed it" without proof
- silent partial apply or silent failure

### 10. Display and Presentation Contract

What this scores:
- whether review and inspect are honest presentations over one runtime truth

`1` Bad:
- display modes imply different truths or different runtimes

`3` Acceptable:
- presentation modes exist conceptually, but persistence or parity is still weak

`5` Excellent:
- one runtime supports multiple honest presentations
- saved settings and runtime state do not contradict one another
- Chatty can expose visible orchestration while Code can expose one visible operator seat without splitting the underlying truth

Anti-patterns:
- presentation mode used as a proxy for runtime differences
- temporary override masquerading as saved default
- mode names that hide what the operator is actually seeing

### 11. Legacy / Archive Classification Discipline

What this scores:
- whether old systems are preserved without being mistaken for canon

`1` Bad:
- old bridge docs, scripts, or stale READMEs still read like live runtime truth

`3` Acceptable:
- most residue is labeled, but some misleading seams remain

`5` Excellent:
- canonical live, helper-only live, implemented transitional, legacy/reference, archive continuity evidence, and dangerous residue are easy to distinguish

Anti-patterns:
- "stale, ignore it"
- archive dismissal
- leaving high-confusion legacy files unlabeled at root-adjacent paths

### 12. Documentation Prominence and Wrapper Split Discipline

What this scores:
- whether the current canon is easy to find and whether Chatty-vs-Code presentation differences are documented without runtime drift

`1` Bad:
- canonical docs are buried
- older similarly named files overshadow them
- Chatty and Code differences are explained conversationally instead of canonically

`3` Acceptable:
- current canon is findable if you already know where to look
- wrapper split exists, but not prominently enough to stop re-litigation

`5` Excellent:
- root and docs indexes point to current orchestration canon first
- Chatty is documented as the visible Three I surface
- Code is documented as the one visible operator seat with explicit subagents
- the shared runtime truth remains clear underneath that split

Anti-patterns:
- burying live canon behind archive and bridge docs
- wrapper differences turning into separate runtime myths
- requiring Devon to restate the same split in chat

## Canon Classification Matrix

| Class | Meaning | Belongs Here | Required Label |
| --- | --- | --- | --- |
| `canonical live contract` | Current repo truth that owns runtime behavior, receipts, or governance | active runtime contracts, receipt-bearing standards, live gating rules | `Status: canonical live contract` |
| `helper-only live surface` | Live and implemented, but not the construct-quality owner or final authority for the topic | helper endpoints, seat runners, preview helpers, support tooling | `Status: helper-only live surface` |
| `implemented transitional` | Real and wired enough to matter, but not yet the final promoted contract | live adapters, partial migrations, target-direction runtime surfaces | `Status: implemented transitional` |
| `unwired design intent worth preserving` | Target-shaping direction that still matters, even though the full runtime contract is not finished | future-facing mode envelopes, preserved archive designs, orchestration scaffolds, surviving direction code | `Status: unwired design intent worth preserving` |
| `legacy/reference` | Historical or optional system surface that still has explanatory value but must not be mistaken for current runtime truth | old bridge docs, legacy scripts, historical patterns that remain readable | `Status: legacy/reference` |
| `archive continuity evidence` | Preserved records that explain prior intent, prior failures, or historical architecture without claiming live ownership | archive analyses, continuity packets, historical architecture ledgers | `Status: archive continuity evidence` |
| `dangerous residue / misleading surface` | Looks active or canonical enough to mislead future work but is not trustworthy in that role | stale READMEs, shadow SDKs, competing editor surfaces, legacy CLIs that still run | `Status: dangerous residue / misleading surface` |

Classification rules:
- A file does not become canonical because it is thoughtful, detailed, or older.
- A file does not become disposable because it is archived.
- A design-intent surface does not outrank live runtime receipts, but it does deserve explicit tracking when it still shapes target canon.
- A surface becomes dangerous residue when a reasonable future agent could mistake it for current runtime truth.

## Prominence Rubric

Score each canon file from `0` to `10`.

### 1. Root discoverability (`0-2`)
- `0`: not reachable from root entrypoints
- `1`: linked indirectly
- `2`: linked directly from root or root-adjacent docs

### 2. Runtime adjacency (`0-2`)
- `0`: no runtime-adjacent doc points to it
- `1`: one related doc points to it
- `2`: the relevant runtime/readiness docs point to it explicitly

### 3. Canon labeling (`0-2`)
- `0`: no canon status or source-of-truth framing
- `1`: implied canon
- `2`: explicit source-of-truth inputs and canon status

### 4. Overshadow resistance (`0-2`)
- `0`: similarly named older files overshadow it
- `1`: some ambiguity remains
- `2`: older competing surfaces are visibly downgraded or cross-linked correctly

### 5. Operator usefulness (`0-2`)
- `0`: only useful after deep repo knowledge
- `1`: somewhat usable
- `2`: a future agent or operator can find and apply it quickly

Interpretation:
- `9-10`: prominent enough
- `7-8`: usable but still easy to miss
- `5-6`: drifting toward obscurity
- `<5`: not prominent enough to count as stable canon

## Archival / Organization Rubric

### Archive
Archive a surface when:
- it is no longer the current runtime or governance contract
- it still has continuity or forensic value
- keeping it live would cause more confusion than clarity

### Keep in place but relabel
Keep a surface in place when:
- operators still need it for local work
- code still references it
- moving it would create avoidable breakage

Required treatment:
- add an explicit status label
- link the canonical replacement
- say what the surface is still good for

### Reconcile
Reconcile rather than archive when:
- the surface still influences implementation choices
- it contains a real contradiction against current canon
- it helps future agents classify cross-repo or cross-era evidence safely

### Mark as dangerous residue
Use this when:
- a file looks like canon but is not
- a stale default still reads like the active default
- a README or helper surface can redirect work into the wrong system

### Preserve continuity evidence without masquerade
Archive evidence should:
- keep its wording intact unless correction notes are needed
- be linked through reconciliation or archive-continuity rules
- never be flattened into "ignore it"
- never outrank runtime receipts without explicit human canon change

## Trust Bar

Chatty orchestration is not trustworthy unless all of the following are true:

1. **Construct identity truth**
   - selected construct identity survives routing, preview, provider selection, and persistence

2. **Receipt-backed orchestration**
   - construct-quality behavior is explainable from runtime receipts and checklists

3. **Explicit seat responsibility**
   - Intelligence, Ingenuity, and Interaction responsibilities are stable and visible in canon

4. **Runtime / provider / model truth**
   - effective runtime/provider/model state is truthful, inspectable, and separate from identity

5. **Bounded agent capability**
   - capability and agent-mode claims match actual runtime boundaries

6. **Verified mutation path**
   - file-editor-era mutation requires explicit targeting, preview, verification, and bounded apply semantics

7. **Honest failure reporting**
   - skips, fallbacks, degraded states, and failed writes are named plainly

8. **Rollback / recovery expectations**
   - mutation-era orchestration defines how work is reversed, resumed, or quarantined after interruption or partial failure

9. **Transcript and persistence ownership**
   - transcript, storage, and artifact truth does not fragment across wrappers or side paths

10. **Current-vs-target honesty**
    - promoted canon is not passed off as implemented canon before the runtime earns it

## Interpretation Guide

### `Trustworthy Canon`
- all critical categories score `4` or `5`
- no trust-bar failure
- current and target canon are both explicit and not confused with one another

### `Usable but Drifting`
- most categories are `3` or better
- no immediate safety failure
- classification or prominence residue still requires operator care

### `Transitional`
- real implementation exists
- promoted direction is real
- but receipt, mutation, wrapper, or prominence work is still incomplete

### `Misleading`
- a surface looks authoritative enough to redirect work, but its status or ownership is mislabeled

### `Dangerous`
- any trust-bar requirement fails
- any critical category scores below `3`
- identity, receipt, or mutation truth can be misread without deliberate forensic work

## Immediate Positioning Rule

For the current phase of Chatty:

- `/api/vvault/message` remains the canonical construct-quality conversation route until an explicit canon change says otherwise.
- `chatty-cli` is the canonical orchestration and product-core direction, while `/api/vvault/message` remains the canonical receipt-backed construct turn route.
- Chatty UI is the visible Three I orchestration surface.
- Code is the one visible operator seat plus explicit subagents.
- Agent Squad bridge docs, stale `vvault_scripts` bootstrap stories, and legacy SimForge/editor seams must not be mistaken for the current runtime contract.
