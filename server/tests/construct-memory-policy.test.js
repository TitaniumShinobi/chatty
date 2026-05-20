import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getHistoricalMemorySources,
  isLinOrchestratedConstruct,
  matchesHistoricalSourcePolicy,
  usesCanonicalChattyHistory,
} from '../lib/constructMemoryPolicy.js';

describe('constructMemoryPolicy', () => {
  it('maps construct-specific historical memory sources', () => {
    assert.deepEqual(getHistoricalMemorySources('zen-001'), ['chatty']);
    assert.deepEqual(getHistoricalMemorySources('lin'), ['chatty']);
    assert.deepEqual(getHistoricalMemorySources('nova-001'), ['chatgpt']);
    assert.deepEqual(getHistoricalMemorySources('katana'), ['chatgpt']);
    assert.deepEqual(getHistoricalMemorySources('sera-001'), ['character.ai']);
    assert.deepEqual(getHistoricalMemorySources('val-001'), ['chatty', 'validation']);
  });

  it('treats the six target constructs as Lin-orchestrated', () => {
    for (const constructId of ['zen-001', 'lin-001', 'katana-001', 'sera-001', 'nova-001', 'val-001']) {
      assert.equal(isLinOrchestratedConstruct(constructId), true);
    }
  });

  it('allows canonical chatty history only for zen, lin, and val', () => {
    assert.equal(usesCanonicalChattyHistory('zen-001'), true);
    assert.equal(usesCanonicalChattyHistory('lin-001'), true);
    assert.equal(usesCanonicalChattyHistory('val-001'), true);
    assert.equal(usesCanonicalChattyHistory('nova-001'), false);
    assert.equal(usesCanonicalChattyHistory('katana-001'), false);
    assert.equal(usesCanonicalChattyHistory('sera-001'), false);
  });

  it('matches files against the correct historical source policy', () => {
    assert.equal(matchesHistoricalSourcePolicy({
      filename: 'instances/zen-001/chatty/chat_with_zen-001.md',
      metadata: { source: 'chatty' },
    }, 'zen-001'), true);

    assert.equal(matchesHistoricalSourcePolicy({
      filename: 'instances/nova-001/chatty/chat_with_nova-001.md',
      metadata: { source: 'chatty' },
    }, 'nova-001'), false);

    assert.equal(matchesHistoricalSourcePolicy({
      filename: 'instances/nova-001/chatgpt/history.md',
      metadata: { source: 'chatgpt' },
    }, 'nova-001'), true);

    assert.equal(matchesHistoricalSourcePolicy({
      filename: 'instances/sera-001/character.ai/session.md',
      metadata: { source: 'character_ai' },
    }, 'sera-001'), true);

    assert.equal(matchesHistoricalSourcePolicy({
      filename: 'instances/val-001/validation/dispositions/report.md',
      metadata: { source: 'validation' },
    }, 'val-001'), true);
  });
});
