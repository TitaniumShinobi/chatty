import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConversationHydrationPayload,
  buildContinuityProofReceipt,
  buildTranscriptTruthPreflight,
} from '../lib/vvaultConversationRouteContract.js';
import { buildOrchestrationChecklist } from '../lib/orchestrationChecklist.js';

describe('vvault routes determinism', () => {
  it('buildConversationHydrationPayload produces deterministic output for same inputs', () => {
    const input = {
      fullLookup: {
        status: 'ok',
        value: [{ sessionId: 'zen-001_chat_with_zen-001', messages: [] }],
      },
      indexLookup: {
        status: 'ok',
        value: [{ id: 'idx-1' }],
      },
      mapIndexRowsToHydrationRecords: () => [],
    };

    const result1 = buildConversationHydrationPayload(input);
    const result2 = buildConversationHydrationPayload(input);

    assert.deepEqual(result1, result2);
    assert.equal(result1.hydrationSource, 'full');
    assert.equal(result1.hydrationComplete, true);
    assert.equal(result1.generativeEligible, true);
    assert.equal(result1.continuityEligible, true);
  });

  it('buildConversationHydrationPayload returns empty-fallback when no lookups succeed', () => {
    const payload = buildConversationHydrationPayload({
      fullLookup: null,
      indexLookup: { status: 'ok', value: [] },
      mapIndexRowsToHydrationRecords: () => [],
    });

    assert.equal(payload.hydrationSource, 'empty-fallback');
    assert.equal(payload.hydrationComplete, false);
    assert.deepEqual(payload.conversations, []);
  });

  it('buildContinuityProofReceipt produces deterministic receipt for same resumeValidation', () => {
    const resumeValidation = {
      continuityExpected: true,
      continuityRestored: true,
      continuitySource: 'runtimeTurnState',
      continuedFromTurnId: 'turn_abc123',
      continuitySeq: 3,
      constructMatch: true,
      threadMatch: true,
    };

    const receipt1 = buildContinuityProofReceipt({
      hydration: 'full',
      hydrationComplete: true,
      resumeValidation,
    });
    const receipt2 = buildContinuityProofReceipt({
      hydration: 'full',
      hydrationComplete: true,
      resumeValidation,
    });

    assert.deepEqual(receipt1, receipt2);
    assert.equal(receipt1.hydration, 'full');
    assert.equal(receipt1.hydrationComplete, true);
    assert.equal(receipt1.continuityExpected, true);
    assert.equal(receipt1.continuityRestored, true);
    assert.equal(receipt1.continuitySource, 'runtimeTurnState');
    assert.equal(receipt1.continuedFromTurnId, 'turn_abc123');
    assert.equal(receipt1.continuitySeq, 3);
  });

  it('buildContinuityProofReceipt defaults when no resumeValidation provided', () => {
    const receipt = buildContinuityProofReceipt({});

    assert.equal(receipt.hydration, 'none');
    assert.equal(receipt.hydrationComplete, false);
    assert.equal(receipt.continuityExpected, false);
    assert.equal(receipt.continuityRestored, false);
    assert.equal(receipt.continuitySource, 'none');
    assert.equal(receipt.continuedFromTurnId, null);
  });

  it('buildTranscriptTruthPreflight returns correct structure for full hydration path', () => {
    const conversations = [
      {
        sessionId: 'zen-001_chat_with_zen-001',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' },
        ],
      },
    ];
    const preflight = buildTranscriptTruthPreflight({
      readPathAvailable: true,
      conversations,
      sessionId: 'zen-001_chat_with_zen-001',
      constructId: 'zen-001',
      requireRuntimeTurnState: false,
    });

    assert.equal(preflight.eligible, true);
    assert.equal(preflight.status, 200);
    assert.equal(preflight.hydrationSource, 'full');
    assert.equal(preflight.hydrationComplete, true);
    assert.equal(preflight.exactThreadFound, true);
    assert.equal(preflight.assistantTailFound, true);
    assert.equal(preflight.exactMessages.length, 2);
    assert.equal(preflight.latestAssistantTurn.role, 'assistant');
    assert.equal(preflight.latestAssistantTurn.content, 'hi there');
    assert.equal(preflight.generativeEligible, true);
  });

  it('buildTranscriptTruthPreflight returns ineligible when thread missing', () => {
    const preflight = buildTranscriptTruthPreflight({
      readPathAvailable: true,
      conversations: [],
      sessionId: 'nonexistent-session',
      constructId: 'zen-001',
    });

    assert.equal(preflight.eligible, false);
    assert.equal(preflight.status, 409);
    assert.equal(preflight.code, 'TRANSCRIPT_HYDRATION_REQUIRED');
    assert.equal(preflight.exactThreadFound, false);
    assert.equal(preflight.hydrationSource, 'empty-fallback');
  });

  it('buildOrchestrationChecklist with fixed inputs produces deterministic output', () => {
    const input = {
      userId: 'test-user-001',
      user: { email: 'test@test.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'continue',
      gptConfig: null,
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'identity_bundle_preflight' },
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false, attempts: [{ status: 'ok' }] },
      runtimeReceipt: {
        auth: { auth_email: 'test@test.com' },
        provider: { provider: 'ollama', model: 'phi3:latest', final_provider: 'ollama' },
        fidelity: {},
        persistence: { status: 'pass', attempted: true, stage: 'assistant' },
      },
      skipPersistence: false,
    };

    const result1 = buildOrchestrationChecklist(input);
    const result2 = buildOrchestrationChecklist(input);

    assert.equal(result1.version, 'orchestration-checklist.v1');
    assert.equal(result2.version, 'orchestration-checklist.v1');

    const stagesWithoutTiming1 = result1.stages.map((s) => ({ id: s.id, status: s.status, owner: s.owner }));
    const stagesWithoutTiming2 = result2.stages.map((s) => ({ id: s.id, status: s.status, owner: s.owner }));
    assert.deepEqual(stagesWithoutTiming1, stagesWithoutTiming2);
  });

  it('provider fallback is visible in orchestration checklist', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'test-user-001',
      user: { email: 'test@test.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'hello',
      gptConfig: null,
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'identity_bundle_preflight' },
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: {
        final_provider: 'openrouter',
        fallback_used: true,
        attempts: [
          { provider: 'openrouter', status: 'failed', error_code: '429' },
          { provider: 'openai', status: 'ok' },
        ],
      },
      runtimeReceipt: {
        auth: { auth_email: 'test@test.com' },
        provider: { provider: 'openrouter', model: 'gpt-4', final_provider: 'openai' },
        fidelity: {},
        persistence: { status: 'pass', attempted: true, stage: 'assistant' },
      },
      skipPersistence: false,
    });

    const providerStage = checklist.stages.find((s) => s.id === 'provider');
    assert.ok(providerStage);
    assert.equal(providerStage.status, 'warn');
    assert.ok(providerStage.details.fallbackUsed);
    assert.equal(providerStage.details.finalProvider, 'openrouter');
  });

  it('persistence failure is visible in orchestration checklist', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'test-user-001',
      user: { email: 'test@test.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'hello',
      gptConfig: null,
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'identity_bundle_preflight' },
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false, attempts: [{ status: 'ok' }] },
      runtimeReceipt: {
        auth: { auth_email: 'test@test.com' },
        provider: { provider: 'ollama', model: 'phi3:latest', final_provider: 'ollama' },
        fidelity: {},
        persistence: { status: 'fail', attempted: true, stage: 'assistant', error: 'VVAULT write failed' },
      },
      skipPersistence: false,
    });

    const persistenceStage = checklist.stages.find((s) => s.id === 'persistence');
    assert.ok(persistenceStage);
    assert.equal(persistenceStage.status, 'fail');
    assert.match(persistenceStage.why, /VVAULT write failed/);
    assert.equal(persistenceStage.details.stage, 'assistant');
  });

  it('all provider failures produce explicit failure state, not fake ok', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'test-user-001',
      user: { email: 'test@test.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'hello',
      gptConfig: null,
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'identity_bundle_preflight' },
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: {
        final_provider: null,
        fallback_used: true,
        total_duration_ms: 5000,
        attempts: [
          { provider: 'openrouter', status: 'failed', error_code: '429' },
          { provider: 'openai', status: 'failed', error_code: '503' },
          { provider: 'ollama', status: 'failed', error_code: 'timeout' },
        ],
      },
      runtimeReceipt: {
        auth: { auth_email: 'test@test.com' },
        provider: { provider: null, model: 'gpt-4', final_provider: null },
        fidelity: {},
        persistence: null,
      },
      skipPersistence: true,
    });

    const providerStage = checklist.stages.find((s) => s.id === 'provider');
    assert.ok(providerStage);
    assert.equal(providerStage.status, 'warn');
    assert.equal(providerStage.details.finalProvider, null);
    assert.equal(providerStage.details.fallbackUsed, true);
    assert.equal(providerStage.details.attempts, 3);
  });

  it('orchestration checklist includes generatedAt timestamp', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'test-user-001',
      user: { email: 'test@test.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'holiday test',
      gptConfig: { id: 'test-gpt', name: 'Test GPT' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'identity_bundle_preflight' },
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false, attempts: [{ status: 'ok' }] },
      runtimeReceipt: {
        auth: { auth_email: 'test@test.com' },
        provider: { provider: 'ollama', model: 'phi3:latest', final_provider: 'ollama' },
        fidelity: {},
        persistence: { status: 'pass', attempted: true, stage: 'assistant' },
      },
      skipPersistence: false,
    });

    assert.equal(typeof checklist.generatedAt, 'string');
    assert.match(checklist.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});
