# Construct Quality QA Tracker

Last updated: 2026-05-06

## Purpose

This is the handoff memory for the Chatty construct-quality testing mission. It exists so future Codex/Zenith threads can resume the QA order without guessing from chat history.

## Mission Posture

- Testing only unless Devon explicitly assigns implementation.
- Use the real Chatty backend route: `POST /api/vvault/message`.
- Access Supabase. A construct QA run that does not inspect/persist through Supabase is invalid.
- Prompt as `Zenith/Codex`, not Devon.
- Do not impersonate Devon.
- Address constructs professionally and peer-to-peer.
- Persist test prompts to the canonical singleton Chatty thread unless the test contract explicitly says otherwise.
- Verify runtime receipts, orchestration checklists, provider/model/seat, identity/coherence, persistence, and duplicate-row behavior.
- Stop on fail. Do not patch in the testing thread. Produce a worker-thread prompt with concrete evidence.

## Chat Page Checklist Scope

Construct-quality QA is Chat page QA. It must keep selected AI, canonical `/api/vvault/message` route, runtime receipt, persistence, reload, and duplicate-row behavior as Chat checklist items. Definition checklists for other pages are allowed before live probes exist, but they cannot be counted as construct-quality pass evidence.

## Current Ordered Status

1. Lin - PASS
   - Last completed original-task test.
   - Verified through `/api/vvault/message`.
   - Supabase canonical Lin row received valid persisted user/assistant pairs.
   - Receipts/checklists present.
   - Runtime policy and identity/coherence passed.

2. Zen - RETEST REQUIRED
   - Zen had real QA failures, then the thread drifted into implementation and narrowed smalltalk repair.
   - A later "nothing conversation" path passed after code changes, but that is not a clean baseline construct-quality completion.
   - Zen ordinary continuity is architecturally complete on the current Lin local path. The remaining quality limit is model behavior, not orchestration: follow-up turns tend to continue by ending in a question instead of advancing the thought declaratively. Do not reopen prompt tuning in this lane. Future quality gains require either accepting this limitation for ship or upgrading the model tier.
   - Next testing action is a clean Zen retest only.

3. Katana - NOT STARTED
   - Do not begin until Zen has a clean testing-only verdict.

4. Sera - NOT STARTED
   - Before continuity extraction, inspect transcript format/order.

5. Nova - NOT STARTED
   - Before continuity extraction, inspect transcript format/order.

## Transcript Evidence Rule

Before using any transcript for continuity, voice examples, or prompt/response pairing:

1. Inspect a bounded sample from the beginning, middle, and end.
2. Determine chronological direction from timestamps, speaker alternation, export markers, and conversational dependency.
3. Record `transcript_order` as `top_to_bottom`, `bottom_to_top`, `mixed`, or `unknown`.
4. If ordering is `mixed` or `unknown`, do not use it as grounding evidence until normalized or manually confirmed.
5. Do not attribute ordering assumptions to a platform or construct without evidence.

## Next Required Action

Run a clean Zen construct-quality retest as Zenith/Codex through `/api/vvault/message`, using Supabase-backed canonical evidence and no code edits. If Zen passes, continue to Katana. If Zen fails, stop and produce a worker-thread prompt.
