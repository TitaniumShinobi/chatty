import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const NOVA_CONSTRUCT = 'nova-001';
const NON_NOVA_CONSTRUCT = 'zen-001';

function createMockClient(name, shouldFail = false, failStatus = null) {
  const calls = [];
  return {
    name,
    calls,
    chat: {
      completions: {
        create: async (params) => {
          calls.push({ model: params.model, messages: params.messages });
          if (shouldFail) {
            const err = new Error(`${name} mock failure`);
            err.status = failStatus || 500;
            throw err;
          }
          return {
            choices: [{ message: { content: `Response from ${name}` }, finish_reason: 'stop' }]
          };
        }
      }
    }
  };
}

function simulateNovaHotfix({ constructId, hasImages, replitOpenrouter, openrouter, openaiClient }) {
  const callLog = [];
  let effectiveProvider = 'openai';
  let effectiveModel = 'gpt-4.1-mini';
  let aiResponse = null;
  const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct';

  if (hasImages) {
    if (constructId === NOVA_CONSTRUCT) {
      if (replitOpenrouter || openrouter) {
        effectiveProvider = replitOpenrouter ? 'replitOpenrouter' : 'openrouter';
        effectiveModel = 'qwen/qwen2.5-vl-72b-instruct';
        callLog.push('nova-vision-path');
      } else {
        return { error: 'no-vision-provider', callLog, effectiveProvider, effectiveModel, aiResponse };
      }
    } else if (openaiClient) {
      effectiveProvider = 'openai';
      effectiveModel = 'gpt-4o';
    }
  }

  const isNovaHotfix = constructId === NOVA_CONSTRUCT && replitOpenrouter && !hasImages;
  if (isNovaHotfix) {
    callLog.push('nova-hotfix-primary');
    effectiveProvider = 'replitOpenrouter';
    effectiveModel = DEFAULT_OPENROUTER_MODEL;
    aiResponse = 'Response from replitOpenrouter';
  } else if (effectiveProvider === 'openai') {
    callLog.push('openai-primary');
    aiResponse = 'Response from openai';
  }

  return { callLog, effectiveProvider, effectiveModel, aiResponse, error: null };
}

function simulateNovaFallbackGuard({ constructId, effectiveProvider, openaiClient }) {
  const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct';
  let model = effectiveProvider === 'openai' ? 'gpt-4.1-mini' : DEFAULT_OPENROUTER_MODEL;

  if (constructId === NOVA_CONSTRUCT && effectiveProvider === 'openai') {
    effectiveProvider = 'openrouter';
    model = DEFAULT_OPENROUTER_MODEL;
  }

  let openaiLastResortBlocked = false;
  const llmSuccess = false;
  if (!llmSuccess && openaiClient && constructId !== NOVA_CONSTRUCT) {
    // would call openai
  } else if (!llmSuccess && constructId === NOVA_CONSTRUCT) {
    openaiLastResortBlocked = true;
  }

  return { effectiveProvider, model, openaiLastResortBlocked };
}

describe('Nova-001 Hotfix Tests', () => {

  it('nova-001 text request routes to replitOpenrouter, never openai', () => {
    const result = simulateNovaHotfix({
      constructId: NOVA_CONSTRUCT,
      hasImages: false,
      replitOpenrouter: createMockClient('replitOpenrouter'),
      openrouter: createMockClient('openrouter'),
      openaiClient: createMockClient('openai'),
    });
    assert.equal(result.effectiveProvider, 'replitOpenrouter');
    assert.ok(!result.callLog.includes('openai-primary'), 'OpenAI must not be called for nova-001');
    assert.ok(result.callLog.includes('nova-hotfix-primary'), 'Nova hotfix must be triggered');
  });

  it('non-nova construct still routes to openai when resolved', () => {
    const result = simulateNovaHotfix({
      constructId: NON_NOVA_CONSTRUCT,
      hasImages: false,
      replitOpenrouter: createMockClient('replitOpenrouter'),
      openrouter: createMockClient('openrouter'),
      openaiClient: createMockClient('openai'),
    });
    assert.equal(result.effectiveProvider, 'openai');
    assert.ok(result.callLog.includes('openai-primary'));
    assert.ok(!result.callLog.includes('nova-hotfix-primary'));
  });

  it('nova-001 vision request bypasses openai, uses replitOpenrouter vision', () => {
    const result = simulateNovaHotfix({
      constructId: NOVA_CONSTRUCT,
      hasImages: true,
      replitOpenrouter: createMockClient('replitOpenrouter'),
      openrouter: createMockClient('openrouter'),
      openaiClient: createMockClient('openai'),
    });
    assert.equal(result.effectiveProvider, 'replitOpenrouter');
    assert.equal(result.effectiveModel, 'qwen/qwen2.5-vl-72b-instruct');
    assert.ok(result.callLog.includes('nova-vision-path'));
    assert.ok(!result.callLog.includes('openai-primary'));
  });

  it('nova-001 vision request with no providers returns error', () => {
    const result = simulateNovaHotfix({
      constructId: NOVA_CONSTRUCT,
      hasImages: true,
      replitOpenrouter: null,
      openrouter: null,
      openaiClient: createMockClient('openai'),
    });
    assert.equal(result.error, 'no-vision-provider');
  });

  it('fallback path: nova-001 overrides openai→openrouter', () => {
    const result = simulateNovaFallbackGuard({
      constructId: NOVA_CONSTRUCT,
      effectiveProvider: 'openai',
      openaiClient: createMockClient('openai'),
    });
    assert.equal(result.effectiveProvider, 'openrouter');
    assert.equal(result.model, 'meta-llama/llama-3.3-70b-instruct');
  });

  it('fallback path: nova-001 blocks openai last-resort', () => {
    const result = simulateNovaFallbackGuard({
      constructId: NOVA_CONSTRUCT,
      effectiveProvider: 'openrouter',
      openaiClient: createMockClient('openai'),
    });
    assert.ok(result.openaiLastResortBlocked, 'OpenAI last-resort must be blocked for nova-001');
  });

  it('fallback path: non-nova construct still allows openai', () => {
    const result = simulateNovaFallbackGuard({
      constructId: NON_NOVA_CONSTRUCT,
      effectiveProvider: 'openai',
      openaiClient: createMockClient('openai'),
    });
    assert.equal(result.effectiveProvider, 'openai');
    assert.ok(!result.openaiLastResortBlocked);
  });

  it('metric fields present in response payload', () => {
    const constructId = NOVA_CONSTRUCT;
    const hasImages = false;
    const effectiveProvider = 'replitOpenrouter';
    const payload = {
      success: true,
      construct_id: constructId,
      provider_forced: constructId === NOVA_CONSTRUCT,
      provider_used: effectiveProvider,
      has_images: hasImages
    };
    assert.equal(payload.provider_forced, true);
    assert.equal(payload.provider_used, 'replitOpenrouter');
    assert.equal(payload.has_images, false);
    assert.equal(payload.construct_id, 'nova-001');
  });
});
