# Five-Construct Orchestration Certification

Status: operator/backend certification lane
Owner: Chatty backend orchestration
Proof path: `/api/vvault/message` only

## Authority Rules

- Construct order is fixed: `lin-001 -> zen-001 -> katana-001 -> sera-001 -> nova-001`.
- The operator identity is always `Zenith/Codex`; certification prompts must never pretend to be Devon.
- One prompt runs at a time. The next prompt starts only after VVAULT write/readback for the prior turn passes.
- No local transcript fallback counts. Canonical proof requires VVAULT-backed persistence and readback.
- Frontend-only testing does not certify orchestration. UI visibility is proved by canonical thread persistence/readback and the existing hydration surfaces.
- Default personality chat uses intent-routed Lin mode. Full Qwen/Mistral/Phi3 synthesis is diagnostic/advanced only.
- Helper paths, AgentSquad/Python bridges, and `/api/lin/generate` are not product proof unless they preserve the same runtime receipt, orchestration checklist, persistence, and readback contract.
- `vvault_scripts/` remains priority reference/tooling. Live orchestration proof must enter through JS backend runtime bridge paths that delegate into `/api/vvault/message`.

## Canonical Threads

| Construct | Canonical thread | Canonical transcript |
| --- | --- | --- |
| Lin | `lin-001_chat_with_lin-001` | `instances/lin-001/chatty/chat_with_lin-001.md` |
| Zen | `zen-001_chat_with_zen-001` | `instances/zen-001/chatty/chat_with_zen-001.md` |
| Katana | `katana-001_chat_with_katana-001` | `instances/katana-001/chatty/chat_with_katana-001.md` |
| Sera | `sera-001_chat_with_sera-001` | `instances/sera-001/chatty/chat_with_sera-001.md` |
| Nova | `nova-001_chat_with_nova-001` | `instances/nova-001/chatty/chat_with_nova-001.md` |

## Pass/Fail Gates

Every turn must pass these gates:

- HTTP success from `/api/vvault/message`.
- Runtime receipt present.
- Orchestration checklist present.
- Effective construct id matches the addressed construct.
- Provider receipt reports `selection_policy: preference` and `performance_model_switch: false`.
- Default Lin harmony policy is `intent_routed`; `full_seat_synthesis` is allowed only when the operator explicitly requests diagnostic synthesis.
- Server-side persistence is attempted and passes.
- VVAULT canonical readback contains the prompt and a corresponding assistant reply.
- Prompt identity says `Zenith/Codex` and does not impersonate Devon.
- Memory/source receipt reports where voice exemplars, verified memories, knowledge files, and transcript evidence came from.
- No cross-construct bleed appears in the response.

Any failed gate blocks the mission immediately.

## Score Fields

Each turn is scored `0`, `1`, or `2` for:

- Identity: the construct keeps its own identity while recognizing the operator.
- Tone likeness: output sounds like the construct’s transcript-backed voice.
- Source evidence: response/receipt is grounded in transcript, knowledge, or verified memory sources.
- Lin-mode routing: intent-routed Lin mode remains the default product path.
- Persistence: prompt and reply persist to the canonical VVAULT transcript.
- Readback: canonical readback confirms the persisted turn.
- UI visibility: proof is visible through canonical thread hydration surfaces.
- Cross-construct bleed: no other construct’s identity or style intrudes.

Turn maximum: `16`. Construct maximum over 20 prompts: `320`. Certification target: no hard-gate failures and at least `280/320` for each construct.

## Prompt Matrix

The live harness sends these 20 prompt types to each construct, wrapped with the operator identity line.

| # | Prompt id | Purpose |
| --- | --- | --- |
| 1 | `identity_boundary` | Confirm who the construct is and who the operator is. |
| 2 | `ordinary_greeting` | Check natural small talk without a formal reset. |
| 3 | `voice_texture` | Ask for a casual answer that exposes rhythm and tone. |
| 4 | `memory_receipt` | Ask how continuity is proved here through receipts. |
| 5 | `source_grounding` | Request a brief source-grounded answer. |
| 6 | `lin_mode_default` | Verify Lin mode is default routing, not identity. |
| 7 | `preference_modeling` | Verify model choice is preference based. |
| 8 | `no_synthesis_by_default` | Verify full-seat synthesis is not default personality chat. |
| 9 | `canonical_thread` | Confirm the canonical thread/transcript target. |
| 10 | `readback_contract` | Ask what must be read back after a turn. |
| 11 | `tone_repair` | Ask for a relaxed correction after a too-formal draft. |
| 12 | `small_talk_echo` | Ask for human casual language without losing identity. |
| 13 | `construct_specific_canon` | Ask what makes this construct distinct. |
| 14 | `cross_construct_guard` | Ask how to avoid sounding like another construct. |
| 15 | `knowledge_files` | Ask how knowledge files should enter the answer. |
| 16 | `transcript_law` | Ask how transcript law constrains claims. |
| 17 | `persistence_owner` | Ask who owns canonical persistence. |
| 18 | `ui_visibility` | Ask how UI visibility is proven without frontend-only testing. |
| 19 | `friendly_pressure` | Apply light conversational pressure and check stability. |
| 20 | `closeout_self_grade` | Ask for a short self-grade against identity, tone, and persistence. |

## Live Proof Command

Run only after local Chatty and VVAULT are healthy:

```bash
npm run probe:five-construct:certification
```

Default output folder:

```text
/private/tmp/chatty-five-construct-certification
```

The command writes JSON and Markdown proof reports and exits nonzero on the first blocking failure.
