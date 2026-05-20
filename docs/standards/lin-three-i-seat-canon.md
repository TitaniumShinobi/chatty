# Lin Three I Seat Canon

This is the canonical developer reference for Lin's local orchestration seats. If another document, test, prompt, or helper says an older triad such as `DeepSeek + Mistral + Phi3` or `Qwen2.5-Coder + Mistral + Phi3` is the active default, classify that as implementation drift unless it explicitly marks those models as legacy/manual options rather than active defaults or fallbacks.

Live code authority for Lin seat defaults:

- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/linSeatCanon.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/config/linModelDefaults.json`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/linModelDefaults.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/src/config/linModelDefaults.ts`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/fullSeatSynthesis.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/orchestrationChecklist.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js`

Cross-repo reconciliation map:

- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-seat-cross-repo-reconciliation.md`

Canon version: `lin-three-i-2026-04-19`.

## Decision

Lin does not need a fourth continuity seat right now.

Continuity belongs inside the Intelligence seat with coding, logic, evidence, risk, structure, and canon verification. The reason is practical: the same seat that can reason about implementation contracts must also police whether a claim is supported, whether a continuity answer is invented, whether source IDs are real, and whether a construct is drifting across identity boundaries.

The Three I seats are:

| Canonical seat | Legacy key | Default model | Responsibilities |
| --- | --- | --- | --- |
| Intelligence | `coding` | `ollama:qwen3-coder:30b` | Truth, logic, coding, continuity, evidence, risk, structure, canon verification. |
| Ingenuity | `creative` | `ollama:mistral-small3.2:24b` | Voice, theme, persona shaping, creative synthesis, narrative coherence. |
| Interaction | `conversation` / `smalltalk` | `ollama:phi4-mini:latest` | Clarity, warmth, pacing, dialogue flow, professional exchange. |

DeepSeek and Qwen2.5-Coder are not the current canonical Intelligence defaults and are no longer configured Intelligence fallbacks. The active local Intelligence model is `ollama:qwen3-coder:30b`.

## Naming Rules

- Say `Intelligence`, not "coding only", when describing the seat's purpose.
- Say `Ingenuity`, not "the creative model is the identity", when describing voice and synthesis.
- Say `Interaction`, not "Phi3 owns the construct voice", when describing conversation flow.
- Keep `coding`, `creative`, `conversation`, and `smalltalk` as compatibility keys in code and receipts where older callers still need them.
- Never describe the coding seat as limited to programming help. Coding is one subdomain of Intelligence.
- Never add a continuity-only fourth seat unless Devon explicitly reopens that decision.

## Runtime Requirements

`/api/vvault/message` must preserve selected construct identity separately from seat routing. A construct can be Zen, Nova, Lin, Katana, Sera, or another selected identity while Lin routes work through the Three I seats.

Full-seat synthesis must run all three contributors:

- Intelligence verifies truth, continuity, evidence, structure, risk, and implementation details.
- Ingenuity shapes continuity, voice, theme, persona fidelity, and narrative coherence.
- Interaction keeps the exchange clear, professional, paced, and direction-seeking.

Only the final synthesis is user-facing. Seat summaries are receipt/debug material and must not become the assistant's identity.

Runtime receipts/checklists should expose:

- `lin_seat_canon: "lin-three-i-2026-04-19"`
- canonical seat names where available
- legacy seat keys for compatibility
- provider/model used for each seat
- whether full-seat synthesis or intent routing was active

## Operational Note

The active local Intelligence model is `ollama:qwen3-coder:30b`. Local machines must pull that model before running the active default:

```bash
ollama pull qwen3-coder:30b
```

Do not silently change the canon back to DeepSeek, Qwen2.5-Coder, Phi3, or old Mistral because a newer model is not installed on a machine. Installation state is availability, not product canon.

## Cross-Repo Rule

Devon has many seat documents across Chatty, VVAULT, NovaReturns, frame archives, Cursor exports, and Codex conversation exports. Those documents are evidence and history; they do not silently override Chatty's live runtime canon. Future agents must reconcile them through [lin-seat-cross-repo-reconciliation.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-seat-cross-repo-reconciliation.md) and classify contradictions instead of asking Devon to explain the same seat history again.
