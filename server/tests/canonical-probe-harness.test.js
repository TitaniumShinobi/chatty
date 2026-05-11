import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalProbeReport,
  describeRepairOutcome,
  summarizeCanonicalProbeTurn,
} from '../lib/canonicalProbeHarness.js';
import { promptMatrixForConstructs } from '../scripts/runPromptGateProbeHarness.js';

describe('canonical probe harness report shape', () => {
  it('summarizes seat routing, coherence, and transcript growth from checklist plus receipt data', () => {
    const turn = summarizeCanonicalProbeTurn({
      probe: {
        id: 'runtime_contract',
        label: 'Runtime Contract',
        message: 'Inspect the exact /api/vvault/message receipt and checklist contract.',
      },
      httpStatus: 200,
      payload: {
        success: true,
        construct_id: 'lin-001',
        response: 'Grounded response',
        packets: [{ id: 'packet-1' }],
        runtime_receipt: {
          provider: {
            final_provider: 'ollama',
            model: 'qwen2.5-coder:latest',
            model_source: 'lin_default',
            requested_seat: 'coding',
            requested_canonical_seat: 'intelligence',
            local_cloud_fallback_state: 'local_first',
            fallback_used: false,
          },
          fidelity: {
            identity_coherence: {
              status: 'pass',
              final_answer_source: 'model',
              blocked_canonical_persistence: false,
            },
          },
          persistence: {
            status: 'pass',
            canonical_target: 'supabase_vault_files',
          },
        },
        orchestration_checklist: {
          overallStatus: 'pass',
          summary: { pass: 12, warn: 0, fail: 0, skipped: 0 },
          stages: [
            {
              id: 'provider',
              status: 'pass',
              details: {
                finalProvider: 'ollama',
                model: 'qwen2.5-coder:latest',
                requestedSeat: 'coding',
                requestedCanonicalSeat: 'intelligence',
                modelSource: 'lin_default',
                localCloudFallbackState: 'local_first',
              },
            },
            {
              id: 'identity_coherence',
              status: 'pass',
              why: 'Identity/coherence passed before persistence.',
              details: {
                status: 'pass',
                reasons: [],
                finalAnswerSource: 'model',
                blockedCanonicalPersistence: false,
              },
            },
            {
              id: 'persistence',
              status: 'pass',
              why: 'Server-side transcript persistence was enabled for this response.',
              details: {},
            },
          ],
        },
      },
      beforeSnapshot: {
        transcriptPath: 'instances/lin-001/chatty/chat_with_lin-001.md',
        rowCount: 1,
        messageCount: 146,
        nonDateMessageCount: 146,
        totalMessageCount: 146,
      },
      afterSnapshot: {
        transcriptPath: 'instances/lin-001/chatty/chat_with_lin-001.md',
        rowCount: 1,
        messageCount: 148,
        nonDateMessageCount: 148,
        totalMessageCount: 148,
      },
    });

    assert.equal(turn.ok, true);
    assert.equal(turn.constructId, 'lin-001');
    assert.equal(turn.seat.requestedSeat, 'coding');
    assert.equal(turn.seat.requestedCanonicalSeat, 'intelligence');
    assert.equal(turn.seat.displayName, 'Intelligence');
    assert.equal(turn.provider.finalProvider, 'ollama');
    assert.equal(turn.provider.model, 'qwen2.5-coder:latest');
    assert.equal(turn.coherence.checklistStatus, 'pass');
    assert.equal(turn.coherence.repairOutcome, 'not_needed');
    assert.equal(turn.persistence.checklistStatus, 'pass');
    assert.equal(turn.transcript.rowDelta, 0);
    assert.equal(turn.transcript.messageDelta, 2);
  });

  it('counts repaired turns when deterministic fallback or repair was applied', () => {
    const report = buildCanonicalProbeReport({
      constructId: 'lin-001',
      sessionId: 'lin-001_chat_with_lin-001',
      apiBaseUrl: 'http://127.0.0.1:5050',
      probes: [{ id: 'identity_boundary', label: 'Identity Boundary', message: 'Who are you?' }],
      initialSnapshot: { rowCount: 1, messageCount: 100, nonDateMessageCount: 100, totalMessageCount: 100 },
      finalSnapshot: { rowCount: 1, messageCount: 102, nonDateMessageCount: 102, totalMessageCount: 102 },
      results: [
        {
          ok: true,
          coherence: {
            repairOutcome: 'deterministic_policy_fallback_applied',
          },
          transcript: {
            messageDelta: 2,
          },
        },
      ],
    });

    assert.equal(
      describeRepairOutcome({
        deterministic_policy_fallback_applied: true,
      }),
      'deterministic_policy_fallback_applied',
    );
    assert.equal(report.summary.totalTurns, 1);
    assert.equal(report.summary.okTurns, 1);
    assert.equal(report.summary.repairedTurns, 1);
    assert.equal(report.summary.transcriptGrowthTurns, 1);
    assert.equal(report.transcript.messageDelta, 2);
  });
});

describe('prompt-gate probe harness matrix', () => {
  it('keeps the evidence-positive control and adds the second live-lane Zen prompt', () => {
    const zenPrompts = promptMatrixForConstructs(['zen-001']);
    assert.deepEqual(
      zenPrompts.map((probe) => probe.id),
      ['zen_direct_equivalent', 'zen_remains_true_orchestration'],
    );
    assert.equal(
      zenPrompts[1]?.message,
      'Codex diagnostic prompt-gate probe, not Devon. Zen, what remains true about you while we work on orchestration?',
    );

    const novaPrompts = promptMatrixForConstructs(['nova-001']);
    const evidenceControl = novaPrompts.find((probe) => probe.id === 'evidence_positive_control');
    assert.ok(evidenceControl);
    assert.equal(evidenceControl.expectedMode, 'evidence');
  });
});
