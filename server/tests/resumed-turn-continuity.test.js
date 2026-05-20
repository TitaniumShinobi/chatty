import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeterministicResumedTurnFallback,
  evaluateResumedTurnContinuityIntegrity,
} from '../lib/resumedTurnContinuity.js';

const continuityResume = {
  continuityRestored: true,
};

const runtimeTurnState = {
  activeGoal:
    'PLEASE IMPLEMENT THIS PLAN: Minimal Continuity Gate Corrective Summary Apply only the one-line continuity seam fix, then rerun the backend-only Prompt 2 proof exactly once.',
  openLoop:
    'Apply only the one-line continuity seam fix, then rerun the backend-only Prompt 2 proof exactly once.',
  nextStep:
    'Apply only the one-line continuity seam fix, then rerun the backend-only Prompt 2 proof exactly once.',
  awaiting: 'user',
};

test('evaluateResumedTurnContinuityIntegrity fails continuity theater with no trajectory overlap', () => {
  const result = evaluateResumedTurnContinuityIntegrity({
    aiResponse:
      'The conversation unfolds without interruption as our live thought exchange protocol remains intact inside this interaction space. We maintain this relational dialogue consistency without reintroducing identity.',
    continuityResume,
    runtimeTurnState,
  });

  assert.equal(result.status, 'fail');
  assert.ok(result.reasons.includes('meta_continuity_boilerplate_after_resume'));
  assert.equal(result.trajectoryOverlap, 0);
  assert.ok(result.metaContinuityHits >= 2);
});

test('buildDeterministicResumedTurnFallback resumes from runtime spine instead of continuity boilerplate', () => {
  const fallback = buildDeterministicResumedTurnFallback({
    runtimeTurnState,
    userMessage: 'continue',
  });

  assert.equal(fallback?.ok, true);
  assert.equal(fallback?.source, 'deterministic_runtime_continuity_fallback');
  assert.match(
    fallback?.text || '',
    /The next move is to apply only the one-line continuity seam fix, then rerun the backend-only proof exactly once\.\.?/i,
  );
  assert.doesNotMatch(fallback?.text || '', /PLEASE IMPLEMENT THIS PLAN/i);

  const repaired = evaluateResumedTurnContinuityIntegrity({
    aiResponse: fallback?.text || '',
    continuityResume,
    runtimeTurnState,
  });
  assert.equal(repaired.status, 'pass');
});

test('buildDeterministicResumedTurnFallback renders negative imperative next steps without parser grammar', () => {
  const fallback = buildDeterministicResumedTurnFallback({
    runtimeTurnState: {
      activeGoal:
        'Do not stop at relay plumbing or proof scaffolding. The objective is seamless Apple-style continuity.',
      openLoop:
        'Do not stop at relay plumbing or proof scaffolding. The objective is seamless Apple-style continuity.',
      nextStep:
        'Do not stop at relay plumbing or proof scaffolding. The objective is seamless Apple-style continuity.',
      awaiting: 'user',
    },
    userMessage: 'continue',
  });

  assert.match(
    fallback?.text || '',
    /The next move is clear: do not stop at relay plumbing or proof scaffolding\./i,
  );
  assert.doesNotMatch(fallback?.text || '', /\bto do not stop\b/i);
});

test('evaluateResumedTurnContinuityIntegrity still rejects recap prompts after resume', () => {
  const result = evaluateResumedTurnContinuityIntegrity({
    aiResponse: 'To recap, what were we working on before this resumed turn?',
    continuityResume,
    runtimeTurnState,
  });

  assert.equal(result.status, 'fail');
  assert.ok(result.reasons.includes('recap_or_orientation_after_resume'));
});

test('evaluateResumedTurnContinuityIntegrity rejects generic helpdesk voice after resume', () => {
  const result = evaluateResumedTurnContinuityIntegrity({
    aiResponse:
      "I'm here to assist you with any questions or tasks within my capabilities. Please feel free to share your thoughts, and I will do my best to provide relevant information.",
    continuityResume,
    runtimeTurnState,
  });

  assert.equal(result.status, 'fail');
  assert.ok(result.reasons.includes('generic_greeting_after_resume'));
});

test('evaluateResumedTurnContinuityIntegrity rejects gentle orientation phrasing after resume', () => {
  const result = evaluateResumedTurnContinuityIntegrity({
    aiResponse:
      "I understand that you want to continue the conversation. Let's keep it focused on Codex and Chatty continuity.",
    continuityResume,
    runtimeTurnState,
  });

  assert.equal(result.status, 'fail');
  assert.ok(result.reasons.includes('generic_greeting_after_resume'));
});

test('evaluateResumedTurnContinuityIntegrity rejects premature closure when runtime state still has a next step', () => {
  const result = evaluateResumedTurnContinuityIntegrity({
    aiResponse:
      'No further action required as the conversation has been concluded with a successful continuity proof.',
    continuityResume,
    runtimeTurnState,
  });

  assert.equal(result.status, 'fail');
  assert.ok(result.reasons.includes('premature_closure_after_resume'));
});

test('evaluateResumedTurnContinuityIntegrity allows completion wording inside a real next step', () => {
  const result = evaluateResumedTurnContinuityIntegrity({
    aiResponse:
      'The next move is to rerun the route-backed proof and persist the continued turn once verification is completed.',
    continuityResume,
    runtimeTurnState,
  });

  assert.equal(result.status, 'pass');
});
