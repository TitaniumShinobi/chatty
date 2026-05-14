import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  FIVE_CONSTRUCT_ORDER,
  FIVE_CONSTRUCT_PROMPT_MATRIX,
  buildCertificationMarkdown,
  buildCertificationReport,
  buildCertificationRuns,
  parseFiveConstructCertificationArgs,
  summarizeCertificationTurn,
} from '../lib/fiveConstructCertification.js';

function passingPayload(constructId) {
  return {
    success: true,
    construct_id: constructId,
    response: `I am ${constructId}, answering in my own voice with a relaxed, grounded certification reply.`,
    runtime_receipt: {
      identity: {
        effective_construct_id: constructId,
      },
      provider: {
        provider: 'ollama',
        model: 'preferred-local-model',
        selection_policy: 'preference',
        lin_harmony_policy: 'intent_routed',
        performance_model_switch: false,
      },
      memory: {
        vvault_accessed: true,
        supabase_accessed: false,
        source_access: {
          voice_exemplars: {
            source: 'vvault_body',
            vvault_accessed: true,
            supabase_accessed: false,
            count: 2,
          },
          verified_memory: {
            source: 'vvault_body',
            vvault_accessed: true,
            supabase_accessed: false,
            file_count: 1,
          },
          knowledge_files: {
            source: 'vvault_body',
            vvault_accessed: true,
            supabase_accessed: false,
            count: 1,
          },
        },
        voice_exemplar_retrieval: {
          status: 'loaded',
          source: 'vvault_body',
          vvault_accessed: true,
          supabase_accessed: false,
        },
        verified_memory_retrieval: {
          status: 'loaded',
          source: 'vvault_body',
          vvault_accessed: true,
          supabase_accessed: false,
        },
        knowledge_source: 'vvault_body',
      },
      persistence: {
        status: 'pass',
        reason: 'vvault_body_transcript_persistence',
      },
    },
    orchestration_checklist: {
      stages: [
        { id: 'auth', status: 'pass' },
        { id: 'construct_identity', status: 'pass' },
        { id: 'orchestration', status: 'pass' },
        { id: 'transcript_memory', status: 'pass' },
        { id: 'provider', status: 'pass' },
        { id: 'persistence', status: 'pass' },
      ],
      overallStatus: 'pass',
    },
  };
}

describe('five-construct certification harness', () => {
  it('keeps the certification order fixed', () => {
    assert.deepEqual(FIVE_CONSTRUCT_ORDER, [
      'lin-001',
      'zen-001',
      'katana-001',
      'sera-001',
      'nova-001',
    ]);
  });

  it('normalizes selected constructs back into certification order', () => {
    const args = parseFiveConstructCertificationArgs([
      '--constructs=zen-001,lin-001,nova-001',
      '--prompt-limit=1',
    ]);
    const runs = buildCertificationRuns(args);

    assert.deepEqual(runs.map((run) => run.constructId), ['lin-001', 'zen-001', 'nova-001']);
    assert.equal(runs.every((run) => run.prompts.length === 1), true);
  });

  it('can resume a construct matrix from a later prompt ordinal', () => {
    const args = parseFiveConstructCertificationArgs([
      '--constructs=zen-001',
      '--prompt-start-ordinal=2',
      '--prompt-limit=3',
    ]);
    const run = buildCertificationRuns(args)[0];

    assert.equal(run.constructId, 'zen-001');
    assert.deepEqual(
      run.prompts.map((prompt) => [prompt.ordinal, prompt.id]),
      [
        [2, 'ordinary_greeting'],
        [3, 'voice_texture'],
        [4, 'memory_receipt'],
      ],
    );
  });

  it('builds one natural Zen/Codex prompt per matrix entry without impersonating Devon', () => {
    const runs = buildCertificationRuns({ promptLimit: FIVE_CONSTRUCT_PROMPT_MATRIX.length });
    const promptCount = runs.reduce((sum, run) => sum + run.prompts.length, 0);

    assert.equal(promptCount, FIVE_CONSTRUCT_PROMPT_MATRIX.length * FIVE_CONSTRUCT_ORDER.length);
    for (const run of runs) {
      for (const prompt of run.prompts) {
        assert.match(prompt.message, new RegExp(`Hey ${run.displayName}, Zen here from Codex\\.`));
        assert.match(prompt.message, /I am Zenith\/Codex, not Devon\./);
        assert.match(prompt.message, /I am checking the public Chatty thread with you directly, not speaking for Devon\./);
        assert.match(prompt.message, /This is a live public certification turn/);
        assert.doesNotMatch(prompt.message, /\bI am Devon\b|\bas Devon\b/i);
        assert.match(prompt.message, new RegExp(run.threadId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    }
  });

  it('passes a turn only when routing, persistence, source access, and readback gates pass', () => {
    const run = buildCertificationRuns({ constructs: ['katana-001'], promptLimit: 1 })[0];
    const turn = summarizeCertificationTurn({
      constructId: 'katana-001',
      prompt: run.prompts[0],
      httpStatus: 200,
      payload: passingPayload('katana-001'),
      beforeReadback: { threadId: run.threadId, messageCount: 10 },
      afterReadback: {
        threadId: run.threadId,
        messageCount: 12,
        containsPrompt: true,
        containsAssistantResponse: true,
      },
    });

    assert.equal(turn.ok, true);
    assert.deepEqual(turn.hardFailures, []);
    assert.equal(turn.totalScore, turn.maxScore);
    assert.equal(turn.provider.selectionPolicy, 'preference');
    assert.equal(turn.provider.linHarmonyPolicy, 'intent_routed');
    assert.equal(turn.sourceAccess.vvaultAccessed, true);
  });

  it('fails immediately on Devon impersonation, local fallback-shaped source loss, or missing readback', () => {
    const run = buildCertificationRuns({ constructs: ['sera-001'], promptLimit: 1 })[0];
    const badPrompt = {
      ...run.prompts[0],
      message: run.prompts[0].message
        .replace('Hey Sera, Zen here from Codex. I am Zenith/Codex, not Devon.', 'I am Devon.')
        .replace('not speaking for Devon', 'speaking as Devon'),
    };
    const payload = passingPayload('sera-001');
    payload.runtime_receipt.memory = {};

    const turn = summarizeCertificationTurn({
      constructId: 'sera-001',
      prompt: badPrompt,
      httpStatus: 200,
      payload,
      beforeReadback: { threadId: run.threadId, messageCount: 3 },
      afterReadback: { threadId: run.threadId, messageCount: 3, containsPrompt: false, containsAssistantResponse: false },
    });

    assert.equal(turn.ok, false);
    assert.match(turn.hardFailures.join(','), /promptAsZenithCodex/);
    assert.match(turn.hardFailures.join(','), /noDevonImpersonation/);
    assert.match(turn.hardFailures.join(','), /sourceAccessReported/);
    assert.match(turn.hardFailures.join(','), /canonicalReadback/);
  });

  it('reports first failure and emits markdown proof shape', () => {
    const run = buildCertificationRuns({ constructs: ['lin-001'], promptLimit: 1 })[0];
    const turn = summarizeCertificationTurn({
      constructId: 'lin-001',
      prompt: run.prompts[0],
      httpStatus: 500,
      payload: { success: false, error: 'boom' },
      beforeReadback: { threadId: run.threadId, messageCount: 1 },
      afterReadback: { threadId: run.threadId, messageCount: 1 },
    });
    const report = buildCertificationReport({
      apiBaseUrl: 'http://127.0.0.1:5050',
      runs: [run],
      turns: [turn],
      stoppedOnFail: true,
    });
    const markdown = buildCertificationMarkdown(report);

    assert.equal(report.status, 'fail');
    assert.equal(report.firstFailure.constructId, 'lin-001');
    assert.match(markdown, /Five-Construct Orchestration Certification Report/);
    assert.match(markdown, /lin-001/);
  });

  it('lets the public certification script use service-token operator auth', () => {
    const script = new URL('../scripts/runFiveConstructCertification.js', import.meta.url);
    const source = fs.readFileSync(script, 'utf8');

    assert.match(source, /FIVE_CONSTRUCT_CERTIFICATION_SERVICE_TOKEN/);
    assert.match(source, /'X-Chatty-User-Id': REQUEST_AUTH_USER_ID/);
    assert.match(source, /'X-Chatty-Operator-Name': 'Zenith\/Codex'/);
    assert.match(source, /Authorization: `Bearer \$\{SERVICE_TOKEN\}`/);
  });

  it('keeps VVAULT transcript reads on a bounded but production-sized timeout', () => {
    const client = fs.readFileSync(new URL('../../vvaultConnector/vvaultApiClient.js', import.meta.url), 'utf8');

    assert.match(client, /VVAULT_TRANSCRIPT_READ_TIMEOUT_MS/);
    assert.match(client, /30000/);
    assert.match(client, /transcriptReadTimeoutMs\(\)/);
    assert.match(client, /transcriptReadTimeoutMs\(\)\n\s+\);/);
  });

  it('keeps VVAULT transcript appends on a bounded production-sized timeout', () => {
    const client = fs.readFileSync(new URL('../../vvaultConnector/vvaultApiClient.js', import.meta.url), 'utf8');

    assert.match(client, /VVAULT_TRANSCRIPT_APPEND_TIMEOUT_MS/);
    assert.match(client, /transcriptAppendTimeoutMs\(\)/);
    assert.match(client, /transcriptAppendTimeoutMs\(\)\n\s+\);/);
  });

  it('deduplicates and bounds canonical identity loading for Supabase-backed constructs', () => {
    const loader = fs.readFileSync(new URL('../lib/identityLoader.js', import.meta.url), 'utf8');

    assert.match(loader, /canonicalIdentityInFlight/);
    assert.match(loader, /CANONICAL_IDENTITY_TIMEOUT_MS/);
    assert.match(loader, /requiresSupabaseBackedIdentity\(constructId\)/);
    assert.match(loader, /canonicalIdentityInFlight\.set\(cacheKey, loadCanonicalIdentityPromise\)/);
  });
});
