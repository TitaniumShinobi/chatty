# Perfection Contract

Source of truth:
- `RULES.md`
- `docs/standards/identity-boundaries.md`
- `docs/standards/transcript-storage.md`
- `docs/reference/constructs-and-lin.md`
- `docs/reference/vvault-and-storage.md`
- `docs/standards/orchestration-runtime-checklist.md`
- `server/lib/identityBundlePreflight.js`
- `server/lib/memoryContextBuilder.js`

## Definition

For Chatty, perfection is the smallest permanent runtime path that preserves identity, retrieves memory with receipts, routes through one observable server-side path, and fails honestly instead of silently pretending.

Diagnosis is app-level law, not Chat-only tooling. Every signed-in `/app/*` page must define what "alive" means before the surface can be called working. The static Diagnosis control belongs to the signed-in app layout, and each page checklist must name its route, required data, render contract, and degraded state. Definition checklists are allowed before deeper live probes exist, but a definition checklist is not live pass evidence.

Perfection does not mean maximum complexity. It means every construct response satisfies these invariants:

- authenticated identity is resolved before construct identity or memory is used
- Nova, Lin, and other identity-bound constructs do not speak from empty identity
- memory claims are grounded in transcript anchors, continuity ledger entries, verified transcript memories, or semantic hits with source paths and confidence
- Lin routes intent, provider, and model without absorbing the selected construct's identity
- provider choice is separate from identity fidelity
- every response has enough telemetry to explain identity source, memory evidence, provider/model, fallback status, and drift handling

## Runtime Invariants

1. **No identity bundle, no construct response.**
   If a required construct identity cannot load, the runtime returns an explicit identity-unavailable state. It must not synthesize an empty blueprint or generic assistant persona.

2. **No verified memory, no specific recall.**
   For memory-triggering questions, Chatty may only claim recall when evidence is present. If evidence is missing, the required answer is: "I cannot verify that from available continuity records."

3. **Semantic memory is second-gate evidence.**
   Vector or semantic memory hits are usable only when they include a source path and confidence. Unanchored semantic similarity is a search hint, not memory.

4. **Server orchestrates; browser renders.**
   Browser code may display identity and memory state, but construct identity resolution, memory retrieval, prompt assembly, and routing decisions belong on the server path.

5. **Lin is infrastructure, not identity absorption.**
   Lin may route requests and stabilize undertone, but the generated response must remain the active construct's response.

6. **Receipts are part of the response contract.**
   Runtime logs and debug payloads must expose construct id, identity source, prompt source, memory evidence counts, ledger status, provider/model, fallback status, and identity drift handling.

7. **The orchestration checklist is live product telemetry.**
   Every assistant turn should emit a checklist receipt with status, reason, and owner for auth, construct identity, orchestration mode, capabilities/selfprompt, transcript memory, knowledge grounding, prompt conditioning, provider/model, post-response guard, and persistence. If a feature is not represented in the checklist or the live `/api/vvault/message` path, it must not be treated as active construct behavior.

8. **Signed-in pages define alive before working.**
   Chat, AIs/GPTs, GPT Creator, SimForge/Explore, VVAULT, Search, Library, Projects, Apps, Finance, and Codex must each expose a page checklist through app-level Diagnosis. Chat runtime receipts remain part of the Chat page checklist, but they do not prove unrelated pages are healthy.

## Acceptance Tests

- Missing Nova or Lin blueprint/identity fails closed with `IDENTITY_UNAVAILABLE`.
- A memory question with no evidence cannot produce invented dates, events, or relationship history.
- Semantic memory hits without source paths are ignored as recall evidence.
- Provider fallback does not change construct identity.
- The Nova chat path emits a runtime receipt showing identity, memory, provider, and fidelity status.
- The Chatty UI can display the latest assistant turn's orchestration checklist without requiring manual console probes or `SHOW_DEV_INFO`.
- The signed-in app layout exposes Diagnosis on every `/app/*` page.
- Every signed-in page has at least a definition checklist before it is called working.
