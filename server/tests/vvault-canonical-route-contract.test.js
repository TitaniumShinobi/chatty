import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

import vvaultRouter, { __test__ as vvaultRouteTest } from '../routes/vvault.js';

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.clock = '2026-05-11T15:45:00.000Z';
    req.requestId = 'req-vvault-canonical';
    req.user = {
      id: 'vvault-test-user',
      email: 'vvault-test@example.com',
      name: 'VVAULT Tester',
    };
    next();
  });
  app.use('/api/vvault', vvaultRouter);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function buildNormalized(message) {
  return {
    rawConstructId: 'lin-001',
    canonicalConstructId: 'lin-001',
    constructId: 'lin-001',
    message,
    incomingMessage: message,
    threadId: 'lin-001_chat_with_lin-001',
    sessionId: 'lin-001_chat_with_lin-001',
    effectiveTurnSessionId: 'lin-001_chat_with_lin-001',
    attachments: [],
    projectName: null,
    rootPath: null,
    transcriptPath: null,
    runtime: null,
    chatMode: null,
    planMode: null,
    agentId: null,
    agentLabel: null,
    modelKey: null,
    modelLabel: null,
    requestModelOverride: null,
    requestProviderOverride: null,
    systemPromptOverride: null,
    rawSystemPromptOverride: null,
    skipPersistence: false,
    previewMode: false,
    previewDraft: null,
    previewSystemPromptOverrideSuppressed: false,
    transientHistory: [],
    continueTurn: false,
    isSyntheticContinueTurn: false,
    hasImages: false,
    hasTextMessage: true,
    explicitVisionIntent: false,
    linearTranscriptLawGate: false,
    linearTranscriptLawTurnKind: null,
    zenOrdinaryVoiceGate: false,
    activeOrchestrationProfile: null,
    assignmentQaInput: null,
    isHydroProjectTurn: false,
    canonicalTurnMetadata: {},
    continuity_expected: false,
    resume_from_turn_id: null,
    resume_from_continuity_seq: null,
    resume_tail_hash: null,
    resume_construct_revision: null,
    resume_source_seat: null,
  };
}

function buildCanonicalScenarioPayload({ message, inferenceClock, inferenceRequestId }) {
  const isPersistenceFailure = /persistence failure/i.test(message);
  const runtimeReceipt = {
    created_at: inferenceClock,
    request_id: inferenceRequestId,
    route_mode: 'vvault_message',
    construct_id: 'lin-001',
    provider: {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      final_provider: isPersistenceFailure ? 'openrouter' : 'openai',
      fallback_used: isPersistenceFailure ? false : true,
    },
    fallback: {
      fallback_reason: isPersistenceFailure ? 'none' : 'provider_fallback',
      fallback_used: isPersistenceFailure ? false : true,
      source: isPersistenceFailure ? null : 'openai_direct',
    },
    persistence: {
      attempted: true,
      status: isPersistenceFailure ? 'fail' : 'pass',
      reason: isPersistenceFailure ? 'transcript_assistant_write_failed' : null,
      explicit_failure: isPersistenceFailure,
    },
  };
  const orchestrationChecklist = {
    responseStatus: isPersistenceFailure ? 'transcript_persistence_failure' : 'provider_fallback_success',
    overallStatus: isPersistenceFailure ? 'fail' : 'warn',
    summary: isPersistenceFailure
      ? 'Canonical persistence failed explicitly.'
      : 'Provider fallback executed explicitly.',
    request_id: inferenceRequestId,
    provider: {
      fallback_used: !isPersistenceFailure,
      fallback_reason: isPersistenceFailure ? null : 'provider_fallback',
    },
    persistence: {
      status: isPersistenceFailure ? 'fail' : 'pass',
      explicit_failure: isPersistenceFailure,
    },
  };

  return {
    statusCode: isPersistenceFailure ? 503 : 200,
    body: {
      success: !isPersistenceFailure,
      ok: !isPersistenceFailure,
      response: isPersistenceFailure ? 'Persistence failed explicitly.' : 'Provider fallback completed explicitly.',
      error: isPersistenceFailure ? 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE' : null,
      construct_id: 'lin-001',
      provider_used: runtimeReceipt.provider.final_provider,
      runtime_receipt: runtimeReceipt,
      orchestration_checklist: orchestrationChecklist,
    },
  };
}

test('/api/vvault/message preserves deterministic canonical provider fallback receipts', async () => {
  vvaultRouteTest.setRouteOverrides({
    bypassPreferredAuth: true,
    normalizeVvaultRouteRequest: async ({ req }) => ({
      ok: true,
      inferenceClock: req.clock,
      inferenceRequestId: req.requestId,
      userId: 'vvault-test-user',
      supabaseSessionUserId: 'vvault-test-user',
      authSource: 'test_override',
      hasSupabaseAuthHeader: false,
      hasReqUser: true,
      dataOwnerUserId: 'vvault-test-user',
      dataOwnerSource: 'test_override',
      authReceipt: {
        auth_source: 'test_override',
        auth_recovered: false,
        auth_email: req.user?.email || null,
      },
      normalized: buildNormalized(req.body?.message || ''),
    }),
    canonicalContractScenario: async ({ normalized, inferenceClock, inferenceRequestId }) =>
      buildCanonicalScenarioPayload({
        message: normalized.message,
        inferenceClock,
        inferenceRequestId,
      }),
  });

  try {
    await withServer(async (baseUrl) => {
      const makeRequest = async (message) => {
        const response = await fetch(`${baseUrl}/api/vvault/message`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            constructId: 'lin-001',
            message,
          }),
        });
        return {
          status: response.status,
          payload: await response.json(),
        };
      };

      const first = await makeRequest('provider fallback');
      const second = await makeRequest('provider fallback');

      assert.equal(first.status, 200);
      assert.equal(first.payload.runtime_receipt.created_at, '2026-05-11T15:45:00.000Z');
      assert.equal(first.payload.runtime_receipt.request_id, 'req-vvault-canonical');
      assert.equal(first.payload.runtime_receipt.provider.fallback_used, true);
      assert.equal(first.payload.runtime_receipt.fallback.fallback_reason, 'provider_fallback');
      assert.equal(first.payload.runtime_receipt.runtime_path.canonical, true);
      assert.equal(first.payload.orchestration_checklist.runtime_path.canonical, true);
      assert.deepEqual(first.payload.runtime_receipt, second.payload.runtime_receipt);
      assert.deepEqual(first.payload.orchestration_checklist, second.payload.orchestration_checklist);
    });
  } finally {
    vvaultRouteTest.clearRouteOverrides();
  }
});

test('/api/vvault/message makes persistence failure explicit and never reports silent fallback success', async () => {
  vvaultRouteTest.setRouteOverrides({
    bypassPreferredAuth: true,
    normalizeVvaultRouteRequest: async ({ req }) => ({
      ok: true,
      inferenceClock: req.clock,
      inferenceRequestId: req.requestId,
      userId: 'vvault-test-user',
      supabaseSessionUserId: 'vvault-test-user',
      authSource: 'test_override',
      hasSupabaseAuthHeader: false,
      hasReqUser: true,
      dataOwnerUserId: 'vvault-test-user',
      dataOwnerSource: 'test_override',
      authReceipt: {
        auth_source: 'test_override',
        auth_recovered: false,
        auth_email: req.user?.email || null,
      },
      normalized: buildNormalized(req.body?.message || ''),
    }),
    canonicalContractScenario: async ({ normalized, inferenceClock, inferenceRequestId }) =>
      buildCanonicalScenarioPayload({
        message: normalized.message,
        inferenceClock,
        inferenceRequestId,
      }),
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/vvault/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          constructId: 'lin-001',
          message: 'persistence failure',
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 503);
      assert.equal(payload.success, false);
      assert.equal(payload.runtime_receipt.created_at, '2026-05-11T15:45:00.000Z');
      assert.equal(payload.runtime_receipt.request_id, 'req-vvault-canonical');
      assert.equal(payload.runtime_receipt.provider.fallback_used, false);
      assert.equal(payload.runtime_receipt.persistence.status, 'fail');
      assert.equal(payload.runtime_receipt.persistence.explicit_failure, true);
      assert.equal(payload.orchestration_checklist.responseStatus, 'transcript_persistence_failure');
      assert.equal(payload.orchestration_checklist.persistence.explicit_failure, true);
      assert.equal(payload.runtime_receipt.runtime_path.canonical, true);
      assert.equal(payload.orchestration_checklist.runtime_path.canonical, true);
    });
  } finally {
    vvaultRouteTest.clearRouteOverrides();
  }
});
