import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getOllamaExecutionModel,
  buildRouteTrackingState,
  computeRouteTrackingUpdates,
  computeOllamaRouteTrackingUpdates,
  buildNovaOpenRouterModelCandidates,
  looksLikeInvalidModelAttempt,
  buildProviderCandidates,
  normalizeProviderError,
} from '../lib/inferenceProvider.js';

describe('getOllamaExecutionModel', () => {
  it('returns effectiveModel when lin mode, effectiveProvider is ollama, and effectiveModel is set', () => {
    const result = getOllamaExecutionModel({
      modelResolution: { mode: 'lin', provider: 'openai', model: 'gpt-4' },
      effectiveProvider: 'ollama',
      effectiveModel: 'llama3',
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'llama3');
  });

  it('returns effectiveModel when lin mode, effectiveProvider is ollama, and effectiveModel is empty string', () => {
    const result = getOllamaExecutionModel({
      modelResolution: { mode: 'lin' },
      effectiveProvider: 'ollama',
      effectiveModel: '',
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'default-llama');
  });

  it('returns requestedModel when lin mode, requestedProvider is ollama, and requestedModel is set', () => {
    const result = getOllamaExecutionModel({
      modelResolution: { mode: 'lin', requestedProvider: 'ollama', requestedModel: 'mistral', provider: 'openai' },
      effectiveProvider: 'openai',
      effectiveModel: 'gpt-4',
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'mistral');
  });

  it('returns modelResolution.model when lin mode, provider is ollama, and model is set', () => {
    const result = getOllamaExecutionModel({
      modelResolution: { mode: 'lin', requestedProvider: 'openai', provider: 'ollama', model: 'codellama' },
      effectiveProvider: 'openai',
      effectiveModel: 'gpt-4',
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'codellama');
  });

  it('returns preferredOllamaModel when lin mode but no ollama provider/model matches', () => {
    const result = getOllamaExecutionModel({
      modelResolution: { mode: 'lin', requestedProvider: 'openai', provider: 'openai', model: 'gpt-4' },
      effectiveProvider: 'openai',
      effectiveModel: 'gpt-4',
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'default-llama');
  });

  it('returns preferredOllamaModel when not lin mode', () => {
    const result = getOllamaExecutionModel({
      modelResolution: { mode: 'cloud', provider: 'ollama', model: 'llama3' },
      effectiveProvider: 'ollama',
      effectiveModel: 'llama3',
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'default-llama');
  });

  it('returns preferredOllamaModel when modelResolution is null', () => {
    const result = getOllamaExecutionModel({
      modelResolution: null,
      effectiveProvider: 'ollama',
      effectiveModel: 'llama3',
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'default-llama');
  });

  it('returns preferredOllamaModel when modelResolution is undefined', () => {
    const result = getOllamaExecutionModel({
      modelResolution: undefined,
      effectiveProvider: 'ollama',
      effectiveModel: 'llama3',
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'default-llama');
  });

  it('follows priority: effectiveModel > requestedModel > modelResolution.model', () => {
    const result = getOllamaExecutionModel({
      modelResolution: { mode: 'lin', requestedProvider: 'ollama', requestedModel: 'requested-model', provider: 'ollama', model: 'resolved-model' },
      effectiveProvider: 'ollama',
      effectiveModel: 'effective-model',
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'effective-model');
  });

  it('falls through requestedModel when requestedProvider is not ollama', () => {
    const result = getOllamaExecutionModel({
      modelResolution: { mode: 'lin', requestedProvider: 'openai', requestedModel: 'gpt-4', provider: 'ollama', model: 'codellama' },
      effectiveProvider: 'openai',
      effectiveModel: null,
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'codellama');
  });

  it('falls through effectiveModel when effectiveProvider is not ollama', () => {
    const result = getOllamaExecutionModel({
      modelResolution: { mode: 'lin', requestedProvider: 'ollama', requestedModel: 'mistral', provider: 'openai', model: 'gpt-4' },
      effectiveProvider: 'openai',
      effectiveModel: 'gpt-4',
      preferredOllamaModel: 'default-llama',
    });
    assert.equal(result, 'mistral');
  });
});

describe('buildRouteTrackingState', () => {
  it('returns default state when modelResolution is null', () => {
    const result = buildRouteTrackingState(null);
    assert.deepEqual(result, {
      effectiveRouteFallbackUsed: false,
      effectiveLocalFirstUsed: false,
      effectiveLocalCloudFallbackState: null,
      effectiveSeatDefaultsOrOverrides: null,
    });
  });

  it('returns default state when modelResolution is undefined', () => {
    const result = buildRouteTrackingState(undefined);
    assert.deepEqual(result, {
      effectiveRouteFallbackUsed: false,
      effectiveLocalFirstUsed: false,
      effectiveLocalCloudFallbackState: null,
      effectiveSeatDefaultsOrOverrides: null,
    });
  });

  it('returns state with localFirstUsed true when modelResolution.localFirstUsed is true', () => {
    const result = buildRouteTrackingState({ localFirstUsed: true });
    assert.equal(result.effectiveLocalFirstUsed, true);
  });

  it('returns state with localCloudFallbackState when set', () => {
    const result = buildRouteTrackingState({ localCloudFallbackState: 'fallback_to_openai' });
    assert.equal(result.effectiveLocalCloudFallbackState, 'fallback_to_openai');
  });

  it('returns state with seatDefaultsOrOverrides when set', () => {
    const result = buildRouteTrackingState({ seatDefaultsOrOverrides: 'admin_override' });
    assert.equal(result.effectiveSeatDefaultsOrOverrides, 'admin_override');
  });

  it('coerces localFirstUsed to boolean', () => {
    const truthy = buildRouteTrackingState({ localFirstUsed: 1 });
    assert.equal(truthy.effectiveLocalFirstUsed, true);

    const falsy = buildRouteTrackingState({ localFirstUsed: 0 });
    assert.equal(falsy.effectiveLocalFirstUsed, false);
  });

  it('sets fallback fields to null when not provided', () => {
    const result = buildRouteTrackingState({ localFirstUsed: false });
    assert.equal(result.effectiveLocalCloudFallbackState, null);
    assert.equal(result.effectiveSeatDefaultsOrOverrides, null);
  });

  it('sets effectiveRouteFallbackUsed to false always', () => {
    const result = buildRouteTrackingState({ localFirstUsed: true });
    assert.equal(result.effectiveRouteFallbackUsed, false);
  });
});

describe('computeRouteTrackingUpdates', () => {
  it('sets modelSource when source is truthy', () => {
    const result = computeRouteTrackingUpdates({ source: 'openai', localFirstUsed: false, fallbackUsed: false });
    assert.equal(result.modelSource, 'openai');
  });

  it('omits modelSource when source is null', () => {
    const result = computeRouteTrackingUpdates({ source: null, localFirstUsed: false, fallbackUsed: false });
    assert.equal(result.modelSource, undefined);
  });

  it('omits modelSource when source is empty string', () => {
    const result = computeRouteTrackingUpdates({ source: '', localFirstUsed: false, fallbackUsed: false });
    assert.equal(result.modelSource, undefined);
  });

  it('sets effectiveLocalFirstUsed when localFirstUsed is boolean true', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: true, fallbackUsed: false });
    assert.equal(result.effectiveLocalFirstUsed, true);
  });

  it('sets effectiveLocalFirstUsed when localFirstUsed is boolean false', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: false, fallbackUsed: false });
    assert.equal(result.effectiveLocalFirstUsed, false);
  });

  it('omits effectiveLocalFirstUsed when localFirstUsed is not boolean', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: null, fallbackUsed: false });
    assert.equal(result.effectiveLocalFirstUsed, undefined);
  });

  it('omits effectiveLocalFirstUsed when localFirstUsed is undefined', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: undefined, fallbackUsed: false });
    assert.equal(result.effectiveLocalFirstUsed, undefined);
  });

  it('sets effectiveLocalCloudFallbackState when truthy', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: false, localCloudFallbackState: 'fallback_to_openai', fallbackUsed: false });
    assert.equal(result.effectiveLocalCloudFallbackState, 'fallback_to_openai');
  });

  it('omits effectiveLocalCloudFallbackState when falsy', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: false, localCloudFallbackState: '', fallbackUsed: false });
    assert.equal(result.effectiveLocalCloudFallbackState, undefined);
  });

  it('omits effectiveLocalCloudFallbackState when null', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: false, localCloudFallbackState: null, fallbackUsed: false });
    assert.equal(result.effectiveLocalCloudFallbackState, undefined);
  });

  it('sets effectiveRouteFallbackUsed when fallbackUsed is boolean true', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: false, fallbackUsed: true });
    assert.equal(result.effectiveRouteFallbackUsed, true);
  });

  it('sets effectiveRouteFallbackUsed when fallbackUsed is boolean false', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: false, fallbackUsed: false });
    assert.equal(result.effectiveRouteFallbackUsed, false);
  });

  it('omits effectiveRouteFallbackUsed when fallbackUsed is not boolean', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: false, fallbackUsed: null });
    assert.equal(result.effectiveRouteFallbackUsed, undefined);
  });

  it('sets effectiveSeatDefaultsOrOverrides when truthy', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: false, fallbackUsed: false, seatDefaultsOrOverrides: 'admin' });
    assert.equal(result.effectiveSeatDefaultsOrOverrides, 'admin');
  });

  it('omits effectiveSeatDefaultsOrOverrides when falsy', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: false, fallbackUsed: false, seatDefaultsOrOverrides: '' });
    assert.equal(result.effectiveSeatDefaultsOrOverrides, undefined);
  });

  it('omits effectiveSeatDefaultsOrOverrides when null', () => {
    const result = computeRouteTrackingUpdates({ source: 'test', localFirstUsed: false, fallbackUsed: false, seatDefaultsOrOverrides: null });
    assert.equal(result.effectiveSeatDefaultsOrOverrides, undefined);
  });

  it('returns all fields when all are truthy/boolean', () => {
    const result = computeRouteTrackingUpdates({
      source: 'ollama',
      localFirstUsed: true,
      localCloudFallbackState: 'local_first',
      fallbackUsed: true,
      seatDefaultsOrOverrides: 'override',
    });
    assert.deepEqual(result, {
      modelSource: 'ollama',
      effectiveLocalFirstUsed: true,
      effectiveLocalCloudFallbackState: 'local_first',
      effectiveRouteFallbackUsed: true,
      effectiveSeatDefaultsOrOverrides: 'override',
    });
  });

  it('returns empty object when no conditions met', () => {
    const result = computeRouteTrackingUpdates({});
    assert.deepEqual(result, {});
  });
});

describe('computeOllamaRouteTrackingUpdates', () => {
  it('uses modelSource as source when in lin mode and modelSource provided', () => {
    const result = computeOllamaRouteTrackingUpdates({
      fallbackUsed: false,
      localCloudFallbackState: null,
      modelSource: 'lin_resolved',
      modelResolution: { mode: 'lin' },
    });
    assert.equal(result.modelSource, 'lin_resolved');
  });

  it('uses modelResolution.source as source when in lin mode and modelSource not provided', () => {
    const result = computeOllamaRouteTrackingUpdates({
      fallbackUsed: false,
      localCloudFallbackState: null,
      modelSource: null,
      modelResolution: { mode: 'lin', source: 'resolution_source' },
    });
    assert.equal(result.modelSource, 'resolution_source');
  });

  it('uses ollama_local_execution as source when not lin mode and not fallback', () => {
    const result = computeOllamaRouteTrackingUpdates({
      fallbackUsed: false,
      localCloudFallbackState: null,
      modelSource: null,
      modelResolution: null,
    });
    assert.equal(result.modelSource, 'ollama_local_execution');
  });

  it('uses fallback_to_ollama as source when not lin mode and fallback', () => {
    const result = computeOllamaRouteTrackingUpdates({
      fallbackUsed: true,
      localCloudFallbackState: null,
      modelSource: null,
      modelResolution: null,
    });
    assert.equal(result.modelSource, 'fallback_to_ollama');
  });

  it('uses fallback_to_ollama as source when lin mode with no modelSource and no resolution.source', () => {
    const result = computeOllamaRouteTrackingUpdates({
      fallbackUsed: true,
      localCloudFallbackState: null,
      modelSource: null,
      modelResolution: { mode: 'lin' },
    });
    assert.equal(result.modelSource, 'fallback_to_ollama');
  });

  it('uses local_first as localCloudFallbackState when not fallback and not provided', () => {
    const result = computeOllamaRouteTrackingUpdates({
      fallbackUsed: false,
      localCloudFallbackState: null,
      modelSource: null,
      modelResolution: null,
    });
    assert.equal(result.effectiveLocalCloudFallbackState, 'local_first');
  });

  it('uses fallback_to_ollama as localCloudFallbackState when fallback and not provided', () => {
    const result = computeOllamaRouteTrackingUpdates({
      fallbackUsed: true,
      localCloudFallbackState: null,
      modelSource: null,
      modelResolution: null,
    });
    assert.equal(result.effectiveLocalCloudFallbackState, 'fallback_to_ollama');
  });

  it('uses provided localCloudFallbackState over default', () => {
    const result = computeOllamaRouteTrackingUpdates({
      fallbackUsed: true,
      localCloudFallbackState: 'custom_fallback',
      modelSource: null,
      modelResolution: null,
    });
    assert.equal(result.effectiveLocalCloudFallbackState, 'custom_fallback');
  });

  it('always sets effectiveLocalFirstUsed to true', () => {
    const result = computeOllamaRouteTrackingUpdates({
      fallbackUsed: false,
      localCloudFallbackState: null,
      modelSource: null,
      modelResolution: null,
    });
    assert.equal(result.effectiveLocalFirstUsed, true);
  });

  it('passes through fallbackUsed boolean', () => {
    const result = computeOllamaRouteTrackingUpdates({
      fallbackUsed: true,
      localCloudFallbackState: null,
      modelSource: null,
      modelResolution: null,
    });
    assert.equal(result.effectiveRouteFallbackUsed, true);
  });
});

describe('buildNovaOpenRouterModelCandidates', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.NOVA_OPENROUTER_MODEL_CANDIDATES;
    delete process.env.OPENROUTER_MODEL;
  });

  afterEach(() => {
    process.env.NOVA_OPENROUTER_MODEL_CANDIDATES = ORIGINAL_ENV.NOVA_OPENROUTER_MODEL_CANDIDATES;
    process.env.OPENROUTER_MODEL = ORIGINAL_ENV.OPENROUTER_MODEL;
  });

  it('uses NOVA_OPENROUTER_MODEL_CANDIDATES env var when set', () => {
    process.env.NOVA_OPENROUTER_MODEL_CANDIDATES = 'model-a, model-b, model-a';
    const result = buildNovaOpenRouterModelCandidates('hotfix-model');
    assert.deepEqual(result, ['model-a', 'model-b']);
  });

  it('falls back to hotfixModel and OPENROUTER_MODEL when NOVA env not set', () => {
    process.env.OPENROUTER_MODEL = 'openrouter-model';
    const result = buildNovaOpenRouterModelCandidates('hotfix-model');
    assert.deepEqual(result, ['hotfix-model', 'openrouter-model']);
  });

  it('falls back to hotfixModel and default when no env vars set', () => {
    const result = buildNovaOpenRouterModelCandidates('hotfix-model');
    assert.deepEqual(result, ['hotfix-model', 'meta-llama/llama-3.2-3b-instruct:free']);
  });

  it('deduplicates when hotfixModel matches default', () => {
    const result = buildNovaOpenRouterModelCandidates('meta-llama/llama-3.2-3b-instruct:free');
    assert.deepEqual(result, ['meta-llama/llama-3.2-3b-instruct:free']);
  });

  it('filters out empty entries from env var', () => {
    process.env.NOVA_OPENROUTER_MODEL_CANDIDATES = 'model-a, , model-b,';
    const result = buildNovaOpenRouterModelCandidates('hotfix-model');
    assert.deepEqual(result, ['model-a', 'model-b']);
  });

  it('returns only env candidates when NOVA_OPENROUTER_MODEL_CANDIDATES is set to a single model', () => {
    process.env.NOVA_OPENROUTER_MODEL_CANDIDATES = 'single-model';
    const result = buildNovaOpenRouterModelCandidates('hotfix-model');
    assert.deepEqual(result, ['single-model']);
  });

  it('filters null hotfixModel when using fallback', () => {
    const result = buildNovaOpenRouterModelCandidates(null);
    assert.ok(result.length <= 2);
  });
});

describe('looksLikeInvalidModelAttempt', () => {
  it('returns false for null', () => {
    assert.equal(looksLikeInvalidModelAttempt(null), false);
  });

  it('returns false for undefined', () => {
    assert.equal(looksLikeInvalidModelAttempt(undefined), false);
  });

  it('returns false for timeout status', () => {
    const result = looksLikeInvalidModelAttempt({ status: 'timeout', error_code: 404, error_message_short: 'not found' });
    assert.equal(result, false);
  });

  it('returns true when error_message contains "invalid model"', () => {
    const result = looksLikeInvalidModelAttempt({ status: 'failed', error_message_short: 'The model is invalid model abc' });
    assert.equal(result, true);
  });

  it('returns true when error_message contains "not a valid model"', () => {
    const result = looksLikeInvalidModelAttempt({ status: 'failed', error_message_short: 'not a valid model id' });
    assert.equal(result, true);
  });

  it('returns true when error_message contains "model id"', () => {
    const result = looksLikeInvalidModelAttempt({ status: 'failed', error_message_short: 'Unknown model id' });
    assert.equal(result, true);
  });

  it('returns true for 4xx error_code as number', () => {
    assert.equal(looksLikeInvalidModelAttempt({ status: 'failed', error_code: 400 }), true);
    assert.equal(looksLikeInvalidModelAttempt({ status: 'failed', error_code: 404 }), true);
    assert.equal(looksLikeInvalidModelAttempt({ status: 'failed', error_code: 499 }), true);
  });

  it('returns true for 4xx error_code as string', () => {
    assert.equal(looksLikeInvalidModelAttempt({ status: 'failed', error_code: '404' }), true);
  });

  it('returns false for 5xx error_code', () => {
    assert.equal(looksLikeInvalidModelAttempt({ status: 'failed', error_code: 500 }), false);
    assert.equal(looksLikeInvalidModelAttempt({ status: 'failed', error_code: 503 }), false);
  });

  it('returns false for 3xx error_code', () => {
    assert.equal(looksLikeInvalidModelAttempt({ status: 'failed', error_code: 302 }), false);
  });

  it('returns false for null error_code', () => {
    assert.equal(looksLikeInvalidModelAttempt({ status: 'failed', error_code: null }), false);
  });

  it('returns false for undefined error_code', () => {
    assert.equal(looksLikeInvalidModelAttempt({ status: 'failed' }), false);
  });

  it('is case insensitive for error message', () => {
    const result = looksLikeInvalidModelAttempt({ status: 'failed', error_message_short: 'INVALID MODEL' });
    assert.equal(result, true);
  });

  it('handles non-string error_message_short gracefully', () => {
    const result = looksLikeInvalidModelAttempt({ status: 'failed', error_message_short: 12345 });
    assert.equal(result, false);
  });

  it('handles null error_message_short', () => {
    const result = looksLikeInvalidModelAttempt({ status: 'failed', error_message_short: null });
    assert.equal(result, false);
  });

  it('returns false when no match found', () => {
    const result = looksLikeInvalidModelAttempt({ status: 'failed', error_message_short: 'some other error', error_code: 200 });
    assert.equal(result, false);
  });

  it('error message check takes priority over error_code', () => {
    const result = looksLikeInvalidModelAttempt({ status: 'failed', error_message_short: 'invalid model', error_code: 200 });
    assert.equal(result, true);
  });
});

describe('buildProviderCandidates', () => {
  it('returns array starting with effectiveModel', () => {
    const result = buildProviderCandidates('custom-model');
    assert.equal(result[0], 'custom-model');
    assert.equal(result.length, 5);
  });

  it('includes the four fallback models', () => {
    const result = buildProviderCandidates('custom-model');
    assert.deepEqual(result, [
      'custom-model',
      'meta-llama/llama-3.3-70b-instruct',
      'mistralai/mistral-large',
      'qwen/qwen-2.5-72b-instruct',
      'meta-llama/llama-3.2-3b-instruct:free',
    ]);
  });

  it('returns only fallbacks when effectiveModel is null', () => {
    const result = buildProviderCandidates(null);
    assert.equal(result.length, 4);
    assert.equal(result[0], 'meta-llama/llama-3.3-70b-instruct');
  });

  it('returns only fallbacks when effectiveModel is undefined', () => {
    const result = buildProviderCandidates(undefined);
    assert.equal(result.length, 4);
  });

  it('returns only fallbacks when effectiveModel is empty string', () => {
    const result = buildProviderCandidates('');
    assert.equal(result.length, 4);
  });

  it('deduplicates when effectiveModel matches a fallback', () => {
    const result = buildProviderCandidates('meta-llama/llama-3.3-70b-instruct');
    assert.equal(result.length, 4);
    assert.equal(result[0], 'meta-llama/llama-3.3-70b-instruct');
  });
});

describe('normalizeProviderError', () => {
  it('returns default for null error', () => {
    const result = normalizeProviderError(null);
    assert.deepEqual(result, { message: 'Unknown error', upstreamStatus: null, providerCode: null, hint: null });
  });

  it('returns default for undefined error', () => {
    const result = normalizeProviderError(undefined);
    assert.deepEqual(result, { message: 'Unknown error', upstreamStatus: null, providerCode: null, hint: null });
  });

  it('returns 503 for ALL_PROVIDERS_FAILED code', () => {
    const result = normalizeProviderError({ code: 'ALL_PROVIDERS_FAILED' });
    assert.equal(result.message, 'All providers failed');
    assert.equal(result.upstreamStatus, 503);
    assert.equal(result.providerCode, 'ALL_PROVIDERS_FAILED');
    assert.equal(result.hint, 'All configured LLM providers returned errors.');
  });

  it('maps 401 to API key hint', () => {
    const result = normalizeProviderError({ status: 401, message: 'Unauthorized' });
    assert.equal(result.hint, 'Check your API key.');
    assert.equal(result.upstreamStatus, 401);
  });

  it('maps 403 to API key hint', () => {
    const result = normalizeProviderError({ status: 403, message: 'Forbidden' });
    assert.equal(result.hint, 'Check your API key.');
    assert.equal(result.upstreamStatus, 403);
  });

  it('maps 429 to rate limit hint', () => {
    const result = normalizeProviderError({ status: 429, message: 'Too Many Requests' });
    assert.equal(result.hint, 'Rate limited. Try again later.');
  });

  it('maps 402 to billing hint', () => {
    const result = normalizeProviderError({ status: 402, message: 'Payment Required' });
    assert.equal(result.hint, 'Billing issue. Check your account.');
  });

  it('maps insufficient_quota code to quota hint', () => {
    const result = normalizeProviderError({ code: 'insufficient_quota', message: 'Quota exceeded' });
    assert.equal(result.hint, 'Quota exceeded.');
  });

  it('uses statusCode as fallback for status', () => {
    const result = normalizeProviderError({ statusCode: 429, message: 'rate limit' });
    assert.equal(result.upstreamStatus, 429);
    assert.equal(result.hint, 'Rate limited. Try again later.');
  });

  it('uses type as fallback for code', () => {
    const result = normalizeProviderError({ type: 'insufficient_quota', message: 'out of quota' });
    assert.equal(result.providerCode, 'insufficient_quota');
    assert.equal(result.hint, 'Quota exceeded.');
  });

  it('returns no hint for unknown status', () => {
    const result = normalizeProviderError({ status: 500, message: 'Internal Server Error' });
    assert.equal(result.hint, null);
    assert.equal(result.upstreamStatus, 500);
  });

  it('includes error message in result', () => {
    const result = normalizeProviderError({ status: 500, message: 'Something broke' });
    assert.equal(result.message, 'Something broke');
  });

  it('stringifies non-object error', () => {
    const result = normalizeProviderError('just a string');
    assert.equal(result.message, 'just a string');
  });

  it('extracts message from error with no status', () => {
    const result = normalizeProviderError({ message: 'custom error' });
    assert.equal(result.message, 'custom error');
    assert.equal(result.upstreamStatus, null);
    assert.equal(result.hint, null);
  });
});
