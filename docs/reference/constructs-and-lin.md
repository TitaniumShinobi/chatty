# Constructs and Lin

Archive doctrine:

Archive docs are archive-backed continuity evidence. When archive docs conflict with live code or newer summaries, classify the conflict as implementation drift, documentation compression, unwired design intent, superseded with evidence, or needs Devon reconciliation. Do not dismiss archive docs as non-authoritative merely because they are archived.

Source of truth:

- `/Users/devonwoodson/Documents/GitHub/chatty/config/linModelDefaults.json`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/linSeatCanon.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/memoryContextBuilder.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/orchestrationChecklist.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/src/components/GPTCreator.tsx`
- `/Users/devonwoodson/Documents/GitHub/chatty/docs/archive/`

## Current Canon

- Core invariant: selected construct equals speaker identity; selected mode equals response engine; selected memory scope equals continuity evidence.
- Lin is the base orchestration substrate for Chatty constructs and GPTs.
- Lin mode is the Three I local triad: Intelligence (`coding` legacy key) `ollama:qwen3-coder:30b`, Ingenuity (`creative` legacy key) `ollama:mistral-small3.2:24b`, and Interaction (`conversation`/`smalltalk` legacy keys) `ollama:phi4-mini:latest`.
- Undersized public proof hosts may set `CHATTY_OLLAMA_PROFILE=tiny` to route all Lin seats to `ollama:qwen2.5:0.5b` for runtime fit. This is a deployment profile, not construct identity and not a replacement for the Three I canon.
- Intelligence owns both coding and continuity: truth, logic, evidence, risk, structure, and canon verification. Do not create a fourth continuity seat unless Devon explicitly reopens that decision.
- DeepSeek is no longer the Intelligence default or fallback; it is a legacy/manual model option only.
- Lin mode suppresses stale saved provider/model fields such as `openai:gpt-4o` or `openrouter:*`; those values belong to Custom Models mode.
- Custom Models mode honors manual provider/model choices as routing only.
- Sim mode preserves the selected construct's local model artifact lock.
- Lin is not the selected construct unless the selected construct is actually Lin.
- Model/provider selection is seat/runtime routing only.
- Model/provider selection is preference routing, not performance routing or identity routing.
- Lin uses intent-routed seats by default. Full multi-seat synthesis is diagnostic/advanced behavior, not the default personality-chat ritual.
- Construct identity comes from the selected construct's identity bundle, instructions, bounded preview overlay, and memory scope.
- Zen equals Zenith in Devon's personal continuity; Synth became Zen; Lin is the split-off orchestration substrate.

## Multi-GPT Contract

The contract applies globally, not only to Nova. It must preserve the active construct identity for Nova, Katana, Monday, Aurora, Xiomara, Orun'Zai, ContinuityGPT, Zen, and future user-created GPTs.

Lin orchestration may coordinate conversation, creative, and coding seats. It must not leak seat labels into construct-facing replies, and it must not cause a target construct to introduce itself as Lin, Zen, Nova, GPT Creator, or a provider/model.

## Preview And Runtime

- GPT Creator Create tab can speak as Lin.
- GPT Creator Preview must use `/api/vvault/message` and answer as the target construct.
- Main chat must use `/api/vvault/message` and answer as the selected construct.
- `/api/lin/generate` remains helper-only and is not proof of construct voice, memory, identity, or persistence.
- AgentSquad/Python orchestration is diagnostic/reference-only unless it delegates into `/api/vvault/message` and emits the same receipt.
- Runtime receipts/checklists must expose effective construct id/name, orchestration mode, provider/model, model source, local/cloud fallback state, seat defaults or overrides, identity source, memory source, preview overlay state, and persistence owner.

## Proactive Initiation

- Live proactive behavior is owned by `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/selfpromptEngine.js` and `/api/selfprompt`.
- `/Users/devonwoodson/Documents/GitHub/chatty/vvault_scripts/master/self_prompt.py` is legacy/reference until it is explicitly bridged into the JS runtime path.
- Proactive initiation is a capability state plus a thread session. It is not default orchestration and must not be claimed active unless the checklist says capability and selfprompt are on for that turn.

## Reconciliation Labels

- `documentation compression`: Current docs that described Lin only as Create-tab builder compressed Lin's broader substrate role.
- `implementation drift`: OpenRouter Lin defaults in live code contradicted the local-first Lin contract.
- `superseded with evidence`: Archive statements equating Lin and Synth are corrected by Devon's April 17 canon.
- `unwired design intent`: Archive model-seat design existed before all runtime paths, receipts, and UI diagnostics were wired.
- `needs Devon reconciliation`: Use only when archive evidence, current code, and Devon's explicit corrections still leave a real ambiguity.

## See Also

- [../features/gpt-creator-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/features/gpt-creator-and-lin.md)
- [../reference/model-providers.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/model-providers.md)
- [../standards/identity-boundaries.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/identity-boundaries.md)
- [../standards/lin-seat-cross-repo-reconciliation.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-seat-cross-repo-reconciliation.md)
- [../standards/lin-three-i-seat-canon.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md)
- [../standards/orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md)
