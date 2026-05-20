# Lin Seat Cross-Repo Reconciliation

This is the findable reconciliation map for Lin seat documents that live outside Chatty or inside older Chatty surfaces. Chatty owns the live runtime contract, but older repo documents are still continuity evidence. Future agents must inspect and classify them instead of asking Devon to re-explain the seat history.

Runtime canon:

- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/linSeatCanon.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md`
- `/Users/devonwoodson/Documents/GitHub/chatty/config/linModelDefaults.json`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/fullSeatSynthesis.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/orchestrationChecklist.js`

Canon version: `lin-three-i-2026-04-19`.

## Non-Negotiable Decision

There is no fourth continuity seat unless Devon explicitly reopens the decision.

Continuity, truth, evidence, risk, structure, coding, and canon verification belong to Intelligence. Qwen3-Coder is the active local Intelligence model. DeepSeek and Qwen2.5-Coder are not the Lin Intelligence default or fallback. Ingenuity owns creative synthesis and voice shaping. Interaction owns dialogue flow and clarity.

## Source Priority

When documents disagree, use this order:

1. Devon's explicit current canon, if given in the active task.
2. Chatty live code and receipts on `/api/vvault/message`.
3. Chatty standards docs listed above.
4. Supabase/VVAULT transcript evidence and runtime receipts.
5. Cross-repo docs and attached assets as design history or continuity evidence.
6. Conversation exports and archive logs as supporting evidence, not runtime proof.

Older docs are not thrown away. They are classified.

## Reconciliation Labels

- `runtime canon`: Current Chatty code/docs that own live behavior.
- `supporting history`: Explains why the current canon exists but does not override it.
- `superseded runtime default`: Names DeepSeek as primary, names DeepSeek as the Lin Intelligence fallback, uses the old DeepSeek/Phi3/Mistral triad, or lets stale OpenAI/OpenRouter placeholder defaults drive Lin `smalltalk`, `creative`, or `coding`.
- `unwired design intent`: Describes a seat or orchestration concept that never reached `/api/vvault/message` receipts.
- `documentation compression`: Collapses Lin into only GPT Creator or only continuity guardian and omits the broader substrate role.
- `needs Devon reconciliation`: Real ambiguity remains after checking code, receipts, and these source docs.

## Known Cross-Repo Evidence

| Path | Current classification | How to read it |
| --- | --- | --- |
| `/Users/devonwoodson/Documents/GitHub/CODEX_PROMPT_LEGAL_AND_ORCHESTRATION.md` | supporting history | Investigation prompt for `orchestrationMode`, legal injection, and prompt-builder coverage. It proves orchestration-mode questions existed before the Three I canon, not that older mode behavior remains correct. |
| `/Users/devonwoodson/Documents/GitHub/codex_conversations/codex_lin_orchestration.txt` | supporting history | Conversation export for Lin orchestration design; use for historical context and search terms, not live routing proof. |
| `/Users/devonwoodson/Documents/GitHub/codex_conversations/codex_lin_orchestration_deep_file_parsing.txt` | supporting history | Deep parsing/orchestration continuity history. Reconcile any seat names through the Three I canon before implementing. |
| `/Users/devonwoodson/Documents/GitHub/cursor_conversations/cursor_why_did_chatty_cli_fail.md` | superseded runtime default where it names old triad defaults | Contains old coding/creative seat flow and DeepSeek references. Treat old model defaults as replaced by Qwen-backed Intelligence. |
| `/Users/devonwoodson/Documents/GitHub/cursor_conversations/cursor_triad_sanity_check_typescript_er.md` | supporting history | Useful for triad health and diagnostics history, but old seat names must be mapped to Intelligence, Ingenuity, and Interaction. |
| `/Users/devonwoodson/Documents/GitHub/cursor_conversations/cursor_unified_lin_orchestrator_review.md` | supporting history | Orchestrator review evidence; only runtime receipts prove current behavior. |
| `/Users/devonwoodson/Documents/GitHub/cursor_conversations/cursor_continuing_with_lin_orchestratio.md` | supporting history | Continuation notes for Lin orchestration. Use as archive evidence and reconcile through this file. |
| `/Users/devonwoodson/Documents/GitHub/vvault/attached_assets/Pasted-Transcript-seat-continuity-codex-hello-1-txt-lines-1256_1769190089602.txt` | supporting history | Explicitly links transcript ingestion, VVAULT capsules, tone detection, and continuity locks. It supports continuity as evidence/canon work, now assigned to Intelligence. |
| `/Users/devonwoodson/Documents/GitHub/vvault/attached_assets/cursor_comprehensive_overview_of_chatty_1769043769122.md` | supporting history | Large Chatty code snapshot. It may preserve old `orchestrationMode` and model defaults; do not treat it as current runtime state. |
| `/Users/devonwoodson/Documents/GitHub/NovaReturns/Intelligence/timeline_sync.md` | supporting history / legal-continuity context | High-level intelligence/timeline evidence. It does not define Chatty seat defaults, but it helps explain why evidence discipline belongs in Intelligence. |
| `/Users/devonwoodson/Documents/GitHub/frame/_archive/**` | supporting history | Broad archive evidence. Search narrowly and classify contradictions instead of flattening them. |

## Search Protocol

Before changing seat behavior, search broadly enough to catch old language:

```bash
rg -n "DeepSeek \\+ Phi3 \\+ Mistral|coding seat|creative seat|conversation seat|seat continuity|Lin orchestration|orchestrationMode|Qwen|continuity guardian" /Users/devonwoodson/Documents/GitHub
```

Then reconcile findings this way:

1. If a document says `DeepSeek + Phi3 + Mistral` as the model triad, label it `superseded runtime default`.
2. If a document says the coding seat only codes, label it `documentation compression`.
3. If a document describes continuity as separate from all three seats, map it to Intelligence unless Devon explicitly reopens the fourth-seat decision.
4. If a document describes Lin as only GPT Creator, label it `documentation compression`.
5. If the document describes an implementation path outside `/api/vvault/message`, label it `unwired design intent` unless the runtime receipt proves it is active.

## Implementation Rule

Do not edit external repos just to make them match Chatty. Add Chatty-local reconciliation notes and runtime tests first. External repo edits should be a separate, explicit task because those files may be legal records, archived conversation exports, or evidence snapshots.
