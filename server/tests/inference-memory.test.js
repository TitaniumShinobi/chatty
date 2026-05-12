import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeMetadataIntoGptConfig,
  applyRequestModelOverride,
  buildMetadataRecoveryDefaults,
} from '../lib/inferenceMemory.js';

describe('mergeMetadataIntoGptConfig', () => {
  it('returns gptConfig unchanged when meta is null', () => {
    const config = { modelId: 'gpt-4' };
    const result = mergeMetadataIntoGptConfig(config, null);
    assert.equal(result, config);
  });

  it('returns gptConfig unchanged when meta is undefined', () => {
    const config = { modelId: 'gpt-4' };
    const result = mergeMetadataIntoGptConfig(config, undefined);
    assert.equal(result, config);
  });

  it('returns a new object merging meta fields into gptConfig', () => {
    const config = { modelId: 'gpt-4', provider: 'openai' };
    const meta = { model: 'claude-3', provider: 'anthropic' };
    const result = mergeMetadataIntoGptConfig(config, meta);
    assert.notEqual(result, config);
    assert.equal(result.modelId, 'anthropic:claude-3');
    assert.equal(result.provider, 'anthropic');
  });

  it('preserves existing gptConfig fields not overridden by meta', () => {
    const config = { modelId: 'gpt-4', temperature: 0.7, maxTokens: 2000 };
    const meta = { model: 'claude-3' };
    const result = mergeMetadataIntoGptConfig(config, meta);
    assert.equal(result.temperature, 0.7);
    assert.equal(result.maxTokens, 2000);
  });

  it('combines provider and model when model lacks colon and both exist', () => {
    const config = {};
    const meta = { model: 'claude-3', provider: 'anthropic' };
    const result = mergeMetadataIntoGptConfig(config, meta);
    assert.equal(result.modelId, 'anthropic:claude-3');
    assert.equal(result.conversationModel, 'anthropic:claude-3');
  });

  it('does not combine provider and model when model already contains a colon', () => {
    const config = {};
    const meta = { model: 'anthropic:claude-3', provider: 'custom' };
    const result = mergeMetadataIntoGptConfig(config, meta);
    assert.equal(result.modelId, 'anthropic:claude-3');
    assert.equal(result.conversationModel, 'anthropic:claude-3');
  });

  it('sets modelId from meta.model when no provider or model has colon', () => {
    const config = {};
    const meta = { model: 'gpt-4' };
    const result = mergeMetadataIntoGptConfig(config, meta);
    assert.equal(result.modelId, 'gpt-4');
    assert.equal(result.conversationModel, 'gpt-4');
  });

  it('falls back avatarUrl to meta.avatarUrl then gptConfig.avatarUrl then gptConfig.avatar', () => {
    const result = mergeMetadataIntoGptConfig(
      { avatarUrl: 'url1', avatar: 'avatar1' },
      { avatarUrl: 'meta-avatar' }
    );
    assert.equal(result.avatarUrl, 'meta-avatar');
  });

  it('falls back avatarUrl to gptConfig.avatarUrl when meta.avatarUrl absent', () => {
    const result = mergeMetadataIntoGptConfig({ avatarUrl: 'url1', avatar: 'avatar1' }, {});
    assert.equal(result.avatarUrl, 'url1');
  });

  it('falls back avatarUrl to gptConfig.avatar when meta.avatarUrl and gptConfig.avatarUrl absent', () => {
    const result = mergeMetadataIntoGptConfig({ avatar: 'avatar1' }, {});
    assert.equal(result.avatarUrl, 'avatar1');
  });

  it('sets avatarUrl to undefined when no avatar available', () => {
    const result = mergeMetadataIntoGptConfig({}, {});
    assert.equal(result.avatarUrl, undefined);
  });

  it('merges coderModel, coderProvider, capabilities, tags, categories, systemPromptOverride, configJson', () => {
    const config = {};
    const meta = {
      coderModel: 'codestral',
      coderProvider: 'mistral',
      capabilities: ['vision'],
      tags: ['beta'],
      categories: ['chat'],
      systemPromptOverride: 'you are a test',
      configJson: '{"key":"val"}',
    };
    const result = mergeMetadataIntoGptConfig(config, meta);
    assert.equal(result.coderModel, 'codestral');
    assert.equal(result.coderProvider, 'mistral');
    assert.deepEqual(result.capabilities, ['vision']);
    assert.deepEqual(result.tags, ['beta']);
    assert.deepEqual(result.categories, ['chat']);
    assert.equal(result.systemPromptOverride, 'you are a test');
    assert.equal(result.configJson, '{"key":"val"}');
  });

  it('preserves gptConfig fallbacks for fields not in meta', () => {
    const config = {
      coderModel: 'gpt-4',
      coderProvider: 'openai',
      capabilities: ['audio'],
      tags: ['stable'],
      categories: ['general'],
      systemPromptOverride: 'default prompt',
      configJson: '{"default":true}',
    };
    const result = mergeMetadataIntoGptConfig(config, {});
    assert.equal(result.coderModel, 'gpt-4');
    assert.equal(result.coderProvider, 'openai');
    assert.deepEqual(result.capabilities, ['audio']);
    assert.deepEqual(result.tags, ['stable']);
    assert.deepEqual(result.categories, ['general']);
    assert.equal(result.systemPromptOverride, 'default prompt');
    assert.equal(result.configJson, '{"default":true}');
  });
});

describe('applyRequestModelOverride', () => {
  it('returns gptConfig unchanged when requestModelOverride is null', () => {
    const config = { modelId: 'gpt-4', provider: 'openai' };
    const result = applyRequestModelOverride(config, null);
    assert.equal(result, config);
  });

  it('returns gptConfig unchanged when requestModelOverride is undefined', () => {
    const config = { modelId: 'gpt-4', provider: 'openai' };
    const result = applyRequestModelOverride(config, undefined);
    assert.equal(result, config);
  });

  it('returns gptConfig unchanged when requestModelOverride is not a string', () => {
    const config = { modelId: 'gpt-4', provider: 'openai' };
    const result = applyRequestModelOverride(config, 42);
    assert.equal(result, config);
  });

  it('sets modelId and conversationModel when requestModelOverride is a plain string', () => {
    const config = { modelId: 'gpt-4', provider: 'openai' };
    const result = applyRequestModelOverride(config, 'claude-3');
    assert.equal(result.modelId, 'claude-3');
    assert.equal(result.conversationModel, 'claude-3');
  });

  it('preserves provider from gptConfig when requestProviderOverride not given', () => {
    const config = { modelId: 'gpt-4', provider: 'openai' };
    const result = applyRequestModelOverride(config, 'claude-3');
    assert.equal(result.provider, 'openai');
  });

  it('combines requestProviderOverride with model when model lacks colon', () => {
    const config = { modelId: 'gpt-4', provider: 'openai' };
    const result = applyRequestModelOverride(config, 'claude-3', 'anthropic');
    assert.equal(result.modelId, 'anthropic:claude-3');
    assert.equal(result.conversationModel, 'anthropic:claude-3');
  });

  it('uses model as-is when model contains colon even with provider override', () => {
    const config = { modelId: 'gpt-4', provider: 'openai' };
    const result = applyRequestModelOverride(config, 'anthropic:claude-3', 'custom');
    assert.equal(result.modelId, 'anthropic:claude-3');
    assert.equal(result.conversationModel, 'anthropic:claude-3');
  });

  it('sets provider to requestProviderOverride when given', () => {
    const config = { modelId: 'gpt-4', provider: 'openai' };
    const result = applyRequestModelOverride(config, 'claude-3', 'anthropic');
    assert.equal(result.provider, 'anthropic');
  });

  it('preserves other gptConfig fields', () => {
    const config = { modelId: 'gpt-4', temperature: 0.7, maxTokens: 2000 };
    const result = applyRequestModelOverride(config, 'claude-3');
    assert.equal(result.temperature, 0.7);
    assert.equal(result.maxTokens, 2000);
  });
});

describe('buildMetadataRecoveryDefaults', () => {
  it('returns standard profile when boundedZenSmalltalkRoute is false', () => {
    const result = buildMetadataRecoveryDefaults(false);
    assert.equal(result.profile, 'standard');
  });

  it('returns standard profile when boundedZenSmalltalkRoute is null', () => {
    const result = buildMetadataRecoveryDefaults(null);
    assert.equal(result.profile, 'standard');
  });

  it('returns zen_smalltalk_bounded profile when boundedZenSmalltalkRoute is true', () => {
    const result = buildMetadataRecoveryDefaults(true);
    assert.equal(result.profile, 'zen_smalltalk_bounded');
  });

  it('returns attempted set to false', () => {
    const result = buildMetadataRecoveryDefaults(false);
    assert.equal(result.attempted, false);
  });

  it('returns applied set to false', () => {
    const result = buildMetadataRecoveryDefaults(false);
    assert.equal(result.applied, false);
  });

  it('returns status as not_attempted', () => {
    const result = buildMetadataRecoveryDefaults(false);
    assert.equal(result.status, 'not_attempted');
  });

  it('returns timeout_ms as null', () => {
    const result = buildMetadataRecoveryDefaults(false);
    assert.equal(result.timeout_ms, null);
  });

  it('returns fallback_source as null', () => {
    const result = buildMetadataRecoveryDefaults(false);
    assert.equal(result.fallback_source, null);
  });

  it('returns correct defaults with zen_smalltalk_bounded profile', () => {
    const result = buildMetadataRecoveryDefaults(true);
    assert.deepEqual(result, {
      attempted: false,
      applied: false,
      profile: 'zen_smalltalk_bounded',
      status: 'not_attempted',
      timeout_ms: null,
      fallback_source: null,
    });
  });

  it('returns correct defaults with standard profile', () => {
    const result = buildMetadataRecoveryDefaults(false);
    assert.deepEqual(result, {
      attempted: false,
      applied: false,
      profile: 'standard',
      status: 'not_attempted',
      timeout_ms: null,
      fallback_source: null,
    });
  });
});
