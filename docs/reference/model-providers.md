# Model Providers

Archive doctrine:

Archive docs are archive-backed continuity evidence. When archive docs conflict with live code or newer summaries, classify the conflict as implementation drift, documentation compression, unwired design intent, superseded with evidence, or needs Devon reconciliation. Do not dismiss archive docs as non-authoritative merely because they are archived.

Live code authority for provider/model defaults:

- `/Users/devonwoodson/Documents/GitHub/chatty/config/linModelDefaults.json`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/linSeatCanon.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/lib/linModelDefaults.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/src/config/linModelDefaults.ts`
- `/Users/devonwoodson/Documents/GitHub/chatty/src/lib/modelProviders.ts`
- `/Users/devonwoodson/Documents/GitHub/chatty/src/lib/browserSeatRunner.ts`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/linChat.js`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/routes/vvault.js`

## Lin Defaults

Lin local-first defaults are:

- Intelligence (`coding` legacy key): `ollama:qwen2.5-coder:latest`
- Intelligence upgrade target: `ollama:qwen3-coder:30b`
- Ingenuity (`creative` legacy key): `ollama:mistral:latest`
- Interaction (`conversation`/`smalltalk` legacy keys): `ollama:phi3:latest`

DeepSeek is not the Intelligence default or fallback. It remains a manual/legacy coding model option, but Lin's fallback stays in the Qwen family.

The shared JSON file and `server/lib/linSeatCanon.js` are the live code authority for Lin seat defaults. The server wrapper loads the JSON with filesystem loading. The client wrapper imports the same JSON. Tests must prove those wrappers stay in parity. See [lin-three-i-seat-canon.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md). When older repos or exported conversations disagree about seat defaults, reconcile them through [lin-seat-cross-repo-reconciliation.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-seat-cross-repo-reconciliation.md).

## Routing Contract

- Lin mode always resolves through the shared Three I local triad. Empty config, placeholder config, known legacy Lin cloud defaults, and stale saved cloud fields resolve to Lin defaults when Ollama is available.
- Lin mode suppresses saved/stale configured provider/model fields and exposes the suppressed value in runtime receipts.
- Custom Models mode honors explicit manual `ollama:`, `openrouter:`, or `openai:` values as routing overrides only.
- Sim mode preserves the selected construct's local artifact lock, usually `ollama:<construct>`.
- Provider/model overrides must never change construct identity, construct name, memory scope, or instructions.
- Provider/model choice is preference routing, not a performance-based personality shortcut.
- Lin uses intent-routed seats by default. Full triad synthesis is diagnostic/advanced behavior unless a future product mode explicitly enables and receipts it.
- If a requested provider is unavailable, fallback must be visible in the runtime receipt/checklist rather than leaking framework language into the construct reply.
- `/api/vvault/message` owns construct-quality runtime routing.
- `/api/lin/generate` is a helper path for Lin Create-tab assistance and seat experiments.

## Reconciliation Labels

- `implementation drift`: Previous OpenRouter Lin defaults in live code contradicted Lin local-first canon.
- `documentation compression`: References that narrowed Lin to Create-tab provider choice omitted the broader orchestration substrate.
- `unwired design intent`: Archive seat-triad designs existed before all UI defaults, helper paths, and runtime receipts used one shared default source.
- `superseded with evidence`: Archive Synth/Lin equivalence must be read through Devon's correction that Synth became Zen and Lin split off as substrate.
- `needs Devon reconciliation`: Use for unresolved provider identity ambiguity that cannot be resolved from runtime receipt, archive evidence, or Devon's explicit canon.

## Receipt Fields

Runtime receipts and checklists must expose:

- effective construct id/name
- orchestration mode
- final provider/model
- model source
- configured/requested provider/model
- local-first or cloud fallback state
- seat defaults or manual overrides
- identity source
- memory source
- preview overlay state
- persistence owner
