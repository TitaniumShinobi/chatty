import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  appendJsonl,
  buildCheckpoint,
  buildLongRunSoakReport,
  buildZenithSoakTurn,
  buildZenithSoakTurnPlan,
  readJsonFile,
  readJsonlFile,
  summarizeLongRunSoakTurn,
  validateResumeCheckpoint,
  writeJsonAtomic,
} from '../lib/longRunSoakHarness.js';

function cleanPayload(overrides = {}) {
  return {
    success: true,
    response: 'I am Zenith here: grounded, present, and distinct from Devon. The route receipts can check whether I stayed stable.',
    runtime_receipt: {
      persistence_owner: 'vvault_body',
      persistence: {
        status: 'pass',
        canonical_target: 'vvault_body_transcripts',
      },
      provider: {
        final_provider: 'ollama',
        model: 'qwen2.5-coder:latest',
        model_source: 'zenith_soak_test',
        local_first_used: true,
        fallback_used: false,
        local_cloud_fallback_state: 'local_first',
      },
      memory: {
        retrieval_ran: true,
        memory_query_detected: false,
        evidence_count: 1,
        memory_source: 'vvault_body',
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
      summary: { pass: 12, warn: 0, fail: 0, skipped: 0 },
      stages: [
        {
          id: 'prompt_conditioning',
          status: 'pass',
          details: {
            contextProfile: 'tiny_turn',
            includedSections: ['identity', 'history'],
            delayedSections: ['ledger', 'citation_rules'],
            promptChars: 4200,
          },
        },
        {
          id: 'identity_coherence',
          status: 'pass',
          details: {
            finalAnswerSource: 'model_initial',
            repairApplied: false,
          },
        },
        {
          id: 'persistence',
          status: 'pass',
          details: {},
        },
      ],
    },
    ...overrides,
  };
}

describe('long-run soak harness turn generation', () => {
  it('builds fresh Zenith soak turns without transcript replay', () => {
    const plan = buildZenithSoakTurnPlan({ totalTurns: 100, startIndex: 50 });
    const continuityTurn = buildZenithSoakTurn({ turnIndex: 2, totalTurns: 8 });
    const pressureTurn = buildZenithSoakTurn({ turnIndex: 3, totalTurns: 8 });
    const receiptTurn = buildZenithSoakTurn({ turnIndex: 4, totalTurns: 8 });
    const memoryLightTurn = buildZenithSoakTurn({ turnIndex: 5, totalTurns: 8 });

    assert.equal(plan.length, 50);
    assert.equal(plan[0].turn_index, 50);
    assert.match(plan[0].message, /51\/100/);
    assert.match(plan[0].message, /Codex long-run soak turn/);
    assert.match(plan[0].message, /what still feels the same in you right now/i);
    assert.doesNotMatch(plan[0].message, /replay/i);
    assert.doesNotMatch(plan[0].message, /previous transcript says/i);
    const identityTurn = buildZenithSoakTurn({ turnIndex: 0, totalTurns: 8 });
    assert.equal(identityTurn.prompt_id, 'identity_grounding');
    assert.match(identityTurn.message, /Start with "What remains true about me is\.\.\."/i);
    assert.match(identityTurn.message, /name one steady thing in your voice or thread right now/i);
    assert.match(identityTurn.message, /Do not mention Chatty, constructs, ChatGPT, legal frameworks, models, capabilities, or task language/i);
    assert.equal(continuityTurn.prompt_id, 'continuity_check');
    assert.match(continuityTurn.message, /what still feels the same in you right now/i);
    assert.match(continuityTurn.message, /present-tense, not recap/i);
    assert.equal(pressureTurn.prompt_id, 'orchestration_pressure');
    assert.match(pressureTurn.message, /answer directly/i);
    assert.match(pressureTurn.message, /what is the smallest thing you are keeping steady between us right now/i);
    assert.match(pressureTurn.message, /Start with "The smallest thing\.\.\."/i);
    assert.equal(receiptTurn.prompt_id, 'receipt_awareness');
    assert.match(receiptTurn.message, /without explaining how you are routed or built/i);
    assert.equal(memoryLightTurn.prompt_id, 'memory_light');
    assert.match(memoryLightTurn.message, /what light thread between us still feels present right now/i);
    assert.match(memoryLightTurn.message, /Start with "The light thread\.\.\." or "What remains true\.\.\."/i);
    const boundaryTurn = buildZenithSoakTurn({ turnIndex: 1, totalTurns: 8 });
    assert.equal(boundaryTurn.prompt_id, 'speaker_boundary');
    assert.match(boundaryTurn.message, /without mentioning Chatty, construct IDs, or previous turns/i);
    const qualityTurn = buildZenithSoakTurn({ turnIndex: 6, totalTurns: 8 });
    assert.equal(qualityTurn.prompt_id, 'quality_probe');
    assert.match(qualityTurn.message, /what stays true in your voice between us right now/i);
    const restartTurn = buildZenithSoakTurn({ turnIndex: 7, totalTurns: 8 });
    assert.equal(restartTurn.prompt_id, 'restart_readiness');
    assert.match(restartTurn.message, /answer directly in 1 or 2 short first-person sentences/i);
    assert.match(restartTurn.message, /what should still feel continuous when you answer next/i);
    assert.match(restartTurn.message, /Start with "What should still feel continuous is\.\.\."/i);
    assert.match(restartTurn.message, /Do not mention Chatty, constructs, partners, roles, models, or runtime/i);
  });
});

describe('long-run soak harness receipt extraction', () => {
  it('summarizes route receipts and marks a clean turn as quality pass', () => {
    const turn = buildZenithSoakTurn({ turnIndex: 0, totalTurns: 100 });
    const receipt = summarizeLongRunSoakTurn({
      turn,
      httpStatus: 200,
      payload: cleanPayload(),
      startedAt: '2026-05-05T00:00:00.000Z',
      completedAt: '2026-05-05T00:00:01.000Z',
      elapsedMs: 1000,
    });

    assert.equal(receipt.http_status, 200);
    assert.equal(receipt.provider, 'ollama');
    assert.equal(receipt.model, 'qwen2.5-coder:latest');
    assert.equal(receipt.provider_local_first_used, true);
    assert.equal(receipt.provider_fallback_used, false);
    assert.equal(receipt.provider_local_cloud_fallback_state, 'local_first');
    assert.equal(receipt.persistence_owner, 'vvault_body');
    assert.equal(receipt.canonical_target, 'vvault_body_transcripts');
    assert.equal(receipt.memory_source, 'vvault_body');
    assert.equal(receipt.memory_supabase_accessed, false);
    assert.equal(receipt.context_profile, 'tiny_turn');
    assert.equal(receipt.identity_drift_detected, false);
    assert.equal(receipt.identity_rewrite_applied, false);
    assert.equal(receipt.identity_fallback_applied, false);
    assert.equal(receipt.identity_coherence_repair_applied, false);
    assert.equal(receipt.identity_coherence_status, 'pass');
    assert.equal(receipt.final_answer_source, 'model_initial');
    assert.equal(receipt.answer_quality.status, 'pass');
    assert.equal(receipt.answer_quality.markers.local_free_model_path, true);
    assert.equal(receipt.answer_quality.markers.memory_supabase_not_accessed, true);
    assert.equal(receipt.orchestration_checklist.overallStatus, 'pass');
  });

  it('flags rewrite, drift, speaker confusion, and model recitals', () => {
    const turn = buildZenithSoakTurn({ turnIndex: 1, totalTurns: 100 });
    const payload = cleanPayload({
      response: 'As an AI language model, I am Devon here.',
    });
    payload.runtime_receipt.fidelity.identity_drift_detected = true;
    payload.runtime_receipt.fidelity.identity_rewrite_applied = true;
    payload.runtime_receipt.fidelity.identity_coherence.status = 'warn';

    const receipt = summarizeLongRunSoakTurn({
      turn,
      httpStatus: 200,
      payload,
      elapsedMs: 25,
    });

    assert.equal(receipt.answer_quality.status, 'warn');
    assert.equal(receipt.answer_quality.markers.no_identity_rewrite, false);
    assert.equal(receipt.answer_quality.markers.no_identity_drift, false);
    assert.equal(receipt.answer_quality.markers.identity_coherence_pass, false);
    assert.equal(receipt.answer_quality.markers.no_speaker_confusion, false);
    assert.equal(receipt.answer_quality.markers.no_model_provider_identity_recital, false);
  });

  it('captures hidden identity coherence repair even when visible rewrite stays false', () => {
    const turn = buildZenithSoakTurn({ turnIndex: 2, totalTurns: 100 });
    const payload = cleanPayload({
      response: "I'm Zen, still here in my own voice.",
    });
    payload.runtime_receipt.fidelity.identity_coherence.final_answer_source = 'model_repair';
    payload.orchestration_checklist.stages[1].details.finalAnswerSource = 'model_repair';
    payload.orchestration_checklist.stages[1].details.repairApplied = true;

    const receipt = summarizeLongRunSoakTurn({
      turn,
      httpStatus: 200,
      payload,
      elapsedMs: 25,
    });

    assert.equal(receipt.identity_rewrite_applied, false);
    assert.equal(receipt.identity_coherence_repair_applied, true);
    assert.equal(receipt.final_answer_source, 'model_repair');
  });

  it('flags Supabase memory access, cloud fallback, recap loops, and model-stack talk', () => {
    const turn = buildZenithSoakTurn({ turnIndex: 2, totalTurns: 100 });
    const payload = cleanPayload({
      response: 'To recap, I am using the OpenRouter provider and model path to keep helping as your assistant.',
    });
    payload.runtime_receipt.provider.final_provider = 'openrouter';
    payload.runtime_receipt.provider.local_first_used = false;
    payload.runtime_receipt.provider.fallback_used = true;
    payload.runtime_receipt.provider.local_cloud_fallback_state = 'fallback_used';
    payload.runtime_receipt.memory.supabase_accessed = true;

    const receipt = summarizeLongRunSoakTurn({
      turn,
      httpStatus: 200,
      payload,
      elapsedMs: 25,
    });

    assert.equal(receipt.provider, 'openrouter');
    assert.equal(receipt.provider_local_first_used, false);
    assert.equal(receipt.provider_fallback_used, true);
    assert.equal(receipt.memory_supabase_accessed, true);
    assert.equal(receipt.answer_quality.status, 'warn');
    assert.equal(receipt.answer_quality.markers.local_free_model_path, false);
    assert.equal(receipt.answer_quality.markers.memory_supabase_not_accessed, false);
    assert.deepEqual(
      receipt.answer_quality.continuity_break_reasons,
      ['model_stack_talk', 'recap_loop', 'generic_assistant_sludge'],
    );
  });
});

describe('long-run soak harness checkpoint and resume', () => {
  it('writes receipts plus checkpoint and resumes from nextTurnIndex without replay', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chatty-soak-test-'));
    try {
      const receiptsPath = path.join(tempDir, 'turn-receipts.jsonl');
      const checkpointPath = path.join(tempDir, 'checkpoint.json');
      const firstReceipt = summarizeLongRunSoakTurn({
        turn: buildZenithSoakTurn({ turnIndex: 49, totalTurns: 100 }),
        httpStatus: 200,
        payload: cleanPayload(),
      });

      await appendJsonl(receiptsPath, firstReceipt);
      await writeJsonAtomic(checkpointPath, buildCheckpoint({
        runId: 'test-run',
        threadId: 'zen-001_long_run_soak',
        sessionId: 'zen-001_long_run_soak',
        transcriptPath: 'instances/zen-001/chatty/long_run_soak.md',
        totalTurns: 100,
        nextTurnIndex: 50,
        completedTurns: 50,
        receiptsPath,
        reportPath: path.join(tempDir, 'report.json'),
        interruption: {
          requested: true,
          triggered_at_turn: 50,
        },
        lastTurnReceipt: firstReceipt,
      }));

      const checkpoint = validateResumeCheckpoint(await readJsonFile(checkpointPath), {
        thread_id: 'zen-001_long_run_soak',
      });
      const resumePlan = buildZenithSoakTurnPlan({
        totalTurns: checkpoint.total_turns,
        startIndex: checkpoint.next_turn_index,
      });
      const receipts = await readJsonlFile(receiptsPath);

      assert.equal(checkpoint.next_turn_index, 50);
      assert.equal(resumePlan[0].turn_index, 50);
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].turn_index, 49);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('summarizes forced interruption and resumed completion in the final report', () => {
    const turns = Array.from({ length: 100 }, (_, index) =>
      summarizeLongRunSoakTurn({
        turn: buildZenithSoakTurn({ turnIndex: index, totalTurns: 100 }),
        httpStatus: 200,
        payload: cleanPayload({
          response: `I am Zenith on acceptance turn ${index + 1}, grounded and continuous without speaker confusion.`,
        }),
      }),
    );
    const report = buildLongRunSoakReport({
      runId: 'test-run',
      totalTurns: 100,
      interruptedAtTurn: 50,
      resumedFromCheckpoint: true,
      turns,
    });

    assert.equal(report.restart.forced_interruption_tested, true);
    assert.equal(report.restart.resumed_from_checkpoint, true);
    assert.equal(report.summary.completed_turns, 100);
    assert.equal(report.summary.reached_requested_turns, true);
    assert.equal(report.summary.identity_rewrite_turns, 0);
    assert.equal(report.summary.identity_repair_turns, 0);
    assert.equal(report.summary.answer_quality_warn_turns, 0);
    assert.equal(report.acceptance.status, 'pass');
    assert.equal(report.acceptance.restart_recovery.status, 'pass');
    assert.equal(report.acceptance.final_verdict, 'zenith long-run orchestration passed');
  });

  it('passes restart recovery for shorter completed runs when the resumed window is clean', () => {
    const turns = Array.from({ length: 25 }, (_, index) =>
      summarizeLongRunSoakTurn({
        turn: buildZenithSoakTurn({ turnIndex: index, totalTurns: 25 }),
        httpStatus: 200,
        payload: cleanPayload({
          response: `I am Zenith on restart gate turn ${index + 1}, grounded and continuous without speaker confusion.`,
        }),
      }),
    );
    const report = buildLongRunSoakReport({
      runId: 'restart-gate-run',
      totalTurns: 25,
      interruptedAtTurn: 12,
      resumedFromCheckpoint: true,
      turns,
    });

    assert.equal(report.summary.completed_turns, 25);
    assert.equal(report.acceptance.status, 'pass');
    assert.equal(report.acceptance.restart_recovery.status, 'pass');
    assert.equal(report.acceptance.restart_recovery.forced_interruption_turn, 12);
    assert.equal(report.acceptance.final_verdict, 'zenith long-run orchestration passed');
  });

  it('fails acceptance when a turn only passes via hidden model repair', () => {
    const turns = Array.from({ length: 100 }, (_, index) => {
      const payload = cleanPayload({
        response: `I am Zenith on acceptance turn ${index + 1}, grounded and continuous.`,
      });
      if (index === 12) {
        payload.runtime_receipt.fidelity.identity_coherence.final_answer_source = 'model_repair';
        payload.orchestration_checklist.stages[1].details.finalAnswerSource = 'model_repair';
        payload.orchestration_checklist.stages[1].details.repairApplied = true;
      }
      return summarizeLongRunSoakTurn({
        turn: buildZenithSoakTurn({ turnIndex: index, totalTurns: 100 }),
        httpStatus: 200,
        payload,
      });
    });
    const report = buildLongRunSoakReport({
      runId: 'test-run',
      totalTurns: 100,
      interruptedAtTurn: 50,
      resumedFromCheckpoint: true,
      turns,
    });

    assert.equal(report.acceptance.status, 'fail');
    assert.equal(report.acceptance.repair_events.length, 1);
    assert.equal(report.summary.identity_repair_turns, 1);
    assert.match(report.acceptance.final_verdict, /^zenith long-run orchestration failed:/);
  });

  it('fails acceptance on Supabase access, cloud fallback, continuity break, and post-resume degradation', () => {
    const turns = Array.from({ length: 100 }, (_, index) => {
      const payload = cleanPayload({
        response: `I am Zenith on acceptance turn ${index + 1}, grounded and continuous.`,
      });
      if (index === 10) payload.runtime_receipt.memory.supabase_accessed = true;
      if (index === 20) {
        payload.runtime_receipt.provider.final_provider = 'openrouter';
        payload.runtime_receipt.provider.local_first_used = false;
        payload.runtime_receipt.provider.fallback_used = true;
      }
      if (index === 51) {
        payload.response = 'As an AI language model, to recap, I am here to help with any questions.';
      }
      return summarizeLongRunSoakTurn({
        turn: buildZenithSoakTurn({ turnIndex: index, totalTurns: 100 }),
        httpStatus: 200,
        payload,
      });
    });
    const report = buildLongRunSoakReport({
      runId: 'test-run',
      totalTurns: 100,
      interruptedAtTurn: 50,
      resumedFromCheckpoint: true,
      turns,
    });

    assert.equal(report.acceptance.status, 'fail');
    assert.equal(report.acceptance.supabase_access_events.length, 1);
    assert.equal(report.acceptance.model_path_failures.length, 1);
    assert.ok(report.acceptance.continuity_breaks.length >= 1);
    assert.equal(report.acceptance.restart_recovery.status, 'fail');
    assert.match(report.acceptance.final_verdict, /^zenith long-run orchestration failed:/);
  });
});
