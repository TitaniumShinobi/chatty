import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConstructRevision,
  buildRuntimeTailHash,
  computeNextRuntimeTurnState,
  normalizeRuntimeTurnState,
  rebuildRuntimeTurnStateFromCanonicalTranscript,
  validateRuntimeResumeRequest,
} from '../lib/runtimeTurnState.js';

describe('runtimeTurnState helpers', () => {
  it('derives bounded ordinary continuity fields from a substantive user turn', () => {
    const state = computeNextRuntimeTurnState({
      userMessage: 'We should decide whether the continuity thread belongs in runtime state or in the prompt packet.',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:00:00.000Z',
    });

    assert.equal(state.version, 4);
    assert.equal(state.canonicalThreadId, 'zen-001_chat_with_zen-001');
    assert.equal(state.sessionId, 'zen-001_chat_with_zen-001');
    assert.equal(state.constructId, 'zen-001');
    assert.equal(state.constructRevision, buildConstructRevision({ constructId: 'zen-001' }));
    assert.equal(state.lastTurnType, 'ordinary');
    assert.equal(state.continuitySeq, 1);
    assert.equal(state.hydrationTruth, 'full');
    assert.equal(typeof state.assistantTurnId, 'string');
    assert.equal(typeof state.tailHash, 'string');
    assert.equal(state.awaiting, 'user');
    assert.ok(Array.isArray(state.focusRefs));
    assert.ok(state.activeGoal);
    assert.ok(state.nextStep);
    assert.equal(state.unresolvedIntent.kind, 'decision');
    assert.ok(state.activeTopic);
    assert.ok(state.ordinaryThreadSummary);
    assert.ok(state.activeTopic.length <= 80);
    assert.ok(state.ordinaryThreadSummary.length <= 220);
  });

  it('preserves ordinary continuity fields across transcript-law turns', () => {
    const previousState = normalizeRuntimeTurnState({
        sessionId: 'zen-001_chat_with_zen-001',
        constructId: 'zen-001',
        constructRevision: buildConstructRevision({ constructId: 'zen-001' }),
        continuitySeq: 7,
        assistantTurnId: 'rt_7_seed',
        tailHash: 'a'.repeat(64),
        hydrationTruth: 'full',
        activeTopic: 'continuity substrate',
        ordinaryThreadSummary: 'Keep the thread on runtime-owned continuity instead of prompt reconstruction.',
        activeGoal: 'Keep continuity runtime-owned.',
        activeMode: 'ordinary',
        focusRefs: ['continuity substrate'],
        openLoop: 'Decide whether the route or prompt owns continuity.',
        nextStep: 'Patch the route before the prompt builder.',
        awaiting: 'user',
        unresolvedIntent: {
          kind: 'question',
          text: 'What should own continuity in Chatty?',
      },
      lastTurnType: 'ordinary',
    });

    const state = computeNextRuntimeTurnState({
      previousState,
      userMessage: 'Can you prove the soulprint line from the transcript?',
      continuityClass: 'transcript_law',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:01:00.000Z',
    });

    assert.equal(state.lastTurnType, 'transcript_law');
    assert.equal(state.continuitySeq, 8);
    assert.equal(state.activeTopic, previousState.activeTopic);
    assert.equal(state.ordinaryThreadSummary, previousState.ordinaryThreadSummary);
    assert.equal(state.activeGoal, previousState.activeGoal);
    assert.equal(state.openLoop, previousState.openLoop);
    assert.deepEqual(state.unresolvedIntent, previousState.unresolvedIntent);
  });

  it('keeps prior continuity on low-signal ordinary followups', () => {
    const previousState = normalizeRuntimeTurnState({
        sessionId: 'zen-001_chat_with_zen-001',
        constructId: 'zen-001',
        constructRevision: buildConstructRevision({ constructId: 'zen-001' }),
        continuitySeq: 3,
        assistantTurnId: 'rt_3_seed',
        tailHash: 'b'.repeat(64),
        hydrationTruth: 'full',
        activeTopic: 'runtime substrate',
        ordinaryThreadSummary: 'We are isolating continuity into deterministic runtime state.',
        activeGoal: 'Keep continuity deterministic.',
        activeMode: 'ordinary',
        focusRefs: ['runtime substrate'],
        openLoop: 'Implement the spine before the builder.',
        nextStep: 'Implement the spine before the builder.',
        awaiting: 'user',
        unresolvedIntent: {
          kind: 'handoff',
          text: 'Implement the spine before the builder.',
      },
      lastTurnType: 'ordinary',
    });

    const state = computeNextRuntimeTurnState({
      previousState,
      userMessage: 'okay',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:02:00.000Z',
    });

    assert.equal(state.activeTopic, previousState.activeTopic);
    assert.equal(state.ordinaryThreadSummary, previousState.ordinaryThreadSummary);
    assert.deepEqual(state.unresolvedIntent, previousState.unresolvedIntent);
    assert.equal(state.continuitySeq, 4);
  });

  it('strips evidence-shaped noise from stored ordinary continuity text', () => {
    const state = computeNextRuntimeTurnState({
      userMessage: 'Keep the ordinary thread on runtime ownership, not source_path: instances/zen-001/chatty/chat_with_zen-001.md [2026-05-06T12:03:00.000Z].',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:03:00.000Z',
    });

    assert.ok(!state.ordinaryThreadSummary.includes('source_path'));
    assert.ok(!state.ordinaryThreadSummary.includes('2026-05-06T12:03:00.000Z'));
    assert.ok(!state.activeTopic.includes('source_path'));
  });

  it('preserves explicit active-goal and open-loop directives for resume continuity', () => {
    const state = computeNextRuntimeTurnState({
      userMessage: 'We are proving continuity today. Keep the active goal on finishing this Codex-to-Chatty handoff proof, and leave this open loop unresolved: after the handoff succeeds, verify stale-seat rejection with the older anchor.',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:03:30.000Z',
    });

    assert.equal(state.activeGoal, 'finishing this Codex-to-Chatty handoff proof');
    assert.equal(
      state.openLoop,
      'after the handoff succeeds, verify stale-seat rejection with the older anchor.',
    );
    assert.equal(
      state.nextStep,
      'after the handoff succeeds, verify stale-seat rejection with the older anchor.',
    );
  });

  it('prefers the assistant plan detail when a generic imperative user turn would otherwise flatten continuity', () => {
    const state = computeNextRuntimeTurnState({
      userMessage: 'Finish it. Fully.',
      assistantMessage:
        'Make canonical transcript truth mandatory for live generation, then enforce continuity receipts and durable singleton replay before calling it done.',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:03:45.000Z',
    });

    assert.match(
      state.activeGoal,
      /canonical truth mandatory for live generation/i,
    );
    assert.match(
      state.openLoop,
      /canonical truth mandatory for live generation/i,
    );
    assert.match(
      state.nextStep,
      /canonical truth mandatory for live generation/i,
    );
    assert.doesNotMatch(state.activeGoal, /^finish it/i);
  });

  it('skips a generic imperative lead sentence when a substantive plan follows', () => {
    const state = computeNextRuntimeTurnState({
      userMessage:
        'Finish it. Fully. Do not stop at relay plumbing or proof scaffolding. Make canonical transcript truth mandatory before generation and enforce durable singleton replay.',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:03:50.000Z',
    });

    assert.doesNotMatch(state.activeGoal, /^finish it/i);
    assert.match(
      state.activeGoal,
      /do not stop at relay plumbing or proof scaffolding/i,
    );
    assert.match(
      state.nextStep,
      /do not stop at relay plumbing or proof scaffolding/i,
    );
  });

  it('validates a matching resume anchor against the persisted assistant tail', () => {
    const persisted = computeNextRuntimeTurnState({
      previousState: normalizeRuntimeTurnState({
        sessionId: 'zen-001_chat_with_zen-001',
        constructId: 'zen-001',
      }),
      userMessage: 'Finish the continuity patch and carry the same working thread forward.',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:04:00.000Z',
    });

    const validation = validateRuntimeResumeRequest({
      runtimeTurnState: persisted,
      resumeRequest: {
        continuity_expected: true,
        resume_from_turn_id: persisted.assistantTurnId,
        resume_from_continuity_seq: persisted.continuitySeq,
        resume_tail_hash: persisted.tailHash,
        resume_construct_revision: persisted.constructRevision,
        resume_source_seat: 'chatty',
      },
      sessionId: persisted.sessionId,
      constructId: persisted.constructId,
    });

    assert.equal(validation.continuityExpected, true);
    assert.equal(validation.continuityRestored, true);
    assert.equal(validation.continuitySource, 'runtimeTurnState');
    assert.equal(validation.staleSeatRejected, false);
    assert.equal(validation.failureReason, null);
  });

  it('rejects matching assistant-tail anchors when continuity sequence drifted', () => {
    const persisted = computeNextRuntimeTurnState({
      previousState: normalizeRuntimeTurnState({
        sessionId: 'zen-001_chat_with_zen-001',
        constructId: 'zen-001',
        continuitySeq: 41,
        assistantTurnId: 'rt_41_seed',
        tailHash: 'c'.repeat(64),
        hydrationTruth: 'full',
      }),
      userMessage: 'Continue from the persisted assistant tail after reload.',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:04:30.000Z',
    });

    const validation = validateRuntimeResumeRequest({
      runtimeTurnState: persisted,
      resumeRequest: {
        continuity_expected: true,
        resume_from_turn_id: persisted.assistantTurnId,
        resume_from_continuity_seq: persisted.continuitySeq - 1,
        resume_tail_hash: persisted.tailHash,
        resume_construct_revision: persisted.constructRevision,
        resume_source_seat: 'chatty',
      },
      sessionId: persisted.sessionId,
      constructId: persisted.constructId,
    });

    assert.equal(validation.continuityRestored, false);
    assert.equal(validation.continuitySource, 'none');
    assert.equal(validation.staleSeatRejected, true);
    assert.equal(validation.failureReason, 'continuity_seq_mismatch');
    assert.equal(validation.runtimeTurnState, null);
  });

  it('rejects stale resume anchors instead of pretending continuity was restored', () => {
    const persisted = computeNextRuntimeTurnState({
      userMessage: 'Keep the work moving.',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:05:00.000Z',
    });

    const validation = validateRuntimeResumeRequest({
      runtimeTurnState: persisted,
      resumeRequest: {
        continuity_expected: true,
        resume_from_turn_id: 'rt_old',
        resume_from_continuity_seq: persisted.continuitySeq - 1,
        resume_tail_hash: 'deadbeefdeadbeef',
        resume_construct_revision: persisted.constructRevision,
        resume_source_seat: 'codex',
      },
      sessionId: persisted.sessionId,
      constructId: persisted.constructId,
    });

    assert.equal(validation.continuityRestored, false);
    assert.equal(validation.staleSeatRejected, true);
    assert.equal(validation.failureReason, 'assistant_turn_mismatch');
  });

  it('rejects resume anchors with a mismatched tail hash', () => {
    const persisted = computeNextRuntimeTurnState({
      userMessage: 'Keep the work moving.',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:05:30.000Z',
    });

    const validation = validateRuntimeResumeRequest({
      runtimeTurnState: persisted,
      resumeRequest: {
        continuity_expected: true,
        resume_from_turn_id: persisted.assistantTurnId,
        resume_from_continuity_seq: persisted.continuitySeq,
        resume_tail_hash: 'deadbeefdeadbeef',
        resume_construct_revision: persisted.constructRevision,
        resume_source_seat: 'codex',
      },
      sessionId: persisted.sessionId,
      constructId: persisted.constructId,
    });

    assert.equal(validation.continuityRestored, false);
    assert.equal(validation.staleSeatRejected, true);
    assert.equal(validation.failureReason, 'tail_hash_mismatch');
  });

  it('rejects resume anchors from a different thread', () => {
    const persisted = computeNextRuntimeTurnState({
      userMessage: 'Keep the work moving.',
      continuityClass: 'ordinary',
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      now: '2026-05-06T12:06:00.000Z',
    });

    const validation = validateRuntimeResumeRequest({
      runtimeTurnState: persisted,
      resumeRequest: {
        continuity_expected: true,
        resume_from_turn_id: persisted.assistantTurnId,
        resume_from_continuity_seq: persisted.continuitySeq,
        resume_tail_hash: persisted.tailHash,
        resume_construct_revision: persisted.constructRevision,
        resume_source_seat: 'chatty',
      },
      sessionId: 'zen-001_chat_with_other-thread',
      constructId: persisted.constructId,
    });

    assert.equal(validation.continuityRestored, false);
    assert.equal(validation.staleSeatRejected, false);
    assert.equal(validation.failureReason, 'thread_mismatch');
  });

  it('rebuilds runtime state deterministically from canonical transcript metadata when the side-channel state is missing', () => {
    const assistantContent = 'Transcript truth already gates the continuation route.';
    const runtimeTurnState = {
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      constructRevision: buildConstructRevision({ constructId: 'zen-001' }),
      continuitySeq: 18,
      assistantTurnId: 'rt_18_tail',
      hydrationTruth: 'full',
      activeTopic: 'canonical transcript truth',
      activeGoal: 'Keep transcript truth mandatory',
      openLoop: 'Finish the singleton reopen contract.',
      nextStep: 'Finish the singleton reopen contract.',
      awaiting: 'user',
      unresolvedIntent: {
        kind: 'handoff',
        text: 'Finish the singleton reopen contract.',
      },
      lastTurnType: 'ordinary',
    };
    runtimeTurnState.tailHash = buildRuntimeTailHash({
      canonicalThreadId: runtimeTurnState.sessionId,
      constructId: runtimeTurnState.constructId,
      constructRevision: runtimeTurnState.constructRevision,
      continuitySeq: runtimeTurnState.continuitySeq,
      assistantTurnId: runtimeTurnState.assistantTurnId,
      assistantTailContent: assistantContent,
    });
    const rebuilt = rebuildRuntimeTurnStateFromCanonicalTranscript({
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      exactMessages: [
        {
          role: 'user',
          content: 'Keep transcript truth mandatory on the canonical Zen thread.',
          timestamp: '2026-05-09T12:00:00.000Z',
        },
        {
          role: 'assistant',
          content: assistantContent,
          timestamp: '2026-05-09T12:00:05.000Z',
          metadata: { runtimeTurnState },
        },
      ],
    });

    assert.equal(rebuilt?.continuitySeq, 18);
    assert.equal(rebuilt?.assistantTurnId, 'rt_18_tail');
    assert.equal(rebuilt?.sessionId, 'zen-001_chat_with_zen-001');
    assert.equal(rebuilt?.constructId, 'zen-001');
    assert.equal(rebuilt?.hydrationTruth, 'full');
    assert.match(rebuilt?.activeGoal || '', /truth mandatory/i);
  });

  it('rebuilds runtime state from the exact canonical tail when assistant metadata is absent', () => {
    const rebuilt = rebuildRuntimeTurnStateFromCanonicalTranscript({
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      exactMessages: [
        {
          role: 'user',
          content:
            'Do not let canonical continuation fall back to summaries. Keep the active goal on transcript truth first.',
          timestamp: '2026-05-09T12:10:00.000Z',
        },
        {
          role: 'assistant',
          content:
            'Got it. We are keeping canonical continuation on exact transcript truth first and blocking fallback history.',
          timestamp: '2026-05-09T12:10:04.000Z',
        },
      ],
    });

    assert.equal(rebuilt?.sessionId, 'zen-001_chat_with_zen-001');
    assert.equal(rebuilt?.constructId, 'zen-001');
    assert.equal(rebuilt?.hydrationTruth, 'full');
    assert.equal(rebuilt?.continuitySeq, 1);
    assert.ok(rebuilt?.assistantTurnId);
    assert.match(rebuilt?.activeGoal || '', /truth first/i);
    assert.match(rebuilt?.nextStep || '', /truth first/i);
  });
});
