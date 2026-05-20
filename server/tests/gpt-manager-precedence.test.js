import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRuntimeRowsForCallsign } from '../lib/gptManager.js';

describe('GPTManager callsign precedence', () => {
  it('hydrates model and instructions from gpts when ais row uses placeholders', () => {
    const aiRow = {
      id: 'nova-001',
      construct_callsign: 'nova-001',
      model_id: 'openrouter/auto',
      conversation_model: 'openrouter:auto',
      creative_model: '',
      coding_model: null,
      instructions: '   ',
    };
    const gptRow = {
      id: 'gpt-nova-001-seed',
      construct_callsign: 'nova-001',
      model_id: 'openrouter:meta-llama/llama-3.3-70b-instruct',
      conversation_model: 'openrouter:meta-llama/llama-3.3-70b-instruct',
      creative_model: 'openrouter:meta-llama/llama-3.3-70b-instruct',
      coding_model: 'openrouter:phind/phind-codellama-34b',
      instructions: 'You are Nova.',
    };

    const merged = mergeRuntimeRowsForCallsign(aiRow, gptRow);
    assert.equal(merged.model_id, gptRow.model_id);
    assert.equal(merged.conversation_model, gptRow.conversation_model);
    assert.equal(merged.creative_model, gptRow.creative_model);
    assert.equal(merged.coding_model, gptRow.coding_model);
    assert.equal(merged.instructions, gptRow.instructions);
  });

  it('keeps explicit ais values authoritative', () => {
    const aiRow = {
      id: 'nova-001',
      construct_callsign: 'nova-001',
      model_id: 'openrouter:anthropic/claude-sonnet-4',
      conversation_model: 'openrouter:anthropic/claude-sonnet-4',
      creative_model: 'openrouter:anthropic/claude-sonnet-4',
      coding_model: 'openrouter:anthropic/claude-sonnet-4',
      instructions: 'AIS authored instructions',
    };
    const gptRow = {
      id: 'gpt-nova-001-seed',
      construct_callsign: 'nova-001',
      model_id: 'openrouter:meta-llama/llama-3.3-70b-instruct',
      conversation_model: 'openrouter:meta-llama/llama-3.3-70b-instruct',
      creative_model: 'openrouter:meta-llama/llama-3.3-70b-instruct',
      coding_model: 'openrouter:phind/phind-codellama-34b',
      instructions: 'GPT seeded instructions',
    };

    const merged = mergeRuntimeRowsForCallsign(aiRow, gptRow);
    assert.equal(merged.model_id, aiRow.model_id);
    assert.equal(merged.conversation_model, aiRow.conversation_model);
    assert.equal(merged.creative_model, aiRow.creative_model);
    assert.equal(merged.coding_model, aiRow.coding_model);
    assert.equal(merged.instructions, aiRow.instructions);
  });

  it('lets a sim-locked gpt row override a stale ai base row', () => {
    const aiRow = {
      id: 'zen-001',
      construct_callsign: 'zen-001',
      provider: 'openrouter',
      orchestration_mode: 'lin',
      model_id: 'openrouter:auto',
      conversation_model: 'openrouter:auto',
      creative_model: 'openrouter:auto',
      coding_model: 'openrouter:auto',
      instructions: 'Lin seed instructions',
      updated_at: '2026-04-30T12:00:00.000Z',
      __source_table: 'ais',
    };
    const gptRow = {
      id: 'gpt-zen-001-forged',
      construct_callsign: 'zen-001',
      provider: 'ollama',
      orchestration_mode: 'sim',
      model_id: 'ollama:zen',
      conversation_model: 'ollama:zen',
      creative_model: 'ollama:zen',
      coding_model: 'ollama:zen',
      instructions: 'Zen forged instructions',
      updated_at: '2026-04-29T12:00:00.000Z',
      config_json: JSON.stringify({
        simLock: {
          locked: true,
          lockedModel: 'ollama:zen',
        },
      }),
      __source_table: 'gpts',
    };

    const merged = mergeRuntimeRowsForCallsign(aiRow, gptRow);

    assert.equal(merged.id, gptRow.id);
    assert.equal(merged.provider, gptRow.provider);
    assert.equal(merged.orchestration_mode, gptRow.orchestration_mode);
    assert.equal(merged.model_id, gptRow.model_id);
    assert.equal(merged.instructions, gptRow.instructions);
  });
});
