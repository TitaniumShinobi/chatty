import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProviderTrace,
  buildValidatorDebug,
  buildRetrievalDiagnostics,
  buildPromptDiagnostics,
  buildLLMMessages,
  resolveGenerationParams,
} from '../lib/routeInference.js';

describe('routeInference', () => {
  describe('buildProviderTrace', () => {
    it('returns trace with all provided fields', () => {
      const result = buildProviderTrace({
        requestId: 'req-001',
        constructId: 'zen-001',
        lowComplexityTurn: false,
        promptChars: 1200,
      });
      assert.equal(result.request_id, 'req-001');
      assert.equal(result.construct_id, 'zen-001');
      assert.equal(result.low_complexity_turn, false);
      assert.equal(result.prompt_chars, 1200);
    });

    it('sets attempts to empty array', () => {
      const result = buildProviderTrace({ requestId: 'r', constructId: 'c', lowComplexityTurn: false, promptChars: 0 });
      assert.deepEqual(result.attempts, []);
    });

    it('sets final_provider to null', () => {
      const result = buildProviderTrace({ requestId: 'r', constructId: 'c', lowComplexityTurn: false, promptChars: 0 });
      assert.equal(result.final_provider, null);
    });

    it('sets fallback_used to false', () => {
      const result = buildProviderTrace({ requestId: 'r', constructId: 'c', lowComplexityTurn: false, promptChars: 0 });
      assert.equal(result.fallback_used, false);
    });

    it('sets total_duration_ms to 0', () => {
      const result = buildProviderTrace({ requestId: 'r', constructId: 'c', lowComplexityTurn: false, promptChars: 0 });
      assert.equal(result.total_duration_ms, 0);
    });

    it('passes through truthy lowComplexityTurn', () => {
      const result = buildProviderTrace({ requestId: 'r', constructId: 'c', lowComplexityTurn: true, promptChars: 0 });
      assert.equal(result.low_complexity_turn, true);
    });

    it('passes through zero promptChars', () => {
      const result = buildProviderTrace({ requestId: 'r', constructId: 'c', lowComplexityTurn: false, promptChars: 0 });
      assert.equal(result.prompt_chars, 0);
    });

    it('passes through undefined values', () => {
      const result = buildProviderTrace({});
      assert.equal(result.request_id, undefined);
      assert.equal(result.construct_id, undefined);
      assert.equal(result.low_complexity_turn, undefined);
      assert.equal(result.prompt_chars, undefined);
    });
  });

  describe('buildValidatorDebug', () => {
    it('extracts memory_retrieval_ran from enrichedContext', () => {
      const result = buildValidatorDebug({ enrichedContext: { memory_retrieval_ran: true }, greetingTurnContext: null });
      assert.equal(result.memory_retrieval_ran, true);
    });

    it('coerces memory_retrieval_ran to boolean', () => {
      const result = buildValidatorDebug({ enrichedContext: { memory_retrieval_ran: 1 }, greetingTurnContext: null });
      assert.equal(result.memory_retrieval_ran, true);
    });

    it('defaults memory_retrieval_ran to false when missing', () => {
      const result = buildValidatorDebug({ enrichedContext: {}, greetingTurnContext: null });
      assert.equal(result.memory_retrieval_ran, false);
    });

    it('defaults memory_retrieval_ran to false when enrichedContext is null', () => {
      const result = buildValidatorDebug({ enrichedContext: null, greetingTurnContext: null });
      assert.equal(result.memory_retrieval_ran, false);
    });

    it('extracts memory_query_detected from enrichedContext', () => {
      const result = buildValidatorDebug({ enrichedContext: { memory_query_detected: true }, greetingTurnContext: null });
      assert.equal(result.memory_query_detected, true);
    });

    it('defaults memory_query_detected to false when missing', () => {
      const result = buildValidatorDebug({ enrichedContext: {}, greetingTurnContext: null });
      assert.equal(result.memory_query_detected, false);
    });

    it('extracts evidence_count from enrichedContext', () => {
      const result = buildValidatorDebug({ enrichedContext: { evidence_count: 5 }, greetingTurnContext: null });
      assert.equal(result.evidence_count, 5);
    });

    it('defaults evidence_count to 0 when missing', () => {
      const result = buildValidatorDebug({ enrichedContext: {}, greetingTurnContext: null });
      assert.equal(result.evidence_count, 0);
    });

    it('defaults evidence_count to 0 when enrichedContext is null', () => {
      const result = buildValidatorDebug({ enrichedContext: null, greetingTurnContext: null });
      assert.equal(result.evidence_count, 0);
    });

    it('builds greeting_turn with posture, identity_available, low_confidence when greetingTurnContext provided', () => {
      const result = buildValidatorDebug({
        enrichedContext: {},
        greetingTurnContext: {
          posture: 'greeting',
          voiceContext: { identityAvailable: true, lowConfidence: false },
        },
      });
      assert.deepEqual(result.greeting_turn, {
        posture: 'greeting',
        identity_available: true,
        low_confidence: false,
      });
    });

    it('sets identity_available false when voiceContext missing', () => {
      const result = buildValidatorDebug({
        enrichedContext: {},
        greetingTurnContext: { posture: 'normal' },
      });
      assert.equal(result.greeting_turn.identity_available, false);
    });

    it('sets identity_available false when voiceContext.identityAvailable not strictly true', () => {
      const result = buildValidatorDebug({
        enrichedContext: {},
        greetingTurnContext: { posture: 'normal', voiceContext: { identityAvailable: 1 } },
      });
      assert.equal(result.greeting_turn.identity_available, false);
    });

    it('sets low_confidence false when voiceContext.lowConfidence not strictly true', () => {
      const result = buildValidatorDebug({
        enrichedContext: {},
        greetingTurnContext: { posture: 'normal', voiceContext: { lowConfidence: 0 } },
      });
      assert.equal(result.greeting_turn.low_confidence, false);
    });

    it('sets greeting_turn to null when greetingTurnContext is null', () => {
      const result = buildValidatorDebug({ enrichedContext: {}, greetingTurnContext: null });
      assert.equal(result.greeting_turn, null);
    });

    it('sets greeting_turn to null when greetingTurnContext is undefined', () => {
      const result = buildValidatorDebug({ enrichedContext: {} });
      assert.equal(result.greeting_turn, null);
    });

    it('sets all detection flags to false', () => {
      const result = buildValidatorDebug({ enrichedContext: {}, greetingTurnContext: null });
      assert.equal(result.identity_drift_detected, false);
      assert.equal(result.identity_rewrite_applied, false);
      assert.equal(result.identity_fallback_applied, false);
      assert.equal(result.cutoff_violation_detected, false);
      assert.equal(result.rewrite_applied, false);
    });
  });

  describe('buildRetrievalDiagnostics', () => {
    it('passes through lowComplexityTurn', () => {
      const result = buildRetrievalDiagnostics({ lowComplexityTurn: true });
      assert.equal(result.low_complexity_turn, true);
    });

    it('passes through systemPromptLength', () => {
      const result = buildRetrievalDiagnostics({ systemPromptLength: 2048 });
      assert.equal(result.system_prompt_chars, 2048);
    });

    it('includes phase_timing from enrichedContext', () => {
      const phaseTiming = { identity: { source: 'loaded', ms: 3 } };
      const result = buildRetrievalDiagnostics({ enrichedContext: { phaseTiming } });
      assert.deepEqual(result.phase_timing, phaseTiming);
    });

    it('defaults phase_timing to empty object when enrichedContext missing phaseTiming', () => {
      const result = buildRetrievalDiagnostics({ enrichedContext: {} });
      assert.deepEqual(result.phase_timing, {});
    });

    it('defaults phase_timing to empty object when enrichedContext is null', () => {
      const result = buildRetrievalDiagnostics({ enrichedContext: null });
      assert.deepEqual(result.phase_timing, {});
    });

    it('prefers enrichedContext.context_profile for context_profile', () => {
      const result = buildRetrievalDiagnostics({
        enrichedContext: { context_profile: 'memory_gpt' },
        contextBudgetProfile: 'standard_turn',
      });
      assert.equal(result.context_profile, 'memory_gpt');
    });

    it('falls back to enrichedContext.context_budget.profile for context_profile', () => {
      const result = buildRetrievalDiagnostics({
        enrichedContext: { context_budget: { profile: 'budget_profile' } },
      });
      assert.equal(result.context_profile, 'budget_profile');
    });

    it('falls back to contextBudgetProfile argument', () => {
      const result = buildRetrievalDiagnostics({
        enrichedContext: {},
        contextBudgetProfile: 'fallback_profile',
      });
      assert.equal(result.context_profile, 'fallback_profile');
    });

    it('defaults context_profile to undefined when no source', () => {
      const result = buildRetrievalDiagnostics({ enrichedContext: {} });
      assert.equal(result.context_profile, undefined);
    });

    it('extracts retrieval counts from enrichedContext', () => {
      const result = buildRetrievalDiagnostics({
        enrichedContext: {
          vectorMemories: 3,
          verifiedMemories: 2,
          needleHits: 1,
          memoriesLoaded: 5,
        },
      });
      assert.deepEqual(result.retrieval_counts, {
        vector: 3,
        verified: 2,
        needle: 1,
        transcript: 5,
      });
    });

    it('defaults retrieval counts to 0 when missing', () => {
      const result = buildRetrievalDiagnostics({ enrichedContext: {} });
      assert.deepEqual(result.retrieval_counts, {
        vector: 0,
        verified: 0,
        needle: 0,
        transcript: 0,
      });
    });

    it('defaults retrieval counts to 0 when enrichedContext is null', () => {
      const result = buildRetrievalDiagnostics({ enrichedContext: null });
      assert.deepEqual(result.retrieval_counts, {
        vector: 0,
        verified: 0,
        needle: 0,
        transcript: 0,
      });
    });

    it('sets greeting_turn.active true when greetingTurnContext provided', () => {
      const result = buildRetrievalDiagnostics({
        enrichedContext: {},
        greetingTurnContext: { posture: 'greeting', voiceContext: {} },
      });
      assert.equal(result.greeting_turn.active, true);
      assert.equal(result.greeting_turn.posture, 'greeting');
    });

    it('sets greeting_turn.active false when greetingTurnContext is null', () => {
      const result = buildRetrievalDiagnostics({ enrichedContext: {} });
      assert.equal(result.greeting_turn.active, false);
    });

    it('sets greeting_turn.active false when greetingTurnContext is undefined', () => {
      const result = buildRetrievalDiagnostics({ enrichedContext: {} });
      assert.equal(result.greeting_turn.active, false);
    });

    it('includes included_sections and delayed_sections from context_budget', () => {
      const result = buildRetrievalDiagnostics({
        enrichedContext: {
          context_budget: {
            included_sections: ['identity', 'memory'],
            delayed_sections: ['research'],
          },
        },
      });
      assert.deepEqual(result.included_sections, ['identity', 'memory']);
      assert.deepEqual(result.delayed_sections, ['research']);
    });

    it('defaults included_sections and delayed_sections to empty array', () => {
      const result = buildRetrievalDiagnostics({ enrichedContext: {} });
      assert.deepEqual(result.included_sections, []);
      assert.deepEqual(result.delayed_sections, []);
    });

    it('sets no_rewrite_identity_anchor from enrichedContext', () => {
      const result = buildRetrievalDiagnostics({ enrichedContext: { no_rewrite_identity_anchor: true } });
      assert.equal(result.no_rewrite_identity_anchor, true);
    });

    it('sets identity_rewrite_prevented_by from enrichedContext', () => {
      const result = buildRetrievalDiagnostics({ enrichedContext: { identity_rewrite_prevented_by: 'manual_override' } });
      assert.equal(result.identity_rewrite_prevented_by, 'manual_override');
    });

    it('handles greetingTurnContext voiceContext fields', () => {
      const result = buildRetrievalDiagnostics({
        enrichedContext: {},
        greetingTurnContext: {
          posture: 'followup',
          voiceContext: { identityAvailable: true, lowConfidence: true },
        },
      });
      assert.equal(result.greeting_turn.posture, 'followup');
      assert.equal(result.greeting_turn.identity_available, true);
      assert.equal(result.greeting_turn.low_confidence, true);
    });
  });

  describe('buildPromptDiagnostics', () => {
    it('includes route, mode, and constructId', () => {
      const result = buildPromptDiagnostics({ mode: 'lin', constructId: 'zen-001' });
      assert.equal(result.route, '/api/vvault/message');
      assert.equal(result.mode, 'lin');
      assert.equal(result.constructId, 'zen-001');
    });

    it('sets prompt_source to enriched_context', () => {
      const result = buildPromptDiagnostics({});
      assert.equal(result.prompt_source, 'enriched_context');
    });

    it('derives base_prompt_source from enriched.phaseTiming', () => {
      const result = buildPromptDiagnostics({ enriched: { phaseTiming: { basePromptSource: 'supabase' } } });
      assert.equal(result.base_prompt_source, 'supabase');
    });

    it('defaults base_prompt_source to unknown', () => {
      const result = buildPromptDiagnostics({ enriched: {} });
      assert.equal(result.base_prompt_source, 'unknown');
    });

    it('defaults base_prompt_source to unknown when enriched is null', () => {
      const result = buildPromptDiagnostics({ enriched: null });
      assert.equal(result.base_prompt_source, 'unknown');
    });

    it('sets gpt_config_present true when gptConfig provided', () => {
      const result = buildPromptDiagnostics({ gptConfig: { name: 'Zen' } });
      assert.equal(result.gpt_config_present, true);
    });

    it('sets gpt_config_present false when gptConfig is null', () => {
      const result = buildPromptDiagnostics({ gptConfig: null });
      assert.equal(result.gpt_config_present, false);
    });

    it('sets gpt_config_present false when gptConfig is undefined', () => {
      const result = buildPromptDiagnostics({});
      assert.equal(result.gpt_config_present, false);
    });

    it('derives identity_source from enriched.phaseTiming.identity.source', () => {
      const result = buildPromptDiagnostics({ enriched: { phaseTiming: { identity: { source: 'preflight' } } } });
      assert.equal(result.identity_source, 'preflight');
    });

    it('defaults identity_source to unknown', () => {
      const result = buildPromptDiagnostics({ enriched: null });
      assert.equal(result.identity_source, 'unknown');
    });

    it('sets conditioning_appended from enriched.phaseTiming.conditioningInjected', () => {
      const result = buildPromptDiagnostics({ enriched: { phaseTiming: { conditioningInjected: true } } });
      assert.equal(result.conditioning_appended, true);
    });

    it('defaults conditioning_appended to false', () => {
      const result = buildPromptDiagnostics({ enriched: {} });
      assert.equal(result.conditioning_appended, false);
    });

    it('sets preview_mode from argument', () => {
      const result = buildPromptDiagnostics({ previewMode: true });
      assert.equal(result.preview_mode, true);
    });

    it('defaults preview_mode to false', () => {
      const result = buildPromptDiagnostics({});
      assert.equal(result.preview_mode, false);
    });

    it('sets skip_persistence from argument', () => {
      const result = buildPromptDiagnostics({ skipPersistence: true });
      assert.equal(result.skip_persistence, true);
    });

    it('defaults skip_persistence to false', () => {
      const result = buildPromptDiagnostics({});
      assert.equal(result.skip_persistence, false);
    });

    it('builds preview_identity with construct IDs', () => {
      const result = buildPromptDiagnostics({ constructId: 'zen-001', canonicalConstructId: 'zen', rawConstructId: 'zen-001' });
      assert.equal(result.preview_identity.effective_construct_id, 'zen-001');
      assert.equal(result.preview_identity.selected_construct_id, 'zen');
      assert.equal(result.preview_identity.raw_construct_id, 'zen-001');
    });

    it('falls back selected_construct_id to constructId when canonicalConstructId missing', () => {
      const result = buildPromptDiagnostics({ constructId: 'zen-001' });
      assert.equal(result.preview_identity.selected_construct_id, 'zen-001');
    });

    it('sets draft_overlay_applied from enriched.phaseTiming.preview', () => {
      const result = buildPromptDiagnostics({ enriched: { phaseTiming: { preview: { draftOverlayApplied: true } } } });
      assert.equal(result.preview_identity.draft_overlay_applied, true);
    });

    it('defaults draft_overlay_applied to false', () => {
      const result = buildPromptDiagnostics({});
      assert.equal(result.preview_identity.draft_overlay_applied, false);
    });

    it('sets draft_overlay_keys from enriched.phaseTiming.preview', () => {
      const result = buildPromptDiagnostics({ enriched: { phaseTiming: { preview: { draftOverlayKeys: ['key1'] } } } });
      assert.deepEqual(result.preview_identity.draft_overlay_keys, ['key1']);
    });

    it('defaults draft_overlay_keys to empty array', () => {
      const result = buildPromptDiagnostics({});
      assert.deepEqual(result.preview_identity.draft_overlay_keys, []);
    });

    it('sets suppressed_system_prompt_override from enriched.phaseTiming.preview', () => {
      const result = buildPromptDiagnostics({ enriched: { phaseTiming: { preview: { suppressedSystemPromptOverride: true } } } });
      assert.equal(result.preview_identity.suppressed_system_prompt_override, true);
    });

    it('returns true for retrieval_injected when searchInjectedValue is true', () => {
      const result = buildPromptDiagnostics({ searchInjectedValue: true });
      assert.equal(result.retrieval_injected, true);
    });

    it('returns true for retrieval_injected when evidence_count > 0', () => {
      const result = buildPromptDiagnostics({ enriched: { evidence_count: 3 } });
      assert.equal(result.retrieval_injected, true);
    });

    it('returns false for retrieval_injected when no evidence and searchInjectedValue is not true', () => {
      const result = buildPromptDiagnostics({ enriched: {}, searchInjectedValue: false });
      assert.equal(result.retrieval_injected, false);
    });

    it('returns false for retrieval_injected when evidence_count is 0', () => {
      const result = buildPromptDiagnostics({ enriched: { evidence_count: 0 } });
      assert.equal(result.retrieval_injected, false);
    });

    it('sets final_history_count from historyCount', () => {
      const result = buildPromptDiagnostics({ historyCount: 10 });
      assert.equal(result.final_history_count, 10);
    });

    it('sets prompt_chars from systemPromptText length', () => {
      const result = buildPromptDiagnostics({ systemPromptText: 'You are a helpful assistant.' });
      assert.equal(result.prompt_chars, 28);
    });

    it('sets prompt_chars to 0 when systemPromptText is null', () => {
      const result = buildPromptDiagnostics({ systemPromptText: null });
      assert.equal(result.prompt_chars, 0);
    });

    it('sets prompt_chars to 0 when systemPromptText is undefined', () => {
      const result = buildPromptDiagnostics({});
      assert.equal(result.prompt_chars, 0);
    });

    it('sets prompt_chars to 0 when systemPromptText is not a string', () => {
      const result = buildPromptDiagnostics({ systemPromptText: 123 });
      assert.equal(result.prompt_chars, 0);
    });

    it('prefers enriched.context_profile for context_profile', () => {
      const result = buildPromptDiagnostics({ enriched: { context_profile: 'high' } });
      assert.equal(result.context_profile, 'high');
    });

    it('falls back to enriched.context_budget.profile', () => {
      const result = buildPromptDiagnostics({ enriched: { context_budget: { profile: 'medium' } } });
      assert.equal(result.context_profile, 'medium');
    });

    it('defaults context_profile to standard_turn', () => {
      const result = buildPromptDiagnostics({});
      assert.equal(result.context_profile, 'standard_turn');
    });

    it('includes included_sections and delayed_sections from context_budget', () => {
      const result = buildPromptDiagnostics({
        enriched: { context_budget: { included_sections: ['a'], delayed_sections: ['b'] } },
      });
      assert.deepEqual(result.included_sections, ['a']);
      assert.deepEqual(result.delayed_sections, ['b']);
    });

    it('defaults included_sections and delayed_sections to empty array', () => {
      const result = buildPromptDiagnostics({});
      assert.deepEqual(result.included_sections, []);
      assert.deepEqual(result.delayed_sections, []);
    });

    it('sets no_rewrite_identity_anchor from enriched', () => {
      const result = buildPromptDiagnostics({ enriched: { no_rewrite_identity_anchor: true } });
      assert.equal(result.no_rewrite_identity_anchor, true);
    });

    it('sets identity_rewrite_prevented_by from enriched', () => {
      const result = buildPromptDiagnostics({ enriched: { identity_rewrite_prevented_by: 'reason' } });
      assert.equal(result.identity_rewrite_prevented_by, 'reason');
    });

    it('defaults identity_rewrite_prevented_by to null', () => {
      const result = buildPromptDiagnostics({});
      assert.equal(result.identity_rewrite_prevented_by, null);
    });
  });

  describe('buildLLMMessages', () => {
    it('returns array with system and user messages', () => {
      const result = buildLLMMessages('You are Zen.', 'Hello');
      assert.equal(result.length, 2);
      assert.deepEqual(result[0], { role: 'system', content: 'You are Zen.' });
      assert.deepEqual(result[1], { role: 'user', content: 'Hello' });
    });

    it('spreads history items between system and user', () => {
      const history = [
        { role: 'assistant', content: 'How can I help?' },
      ];
      const result = buildLLMMessages('System prompt', 'Hello again', history);
      assert.equal(result.length, 3);
      assert.deepEqual(result[0], { role: 'system', content: 'System prompt' });
      assert.deepEqual(result[1], { role: 'assistant', content: 'How can I help?' });
      assert.deepEqual(result[2], { role: 'user', content: 'Hello again' });
    });

    it('handles multiple history items', () => {
      const history = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'What is AI?' },
      ];
      const result = buildLLMMessages('You are a bot.', 'Tell me', history);
      assert.equal(result.length, 5);
      assert.equal(result[0].role, 'system');
      assert.equal(result[1].role, 'user');
      assert.equal(result[2].role, 'assistant');
      assert.equal(result[3].role, 'user');
      assert.equal(result[4].role, 'user');
    });

    it('defaults history to empty array when not provided', () => {
      const result = buildLLMMessages('System', 'User');
      assert.equal(result.length, 2);
    });

    it('handles empty strings for systemPrompt and userContent', () => {
      const result = buildLLMMessages('', '');
      assert.equal(result[0].content, '');
      assert.equal(result[1].content, '');
    });

    it('handles null systemPrompt', () => {
      const result = buildLLMMessages(null, 'content');
      assert.equal(result[0].content, null);
      assert.equal(result[1].content, 'content');
    });
  });

  describe('resolveGenerationParams', () => {
    it('returns empty object when meta is null', () => {
      const result = resolveGenerationParams(null);
      assert.deepEqual(result, {});
    });

    it('returns empty object when meta is undefined', () => {
      const result = resolveGenerationParams(undefined);
      assert.deepEqual(result, {});
    });

    it('returns empty object when meta has no configJson', () => {
      const result = resolveGenerationParams({});
      assert.deepEqual(result, {});
    });

    it('returns empty object when configJson is null', () => {
      const result = resolveGenerationParams({ configJson: null });
      assert.deepEqual(result, {});
    });

    it('extracts temperature from configJson', () => {
      const result = resolveGenerationParams({ configJson: { temperature: 0.7 } });
      assert.equal(result.temperature, 0.7);
    });

    it('extracts top_p from configJson', () => {
      const result = resolveGenerationParams({ configJson: { top_p: 0.9 } });
      assert.equal(result.top_p, 0.9);
    });

    it('extracts max_tokens from configJson', () => {
      const result = resolveGenerationParams({ configJson: { max_tokens: 4096 } });
      assert.equal(result.max_tokens, 4096);
    });

    it('extracts max_tokens from camelCase maxTokens', () => {
      const result = resolveGenerationParams({ configJson: { maxTokens: 2048 } });
      assert.equal(result.max_tokens, 2048);
    });

    it('prefers maxTokens over max_tokens when both present', () => {
      const result = resolveGenerationParams({ configJson: { max_tokens: 100, maxTokens: 200 } });
      assert.equal(result.max_tokens, 200);
    });

    it('excludes temperature when not finite', () => {
      const result = resolveGenerationParams({ configJson: { temperature: Infinity } });
      assert.equal(Object.hasOwn(result, 'temperature'), false);
    });

    it('excludes temperature when not a number', () => {
      const result = resolveGenerationParams({ configJson: { temperature: 'hot' } });
      assert.equal(Object.hasOwn(result, 'temperature'), false);
    });

    it('includes zero temperature', () => {
      const result = resolveGenerationParams({ configJson: { temperature: 0 } });
      assert.equal(result.temperature, 0);
    });

    it('extracts all fields together', () => {
      const result = resolveGenerationParams({
        configJson: { temperature: 0.5, top_p: 0.8, max_tokens: 1024 },
      });
      assert.equal(result.temperature, 0.5);
      assert.equal(result.top_p, 0.8);
      assert.equal(result.max_tokens, 1024);
    });

    it('only includes fields that are present and finite', () => {
      const result = resolveGenerationParams({
        configJson: { temperature: 0.3 },
      });
      assert.equal(Object.keys(result).length, 1);
      assert.equal(result.temperature, 0.3);
      assert.equal(Object.hasOwn(result, 'top_p'), false);
      assert.equal(Object.hasOwn(result, 'max_tokens'), false);
    });

    it('handles NaN values', () => {
      const result = resolveGenerationParams({ configJson: { temperature: NaN, top_p: 0.5 } });
      assert.equal(Object.hasOwn(result, 'temperature'), false);
      assert.equal(result.top_p, 0.5);
    });
  });
});
