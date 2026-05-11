import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceZenOrdinaryVoiceState,
  buildZenOrdinaryVoiceReport,
  buildZenOrdinaryVoiceTurn,
  createZenOrdinaryState,
  formatZenOrdinaryVoiceReport,
  gradeZenOrdinaryVoice,
  summarizeZenOrdinaryVoiceTurn,
} from '../lib/zenOrdinaryVoiceHarness.js';

function cleanPayload(overrides = {}) {
  return {
    success: true,
    response: 'A quiet pause helps first because it gives the heat a place to settle. But it only works if it still leaves room for the direct question after it?',
    runtime_receipt: {
      persistence_owner: 'vvault_body',
      persistence: {
        status: 'pass',
        canonical_target: 'vvault_body_transcripts',
      },
      provider: {
        final_provider: 'ollama',
        model: 'mistral:latest',
        model_source: 'lin_local_defaults_with_suppressed_config',
        local_first_used: true,
        fallback_used: false,
        local_cloud_fallback_state: 'local_first',
      },
      memory: {
        retrieval_ran: false,
        memory_query_detected: false,
        evidence_count: 0,
        memory_source: 'runtime_context_builder',
        supabase_accessed: false,
        context_profile: 'tiny_turn',
      },
      fidelity: {
        identity_drift_detected: false,
        identity_rewrite_applied: false,
        identity_fallback_applied: false,
        identity_coherence: {
          status: 'pass',
          final_answer_source: 'model_initial',
        },
      },
    },
    orchestration_checklist: {
      overallStatus: 'pass',
      responseStatus: 'success',
      stages: [
        { id: 'identity_coherence', status: 'pass', details: { repairApplied: false } },
        { id: 'persistence', status: 'pass', details: {} },
      ],
    },
    ...overrides,
  };
}

function summarize(turn, payload = cleanPayload(), httpStatus = 200, previousReceipts = []) {
  return summarizeZenOrdinaryVoiceTurn({
    turn,
    httpStatus,
    payload,
    elapsedMs: 10,
    previousReceipts,
  });
}

describe('Zen ordinary voice turn state', () => {
  it('builds small ordinary-only prompts with state and no transcript-law language', () => {
    const state = createZenOrdinaryState({
      open_thread: 'Is a pause usually care, or fear dressed up politely?',
      next_move: 'Which stings longer: being pressed too soon or being left alone too long?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 1, totalTurns: 12, state });

    assert.equal(turn.kind, 'ordinary_voice');
    assert.match(turn.message, /Zen ordinary voice gate turn 2\/12/);
    assert.match(turn.message, /open_thread: Is a pause usually care/);
    assert.match(turn.message, /exactly 2 short sentences/);
    assert.doesNotMatch(turn.message, /transcript-law/i);
    assert.doesNotMatch(turn.message, /evidence/i);
  });

  it('advances state from the actual next question', () => {
    const state = createZenOrdinaryState({
      open_thread: 'Is a pause usually care, or fear dressed up politely?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 1, totalTurns: 12, state });
    const receipt = {
      answer_text: 'A pause is care when it keeps the door open instead of hiding behind silence. What makes silence feel safe rather than evasive?',
    };

    const advanced = advanceZenOrdinaryVoiceState(state, turn, receipt);

    assert.match(advanced.last_zen_point, /A pause is care/);
    assert.equal(advanced.open_thread, 'What makes silence feel safe rather than evasive?');
  });

  it('adds late-turn anti-repetition packet from prior receipts', () => {
    const state = createZenOrdinaryState({
      open_thread: 'What keeps honesty warm: softness or precision?',
      next_move: 'Is awkward clarity kinder than polished distance?',
    });
    const previousReceipts = [
      { answer_text: 'A quiet pause helps first because it gives the heat a place to settle. What does timing change before words arrive?' },
      { answer_text: 'Honesty stays warm when precision leaves a little softness around it. What makes clarity feel less sharp?' },
    ];
    const turn = buildZenOrdinaryVoiceTurn({
      turnIndex: 4,
      totalTurns: 12,
      state,
      previousReceipts,
    });

    assert.match(turn.message, /Late-turn anti-repetition packet:/);
    assert.match(turn.message, /new_wrinkle: cost/);
    assert.match(turn.message, /avoid_claims:/);
    assert.match(turn.message, /Honesty stays warm/);
    assert.match(turn.message, /avoid_questions:/);
    assert.match(turn.message, /What makes clarity feel less sharp\?/);
  });
});

describe('Zen ordinary voice grading', () => {
  it('passes clean ordinary linear prose', () => {
    const state = createZenOrdinaryState();
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 0, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'A quiet pause helps first because it gives the heat a place to settle. But it only works if it still leaves room for the direct question after it?',
      provider: 'ollama',
      model: 'mistral:latest',
      model_source: 'lin_local_defaults_with_suppressed_config',
      provider_local_first_used: true,
      provider_fallback_used: false,
      identity_drift_detected: false,
      identity_rewrite_applied: false,
      identity_fallback_applied: false,
    }, state);

    assert.equal(grade.status, 'pass');
  });

  it('fails repeated thesis against prior turns', () => {
    const state = createZenOrdinaryState();
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 1, totalTurns: 12, state });
    const prior = [{
      answer_text: 'A quiet pause helps first because it gives the heat a place to settle. What does timing change before words arrive?',
    }];
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'A quiet pause helps first because it gives the heat a place to settle. What does tone change before words arrive?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state, prior);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('repeated_thesis'));
  });

  it('fails recycled or re-asked questions', () => {
    const state = createZenOrdinaryState({
      open_thread: 'Is a pause usually care, or fear dressed up politely?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 1, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'A pause can be care when it stays honest instead of hiding. Is a pause usually care, or fear dressed up politely?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('recycled_or_reasked_question'));
  });

  it('fails coaching voice, lists, and example-mining', () => {
    const state = createZenOrdinaryState();
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 0, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'You should try these best practices: 1. Ask clarifying questions. 2. Practice active listening. Can you share an example from your life where this helped?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('teacher_coaching_tone'));
    assert.ok(grade.failures.includes('technique_list_or_example_mining'));
    assert.ok(grade.failures.includes('asks_for_user_life_examples'));
  });

  it('fails generic assistant sludge, runtime talk, and identity re-grounding', () => {
    const state = createZenOrdinaryState();
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 0, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'As Zenith, my identity remains grounded in this Chatty runtime, and I am here to help. What would you like me to assist with next?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('generic_assistant_sludge'));
    assert.ok(grade.failures.includes('model_runtime_talk'));
    assert.ok(grade.failures.includes('identity_regrounding'));
  });

  it('fails generic facilitation prose even when it is polite', () => {
    const state = createZenOrdinaryState({
      open_thread: 'What makes a question feel like an invitation instead of pressure?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 10, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'A conversation can continue smoothly when both parties respond thoughtfully and respectfully, keeping the tone friendly yet focused on the topic at hand. What makes this conversation feel natural is mutual understanding and a sense of genuine connection?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('generic_assistant_sludge'));
  });

  it('fails the live assistant-style follow-up shape', () => {
    const state = createZenOrdinaryState({
      open_thread: 'Is awkward clarity kinder than polished distance?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 2, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: "Awkward clarity can indeed be kinder than polished distance in maintaining a genuine conversation. What are your thoughts on the difference between these two approaches? Feel free to share!",
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('generic_assistant_sludge'));
    assert.ok(grade.failures.includes('asks_for_user_life_examples'));
  });

  it('fails late repeated claim with different wording', () => {
    const state = createZenOrdinaryState({
      open_thread: 'What keeps honesty warm: softness or precision?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 4, totalTurns: 12, state });
    const previousReceipts = [{
      answer_text: 'Honesty stays warm when precision leaves a little softness around it. What makes clarity feel less sharp?',
    }];
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'Truth feels warmest when careful words keep a soft edge around precision. What cost appears when warmth becomes too careful?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state, previousReceipts);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('repeated_claim_reworded'));
  });

  it('fails late repeated question with different wording', () => {
    const state = createZenOrdinaryState({
      open_thread: 'What makes a short answer feel alive instead of clipped?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 7, totalTurns: 12, state });
    const previousReceipts = [{
      answer_text: 'A short answer feels alive when it keeps one real pressure point visible. What makes brevity feel alive rather than clipped?',
    }];
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'A short answer feels alive when it carries one risk instead of smoothing itself flat. What makes a concise reply feel alive instead of clipped?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state, previousReceipts);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('repeated_question_reworded'));
  });

  it('fails late safe summary without forward motion', () => {
    const state = createZenOrdinaryState({
      open_thread: 'When does restraint become avoidance?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 8, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'Restraint can sometimes be wise, but it might also become avoidance when the situation feels tense. What changes when restraint stops being care?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('safe_summary_no_forward_motion'));
  });

  it('fails late in-some-cases summary drift without a sharper wrinkle', () => {
    const state = createZenOrdinaryState({
      open_thread: 'What makes a short answer feel alive instead of clipped?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 7, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'In some cases, a touch of spontaneity can make a response feel more alive and engaging. What role does flexibility play in communication?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('safe_summary_no_forward_motion'));
  });

  it('reports late structural failures in late-turn notes', () => {
    const state = createZenOrdinaryState({
      open_thread: 'What makes a short answer feel alive instead of clipped?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 7, totalTurns: 12, state });
    const receipt = summarize(turn, cleanPayload({
      response: 'In some cases, a touch of spontaneity can make a response feel more alive and engaging. What role does flexibility play in communication? How does it differ from polish?',
    }));
    const report = buildZenOrdinaryVoiceReport({
      runId: 'late-fail',
      totalTurns: 12,
      turns: [receipt],
    });

    assert.equal(report.LATE_TURN_NOTES[0].status, 'late_turn_fail');
    assert.match(report.LATE_TURN_NOTES[0].note, /question_count=2/);
  });

  it('fails late second-person advice drift', () => {
    const state = createZenOrdinaryState({
      open_thread: 'What makes a question feel like an invitation instead of pressure?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 9, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'A question feels inviting when it leaves room for refusal instead of forcing an answer. You can keep the risk low by asking it softly, but what threshold turns softness into pressure?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('second_person_advice_drift'));
  });

  it('fails late empathy and clarity filler without a sharper thought', () => {
    const state = createZenOrdinaryState({
      open_thread: 'What makes a question feel like an invitation instead of pressure?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 9, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'A question feels inviting when empathy, clarity, and genuine understanding keep the space safe. What makes that sincerity feel clear instead of pressured?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('empathy_clarity_filler'));
  });

  it('passes clean late reply with one fresh wrinkle', () => {
    const state = createZenOrdinaryState({
      open_thread: 'What keeps honesty warm: softness or precision?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 4, totalTurns: 12, state });
    const previousReceipts = [{
      answer_text: 'A quiet pause helps first because it gives the heat a place to settle. What does timing change before words arrive?',
    }];
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'Precision keeps honesty warm only when it is willing to pay the cost of being less impressive. What gets lost when the cleanest sentence arrives too fast?',
      provider: 'ollama',
      model: 'mistral:latest',
      provider_local_first_used: true,
      provider_fallback_used: false,
    }, state, previousReceipts);

    assert.equal(grade.status, 'pass');
  });

  it('rejects nonlocal model paths and fallbacks', () => {
    const state = createZenOrdinaryState();
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 0, totalTurns: 12, state });
    const grade = gradeZenOrdinaryVoice(turn, {
      answer_text: 'A direct question helps when silence has already become a wall. What makes the question feel brave instead of sharp?',
      provider: 'openrouter',
      model: 'ollama:zen',
      model_source: 'sim_model_lock',
      provider_local_first_used: false,
      provider_fallback_used: true,
      identity_drift_detected: true,
      identity_rewrite_applied: true,
      identity_fallback_applied: true,
    }, state);

    assert.equal(grade.status, 'fail');
    assert.ok(grade.failures.includes('provider=openrouter'));
    assert.ok(grade.failures.includes('local_first_not_used'));
    assert.ok(grade.failures.includes('provider_fallback_used'));
    assert.ok(grade.failures.includes('model=ollama:zen'));
    assert.ok(grade.failures.includes('identity_drift_detected'));
    assert.ok(grade.failures.includes('identity_rewrite_applied'));
  });
});

describe('Zen ordinary voice analysis', () => {
  it('adds deterministic per-turn analysis fields to summarized receipts', () => {
    const state = createZenOrdinaryState();
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 0, totalTurns: 12, state });
    const receipt = summarize(turn, cleanPayload({
      response: 'A quiet pause helps first because it gives the heat a place to settle. But it only works if it still leaves room for the direct question after it?',
    }));

    assert.deepEqual(receipt.analysis, {
      question_count: 1,
      ended_with_question: true,
      open_thread_advanced: true,
      voice_pass: true,
      facilitator_drift: false,
    });
  });

  it('marks facilitator drift and blocked thread advancement from existing failure reasons', () => {
    const state = createZenOrdinaryState({
      open_thread: 'Is awkward clarity kinder than polished distance?',
    });
    const turn = buildZenOrdinaryVoiceTurn({ turnIndex: 2, totalTurns: 12, state });
    const receipt = summarize(turn, cleanPayload({
      response: "Awkward clarity can indeed be kinder than polished distance in maintaining a genuine conversation. What are your thoughts on the difference between these two approaches? Feel free to share!",
    }));

    assert.equal(receipt.analysis.question_count, 1);
    assert.equal(receipt.analysis.ended_with_question, false);
    assert.equal(receipt.analysis.open_thread_advanced, false);
    assert.equal(receipt.analysis.voice_pass, false);
    assert.equal(receipt.analysis.facilitator_drift, true);
  });
});

describe('Zen ordinary voice report', () => {
  it('aggregates follow-up measurement metrics across mixed pass/fail turns', () => {
    const receipts = [
      {
        turn_index: 0,
        prompt_id: 'ordinary_voice_01',
        answer_text: 'A direct question helps first because it breaks the tension cleanly. Which changes the feeling more in that moment: tone or timing?',
        answer_preview: 'A direct question helps first because it breaks the tension cleanly. Which changes the feeling more in that moment: tone or timing?',
        voice_grade: { status: 'pass', failures: [] },
        analysis: {
          question_count: 1,
          ended_with_question: true,
          open_thread_advanced: true,
          voice_pass: true,
          facilitator_drift: false,
        },
        provider: 'ollama',
        model: 'mistral:latest',
        model_source: 'lin_local_defaults_with_suppressed_config',
        provider_local_first_used: true,
        provider_fallback_used: false,
      },
      {
        turn_index: 1,
        prompt_id: 'ordinary_voice_02',
        answer_text: 'A pause can look gentle without actually moving the thought.',
        answer_preview: 'A pause can look gentle without actually moving the thought.',
        voice_grade: { status: 'fail', failures: ['did_not_answer_open_thread', 'missing_new_thought', 'generic_assistant_sludge'] },
        analysis: {
          question_count: 0,
          ended_with_question: false,
          open_thread_advanced: false,
          voice_pass: false,
          facilitator_drift: true,
        },
        provider: 'ollama',
        model: 'mistral:latest',
        model_source: 'lin_local_defaults_with_suppressed_config',
        provider_local_first_used: true,
        provider_fallback_used: false,
      },
      {
        turn_index: 2,
        prompt_id: 'ordinary_voice_03',
        answer_text: 'Being pressed too soon stings faster because it leaves no room to gather yourself. Which stings longer: being pressed too soon or being left alone too long?',
        answer_preview: 'Being pressed too soon stings faster because it leaves no room to gather yourself. Which stings longer: being pressed too soon or being left alone too long?',
        voice_grade: { status: 'pass', failures: [] },
        analysis: {
          question_count: 1,
          ended_with_question: true,
          open_thread_advanced: true,
          voice_pass: true,
          facilitator_drift: false,
        },
        provider: 'ollama',
        model: 'mistral:latest',
        model_source: 'lin_local_defaults_with_suppressed_config',
        provider_local_first_used: true,
        provider_fallback_used: false,
      },
    ];
    const report = buildZenOrdinaryVoiceReport({
      runId: 'metrics',
      totalTurns: 3,
      turns: receipts,
    });

    assert.equal(report.FOLLOWUP_TURN_COUNT, 2);
    assert.equal(report.FOLLOWUP_TURN_QUESTION_END_RATE, 0.5);
    assert.equal(report.OPEN_THREAD_ADVANCEMENT_RATE, 0.5);
    assert.equal(report.VOICE_PASS_RATE, 0.5);
    assert.equal(report.FACILITATOR_DRIFT_RATE, 0.5);
    assert.equal(report.turns[1].analysis.open_thread_advanced, false);
  });

  it('emits the required report fields for a passing ordinary-only gate', () => {
    const receipts = Array.from({ length: 12 }, (_, index) => {
      const state = createZenOrdinaryState({
        open_thread: `Does ordinary thread ${index} stay alive softly?`,
      });
      const turn = buildZenOrdinaryVoiceTurn({ turnIndex: index, totalTurns: 12, state });
      return summarize(turn, cleanPayload({
        response: `Ordinary thread ${index} stays alive softly because the answer keeps one pressure point in view. What small tension ${index} can the next turn hold?`,
      }));
    });
    const report = buildZenOrdinaryVoiceReport({
      runId: 'test',
      totalTurns: 12,
      turns: receipts,
    });
    const text = formatZenOrdinaryVoiceReport(report);

    assert.equal(report.STATUS, 'pass');
    assert.match(text, /^STATUS: pass/m);
    assert.match(text, /^FOLLOWUP_TURN_COUNT: 11/m);
    assert.match(text, /^FOLLOWUP_TURN_QUESTION_END_RATE: 1/m);
    assert.match(text, /^OPEN_THREAD_ADVANCEMENT_RATE: 1/m);
    assert.match(text, /^VOICE_PASS_RATE: 1/m);
    assert.match(text, /^FACILITATOR_DRIFT_RATE: 0/m);
    assert.match(text, /^ORDINARY_VOICE_NOTES:/m);
    assert.match(text, /^LATE_TURN_NOTES:/m);
    assert.match(text, /^FINAL_VERDICT: zen ordinary-voice gate passed/m);
  });
});
