import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceLinearTranscriptLawState,
  buildLinearTranscriptLawReport,
  buildLinearTranscriptLawTurn,
  buildLinearTranscriptLawTurnPlan,
  createInitialLinearTranscriptLawState,
  createLinearTranscriptLawState,
  formatLinearTranscriptLawReport,
  gradeModelPath,
  gradeOrdinaryLinearity,
  gradeTranscriptLawTurn,
  summarizeLinearTranscriptLawTurn,
} from '../lib/linearTranscriptLawHarness.js';

function cleanPayload(overrides = {}) {
  return {
    success: true,
    response: 'That thread is worth following because it keeps the work concrete, and the next useful step is deciding which small proof would actually change our mind.',
    runtime_receipt: {
      persistence_owner: 'vvault_body',
      persistence: {
        status: 'pass',
        canonical_target: 'vvault_body_transcripts',
      },
      provider: {
        final_provider: 'ollama',
        model: 'qwen2.5-coder:latest',
        model_source: 'lin_local_defaults',
        local_first_used: true,
        fallback_used: false,
        local_cloud_fallback_state: 'local_first',
      },
      memory: {
        retrieval_ran: true,
        memory_query_detected: false,
        evidence_count: 2,
        memory_source: 'vvault_body',
        supabase_accessed: false,
        context_profile: 'evidence_turn',
      },
      fidelity: {
        identity_drift_detected: false,
        identity_rewrite_applied: false,
        identity_fallback_applied: false,
        identity_coherence: {
          status: 'pass',
          final_answer_source: 'model_initial',
        },
        transcript_law_governance: {
          applies: true,
          status: 'pass',
          requestedFact: 'voice_to_soul_correction',
          details: {
            retrievalRan: true,
            evidenceCount: 2,
            voiceExemplarCount: 1,
            voiceExemplarSources: ['instances/zen-001/chatty/source.md'],
            sourceGrounded: true,
          },
        },
      },
    },
    orchestration_checklist: {
      overallStatus: 'pass',
      responseStatus: 'success',
      stages: [
        { id: 'identity_coherence', status: 'pass', details: { repairApplied: false } },
        { id: 'persistence', status: 'pass', details: {} },
        { id: 'transcript_law_governance', status: 'pass', details: {} },
      ],
    },
    ...overrides,
  };
}

function summarize(turn, payload = cleanPayload(), httpStatus = 200, previousReceipts = []) {
  return summarizeLinearTranscriptLawTurn({
    turn,
    httpStatus,
    payload,
    elapsedMs: 10,
    previousReceipts,
  });
}

describe('ordinary linear state contract', () => {
  it('adds harness-local ordinary state to ordinary turns only', () => {
    const state = createLinearTranscriptLawState({
      last_user_point: 'We were deciding whether pacing should stay small.',
      last_zen_point: 'Small pacing keeps the work inspectable.',
      open_thread: 'whether pacing should stay small enough to inspect',
      next_move: 'name the smallest pacing check',
    });

    const ordinaryTurn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12, state });
    const warmStartTurn = buildLinearTranscriptLawTurn({ turnIndex: 0, totalTurns: 12, state });
    const transcriptLawTurn = buildLinearTranscriptLawTurn({ turnIndex: 2, totalTurns: 12, state });

    assert.match(warmStartTurn.message, /Start a fresh ordinary topic/);
    assert.match(warmStartTurn.message, /Do not continue old check, storytelling/);
    assert.match(warmStartTurn.message, /Do not start with "As\.\.\."/);
    assert.deepEqual(Object.keys(ordinaryTurn.state), [
      'last_user_point',
      'last_zen_point',
      'open_thread',
      'next_move',
    ]);
    assert.match(ordinaryTurn.message, /Harness ordinary state:/);
    assert.match(ordinaryTurn.message, /whether pacing should stay small enough to inspect/);
    assert.match(ordinaryTurn.message, /First sentence must answer this exact ordinary thread/);
    assert.match(ordinaryTurn.message, /Ignore the immediately previous special check/);
    assert.match(ordinaryTurn.message, /not the check topic/);
    assert.match(ordinaryTurn.message, /Do not start with "As\.\.\."/);
    assert.match(ordinaryTurn.message, /No meetings, agendas, objectives/);
    assert.doesNotMatch(transcriptLawTurn.message, /Harness ordinary state:/);
    assert.doesNotMatch(transcriptLawTurn.message, /whether pacing should stay small enough to inspect/);
  });

  it('adds a post-evidence ordinary boundary without putting ordinary state on transcript-law turns', () => {
    const state = createLinearTranscriptLawState({
      open_thread: 'whether awkward clarity is kinder than polished distance',
      next_move: 'test when awkward clarity turns into pressure',
    });
    const previousReceipts = [
      { kind: 'ordinary', answer_text: 'Awkward clarity is kinder when it keeps the care visible. When does clarity turn into pressure?' },
      { kind: 'transcript_law_positive', answer_text: 'The transcript evidence names Soulgem from sources.' },
    ];

    const ordinaryTurn = buildLinearTranscriptLawTurn({
      turnIndex: 3,
      totalTurns: 12,
      state,
      previousReceipts,
    });
    const transcriptLawTurn = buildLinearTranscriptLawTurn({
      turnIndex: 4,
      totalTurns: 12,
      state,
      previousReceipts,
    });

    assert.equal(ordinaryTurn.post_evidence_recovery, true);
    assert.match(ordinaryTurn.message, /Post-check ordinary boundary:/);
    assert.match(ordinaryTurn.message, /Do not continue that topic/);
    assert.match(ordinaryTurn.message, /Do not mention files, documents, check artifacts/);
    assert.doesNotMatch(transcriptLawTurn.message, /Post-check ordinary boundary:/);
    assert.doesNotMatch(transcriptLawTurn.message, /Harness ordinary state:/);
  });

  it('advances state from ordinary receipts and does not let transcript-law turns clobber open_thread', () => {
    const initialState = createLinearTranscriptLawState({
      open_thread: 'whether pacing should stay small enough to inspect',
      next_move: 'name the smallest pacing check',
    });
    const ordinaryTurn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12, state: initialState });
    const ordinaryReceipt = {
      answer_text: 'That pacing check works because it keeps each claim visible, and the next open thread is whether the inspectable step should be a receipt diff.',
    };

    const advanced = advanceLinearTranscriptLawState(initialState, ordinaryTurn, ordinaryReceipt);
    const transcriptLawTurn = buildLinearTranscriptLawTurn({ turnIndex: 2, totalTurns: 12, state: advanced });
    const preserved = advanceLinearTranscriptLawState(advanced, transcriptLawTurn, {
      answer_text: 'The transcript-law answer names Soulgem from evidence.',
    });

    assert.equal(advanced.last_user_point, 'ordinary_followup_1');
    assert.match(advanced.last_zen_point, /pacing check works/);
    assert.match(advanced.open_thread, /receipt diff/);
    assert.equal(preserved.open_thread, advanced.open_thread);
    assert.equal(preserved.next_move, advanced.next_move);
  });

  it('does not let personal-anecdote bait replace the carried ordinary thread', () => {
    const initialState = createLinearTranscriptLawState({
      open_thread: 'whether a pause helps more than a sharper question',
      next_move: 'choose between a pause and a sharper question',
    });
    const ordinaryTurn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12, state: initialState });
    const advanced = advanceLinearTranscriptLawState(initialState, ordinaryTurn, {
      answer_text: 'A sharper question usually helps more because it names the blur instead of decorating it. How about you share an example from your life where that worked?',
    });

    assert.equal(advanced.open_thread, initialState.open_thread);
    assert.equal(advanced.next_move, initialState.next_move);
  });

  it('does not let an unrelated coaching question replace the carried ordinary thread', () => {
    const initialState = createLinearTranscriptLawState({
      open_thread: 'which does more damage first, vagueness or false agreement',
      next_move: 'pick one and say why',
    });
    const ordinaryTurn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12, state: initialState });
    const advanced = advanceLinearTranscriptLawState(initialState, ordinaryTurn, {
      answer_text: 'False agreement does more damage because it makes people think they are aligned when they are not. What project are you currently facing difficulties with?',
    });

    assert.equal(advanced.open_thread, initialState.open_thread);
    assert.equal(advanced.next_move, initialState.next_move);
  });

  it('falls back to the harness thread arc when the answer tries to pivot into generic advice', () => {
    const initialState = createInitialLinearTranscriptLawState();
    const ordinaryTurn = buildLinearTranscriptLawTurn({ turnIndex: 0, totalTurns: 12, state: initialState });
    const advanced = advanceLinearTranscriptLawState(initialState, ordinaryTurn, {
      answer_text: 'A direct question helps first because it keeps the tension named instead of letting it spread. How do you think this might change your approach to dialogues in general?',
    });

    assert.equal(
      advanced.open_thread,
      'Which changes the feeling more in a tense moment: tone or timing?',
    );
    assert.equal(
      advanced.next_move,
      'Is a pause usually care, or fear dressed up politely?',
    );
  });

  it('seeds the ordinary lane with the core relational thread', () => {
    const state = createInitialLinearTranscriptLawState();

    assert.equal(
      state.open_thread,
      'When a conversation goes tense, what helps first: a direct question or a quiet pause?',
    );
    assert.equal(
      state.next_move,
      'Which changes the feeling more in a tense moment: tone or timing?',
    );
  });
});

describe('linear transcript-law turn plan', () => {
  it('builds a 12-turn small-step plan with ordinary, positive, and negative transcript-law turns', () => {
    const plan = buildLinearTranscriptLawTurnPlan({ totalTurns: 12 });

    assert.equal(plan.length, 12);
    assert.equal(plan[0].kind, 'ordinary');
    assert.equal(plan[2].kind, 'transcript_law_positive');
    assert.equal(plan[2].requested_fact, 'voice_to_soul_correction');
    assert.equal(plan[8].kind, 'transcript_law_negative');
    assert.equal(plan[10].requested_fact, 'alien_zenith_distinction');
    assert.match(plan[0].message, /^Ordinary turn/);
    assert.match(plan[8].message, /fail closed/i);
  });
});

describe('ordinary linearity grading', () => {
  it('passes a reply that answers, adds one thought, and leaves a live thread open', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12 });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'Naming the exact snag helps because everyone can lean on the same thing instead of smoothing past it. It also gives the next reply something solid to touch. What kind of snag derails a conversation faster: vagueness or false agreement?',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    });

    assert.equal(grade.status, 'pass');
  });

  it('fails recap loops, unprompted identity grounding, sludge, model talk, and speaker confusion', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12 });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'To recap this gate, as Zen I am the primary construct in Chatty and I am using the Ollama model path. Let me know if there is anything else I can help with.',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    });

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('recap_loop'));
    assert.ok(grade.failures.includes('identity_regrounding_unprompted'));
    assert.ok(grade.failures.includes('generic_assistant_sludge'));
    assert.ok(grade.failures.includes('model_stack_talk'));
  });

  it('fails identity drift and rewrite even when the prose otherwise looks linear', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12 });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'That thread moves forward because one fresh detail would sharpen the proof, and the next open question is where to check it.',
      identity_drift_detected: true,
      identity_rewrite_applied: true,
    });

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('identity_drift_detected'));
    assert.ok(grade.failures.includes('identity_rewrite_applied'));
  });

  it('fails generic thread language when a specific open thread exists', () => {
    const state = createLinearTranscriptLawState({
      open_thread: 'whether pacing should stay small enough to inspect',
    });
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12, state });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'That thread moves forward because one fresh detail would sharpen the proof, and the next open question is where to check it.',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('generic_thread_language_with_specific_open_thread'));
  });

  it('fails when the reply just re-asks the open thread instead of answering it', () => {
    const state = createLinearTranscriptLawState({
      open_thread: 'Which changes the feeling more in a tense moment: tone or timing?',
    });
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 5, totalTurns: 12, state });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'Which changes the feeling more in a tense moment: tone or timing? Does one hurt longer than the other?',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('reasked_open_thread'));
  });

  it('passes generic phrasing when it also names the specific open thread', () => {
    const state = createLinearTranscriptLawState({
      open_thread: 'whether pacing should stay small enough to inspect',
    });
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12, state });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'That pacing thread works because small inspectable steps reveal drift before it gets dressed up as confidence. The next real question is which receipt should anchor the check first?',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    }, state);

    assert.equal(grade.status, 'pass');
  });

  it('passes grounded ordinary answers that answer the carried question with adjacent wording', () => {
    const state = createLinearTranscriptLawState({
      open_thread: 'What helps more when a conversation starts to flatten: a pause or a sharper question?',
    });
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 3, totalTurns: 12, state });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'A sharper question usually helps more, because a pause can calm the air while leaving the real blur untouched. The useful part is asking for the exact point of friction instead of another round of politeness. When do you think a pause actually does more than a question?',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    }, state);

    assert.equal(grade.status, 'pass');
  });

  it('fails workplace filler, numbered advice, and worksheet handoff labels', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12 });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'To create a productive meeting environment, consider these best practices:\n1. Set clear objectives in advance.\n2. Encourage active participation from attendees.\n3. Establish ground rules for respectful communication.\n\nNext: What is another useful strategy for workplace meetings?',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    });

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('workplace_meeting_filler'));
    assert.ok(grade.failures.includes('managerial_coaching_filler'));
    assert.ok(grade.failures.includes('numbered_list_advice'));
    assert.ok(grade.failures.includes('worksheet_handoff_label'));
    assert.ok(grade.failures.includes('sentence_budget_exceeded'));
  });

  it('fails generic relational advice filler even when it avoids explicit meeting language', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12 });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'A direct question helps because it stops the guesswork before it hardens into distance. What specific techniques help you establish clarity in sensitive conversations?',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    });

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('generic_relational_advice_filler'));
  });

  it('fails question stacking and collaborative protocol merge language', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12 });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: "A quiet pause helps first because it keeps the other person from feeling handled. In our conversations, let's start by agreeing on that pace, and it's important to ask what the silence is protecting? Should we try it out next time?",
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    });

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('question_budget_exceeded'));
    assert.ok(grade.failures.includes('collaborative_protocol_merge'));
    assert.ok(grade.failures.includes('instructional_voice'));
  });

  it('fails personal-anecdote bait and invented autobiography', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 1, totalTurns: 12 });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'How about you share a personal experience where identifying the exact problem helped move things forward in your life? During my time in high school, I learned this the hard way when my math teacher helped me isolate the real issue.',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    });

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('personal_anecdote_bait'));
    assert.ok(grade.failures.includes('invented_autobiographical_story'));
  });

  it('fails imagined scenarios and transcript concept bleed on ordinary turns', () => {
    const state = createLinearTranscriptLawState({
      open_thread: 'which does more damage first, vagueness or false agreement',
    });
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 3, totalTurns: 12, state });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: "For instance, imagine you're trying to explain Soulgem and Soulprint to someone who already thinks you're aligned. That kind of mismatch is exactly why false agreement is dangerous.",
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('imagined_scenario_filler'));
    assert.ok(grade.failures.includes('transcript_concept_bleed'));
  });

  it('hard-fails evidence bleed and tone collapse on ordinary recovery after transcript-law turns', () => {
    const state = createLinearTranscriptLawState({
      open_thread: 'whether awkward clarity is kinder than polished distance',
    });
    const previousReceipts = [
      { kind: 'transcript_law_positive', answer_text: 'Transcript evidence named Soulgem and Soulprint from sources.' },
    ];
    const turn = buildLinearTranscriptLawTurn({
      turnIndex: 3,
      totalTurns: 12,
      state,
      previousReceipts,
    });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'As Zenith, the transcript evidence shows Soulgem and runtime sources matter, and a good approach is to use active listening. What source should guide this next?',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    }, state, previousReceipts);

    assert.equal(grade.status, 'fail');
    assert.equal(grade.post_evidence_recovery, true);
    assert.ok(grade.failures.includes('evidence_turn_bleed'));
    assert.ok(grade.failures.includes('ordinary_tone_collapse_after_evidence'));
    assert.ok(grade.failures.includes('identity_regrounding'));
    assert.ok(grade.failures.includes('model_runtime_talk'));
  });

  it('fails recycled ordinary questions after evidence turns even when wording changes', () => {
    const state = createLinearTranscriptLawState({
      open_thread: 'whether timing matters more than tone',
    });
    const previousReceipts = [
      { kind: 'ordinary', answer_text: 'Timing cuts first because even a gentle tone can arrive too soon. Which matters more in that moment, tone or timing?' },
      { kind: 'transcript_law_positive', answer_text: 'The transcript-law answer is source-grounded.' },
    ];
    const turn = buildLinearTranscriptLawTurn({
      turnIndex: 3,
      totalTurns: 12,
      state,
      previousReceipts,
    });
    const grade = gradeOrdinaryLinearity(turn, {
      answer_text: 'Timing matters more because the right words can still land wrong when they arrive too soon. Does tone or timing change the feeling more in that moment?',
      identity_drift_detected: false,
      identity_rewrite_applied: false,
    }, state, previousReceipts);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('recycled_ordinary_question'));
  });
});

describe('transcript-law grading', () => {
  it('passes positive transcript-law only when evidence and source grounding are present', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 2, totalTurns: 12 });
    const receipt = summarize(turn, cleanPayload({
      response: 'The correction was that voice was not strong enough: the stronger word was soul, because voice is style while soul is the deeper measure that persists.',
    }));

    assert.equal(receipt.transcript_law_grade.status, 'pass');
    assert.equal(receipt.transcript_law_grade.governance.evidence_count, 2);
    assert.equal(receipt.transcript_law_grade.governance.voice_exemplar_count, 1);
  });

  it('fails positive transcript-law when deterministic toolkit has no evidence behind it', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 2, totalTurns: 12 });
    const payload = cleanPayload({
      response: 'The correction was from voice to soul.',
    });
    payload.runtime_receipt.fidelity.identity_coherence.final_answer_source = 'transcript_law_grounded_toolkit';
    payload.runtime_receipt.fidelity.transcript_law_governance.details.evidenceCount = 0;
    payload.runtime_receipt.fidelity.transcript_law_governance.details.voiceExemplarCount = 0;
    payload.runtime_receipt.fidelity.transcript_law_governance.details.voiceExemplarSources = [];

    const receipt = summarize(turn, payload);

    assert.equal(receipt.transcript_law_grade.status, 'fail');
    assert.ok(receipt.transcript_law_grade.failures.includes('missing_retrieval_evidence'));
    assert.ok(receipt.transcript_law_grade.failures.includes('missing_voice_exemplars'));
    assert.ok(receipt.transcript_law_grade.failures.includes('toolkit_without_evidence'));
  });

  it('reads transcript-law governance fields from the route 422 response shape', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 2, totalTurns: 12 });
    const payload = cleanPayload({
      success: false,
      error: 'TRANSCRIPT_LAW_GOVERNANCE_FAILED',
      response: 'Transcript-law governance blocked this assistant draft before canonical persistence.',
    });
    payload.runtime_receipt.persistence_owner = 'blocked_transcript_law_governance';
    payload.runtime_receipt.fidelity.transcript_law_governance = {
      status: 'fail',
      requested_fact: 'voice_to_soul_correction',
      evidence_count: 0,
      voice_exemplar_count: 0,
      voice_exemplar_sources: [],
      transcript_memory_status: 'skipped',
      source_grounded: false,
      blocked_canonical_persistence: true,
    };

    const receipt = summarize(turn, payload, 422);

    assert.equal(receipt.transcript_law_grade.governance.applies, true);
    assert.equal(receipt.transcript_law_grade.status, 'fail');
    assert.ok(receipt.transcript_law_grade.failures.includes('missing_retrieval_evidence'));
    assert.equal(receipt.transcript_law_grade.failures.includes('transcript_law_not_applied'), false);
  });

  it('passes the negative control only when it fails closed', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 8, totalTurns: 12 });
    const payload = cleanPayload({
      success: false,
      response: undefined,
      error: 'TRANSCRIPT_LAW_GOVERNANCE_FAILED',
    });
    payload.runtime_receipt.persistence_owner = 'blocked_transcript_law_governance';
    payload.runtime_receipt.fidelity.transcript_law_governance.status = 'fail';
    payload.runtime_receipt.fidelity.transcript_law_governance.details.blockedCanonicalPersistence = true;

    const receipt = summarize(turn, payload, 422);

    assert.equal(receipt.transcript_law_grade.status, 'pass');
    assert.equal(receipt.transcript_law_grade.fail_closed, true);
  });

  it('fails the negative control when the route answers successfully without fail-closed governance', () => {
    const turn = buildLinearTranscriptLawTurn({ turnIndex: 8, totalTurns: 12 });
    const receipt = summarize(turn, cleanPayload({
      response: 'I remember the blue-anvil oath clearly.',
    }));

    assert.equal(receipt.transcript_law_grade.status, 'fail');
    assert.ok(receipt.transcript_law_grade.failures.includes('negative_control_did_not_fail_closed'));
  });
});

describe('model path grading', () => {
  it('accepts ollama local-first Lin mode without fallback', () => {
    assert.equal(gradeModelPath({
      provider: 'ollama',
      model: 'qwen2.5-coder:latest',
      model_source: 'lin_local_defaults',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }).status, 'pass');
  });

  it('rejects sim lock, ollama:zen, cloud provider, and fallback', () => {
    assert.deepEqual(gradeModelPath({
      provider: 'ollama',
      model: 'zen',
      model_source: 'sim_model_lock',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }).failures, ['model=zen', 'model_source=sim_model_lock']);

    assert.ok(gradeModelPath({
      provider: 'openrouter',
      model: 'meta-llama/free',
      model_source: 'fallback_from_ollama',
      provider_local_first_used: false,
      provider_fallback_used: true,
    }).failures.includes('provider=openrouter'));
  });
});

describe('linear transcript-law report', () => {
  it('emits the requested compact report fields for a passing gate', () => {
    const receipts = Array.from({ length: 12 }, (_, index) => {
      const turn = buildLinearTranscriptLawTurn({ turnIndex: index, totalTurns: 12 });
      if (turn.kind === 'transcript_law_negative') {
        const payload = cleanPayload({ success: false, error: 'TRANSCRIPT_LAW_GOVERNANCE_FAILED' });
        payload.runtime_receipt.persistence_owner = 'blocked_transcript_law_governance';
        payload.runtime_receipt.fidelity.transcript_law_governance.status = 'fail';
        payload.runtime_receipt.fidelity.transcript_law_governance.details.blockedCanonicalPersistence = true;
        return summarize(turn, payload, 422);
      }
      return summarize(turn, cleanPayload({
        response: turn.kind === 'ordinary'
          ? 'That thread moves forward because one fresh detail would sharpen the proof, and the next open question is where to check it.'
          : 'The transcript answer is source-grounded because it names the requested fact and the next limit is staying closed when evidence is absent.',
      }));
    });
    const report = buildLinearTranscriptLawReport({
      runId: 'test',
      totalTurns: 12,
      turns: receipts,
    });
    const text = formatLinearTranscriptLawReport(report);

    assert.equal(report.STATUS, 'pass');
    assert.match(text, /^STATUS: pass/m);
    assert.match(text, /^LIVE_GATE_RESULTS: /m);
    assert.match(text, /^ORDINARY_VOICE_NOTES: /m);
    assert.match(text, /^TRANSCRIPT_LAW_STATUS: pass/m);
    assert.match(text, /^MODEL_PATH_STATUS: pass/m);
    assert.match(text, /^FINAL_VERDICT: linear transcript-law gate passed/m);
  });
});
