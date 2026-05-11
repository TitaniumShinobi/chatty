# Sim vs GPT vs VSI Boundary

This document defines the runtime boundary so future changes do not conflate model artifacts with orchestration behavior.

## Short Version

- **GPT (Chatty config/runtime):** authoring state and orchestration-driven behavior.
- **Sim (Ollama model artifact):** built model with stable identity baseline baked in.
- **VSI layer:** governance/execution boundary intended to unify orchestration + policy + runtime controls.

## What Gets Baked into a Sim

Sim builds are created by `scripts/build_sims.py` from instance identity files.

- Canonical prompt source: `instances/<callsign>/identity/prompt.json`
- Fallback prompt source: `instances/<callsign>/identity/prompt.txt` (legacy)
- Conditioning source: `instances/<callsign>/identity/conditioning.txt`
- Optional capsule summary: appended only when build flags request it

This gives a stable identity baseline at model level.

## What Stays Outside the Model (Runtime)

The following remain orchestration/runtime concerns:

- routing/orchestration decisions
- transcript retrieval and memory injection
- policy gates and capability checks
- post-processing/guardrails/tooling
- API/service execution paths and job control

In other words: a Sim is the generator artifact, not the whole behavior stack.

## Current Architecture Reality

Today, full behavior is still split:

1. **Model artifact layer:** Sim identity baseline
2. **Runtime layer:** orchestration + context assembly + policies

Planned unification target is the **VSI layer**, where governance and runtime control are consolidated.

## UI Contract (GPT Creator)

`Tone & Orchestration` now has three lanes:

1. `Lin`: platform orchestration defaults.
2. `Custom Models`: cloud-managed model selection (OpenAI/OpenRouter).
3. `Sim`: local Ollama Sim lock for the construct.

Rules:

1. `Sim` lane appears only after a successful Forge Sim build (or when loading a construct already saved in Sim mode).
2. In `Sim` lane, runtime is hard-pinned to the construct model (`ollama:<callsign-without-001>`), and Conversation/Creative/Coding stay on that model.
3. Conversation and Creative dropdowns in `Custom Models` intentionally exclude Ollama choices to avoid bypassing Sim lock semantics.

## Dev Rules

When changing behavior:

1. If the change is identity-baseline/model build logic, edit sim build inputs (`prompt.json`, conditioning, build flags).
2. If the change is turn-by-turn behavior, edit orchestration/runtime pipeline code.
3. Do not assume a Sim build change replaces runtime orchestration changes.
4. Keep `prompt.json` canonical unless explicitly migrating the architecture.
