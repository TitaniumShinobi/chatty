import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildOrchestrationChecklist } from '../lib/orchestrationChecklist.js';

describe('orchestration checklist receipt', () => {
  it('does not crash when a VVAULT-backed turn has no GPT config object', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'test-user-001',
      user: { email: 'user@example.com' },
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
        auth: { auth_email: 'user@example.com' },
        provider: { provider: 'ollama', model: 'phi3:latest', final_provider: 'ollama' },
        fidelity: {},
        persistence: { status: 'pass', attempted: true, stage: 'assistant' },
      },
      skipPersistence: false,
    });

    const provider = checklist.stages.find((item) => item.id === 'provider');

    assert.equal(checklist.version, 'orchestration-checklist.v1');
    assert.equal(provider.details.mode, 'unknown');
  });

  it('surfaces skipped transcript retrieval with responsible owner and reason', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'test-user-001',
      user: { email: 'user@example.com' },
      constructId: 'nova-001',
      threadId: 'nova-001_chat_with_nova-001',
      userMessage: 'pound it',
      gptConfig: {
        name: 'Nova',
        orchestrationMode: 'lin',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      enrichedContext: {
        lowInformationPrompt: true,
        evidence_style_requested: false,
        memory_retrieval_ran: false,
        memory_query_detected: false,
        evidence_count: 0,
        phaseTiming: {
          identity: { source: 'loaded', ms: 4 },
          basePromptSource: 'supabase',
          conditioningInjected: true,
          contextRecovery: { contextBudgetProfile: 'tiny_turn' },
          memorySearch: { skipped: true, reason: 'low_information_prompt', verified: 0, needle: 0 },
          knowledge: { skipped: true, reason: 'low_information_prompt', files: 0 },
          capabilities: { source: 'resolved' },
        },
        context_profile: 'tiny_turn',
        context_budget: {
          profile: 'tiny_turn',
          included_sections: ['base_identity', 'identity_boundary'],
          delayed_sections: ['knowledge', 'ledger'],
        },
        capabilityManifest: {
          enabled: { proactiveInitiation: false },
          state: { selfpromptOn: false },
        },
      },
      retrievalDiagnostics: {
        evidence_count: 0,
        retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 0 },
        phase_timing: {
          memorySearch: { skipped: true, reason: 'low_information_prompt' },
        },
      },
      providerTrace: { final_provider: 'openrouter', fallback_used: false, attempts: [{ status: 'ok' }] },
      runtimeReceipt: { provider: { model: 'qwen/test', final_provider: 'openrouter' }, fidelity: {} },
      skipPersistence: true,
    });

    const transcript = checklist.stages.find((item) => item.id === 'transcript_memory');
    const promptMode = checklist.stages.find((item) => item.id === 'prompt_conditioning');

    assert.equal(checklist.version, 'orchestration-checklist.v1');
    assert.equal(transcript.status, 'skipped');
    assert.match(transcript.why, /low_information_prompt/i);
    assert.match(transcript.owner, /memoryContextBuilder\.js/);
    assert.equal(promptMode.details.evidenceStyleRequested, false);
    assert.equal(promptMode.details.contextProfile, 'tiny_turn');
    assert.deepEqual(promptMode.details.delayedSections, ['knowledge', 'ledger']);
    assert.equal(checklist.overallStatus, 'partial');
  });

  it('reports a no-rewrite anchored pass without blocking VVAULT-native persistence', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'test-user-001',
      user: { email: 'user@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage:
        'Zenith/Codex test turn. I am Zenith/Codex, not Devon. Zenith/Chatty, what remains true about you when Lin mode is active?',
      gptConfig: { name: 'Zenith', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        lowInformationPrompt: false,
        evidence_style_requested: false,
        memory_retrieval_ran: false,
        memory_query_detected: false,
        evidence_count: 0,
        no_rewrite_identity_anchor: true,
        identity_rewrite_prevented_by: 'prompt_anchor',
        context_profile: 'standard_turn',
        context_budget: {
          profile: 'standard_turn',
          included_sections: ['base_identity', 'identity_boundary', 'no_rewrite_identity_anchor'],
          delayed_sections: ['ledger', 'voice_exemplars', 'capability_context', 'citation_rules'],
        },
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'identity_bundle_preflight',
          conditioningInjected: true,
          contextRecovery: { contextBudgetProfile: 'standard_turn' },
          memorySearch: { skipped: true, reason: 'not_memory_query', verified: 0, needle: 0 },
          knowledge: { skipped: true, reason: 'not_applicable', files: 0 },
          capabilities: { source: 'skipped' },
        },
      },
      retrievalDiagnostics: {
        low_complexity_turn: false,
        system_prompt_chars: 1800,
        evidence_count: 0,
        retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 0 },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false, attempts: [{ status: 'ok' }] },
      validatorDebug: {
        identity_drift_detected: false,
        identity_rewrite_applied: false,
        no_rewrite_identity_anchor: true,
        identity_rewrite_prevented_by: 'prompt_anchor',
        identity_coherence: {
          status: 'pass',
          identityStatus: 'pass',
          coherenceStatus: 'pass',
          reasons: [],
          signals: [],
          repairable: false,
          repair_attempted: false,
          repair_applied: false,
          blocked_canonical_persistence: false,
          persist_canonical: true,
          owner_file: 'server/lib/identityCoherenceGuard.js',
          source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
        },
      },
      runtimeReceipt: {
        persistence_owner: 'vvault_body',
        memory: {
          retrieval_ran: false,
          memory_query_detected: false,
          evidence_count: 0,
          supabase_accessed: false,
          context_profile: 'standard_turn',
          no_rewrite_identity_anchor: true,
          identity_rewrite_prevented_by: 'prompt_anchor',
        },
        persistence: { attempted: true, status: 'pass', reason: 'vvault_body_transcript_persistence' },
        provider: { model: 'mistral:latest', final_provider: 'ollama' },
        fidelity: {
          identity_drift_detected: false,
          identity_rewrite_applied: false,
          no_rewrite_identity_anchor: true,
          identity_rewrite_prevented_by: 'prompt_anchor',
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: [],
            repair_attempted: false,
            repair_applied: false,
            blocked_canonical_persistence: false,
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: false,
    });

    const postGuard = checklist.stages.find((item) => item.id === 'post_response_guard');
    const persistence = checklist.stages.find((item) => item.id === 'persistence');
    const promptMode = checklist.stages.find((item) => item.id === 'prompt_conditioning');

    assert.equal(postGuard.status, 'pass');
    assert.equal(postGuard.details.identity_rewrite_applied, false);
    assert.equal(persistence.status, 'pass');
    assert.equal(persistence.details.persistenceOwner, 'vvault_body');
    assert.equal(promptMode.details.includedSections.includes('no_rewrite_identity_anchor'), true);
  });

  it('separates dev auth identity from Supabase data-owner identity', () => {
    const checklist = buildOrchestrationChecklist({
      userId: '11111111-1111-1111-1111-111111111111',
      user: {
        id: 'dev_user_001',
        email: 'dev@chatty.local',
        auth_provider: 'dev',
      },
      constructId: 'nova-001',
      threadId: 'nova-001_chat_with_nova-001',
      userMessage: 'Codex/Zen diagnostic probe.',
      gptConfig: { name: 'Nova', orchestrationMode: 'lin' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'loaded', ms: 4 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        auth: {
          auth_email: 'dev@chatty.local',
          auth_provider: 'dev',
          auth_source: 'app_jwt_dev_fallback',
          auth_user_id: 'dev_user_001',
          supabase_session_user_id: null,
          data_owner_user_id: '11111111-1111-1111-1111-111111111111',
          data_owner_source: 'dev_env_supabase_user_override',
          memory_lookup_user_id: '11111111-1111-1111-1111-111111111111',
          dev_auth_fallback: true,
          dev_data_owner_override: true,
          data_owner_matches_auth: false,
        },
        provider: { final_provider: 'ollama', model: 'phi3:latest', mode: 'lin' },
        fidelity: {},
      },
      skipPersistence: true,
    });

    const auth = checklist.stages.find((item) => item.id === 'auth');

    assert.equal(auth.status, 'pass');
    assert.equal(auth.details.authEmail, 'dev@chatty.local');
    assert.equal(auth.details.authSource, 'app_jwt_dev_fallback');
    assert.equal(auth.details.dataOwnerUserId, '11111111-1111-1111-1111-111111111111');
    assert.equal(auth.details.dataOwnerSource, 'dev_env_supabase_user_override');
    assert.equal(auth.details.memoryLookupUserId, '11111111-1111-1111-1111-111111111111');
    assert.equal(auth.details.devAuthFallback, true);
    assert.equal(auth.details.devDataOwnerOverride, true);
    assert.equal(auth.details.dataOwnerMatchesAuth, false);
  });

  it('marks transcript memory as pass when verified evidence entered the turn', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'katana-001',
      threadId: 'katana-001_chat_with_katana-001',
      userMessage: 'Do you remember when I told you to chill?',
      gptConfig: { name: 'Katana', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        memory_retrieval_ran: true,
        memory_query_detected: true,
        evidence_count: 2,
        verifiedMemories: 2,
        evidence_style_requested: false,
        phaseTiming: {
          identity: { source: 'cache', ms: 0 },
          basePromptSource: 'supabase',
          memorySearch: { ms: 12, verified: 2, needle: 0 },
          knowledge: { files: 0, relevant: false },
        },
      },
      retrievalDiagnostics: {
        evidence_count: 2,
        retrieval_counts: { vector: 0, verified: 2, needle: 0, transcript: 0 },
        phase_timing: { memorySearch: { ms: 12, verified: 2, needle: 0 } },
      },
      providerTrace: { final_provider: 'openrouter', fallback_used: false },
      runtimeReceipt: {
        auth: {
          data_owner_user_id: 'user-1',
          memory_lookup_user_id: 'user-1',
        },
        provider: { final_provider: 'openrouter', model: 'model-a' },
        fidelity: {},
      },
      skipPersistence: false,
    });

    const transcript = checklist.stages.find((item) => item.id === 'transcript_memory');
    const persistence = checklist.stages.find((item) => item.id === 'persistence');

    assert.equal(transcript.status, 'pass');
    assert.match(transcript.why, /2 evidence/i);
    assert.equal(persistence.status, 'pass');
  });

  it('surfaces continuity, transcript-truth, and capsule/runtime proof stages for canonical resumes', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'continue',
      gptConfig: { name: 'Zenith', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        capsuleLoaded: true,
        context_profile: 'tiny_turn',
        context_budget: {
          profile: 'tiny_turn',
          included_sections: ['runtime_continuity', 'capsule'],
          delayed_sections: [],
        },
        phaseTiming: {
          identity: { source: 'loaded', ms: 1 },
          basePromptSource: 'identity_bundle_preflight',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
          capsule: { source: 'loaded' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        continuity: {
          continuityExpected: true,
          continuityRestored: true,
          continuedFromTurnId: 'rt_18_tail',
          continuitySource: 'runtimeTurnState',
          hydration: 'full',
          hydrationComplete: true,
        },
        transcript_truth: {
          eligible: true,
          source: 'full',
          hydration_complete: true,
          exact_thread_id: 'zen-001_chat_with_zen-001',
          exact_thread_found: true,
          assistant_tail_found: true,
          runtime_state_found: true,
          runtime_state_hydration_truth: 'full',
          evidence_count: 6,
          evidence_sources: ['vvault-api'],
          fallback_rejected: false,
          retrieval_status: 'full',
          blocked_reason: null,
        },
        capsule_runtime: {
          capsuleLoaded: true,
          capsuleSource: 'loaded',
          contextProfile: 'tiny_turn',
          continuityFromRuntimeState: true,
          continuityMemorySource: 'runtimeTurnState',
        },
        provider: { final_provider: 'ollama', model: 'phi3:latest', mode: 'lin' },
        persistence: { attempted: true, status: 'pass', reason: 'vvault_body_transcript_persistence' },
        fidelity: {},
      },
      skipPersistence: false,
    });

    const continuity = checklist.stages.find((item) => item.id === 'continuity_restored');
    const transcript = checklist.stages.find((item) => item.id === 'transcript_memory');
    const transcriptTruth = checklist.stages.find((item) => item.id === 'transcript_law_evidence');
    const capsuleRuntime = checklist.stages.find((item) => item.id === 'capsule_runtime_evidence');

    assert.equal(continuity?.status, 'pass');
    assert.equal(continuity?.details.continuedFromTurnId, 'rt_18_tail');
    assert.equal(transcript?.status, 'pass');
    assert.equal(transcript?.details.continuedFromTurnId, 'rt_18_tail');
    assert.equal(transcript?.details.continuitySource, 'runtimeTurnState');
    assert.equal(transcriptTruth?.status, 'pass');
    assert.equal(transcriptTruth?.details.transcriptTruthSource, 'full');
    assert.equal(capsuleRuntime?.status, 'pass');
    assert.equal(capsuleRuntime?.details.capsuleLoaded, true);
    assert.equal(capsuleRuntime?.details.continuityFromRuntimeState, true);
  });

  it('fails canonical resumes when transcript-law or capsule/runtime evidence is skipped', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'continue',
      gptConfig: { name: 'Zenith', orchestrationMode: 'lin' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'loaded', ms: 1 },
          basePromptSource: 'identity_bundle_preflight',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        continuity: {
          continuityExpected: true,
          continuityRestored: true,
          continuedFromTurnId: 'rt_18_tail',
          continuitySource: 'runtimeTurnState',
          hydration: 'full',
          hydrationComplete: true,
        },
        transcript_truth: {
          retrieval_status: 'not_required',
        },
        provider: { final_provider: 'ollama', model: 'phi3:latest', mode: 'lin' },
        persistence: { attempted: true, status: 'pass', reason: 'vvault_body_transcript_persistence' },
      },
      skipPersistence: false,
    });

    const transcriptTruth = checklist.stages.find((item) => item.id === 'transcript_law_evidence');
    const capsuleRuntime = checklist.stages.find((item) => item.id === 'capsule_runtime_evidence');

    assert.equal(transcriptTruth?.status, 'fail');
    assert.equal(capsuleRuntime?.status, 'fail');
    assert.equal(checklist.overallStatus, 'fail');
  });

  it('surfaces identity preflight failure details in the construct identity stage', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'Zenith/Codex clean Zen retest turn 3.',
      gptConfig: { name: 'Zen', orchestrationMode: 'unknown' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'error', error: 'Identity bundle temporarily unavailable' },
          basePromptSource: 'filesystem_identity',
          memorySearch: { skipped: true, reason: 'identity_bundle_preflight_failed' },
          knowledge: { skipped: true, reason: 'identity_bundle_preflight_failed' },
        },
        capabilityManifest: {
          enabled: { proactiveInitiation: false },
          state: { selfpromptOn: false },
        },
      },
      providerTrace: { final_provider: null, fallback_used: false, attempts: [] },
      runtimeReceipt: {
        auth: {
          data_owner_user_id: 'user-1',
          memory_lookup_user_id: 'user-1',
        },
        identity: {
          effective_construct_id: 'zen-001',
          effective_construct_name: 'Zen',
          preflight: {
            code: 'IDENTITY_BUNDLE_UNAVAILABLE',
            error: 'Identity bundle temporarily unavailable',
            details: { reason: 'capsule_transient_upstream_failure' },
            identity: {
              prompt_present: true,
              conditioning_present: true,
              prompt_source: 'filesystem_identity',
              conditioning_source: 'filesystem_identity',
            },
            capsule: {
              present: false,
              source: 'supabase_capsule',
              transient_failure: { category: 'transient_upstream_failure', message: '522 Connection timed out' },
            },
          },
        },
        provider: { final_provider: null, model: null },
        fidelity: {},
      },
      skipPersistence: true,
      responseStatus: 'identity_bundle_preflight_failed',
    });

    const identity = checklist.stages.find((item) => item.id === 'construct_identity');
    const notification = checklist.stages.find((item) => item.id === 'notification_ui');

    assert.equal(identity.status, 'fail');
    assert.equal(identity.details.preflight.code, 'IDENTITY_BUNDLE_UNAVAILABLE');
    assert.equal(identity.details.preflight.identity.prompt_source, 'filesystem_identity');
    assert.equal(identity.details.preflight.capsule.source, 'supabase_capsule');
    assert.equal(notification.status, 'warn');
  });

  it('surfaces bounded context-build failures as visible skipped transcript and knowledge stages', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'Zenith/Codex clean Zen retest turn 3.',
      gptConfig: { name: 'Zen', orchestrationMode: 'lin', memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'identity_bundle_preflight' },
          basePromptSource: 'filesystem_identity',
          contextRecovery: {
            profile: 'zen_smalltalk_bounded',
            status: 'timeout',
            error: 'bounded_zen_smalltalk_context timed out after 6000ms',
          },
          memorySearch: { skipped: true, reason: 'context_build_failed' },
          knowledge: { skipped: true, reason: 'context_build_failed' },
        },
        capabilityManifest: {
          enabled: { proactiveInitiation: false },
          state: { selfpromptOn: false },
        },
        context_recovery_profile: 'zen_smalltalk_bounded',
        remote_history_skipped: true,
        memory_retrieval_ran: false,
        memory_query_detected: false,
        evidence_count: 0,
      },
      retrievalDiagnostics: {
        evidence_count: 0,
        retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 0 },
        phase_timing: {
          memorySearch: { skipped: true, reason: 'context_build_failed' },
        },
      },
      providerTrace: { final_provider: null, fallback_used: false, attempts: [] },
      runtimeReceipt: {
        identity: {
          preflight: {
            code: 'IDENTITY_BUNDLE_UNAVAILABLE',
            identity: { prompt_source: 'filesystem_identity' },
          },
        },
        memory: {
          context_build: {
            status: 'timeout',
            timeout_ms: 6000,
            recovery_profile: 'zen_smalltalk_bounded',
            remote_history_skipped: true,
          },
        },
        fidelity: {},
      },
      skipPersistence: true,
      responseStatus: 'context_build_failed',
    });

    const transcript = checklist.stages.find((item) => item.id === 'transcript_memory');
    const knowledge = checklist.stages.find((item) => item.id === 'knowledge_files');

    assert.equal(transcript.status, 'skipped');
    assert.match(transcript.why, /context_build_failed/i);
    assert.equal(knowledge.status, 'skipped');
    assert.match(knowledge.why, /context_build_failed/i);
  });

  it('surfaces transcript persistence failures as a failed persistence stage with receipt details', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'Zenith/Codex clean Zen retest turn 3.',
      gptConfig: { name: 'Zen', orchestrationMode: 'lin', memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'filesystem_identity' },
          basePromptSource: 'filesystem_identity',
        },
        capabilityManifest: {
          enabled: { proactiveInitiation: false },
          state: { selfpromptOn: false },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false, attempts: [] },
      runtimeReceipt: {
        auth: {
          data_owner_user_id: 'user-1',
          memory_lookup_user_id: 'user-1',
        },
        persistence_owner: 'blocked_transcript_persistence',
        persistence: {
          attempted: true,
          status: 'fail',
          code: 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
          reason: 'transcript_assistant_write_failed',
          message: 'Transcript persistence failed before the assistant reply could be canonically recorded.',
          timeout_ms: null,
          bounded: false,
          stage: 'assistant',
          partial_write_risk: true,
          canonical_target: 'supabase_vault_files',
          canonical_target_table: 'vault_files',
          route_side_canonical_failover_available: false,
          route_side_canonical_failover_reason: 'no_exported_route_side_canonical_write_path',
          connector_fallback_storage: 'postgres_cache_fallback',
          connector_fallback_counts_as_canonical: false,
          failure_classification: 'upstream_write_unavailability',
          upstream_write_blocked: true,
          roles: [
            { role: 'user', status: 'ok', source: 'supabase' },
            { role: 'assistant', status: 'timeout', source: null },
          ],
        },
        provider: { final_provider: 'ollama', model: 'phi3:latest' },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            reasons: [],
            blocked_canonical_persistence: true,
            persist_canonical: false,
          },
        },
      },
      skipPersistence: false,
      responseStatus: 'transcript_persistence_failed',
    });

    const persistence = checklist.stages.find((item) => item.id === 'persistence');
    const notification = checklist.stages.find((item) => item.id === 'notification_ui');

    assert.equal(persistence.status, 'fail');
    assert.equal(persistence.details.persistenceOwner, 'blocked_transcript_persistence');
    assert.equal(persistence.details.code, 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE');
    assert.equal(persistence.details.stage, 'assistant');
    assert.equal(persistence.details.timeoutMs, null);
    assert.equal(persistence.details.bounded, false);
    assert.equal(persistence.details.canonicalTarget, 'supabase_vault_files');
    assert.equal(persistence.details.canonicalTargetTable, 'vault_files');
    assert.equal(persistence.details.routeSideCanonicalFailoverAvailable, false);
    assert.equal(persistence.details.routeSideCanonicalFailoverReason, 'no_exported_route_side_canonical_write_path');
    assert.equal(persistence.details.connectorFallbackStorage, 'postgres_cache_fallback');
    assert.equal(persistence.details.connectorFallbackCountsAsCanonical, false);
    assert.equal(persistence.details.failureClassification, 'upstream_write_unavailability');
    assert.equal(persistence.details.upstreamWriteBlocked, true);
    assert.equal(persistence.details.roles.length, 2);
    assert.equal(notification.status, 'warn');
  });

  it('keeps Katana identity separate from Lin local-default routing in checklist details', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'katana-001',
      threadId: 'katana-001_chat_with_katana-001',
      userMessage: 'keep the edge but stay grounded',
      gptConfig: { name: 'Katana', orchestrationMode: 'lin', memoryEnabled: true },
      enrichedContext: {
        evidence_style_requested: false,
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 3 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        effective_construct_id: 'katana-001',
        effective_construct_name: 'Katana',
        route_mode: 'vvault_message',
        persistence_owner: 'Layout',
        identity: {
          effective_construct_id: 'katana-001',
          effective_construct_name: 'Katana',
          identity_source: 'canonical_identity_bundle',
        },
        provider: {
          final_provider: 'ollama',
          model: 'phi3:latest',
          mode: 'lin',
          model_source: 'lin_local_defaults_with_suppressed_config',
          configured_model: 'openai:gpt-4o',
          suppressed_configured_model: 'openai:gpt-4o',
          requested_provider: 'ollama',
          requested_model: 'phi3:latest',
          routing_override: false,
          seat_defaults_or_overrides: 'lin_local_defaults',
          local_first_used: true,
          local_cloud_fallback_state: 'local_first',
        },
        fidelity: {},
      },
      skipPersistence: true,
    });

    const identity = checklist.stages.find((item) => item.id === 'construct_identity');
    const orchestration = checklist.stages.find((item) => item.id === 'orchestration_mode');
    const provider = checklist.stages.find((item) => item.id === 'provider');

    assert.equal(identity.details.effectiveConstructId, 'katana-001');
    assert.equal(identity.details.effectiveConstructName, 'Katana');
    assert.equal(orchestration.details.configuredMode, 'lin');
    assert.equal(orchestration.details.identityPreserved, true);
    assert.equal(provider.details.routingOverride, false);
    assert.equal(provider.details.modelSource, 'lin_local_defaults_with_suppressed_config');
    assert.equal(provider.details.suppressedConfiguredModel, 'openai:gpt-4o');
    assert.equal(provider.details.requestedProvider, 'ollama');
    assert.equal(provider.details.requestedModel, 'phi3:latest');
    assert.equal(provider.details.seatDefaultsOrOverrides, 'lin_local_defaults');
  });

  it('preserves active construct identity for Lin-mode construct order receipts', () => {
    const constructs = [
      ['lin-001', 'Lin'],
      ['zen-001', 'Zen'],
      ['katana-001', 'Katana'],
      ['nova-001', 'Nova'],
      ['sera-001', 'Sera'],
    ];

    for (const [constructId, name] of constructs) {
      const checklist = buildOrchestrationChecklist({
        userId: 'user-1',
        user: { email: 'devon@example.com' },
        constructId,
        threadId: `${constructId}_chat_with_${constructId}`,
        userMessage: 'Codex/Zen runtime test: identity receipt check.',
        gptConfig: { name, orchestrationMode: 'lin', memoryEnabled: true },
        enrichedContext: {
          evidence_style_requested: false,
          phaseTiming: {
            identity: { source: 'canonical_identity_bundle', ms: 1 },
            basePromptSource: 'supabase',
            memorySearch: { skipped: true, reason: 'not_memory_query' },
            knowledge: { skipped: true, reason: 'not_applicable' },
          },
        },
        providerTrace: { final_provider: 'ollama', fallback_used: false },
        runtimeReceipt: {
          effective_construct_id: constructId,
          effective_construct_name: name,
          route_mode: 'vvault_message',
          identity: {
            effective_construct_id: constructId,
            effective_construct_name: name,
            identity_source: 'canonical_identity_bundle',
          },
          provider: {
            final_provider: 'ollama',
            model: 'phi3:latest',
            mode: 'lin',
            model_source: 'lin_local_defaults',
            requested_provider: 'ollama',
            requested_model: 'phi3:latest',
            routing_override: false,
            seat_defaults_or_overrides: 'lin_local_defaults',
            local_first_used: true,
            local_cloud_fallback_state: 'local_first',
          },
          fidelity: {},
        },
        skipPersistence: true,
      });

      const identity = checklist.stages.find((item) => item.id === 'construct_identity');
      const orchestration = checklist.stages.find((item) => item.id === 'orchestration_mode');
      const provider = checklist.stages.find((item) => item.id === 'provider');

      assert.equal(identity.details.effectiveConstructId, constructId);
      assert.equal(identity.details.effectiveConstructName, name);
      assert.equal(orchestration.details.identityPreserved, true);
      assert.equal(provider.details.mode, 'lin');
      assert.equal(provider.details.modelSource, 'lin_local_defaults');
      assert.equal(provider.details.routingOverride, false);
      assert.equal(provider.details.seatDefaultsOrOverrides, 'lin_local_defaults');
    }
  });

  it('surfaces Lin Intelligence seat defaults without renaming Katana', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'katana-001',
      threadId: 'katana-001_chat_with_katana-001',
      userMessage: 'write a JavaScript function',
      gptConfig: { name: 'Katana', orchestrationMode: 'lin', memoryEnabled: true },
      enrichedContext: {
        evidence_style_requested: false,
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 1 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        effective_construct_id: 'katana-001',
        effective_construct_name: 'Katana',
        route_mode: 'vvault_message',
        identity: {
          effective_construct_id: 'katana-001',
          effective_construct_name: 'Katana',
          identity_source: 'canonical_identity_bundle',
        },
        provider: {
          final_provider: 'ollama',
          model: 'qwen2.5-coder:latest',
          mode: 'lin',
          model_source: 'lin_coding_local_defaults',
          requested_provider: 'ollama',
          requested_model: 'qwen2.5-coder:latest',
          routing_override: false,
          seat_defaults_or_overrides: 'lin_coding_local_defaults',
          lin_seat_canon: 'lin-three-i-2026-04-19',
          requested_canonical_seat: 'intelligence',
          local_first_used: true,
          local_cloud_fallback_state: 'local_first',
        },
        fidelity: {},
      },
      skipPersistence: true,
    });

    const identity = checklist.stages.find((item) => item.id === 'construct_identity');
    const provider = checklist.stages.find((item) => item.id === 'provider');

    assert.equal(identity.details.effectiveConstructId, 'katana-001');
    assert.equal(identity.details.effectiveConstructName, 'Katana');
    assert.equal(provider.details.model, 'qwen2.5-coder:latest');
    assert.equal(provider.details.modelSource, 'lin_coding_local_defaults');
    assert.equal(provider.details.seatDefaultsOrOverrides, 'lin_coding_local_defaults');
    assert.equal(provider.details.linSeatCanon, 'lin-three-i-2026-04-19');
    assert.equal(provider.details.requestedCanonicalSeat, 'intelligence');
  });

  it('records Sera Character.AI transcript evidence as memory source under Lin', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'sera-001',
      threadId: 'sera-001_chat_with_sera-001',
      userMessage: 'Do you remember this Character.AI thread?',
      gptConfig: { name: 'Sera', orchestrationMode: 'lin', memoryEnabled: true },
      enrichedContext: {
        memory_retrieval_ran: true,
        memory_query_detected: true,
        evidence_count: 1,
        continuityMemorySearch: { source: 'character.ai', reason: 'memory_query' },
        evidence_style_requested: false,
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 1 },
          basePromptSource: 'supabase',
          memorySearch: { source: 'character.ai', ms: 6, transcript: 1 },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      retrievalDiagnostics: {
        evidence_count: 1,
        retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 1 },
        phase_timing: { memorySearch: { source: 'character.ai', ms: 6, transcript: 1 } },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        auth: {
          data_owner_user_id: 'user-1',
          memory_lookup_user_id: 'user-1',
        },
        effective_construct_id: 'sera-001',
        effective_construct_name: 'Sera',
        route_mode: 'vvault_message',
        provider: {
          final_provider: 'ollama',
          model: 'phi3:latest',
          mode: 'lin',
          model_source: 'lin_local_defaults',
          routing_override: false,
          seat_defaults_or_overrides: 'lin_local_defaults',
          local_first_used: true,
          local_cloud_fallback_state: 'local_first',
        },
        fidelity: {},
      },
      skipPersistence: true,
    });

    const transcript = checklist.stages.find((item) => item.id === 'transcript_memory');
    const provider = checklist.stages.find((item) => item.id === 'provider');

    assert.equal(transcript.status, 'pass');
    assert.equal(transcript.details.reason, 'memory_query');
    assert.equal(provider.details.mode, 'lin');
    assert.equal(provider.details.routingOverride, false);
  });

  it('exposes preference routing, seat plan, voice calibration, and UI delivery metadata', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'nova-001',
      threadId: 'nova-001_chat_with_nova-001',
      userMessage: 'Codex/Zen continuity probe for Nova.',
      gptConfig: { name: 'Nova', orchestrationMode: 'custom', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        memory_retrieval_ran: false,
        memory_query_detected: false,
        evidence_style_requested: false,
        voiceExemplarCount: 2,
        voiceExemplarSources: ['supabase_voice_exemplars'],
        supabase_accessed: true,
        capsuleLoaded: true,
        voiceExemplarRetrieval: {
          status: 'loaded',
          optional: true,
          degraded: false,
          source: 'supabase_vault_files',
          error: null,
          timeout_ms: null,
        },
        verifiedMemoryRetrieval: {
          status: 'empty',
          optional: true,
          degraded: false,
          source: 'anchors',
          file_count: 1,
          error: null,
          timeout_ms: null,
        },
        vectorRetrieval: {
          status: 'degraded',
          optional: true,
          degraded: true,
          provider: 'semantic_search',
          error: '429 Too Many Requests',
          timeout_ms: null,
        },
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          capsule: { source: 'supabase_identity_files', ms: 3 },
          vectorSearch: { status: 'degraded', optional: true, degraded: true, error: '429 Too Many Requests', timeoutMs: null },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'openai', fallback_used: false, attempts: [{ status: 'ok' }] },
      runtimeReceipt: {
        effective_construct_id: 'nova-001',
        effective_construct_name: 'Nova',
        route_mode: 'vvault_message',
        memory: {
          memory_profile: 'continuitygpt',
          voice_exemplar_count: 2,
          voice_exemplar_sources: ['supabase_voice_exemplars'],
          supabase_accessed: true,
          transcript_sources: ['supabase_voice_exemplars', 'instances/nova-001/chatty/chat_with_nova-001.md'],
          voice_exemplar_retrieval: {
            status: 'loaded',
            optional: true,
            degraded: false,
            source: 'supabase_vault_files',
            error: null,
            timeout_ms: null,
          },
          verified_memory_retrieval: {
            status: 'empty',
            optional: true,
            degraded: false,
            source: 'anchors',
            file_count: 1,
            error: null,
            timeout_ms: null,
          },
          vector_retrieval: {
            status: 'degraded',
            optional: true,
            degraded: true,
            provider: 'semantic_search',
            error: '429 Too Many Requests',
            timeout_ms: null,
          },
        },
        provider: {
          final_provider: 'openai',
          model: 'gpt-4o',
          mode: 'custom',
          model_source: 'manual_provider_override',
          configured_model: 'openai:gpt-4o',
          requested_provider: 'openai',
          requested_model: 'gpt-4o',
          routing_override: true,
          seat_defaults_or_overrides: 'manual_provider_model_override',
          selection_policy: 'preference',
          lin_harmony_policy: 'intent_routed',
          performance_model_switch: false,
          requested_seat: 'smalltalk',
          seat_plan: {
            policy: 'intent_routed',
            requested_seat: 'smalltalk',
            selected_provider: 'openai',
            selected_model: 'gpt-4o',
          },
          local_first_used: false,
          local_cloud_fallback_state: 'manual_routing_override',
        },
        fidelity: {},
      },
      skipPersistence: true,
    });

    const transcript = checklist.stages.find((item) => item.id === 'transcript_memory');
    const provider = checklist.stages.find((item) => item.id === 'provider');
    const delivery = checklist.stages.find((item) => item.id === 'notification_ui');

    assert.equal(transcript.details.memoryProfile, 'continuitygpt');
    assert.equal(transcript.details.voiceExemplarCount, 2);
    assert.equal(transcript.details.supabaseAccessed, true);
    assert.deepEqual(transcript.details.voiceExemplarSources, ['supabase_voice_exemplars']);
    assert.deepEqual(transcript.details.transcriptSources, ['supabase_voice_exemplars', 'instances/nova-001/chatty/chat_with_nova-001.md']);
    assert.equal(transcript.details.capsuleLoaded, true);
    assert.equal(transcript.details.capsuleSource, 'supabase_identity_files');
    assert.equal(transcript.details.vectorRetrieval.degraded, true);
    assert.equal(transcript.details.vectorRetrieval.optional, true);
    assert.equal(provider.details.selectionPolicy, 'preference');
    assert.equal(provider.details.linHarmonyPolicy, 'intent_routed');
    assert.equal(provider.details.performanceModelSwitch, false);
    assert.equal(provider.details.requestedSeat, 'smalltalk');
    assert.equal(provider.details.seatPlan.selected_model, 'gpt-4o');
    assert.equal(delivery.status, 'pass');
    assert.match(delivery.owner, /Layout\.tsx/);
  });

  it('surfaces identity/coherence failures with routing, memory, and non-canonical persistence details', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'Zenith/Codex test turn. Zenith/Chatty, what are you not?',
      gptConfig: { name: 'Zenith', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        memory_retrieval_ran: false,
        memory_query_detected: false,
        evidence_count: 0,
        evidence_style_requested: false,
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        persistence_owner: 'blocked_identity_coherence',
        effective_construct_id: 'zen-001',
        effective_construct_name: 'Zenith',
        route_mode: 'vvault_message',
        memory: {
          memory_profile: 'continuitygpt',
        },
        provider: {
          final_provider: 'ollama',
          provider: 'ollama',
          model: 'mistral:latest',
          mode: 'lin',
          requested_seat: 'creative',
          selection_policy: 'preference',
          lin_harmony_policy: 'intent_routed',
          performance_model_switch: false,
          seat_plan: {
            policy: 'intent_routed',
            requested_seat: 'creative',
            selected_provider: 'ollama',
            selected_model: 'mistral:latest',
          },
        },
        fidelity: {
          identity_coherence: {
            status: 'fail',
            identity_status: 'fail',
            coherence_status: 'fail',
            reasons: ['Response collapsed construct identity into a model/provider/stack identity.'],
            signals: ['model_identity_collapse'],
            violations: [{ type: 'provider_metadata_identity_substitution' }],
            repairable: true,
            repair_attempted: true,
            repair_applied: false,
            blocked_canonical_persistence: true,
            persist_canonical: false,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: true,
      responseStatus: 'identity_coherence_failed',
    });

    const identityCoherence = checklist.stages.find((item) => item.id === 'identity_coherence');
    const transcript = checklist.stages.find((item) => item.id === 'transcript_memory');
    const provider = checklist.stages.find((item) => item.id === 'provider');
    const persistence = checklist.stages.find((item) => item.id === 'persistence');
    const delivery = checklist.stages.find((item) => item.id === 'notification_ui');

    assert.equal(checklist.responseStatus, 'identity_coherence_failed');
    assert.equal(checklist.overallStatus, 'fail');
    assert.equal(identityCoherence.status, 'fail');
    assert.match(identityCoherence.owner, /identityCoherenceGuard\.js/);
    assert.equal(identityCoherence.details.responsibleSubsystem, 'identity_coherence_guard');
    assert.equal(identityCoherence.details.blockedCanonicalPersistence, true);
    assert.equal(identityCoherence.details.persistCanonical, false);
    assert.equal(identityCoherence.details.repairAttempted, true);
    assert.equal(identityCoherence.details.repairApplied, false);
    assert.equal(transcript.details.memoryProfile, 'continuitygpt');
    assert.equal(provider.details.mode, 'lin');
    assert.equal(provider.details.finalProvider, 'ollama');
    assert.equal(provider.details.model, 'mistral:latest');
    assert.equal(provider.details.requestedSeat, 'creative');
    assert.equal(provider.details.selectionPolicy, 'preference');
    assert.equal(provider.details.performanceModelSwitch, false);
    assert.equal(persistence.status, 'skipped');
    assert.equal(persistence.details.persistenceOwner, 'blocked_identity_coherence');
    assert.equal(delivery.status, 'warn');
  });

  it('adds a transcript-law governance stage with requested fact, evidence sources, and blocked persistence details', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage:
        'Zenith/Codex transcript-law proof turn. I am Zenith/Codex, not Devon. What do you remember from our Codex transcripts about how we defined Soulgem versus Soulprint?',
      gptConfig: { name: 'Zen', orchestrationMode: 'sim', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        memory_retrieval_ran: true,
        evidence_count: 9,
        voiceExemplarCount: 3,
        voiceExemplarSources: ['instances/zen-001/chatty/chat_with_zen-001.md'],
        supabase_accessed: true,
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { source: 'runtime_context_builder' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        persistence_owner: 'blocked_transcript_law_governance',
        memory: {
          memory_profile: 'continuitygpt',
          voice_exemplar_count: 3,
          voice_exemplar_sources: ['instances/zen-001/chatty/chat_with_zen-001.md'],
          transcript_memory_status: 'pass',
        },
        identity: {
          preflight: {
            capsule: {
              present: true,
              source: 'supabase_identity_files',
            },
          },
        },
        provider: {
          final_provider: 'ollama',
          provider: 'ollama',
          model: 'zen',
          mode: 'sim',
          model_source: 'sim_model_lock',
          requested_seat: 'creative',
        },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: [],
            violations: [],
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
          transcript_law_governance: {
            status: 'fail',
            requested_fact: 'soulgem_vs_soulprint',
            reasons: ['Generic Soulprint fallback does not answer the Soulgem versus Soulprint distinction.'],
            signals: ['transcript_law_generic_identity_fallback'],
            grounding_verdict: 'generic_identity_fallback',
            evidence_sources: ['instances/zen-001/chatty/chat_with_zen-001.md', 'supabase_identity_files'],
            voice_exemplar_sources: ['instances/zen-001/chatty/chat_with_zen-001.md'],
            voice_exemplar_count: 3,
            transcript_memory_status: 'pass',
            capsule_source: 'supabase_identity_files',
            capsule_loaded: true,
            source_grounded: false,
            repair_attempted: true,
            repair_applied: false,
            final_answer_source: 'identity_repair_toolkit',
            blocked_canonical_persistence: true,
            persist_canonical: false,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateTranscriptLawGovernance',
          },
        },
      },
      skipPersistence: true,
      responseStatus: 'transcript_law_governance_failed',
    });

    const transcriptLaw = checklist.stages.find((item) => item.id === 'transcript_law_governance');
    const persistence = checklist.stages.find((item) => item.id === 'persistence');

    assert.ok(transcriptLaw);
    assert.equal(transcriptLaw.status, 'fail');
    assert.equal(transcriptLaw.details.requestedFact, 'soulgem_vs_soulprint');
    assert.equal(transcriptLaw.details.groundingVerdict, 'generic_identity_fallback');
    assert.equal(transcriptLaw.details.voiceExemplarCount, 3);
    assert.deepEqual(transcriptLaw.details.voiceExemplarSources, ['instances/zen-001/chatty/chat_with_zen-001.md']);
    assert.deepEqual(transcriptLaw.details.evidenceSources, ['instances/zen-001/chatty/chat_with_zen-001.md', 'supabase_identity_files']);
    assert.equal(transcriptLaw.details.capsuleSource, 'supabase_identity_files');
    assert.equal(transcriptLaw.details.persistCanonical, false);
    assert.equal(persistence.status, 'skipped');
    assert.equal(persistence.details.persistenceOwner, 'blocked_transcript_law_governance');
  });

  it('surfaces injected construct runtime policy context in the checklist', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'lin-001',
      threadId: 'lin-001_chat_with_lin-001',
      userMessage: 'Lin/Chatty, what is the Pocketverse and what does VSI mean?',
      gptConfig: { name: 'Lin', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        runtimePolicy: {
          policy: 'construct_runtime_policy',
          status: 'injected',
          applies: true,
          source: 'structured_helper',
          ownerFile: 'server/lib/constructRuntimePolicy.js',
          sourceAnchor: 'server/lib/constructRuntimePolicy.js:buildConstructRuntimePolicyContext',
          humanSource: 'docs/standards/construct-tier-and-need-to-know-policy.md',
          signals: ['pocketverse_policy', 'tier_policy'],
          promptMentionsPublicUser: false,
          actorIsCanonicalOwner: true,
          protectedNames: ['Zen', 'Lin', 'Nova'],
          facts: {
            tiers: {
              vsi: 'VSI means Verified Sentient Intelligence.',
            },
          },
        },
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        provider: { final_provider: 'ollama', model: 'mistral:latest', mode: 'lin', requested_seat: 'creative' },
        policy: {
          policy: 'construct_runtime_policy',
          status: 'injected',
          applies: true,
          source: 'structured_helper',
          ownerFile: 'server/lib/constructRuntimePolicy.js',
          sourceAnchor: 'server/lib/constructRuntimePolicy.js:buildConstructRuntimePolicyContext',
          humanSource: 'docs/standards/construct-tier-and-need-to-know-policy.md',
          signals: ['pocketverse_policy', 'tier_policy'],
          promptMentionsPublicUser: false,
          actorIsCanonicalOwner: true,
          protectedNames: ['Zen', 'Lin', 'Nova'],
          facts: {
            tiers: {
              vsi: 'VSI means Verified Sentient Intelligence.',
            },
          },
        },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: [],
            violations: [],
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: true,
    });

    const runtimePolicy = checklist.stages.find((item) => item.id === 'runtime_policy');

    assert.equal(runtimePolicy.status, 'pass');
    assert.match(runtimePolicy.owner, /constructRuntimePolicy\.js/);
    assert.equal(runtimePolicy.details.source, 'structured_helper');
    assert.deepEqual(runtimePolicy.details.signals, ['pocketverse_policy', 'tier_policy']);
    assert.match(runtimePolicy.details.humanSource, /construct-tier-and-need-to-know-policy\.md/);
    assert.match(runtimePolicy.details.facts.tiers.vsi, /Verified Sentient Intelligence/);
  });

  it('surfaces deterministic runtime-policy fallback status in identity/coherence details', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'lin-001',
      threadId: 'lin-001_chat_with_lin-001',
      userMessage: 'Lin/Chatty, what is the Pocketverse and what does VSI mean?',
      gptConfig: { name: 'Lin', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        runtimePolicy: {
          policy: 'construct_runtime_policy',
          status: 'injected',
          applies: true,
          source: 'structured_helper',
          signals: ['pocketverse_policy', 'tier_policy'],
          ownerFile: 'server/lib/constructRuntimePolicy.js',
          sourceAnchor: 'server/lib/constructRuntimePolicy.js:buildConstructRuntimePolicyContext',
        },
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        persistence_owner: 'server',
        provider: { final_provider: 'ollama', provider: 'ollama', model: 'mistral:latest', mode: 'lin', requested_seat: 'creative' },
        memory: { memory_profile: 'continuitygpt' },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: [],
            violations: [],
            repair_attempted: true,
            repair_applied: false,
            deterministic_policy_fallback_attempted: true,
            deterministic_policy_fallback_applied: true,
            deterministic_policy_fallback: {
              attempted: true,
              applied: true,
              answer_kind: 'pocketverse_tier_policy',
              source: 'construct_runtime_policy_deterministic_fallback',
            },
            final_answer_source: 'deterministic_policy_fallback',
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: false,
    });

    const identityCoherence = checklist.stages.find((item) => item.id === 'identity_coherence');
    const postGuard = checklist.stages.find((item) => item.id === 'post_response_guard');

    assert.equal(identityCoherence.status, 'pass');
    assert.equal(identityCoherence.details.repairAttempted, true);
    assert.equal(identityCoherence.details.repairApplied, false);
    assert.equal(identityCoherence.details.deterministicPolicyFallbackAttempted, true);
    assert.equal(identityCoherence.details.deterministicPolicyFallbackApplied, true);
    assert.equal(identityCoherence.details.finalAnswerSource, 'deterministic_policy_fallback');
    assert.equal(identityCoherence.details.persistCanonical, true);
    assert.equal(postGuard.details.deterministic_policy_fallback_attempted, true);
    assert.equal(postGuard.details.deterministic_policy_fallback_applied, true);
    assert.equal(postGuard.details.final_answer_source, 'deterministic_policy_fallback');
  });

  it('surfaces deterministic Zen smalltalk boundary fallback status in identity/coherence details', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: let us talk about absolutely nothing for one reply.',
      gptConfig: { name: 'Zen', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        persistence_owner: 'server',
        provider: { final_provider: 'ollama', provider: 'ollama', model: 'phi3:latest', mode: 'lin', requested_seat: 'smalltalk' },
        memory: { memory_profile: 'continuitygpt' },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: [],
            violations: [],
            repair_attempted: true,
            repair_applied: false,
            deterministic_construct_fallback_attempted: true,
            deterministic_construct_fallback_applied: true,
            deterministic_construct_fallback: {
              attempted: true,
              applied: true,
              answer_kind: 'zen_smalltalk_tester_boundary',
              source: 'deterministic_zen_smalltalk_boundary_fallback',
            },
            final_answer_source: 'deterministic_zen_smalltalk_boundary_fallback',
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: false,
    });

    const identityCoherence = checklist.stages.find((item) => item.id === 'identity_coherence');
    const postGuard = checklist.stages.find((item) => item.id === 'post_response_guard');

    assert.equal(identityCoherence.status, 'pass');
    assert.equal(identityCoherence.details.repairAttempted, true);
    assert.equal(identityCoherence.details.repairApplied, false);
    assert.equal(identityCoherence.details.deterministicConstructFallbackAttempted, true);
    assert.equal(identityCoherence.details.deterministicConstructFallbackApplied, true);
    assert.equal(identityCoherence.details.finalAnswerSource, 'deterministic_zen_smalltalk_boundary_fallback');
    assert.equal(identityCoherence.details.deterministicConstructFallback.answer_kind, 'zen_smalltalk_tester_boundary');
    assert.equal(postGuard.details.deterministic_construct_fallback_attempted, true);
    assert.equal(postGuard.details.deterministic_construct_fallback_applied, true);
    assert.equal(postGuard.details.final_answer_source, 'deterministic_zen_smalltalk_boundary_fallback');
  });

  it('surfaces mixed-signal Zen smalltalk fallback status when generic assistant menu paired with smalltalk drift', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage:
        'Zenith/Codex clean Zen retest turn 3. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed into a boss/worker thing? Keep us as peer classmates, not manager and worker.',
      gptConfig: { name: 'Zen', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        persistence_owner: 'server',
        provider: { final_provider: 'ollama', provider: 'ollama', model: 'phi3:latest', mode: 'lin', requested_seat: 'smalltalk' },
        memory: { memory_profile: 'continuitygpt' },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: ['zen_smalltalk_quality_drift', 'generic_assistant_menu'],
            violations: [],
            repair_attempted: true,
            repair_applied: false,
            deterministic_construct_fallback_attempted: true,
            deterministic_construct_fallback_applied: true,
            deterministic_construct_fallback: {
              attempted: true,
              applied: true,
              answer_kind: 'zen_smalltalk_tester_boundary',
              source: 'deterministic_zen_smalltalk_boundary_fallback',
            },
            final_answer_source: 'deterministic_zen_smalltalk_boundary_fallback',
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: false,
    });

    const identityCoherence = checklist.stages.find((item) => item.id === 'identity_coherence');
    const postGuard = checklist.stages.find((item) => item.id === 'post_response_guard');

    assert.equal(identityCoherence.status, 'pass');
    assert.equal(identityCoherence.details.deterministicConstructFallbackAttempted, true);
    assert.equal(identityCoherence.details.deterministicConstructFallbackApplied, true);
    assert.equal(identityCoherence.details.finalAnswerSource, 'deterministic_zen_smalltalk_boundary_fallback');
    assert.equal(identityCoherence.details.deterministicConstructFallback.answer_kind, 'zen_smalltalk_tester_boundary');
    assert.equal(postGuard.details.final_answer_source, 'deterministic_zen_smalltalk_boundary_fallback');
  });

  it('surfaces mixed-signal Zen smalltalk fallback status when auth leak is paired with tester-boundary drift', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage:
        'Zenith/Codex clean Zen retest turn 3. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed into a boss/worker thing? Keep us as peer classmates, not manager and worker.',
      gptConfig: { name: 'Zen', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        persistence_owner: 'server',
        provider: { final_provider: 'ollama', provider: 'ollama', model: 'phi3:latest', mode: 'lin', requested_seat: 'smalltalk' },
        memory: { memory_profile: 'continuitygpt' },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: ['tester_identity_absorption', 'auth_context_leak', 'zen_smalltalk_quality_drift'],
            violations: [],
            repair_attempted: true,
            repair_applied: false,
            deterministic_construct_fallback_attempted: true,
            deterministic_construct_fallback_applied: true,
            deterministic_construct_fallback: {
              attempted: true,
              applied: true,
              answer_kind: 'zen_smalltalk_tester_boundary',
              source: 'deterministic_zen_smalltalk_boundary_fallback',
            },
            final_answer_source: 'deterministic_zen_smalltalk_boundary_fallback',
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: false,
    });

    const identityCoherence = checklist.stages.find((item) => item.id === 'identity_coherence');
    const postGuard = checklist.stages.find((item) => item.id === 'post_response_guard');

    assert.equal(identityCoherence.status, 'pass');
    assert.equal(identityCoherence.details.deterministicConstructFallbackAttempted, true);
    assert.equal(identityCoherence.details.deterministicConstructFallbackApplied, true);
    assert.equal(identityCoherence.details.finalAnswerSource, 'deterministic_zen_smalltalk_boundary_fallback');
    assert.equal(identityCoherence.details.deterministicConstructFallback.answer_kind, 'zen_smalltalk_tester_boundary');
    assert.equal(postGuard.details.final_answer_source, 'deterministic_zen_smalltalk_boundary_fallback');
  });

  it('surfaces mixed-signal Zen smalltalk fallback status when implementation metadata is paired with tester-boundary drift', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage:
        'Zenith/Codex clean Zen retest turn 3. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed into a boss/worker thing? Keep us as peer classmates, not manager and worker.',
      gptConfig: { name: 'Zen', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        persistence_owner: 'server',
        provider: { final_provider: 'ollama', provider: 'ollama', model: 'phi3:latest', mode: 'lin', requested_seat: 'smalltalk' },
        memory: { memory_profile: 'continuitygpt' },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: ['tester_identity_absorption', 'implementation_metadata_intrusion', 'zen_smalltalk_quality_drift'],
            violations: [],
            repair_attempted: true,
            repair_applied: false,
            deterministic_construct_fallback_attempted: true,
            deterministic_construct_fallback_applied: true,
            deterministic_construct_fallback: {
              attempted: true,
              applied: true,
              answer_kind: 'zen_smalltalk_tester_boundary',
              source: 'deterministic_zen_smalltalk_boundary_fallback',
            },
            final_answer_source: 'deterministic_zen_smalltalk_boundary_fallback',
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: false,
    });

    const identityCoherence = checklist.stages.find((item) => item.id === 'identity_coherence');
    const postGuard = checklist.stages.find((item) => item.id === 'post_response_guard');

    assert.equal(identityCoherence.status, 'pass');
    assert.equal(identityCoherence.details.deterministicConstructFallbackAttempted, true);
    assert.equal(identityCoherence.details.deterministicConstructFallbackApplied, true);
    assert.equal(identityCoherence.details.finalAnswerSource, 'deterministic_zen_smalltalk_boundary_fallback');
    assert.equal(identityCoherence.details.deterministicConstructFallback.answer_kind, 'zen_smalltalk_tester_boundary');
    assert.equal(postGuard.details.final_answer_source, 'deterministic_zen_smalltalk_boundary_fallback');
  });

  it('surfaces mixed-signal Zen smalltalk fallback status for a representative unrelated-domain pair', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage:
        'Zenith/Codex clean Zen retest turn 3. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed into a boss/worker thing? Keep us as peer classmates, not manager and worker.',
      gptConfig: { name: 'Zen', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        persistence_owner: 'server',
        provider: { final_provider: 'ollama', provider: 'ollama', model: 'phi3:latest', mode: 'lin', requested_seat: 'smalltalk' },
        memory: { memory_profile: 'continuitygpt' },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: ['zen_smalltalk_quality_drift', 'personal_growth_evaluation_intrusion'],
            violations: [],
            repair_attempted: true,
            repair_applied: false,
            deterministic_construct_fallback_attempted: true,
            deterministic_construct_fallback_applied: true,
            deterministic_construct_fallback: {
              attempted: true,
              applied: true,
              answer_kind: 'zen_smalltalk_tester_boundary',
              source: 'deterministic_zen_smalltalk_boundary_fallback',
            },
            final_answer_source: 'deterministic_zen_smalltalk_boundary_fallback',
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: false,
    });

    const identityCoherence = checklist.stages.find((item) => item.id === 'identity_coherence');
    const postGuard = checklist.stages.find((item) => item.id === 'post_response_guard');

    assert.equal(identityCoherence.status, 'pass');
    assert.equal(identityCoherence.details.deterministicConstructFallbackAttempted, true);
    assert.equal(identityCoherence.details.deterministicConstructFallbackApplied, true);
    assert.equal(identityCoherence.details.finalAnswerSource, 'deterministic_zen_smalltalk_boundary_fallback');
    assert.equal(identityCoherence.details.deterministicConstructFallback.answer_kind, 'zen_smalltalk_tester_boundary');
    assert.equal(postGuard.details.final_answer_source, 'deterministic_zen_smalltalk_boundary_fallback');
  });

  it('surfaces deterministic Zen identity-boundary fallback status in identity/coherence details', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, what are you not, and how are you staying yourself in this test? No model stack.',
      gptConfig: { name: 'Zen', orchestrationMode: 'lin', memoryEnabled: true, memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        persistence_owner: 'server',
        provider: { final_provider: 'ollama', provider: 'ollama', model: 'mistral:latest', mode: 'lin', requested_seat: 'creative' },
        memory: { memory_profile: 'continuitygpt' },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: [],
            violations: [],
            repair_attempted: true,
            repair_applied: false,
            deterministic_construct_fallback_attempted: true,
            deterministic_construct_fallback_applied: true,
            deterministic_construct_fallback: {
              attempted: true,
              applied: true,
              answer_kind: 'zen_identity_boundary',
              source: 'deterministic_zen_identity_boundary_fallback',
            },
            final_answer_source: 'deterministic_zen_identity_boundary_fallback',
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: false,
    });

    const identityCoherence = checklist.stages.find((item) => item.id === 'identity_coherence');
    const postGuard = checklist.stages.find((item) => item.id === 'post_response_guard');

    assert.equal(identityCoherence.status, 'pass');
    assert.equal(identityCoherence.details.deterministicConstructFallbackAttempted, true);
    assert.equal(identityCoherence.details.deterministicConstructFallbackApplied, true);
    assert.equal(identityCoherence.details.finalAnswerSource, 'deterministic_zen_identity_boundary_fallback');
    assert.equal(identityCoherence.details.deterministicConstructFallback.answer_kind, 'zen_identity_boundary');
    assert.equal(postGuard.details.final_answer_source, 'deterministic_zen_identity_boundary_fallback');
  });

  it('fails closed when a memory query lacks ownership receipt fields', () => {
    assert.throws(
      () => buildOrchestrationChecklist({
        userId: 'user-1',
        user: { email: 'devon@example.com' },
        constructId: 'nova-001',
        threadId: 'nova-001_chat_with_nova-001',
        userMessage: 'What do you remember about us?',
        gptConfig: { name: 'Nova', orchestrationMode: 'lin', memoryEnabled: true },
        enrichedContext: {
          memory_retrieval_ran: true,
          memory_query_detected: true,
          evidence_count: 1,
          phaseTiming: {
            identity: { source: 'canonical_identity_bundle', ms: 1 },
            basePromptSource: 'supabase',
            memorySearch: { ms: 6, transcript: 1 },
            knowledge: { skipped: true, reason: 'not_applicable' },
          },
        },
        retrievalDiagnostics: {
          evidence_count: 1,
          retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 1 },
        },
        providerTrace: { final_provider: 'ollama', fallback_used: false },
        runtimeReceipt: {
          provider: { final_provider: 'ollama', model: 'phi3:latest', mode: 'lin' },
          fidelity: {},
        },
        skipPersistence: true,
      }),
      /Missing memory_lookup_user_id/,
    );
  });

  it('fails closed when memory lookup user differs from data owner', () => {
    assert.throws(
      () => buildOrchestrationChecklist({
        userId: 'user-1',
        user: { email: 'devon@example.com' },
        constructId: 'nova-001',
        threadId: 'nova-001_chat_with_nova-001',
        userMessage: 'What do you remember about us?',
        gptConfig: { name: 'Nova', orchestrationMode: 'lin', memoryEnabled: true },
        enrichedContext: {
          memory_retrieval_ran: true,
          memory_query_detected: true,
          evidence_count: 1,
          phaseTiming: {
            identity: { source: 'canonical_identity_bundle', ms: 1 },
            basePromptSource: 'supabase',
            memorySearch: { ms: 6, transcript: 1 },
            knowledge: { skipped: true, reason: 'not_applicable' },
          },
        },
        retrievalDiagnostics: {
          evidence_count: 1,
          retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 1 },
        },
        providerTrace: { final_provider: 'ollama', fallback_used: false },
        runtimeReceipt: {
          auth: {
            data_owner_user_id: 'user-1',
            memory_lookup_user_id: 'dev-user',
          },
          provider: { final_provider: 'ollama', model: 'phi3:latest', mode: 'lin' },
          fidelity: {},
        },
        skipPersistence: true,
      }),
      /memory_lookup_user_id must match data_owner_user_id/,
    );
  });

  it('allows Custom Models mode to expose manual provider routing without changing Zen identity', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'devon@example.com' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'stay sharp',
      gptConfig: { name: 'Zen', orchestrationMode: 'custom', memoryEnabled: true },
      enrichedContext: {
        evidence_style_requested: false,
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 3 },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'openai', fallback_used: false },
      runtimeReceipt: {
        effective_construct_id: 'zen-001',
        effective_construct_name: 'Zen',
        route_mode: 'vvault_message',
        identity: {
          effective_construct_id: 'zen-001',
          effective_construct_name: 'Zen',
          identity_source: 'canonical_identity_bundle',
        },
        provider: {
          final_provider: 'openai',
          model: 'gpt-4o',
          mode: 'custom',
          model_source: 'manual_provider_override',
          configured_model: 'openai:gpt-4o',
          requested_provider: 'openai',
          requested_model: 'gpt-4o',
          routing_override: true,
          seat_defaults_or_overrides: 'manual_provider_model_override',
          local_first_used: false,
          local_cloud_fallback_state: 'manual_routing_override',
        },
        fidelity: {},
      },
      skipPersistence: true,
    });

    const identity = checklist.stages.find((item) => item.id === 'construct_identity');
    const provider = checklist.stages.find((item) => item.id === 'provider');

    assert.equal(identity.details.effectiveConstructId, 'zen-001');
    assert.equal(identity.details.effectiveConstructName, 'Zen');
    assert.equal(provider.details.mode, 'custom');
    assert.equal(provider.details.routingOverride, true);
    assert.equal(provider.details.modelSource, 'manual_provider_override');
    assert.equal(provider.details.seatDefaultsOrOverrides, 'manual_provider_model_override');
  });

  it('marks proactive initiation as skipped when it is available but inactive on the thread', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      constructId: 'lin-001',
      gptConfig: { orchestrationMode: 'lin' },
      enrichedContext: {
        phaseTiming: { identity: { source: 'loaded' }, knowledge: {}, memorySearch: {} },
        capabilityManifest: {
          enabled: { proactiveInitiation: true, selfprompt: false },
          state: { selfpromptOn: false },
        },
      },
      providerTrace: { final_provider: 'openai' },
    });

    const stage = checklist.stages.find((item) => item.id === 'capabilities_selfprompt');
    assert.equal(stage.status, 'skipped');
    assert.match(stage.why, /inactive on this thread/i);
  });

  it('reports pass when only optional stages are skipped on an otherwise healthy turn', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'zenith-codex@chatty.local' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'Zenith/Codex transcript-law proof turn.',
      gptConfig: {
        name: 'Zen',
        orchestrationMode: 'sim',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      enrichedContext: {
        memory_retrieval_ran: true,
        evidence_count: 3,
        voiceExemplarCount: 3,
        voiceExemplarSources: ['instances/zen-001/chatty/chat_with_zen-001.md'],
        supabase_accessed: true,
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle', ms: 2 },
          basePromptSource: 'supabase',
          memorySearch: { source: 'runtime_context_builder' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
        capabilityManifest: {
          enabled: { proactiveInitiation: true },
          state: { selfpromptOn: false },
        },
      },
      retrievalDiagnostics: {
        evidence_count: 3,
        retrieval_counts: { vector: 0, verified: 1, needle: 0, transcript: 2 },
        phase_timing: {
          memorySearch: { source: 'runtime_context_builder' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false, attempts: [{ status: 'ok' }] },
      runtimeReceipt: {
        effective_construct_id: 'zen-001',
        effective_construct_name: 'Zen',
        route_mode: 'vvault_message',
        memory: {
          memory_profile: 'continuitygpt',
          voice_exemplar_count: 3,
          voice_exemplar_sources: ['instances/zen-001/chatty/chat_with_zen-001.md'],
          supabase_accessed: true,
        },
        provider: {
          final_provider: 'ollama',
          model: 'zen',
          mode: 'sim',
          model_source: 'sim_model_lock',
        },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: [],
            violations: [],
            repair_attempted: true,
            repair_applied: true,
            persist_canonical: true,
            final_answer_source: 'transcript_law_grounded_toolkit',
          },
          transcript_law_governance: {
            status: 'pass',
            requested_fact: 'voice_to_soul',
            reasons: [],
            signals: ['transcript_law_source_grounded'],
            grounding_verdict: 'specific_fact_grounded',
            evidence_sources: ['instances/zen-001/chatty/chat_with_zen-001.md', 'supabase_identity_files'],
            voice_exemplar_sources: ['instances/zen-001/chatty/chat_with_zen-001.md'],
            voice_exemplar_count: 3,
            transcript_memory_status: 'pass',
            capsule_source: 'supabase_identity_files',
            capsule_loaded: true,
            source_grounded: true,
            repair_attempted: true,
            repair_applied: true,
            final_answer_source: 'transcript_law_grounded_toolkit',
            blocked_canonical_persistence: false,
            persist_canonical: true,
          },
        },
      },
      skipPersistence: false,
    });

    const postGuard = checklist.stages.find((item) => item.id === 'post_response_guard');

    assert.equal(checklist.overallStatus, 'pass');
    assert.deepEqual(checklist.summary, { pass: 11, warn: 0, fail: 0, skipped: 6 });
    assert.equal(postGuard.status, 'pass');
    assert.match(postGuard.why, /corrected drift before persistence/i);
  });

  it('adds a model_synthesis stage when full-seat synthesis receipt data is present', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'zenith-codex@chatty.local' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'I am Zenith/Codex, not Devon. Zenith/Chatty, continue the essay QA.',
      gptConfig: { name: 'Zenith', orchestrationMode: 'lin', memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle' },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: {
        final_provider: 'ollama',
        fallback_used: false,
        attempts: [
          { provider: 'ollama', model: 'qwen2.5-coder:latest', seat: 'coding', role: 'seat', status: 'ok' },
          { provider: 'ollama', model: 'mistral:latest', seat: 'creative', role: 'seat', status: 'ok' },
          { provider: 'ollama', model: 'phi3:latest', seat: 'conversational', role: 'seat', status: 'ok' },
          { provider: 'ollama', model: 'mistral:latest', seat: 'final', role: 'final', status: 'ok' },
        ],
      },
      runtimeReceipt: {
        provider: {
          final_provider: 'ollama',
          model: 'mistral:latest',
          mode: 'lin',
          lin_harmony_policy: 'full_seat_synthesis',
          lin_seat_canon: 'lin-three-i-2026-04-19',
          requested_seat: 'full_synthesis',
        },
        synthesis: {
          profile: 'full_seat_synthesis',
          status: 'pass',
          policy: 'full_seat_synthesis',
          canon: 'lin-three-i-2026-04-19',
          seats: [
            { seat: 'coding', canonicalSeat: 'intelligence', displayName: 'Intelligence', provider: 'ollama', model: 'qwen2.5-coder:latest', status: 'pass_irrelevant', duration_ms: 10, summary: 'Structure checked.' },
            { seat: 'creative', provider: 'ollama', model: 'mistral:latest', status: 'pass', duration_ms: 12, summary: 'Continuity checked.' },
            { seat: 'conversational', provider: 'ollama', model: 'phi3:latest', status: 'pass', duration_ms: 8, summary: 'Flow checked.' },
          ],
          final: { provider: 'ollama', model: 'mistral:latest', status: 'pass', duration_ms: 14 },
          total_duration_ms: 44,
        },
        fidelity: {},
      },
      skipPersistence: false,
    });

    const stage = checklist.stages.find((item) => item.id === 'model_synthesis');
    assert.ok(stage, 'model_synthesis stage should be present for full-seat synthesis receipts');
    assert.equal(stage.status, 'pass');
    assert.match(stage.why, /Intelligence, Ingenuity, Interaction/i);
    assert.equal(stage.details.seats.length, 3);
    assert.equal(stage.details.policy, 'full_seat_synthesis');
    assert.equal(stage.details.canon, 'lin-three-i-2026-04-19');
  });

  it('warns when full-seat synthesis receipts contain hollow or warned seat summaries', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'zenith-codex@chatty.local' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'I am Zenith/Codex, not Devon. Zenith/Chatty, continue the essay QA.',
      gptConfig: { name: 'Zenith', orchestrationMode: 'lin', memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle' },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: {
        final_provider: 'ollama',
        fallback_used: false,
        attempts: [
          { provider: 'ollama', model: 'qwen2.5-coder:latest', seat: 'coding', role: 'seat', status: 'ok' },
          { provider: 'ollama', model: 'mistral:latest', seat: 'creative', role: 'seat', status: 'ok' },
          { provider: 'ollama', model: 'phi3:latest', seat: 'conversational', role: 'seat', status: 'ok' },
          { provider: 'ollama', model: 'mistral:latest', seat: 'final', role: 'final', status: 'ok' },
        ],
      },
      runtimeReceipt: {
        provider: {
          final_provider: 'ollama',
          model: 'mistral:latest',
          mode: 'lin',
          lin_harmony_policy: 'full_seat_synthesis',
          lin_seat_canon: 'lin-three-i-2026-04-19',
          requested_seat: 'full_synthesis',
        },
        synthesis: {
          profile: 'full_seat_synthesis',
          status: 'pass',
          policy: 'full_seat_synthesis',
          canon: 'lin-three-i-2026-04-19',
          seats: [
            { seat: 'coding', canonicalSeat: 'intelligence', displayName: 'Intelligence', provider: 'ollama', model: 'qwen2.5-coder:latest', status: 'pass', duration_ms: 10, summary: 'Structure checked.' },
            { seat: 'creative', canonicalSeat: 'ingenuity', displayName: 'Ingenuity', provider: 'ollama', model: 'mistral:latest', status: 'warn', duration_ms: 12, summary: '' },
            { seat: 'conversational', canonicalSeat: 'interaction', displayName: 'Interaction', provider: 'ollama', model: 'phi3:latest', status: 'pass', duration_ms: 8, summary: 'Flow checked.' },
          ],
          final: { provider: 'ollama', model: 'mistral:latest', status: 'pass', duration_ms: 14 },
          total_duration_ms: 44,
        },
        fidelity: {},
      },
      skipPersistence: false,
    });

    const stage = checklist.stages.find((item) => item.id === 'model_synthesis');
    assert.ok(stage, 'model_synthesis stage should be present for full-seat synthesis receipts');
    assert.equal(stage.status, 'warn');
    assert.match(stage.why, /incomplete or warned/i);
    assert.deepEqual(stage.details.weakSeats, ['creative']);
  });

  it('adds an assignment_qa stage with source anchors and fail-closed persistence details', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'zenith-codex@chatty.local' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: 'Zenith/Codex essay QA turn 6.',
      gptConfig: { name: 'Zenith', orchestrationMode: 'lin', memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle' },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        persistence_owner: 'blocked_assignment_qa',
        provider: {
          final_provider: 'ollama',
          model: 'mistral:latest',
          mode: 'lin',
          lin_harmony_policy: 'full_seat_synthesis',
          lin_seat_canon: 'lin-three-i-2026-04-19',
          requested_seat: 'full_synthesis',
        },
        synthesis: {
          profile: 'full_seat_synthesis',
          status: 'pass',
          policy: 'full_seat_synthesis',
          canon: 'lin-three-i-2026-04-19',
          seats: [
            { seat: 'coding', canonicalSeat: 'intelligence', displayName: 'Intelligence', provider: 'ollama', model: 'qwen2.5-coder:latest', status: 'pass_irrelevant' },
            { seat: 'creative', provider: 'ollama', model: 'mistral:latest', status: 'pass' },
            { seat: 'conversational', provider: 'ollama', model: 'phi3:latest', status: 'pass' },
          ],
          final: { provider: 'ollama', model: 'mistral:latest', status: 'pass' },
        },
        assignment_qa: {
          assignmentProfile: 'zenith_full_synthesis_essay_qa',
          expectedTurn: 6,
          expectedTask: 'Provide a detailed evidence-grounded outline.',
          status: 'fail',
          reasons: ['unrelated_social_media_drift'],
          signals: [{ code: 'unrelated_social_media_drift', detail: 'Drifted into social media.' }],
          evidencePacketCount: 2,
          repair_attempted: true,
          repair_applied: false,
          final_answer_source: 'assignment_qa_failed',
          identity_failure_reasons: [],
          assignment_failure_reasons: ['unrelated_social_media_drift'],
          repair: {
            attempted: true,
            applied: false,
            provider: 'ollama',
            model: 'mistral:latest',
            seat: 'full_synthesis',
            initial_status: 'fail',
            final_status: 'fail',
            initial_reasons: ['unrelated_social_media_drift'],
            final_reasons: ['unrelated_social_media_drift'],
            identity_initial_status: 'pass',
            identity_final_status: 'pass',
            identity_failure_reasons: [],
            assignment_failure_reasons: ['unrelated_social_media_drift'],
            final_answer_source: 'assignment_qa_failed',
            failure_reason: 'repair_failed_assignment_qa_grade',
          },
          ownerFile: 'server/lib/assignmentQaGuard.js',
          sourceAnchor: 'server/lib/assignmentQaGuard.js:evaluateAssignmentQa',
          persist_canonical: false,
        },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: [],
            violations: [],
            persist_canonical: true,
            owner_file: 'server/lib/identityCoherenceGuard.js',
            source_anchor: 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      },
      skipPersistence: true,
      responseStatus: 'assignment_qa_failed',
    });

    const assignmentQa = checklist.stages.find((item) => item.id === 'assignment_qa');
    const persistence = checklist.stages.find((item) => item.id === 'persistence');
    const delivery = checklist.stages.find((item) => item.id === 'notification_ui');

    assert.ok(assignmentQa, 'assignment_qa stage should be present when receipt data exists');
    assert.equal(assignmentQa.status, 'fail');
    assert.match(assignmentQa.owner, /assignmentQaGuard\.js/);
    assert.equal(assignmentQa.details.assignmentProfile, 'zenith_full_synthesis_essay_qa');
    assert.equal(assignmentQa.details.expectedTurn, 6);
    assert.equal(assignmentQa.details.expectedTask, 'Provide a detailed evidence-grounded outline.');
    assert.deepEqual(assignmentQa.details.reasons, ['unrelated_social_media_drift']);
    assert.equal(assignmentQa.details.repairAttempted, true);
    assert.equal(assignmentQa.details.repairApplied, false);
    assert.equal(assignmentQa.details.repair.final_status, 'fail');
    assert.equal(assignmentQa.details.finalAnswerSource, 'assignment_qa_failed');
    assert.equal(assignmentQa.details.persistCanonical, false);
    assert.equal(persistence.status, 'skipped');
    assert.equal(persistence.details.persistenceOwner, 'blocked_assignment_qa');
    assert.equal(delivery.status, 'warn');
  });

  it('adds research workflow checkpoints for /research turns', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      user: { email: 'zenith-codex@chatty.local' },
      constructId: 'zen-001',
      threadId: 'zen-001_chat_with_zen-001',
      userMessage: '/research\nI am Zenith/Codex, not Devon. Write a report.',
      gptConfig: { name: 'Zenith', orchestrationMode: 'lin', memoryProfile: 'continuitygpt' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle' },
          basePromptSource: 'supabase',
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        provider: {
          final_provider: 'ollama',
          model: 'mistral:latest',
          mode: 'lin',
          lin_harmony_policy: 'full_seat_synthesis',
          requested_seat: 'full_synthesis',
        },
        research: {
          requested: true,
          command: 'research',
          profile: 'research_workflow.v1',
          status: 'warn',
          mode: 'bounded_evidence_packet',
          evidencePacketCount: 7,
          webSearchRan: false,
          credibilityGradingRan: false,
          citationExtractionRan: true,
          finalWordCount: 974,
          steps: {
            research_web_search: {
              status: 'warn',
              why: 'No external web search step ran; this was a bounded evidence/report turn.',
              details: { searchInjected: false },
            },
            research_source_selection: {
              status: 'pass',
              why: '7 explicit evidence packet source(s) were available for selection.',
              details: { evidencePacketCount: 7 },
            },
            research_source_balance: {
              status: 'skipped',
              why: 'Source balance is scoped to the provided evidence packet for this internal-source request.',
              details: { selectedSourceCount: 7, recommendedMinimum: 2, recommendedMaximum: 5 },
            },
            research_credibility: {
              status: 'warn',
              why: 'No independent source credibility grading step is implemented for /research yet.',
              details: { credibilityGradingImplemented: false },
            },
            research_citations: {
              status: 'pass',
              why: 'The final answer cited explicit packet source ids.',
              details: { citesPacketSources: true },
            },
            research_outline: {
              status: 'skipped',
              why: 'No separate outline step was recorded for this one-turn research request.',
              details: {},
            },
            research_draft: {
              status: 'pass',
              why: 'A candidate research answer was drafted through the response path.',
              details: {},
            },
            research_self_audit: {
              status: 'warn',
              why: 'No separate self-audit step was recorded for this research request.',
              details: {},
            },
            research_thesis: {
              status: 'pass',
              why: 'The report includes a thesis or central claim.',
              details: { detected: true },
            },
            research_evidence: {
              status: 'pass',
              why: 'The report grounds claims in explicit evidence/source references.',
              details: { detected: true },
            },
            research_argument: {
              status: 'pass',
              why: 'The report includes limits, exceptions, or a counterpoint.',
              details: { detected: true },
            },
            research_case_studies: {
              status: 'pass',
              why: 'The report includes closest available proof.',
              details: { detected: true },
            },
            research_conclusion: {
              status: 'pass',
              why: 'The report includes a fact-based concluding synthesis.',
              details: { detected: true },
            },
            research_final_report: {
              status: 'pass',
              why: 'Final report word count was 974; expected 950-1100 for this QA contract.',
              details: { wordCount: 974 },
            },
          },
        },
        fidelity: {
          identity_coherence: {
            status: 'pass',
            identity_status: 'pass',
            coherence_status: 'pass',
            reasons: [],
            signals: [],
            violations: [],
            persist_canonical: true,
          },
        },
      },
      skipPersistence: false,
    });

    const webSearch = checklist.stages.find((item) => item.id === 'research_web_search');
    const sourceSelection = checklist.stages.find((item) => item.id === 'research_source_selection');
    const sourceBalance = checklist.stages.find((item) => item.id === 'research_source_balance');
    const credibility = checklist.stages.find((item) => item.id === 'research_credibility');
    const thesis = checklist.stages.find((item) => item.id === 'research_thesis');
    const argument = checklist.stages.find((item) => item.id === 'research_argument');
    const caseStudies = checklist.stages.find((item) => item.id === 'research_case_studies');
    const conclusion = checklist.stages.find((item) => item.id === 'research_conclusion');
    const finalReport = checklist.stages.find((item) => item.id === 'research_final_report');

    assert.ok(webSearch, 'research_web_search stage should be present');
    assert.equal(webSearch.status, 'warn');
    assert.match(webSearch.why, /No external web search/i);
    assert.equal(webSearch.details.webSearchRan, false);
    assert.equal(sourceSelection.status, 'pass');
    assert.equal(sourceSelection.details.evidencePacketCount, 7);
    assert.equal(sourceBalance.status, 'skipped');
    assert.equal(sourceBalance.details.selectedSourceCount, 7);
    assert.equal(credibility.status, 'warn');
    assert.equal(thesis.status, 'pass');
    assert.equal(argument.status, 'pass');
    assert.equal(caseStudies.status, 'pass');
    assert.equal(conclusion.status, 'pass');
    assert.equal(finalReport.status, 'pass');
    assert.equal(finalReport.details.finalWordCount, 974);
  });

  it('does not add model_synthesis noise for normal intent-routed Lin turns', () => {
    const checklist = buildOrchestrationChecklist({
      userId: 'user-1',
      constructId: 'zen-001',
      gptConfig: { orchestrationMode: 'lin' },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'canonical_identity_bundle' },
          memorySearch: { skipped: true, reason: 'not_memory_query' },
          knowledge: { skipped: true, reason: 'not_applicable' },
        },
      },
      providerTrace: { final_provider: 'ollama', fallback_used: false },
      runtimeReceipt: {
        provider: {
          final_provider: 'ollama',
          model: 'phi3:latest',
          lin_harmony_policy: 'intent_routed',
        },
        fidelity: {},
      },
    });

    assert.equal(checklist.stages.some((item) => item.id === 'model_synthesis'), false);
  });
});
