import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyForgedSimLockToRecord,
  buildForgedSimConfigJson,
  buildOllamaLockedModelFromCallsign,
  pickPreferredRuntimeConfigRecord,
  readForgedSimLock,
} from '../lib/forgedSimLock.js';

describe('forgedSimLock', () => {
  it('builds the expected Ollama model name from a construct callsign', () => {
    assert.equal(buildOllamaLockedModelFromCallsign('zen-001'), 'ollama:zen');
    assert.equal(buildOllamaLockedModelFromCallsign('nova-001'), 'ollama:nova');
  });

  it('reads a locked lin-derived sim from configJson', () => {
    const lock = readForgedSimLock({
      constructCallsign: 'zen-001',
      configJson: {
        simLock: {
          locked: true,
          lockedModel: 'ollama:zen',
          forgedFromMode: 'lin',
          modeLabel: 'lin-derived sim',
          source: 'construct_sim_build',
        },
      },
    });

    assert.equal(lock?.locked, true);
    assert.equal(lock?.lockedModel, 'ollama:zen');
    assert.equal(lock?.forgedFromMode, 'lin');
    assert.equal(lock?.modeLabel, 'lin-derived sim');
  });

  it('stamps a record into sim mode when a forged sim lock is present', () => {
    const locked = applyForgedSimLockToRecord({
      constructCallsign: 'zen-001',
      orchestrationMode: 'custom',
      provider: 'openai',
      modelId: 'openai:gpt-4o',
      creativeModel: 'openai:gpt-4o',
      codingModel: 'openai:gpt-4o',
      configJson: buildForgedSimConfigJson({}, {
        constructCallsign: 'zen-001',
        lockedModel: 'ollama:zen',
        forgedFromMode: 'lin',
        modeLabel: 'lin-derived sim',
        source: 'construct_sim_build',
        forgedAt: '2026-05-01T00:00:00.000Z',
      }),
    });

    assert.equal(locked.orchestrationMode, 'sim');
    assert.equal(locked.provider, 'ollama');
    assert.equal(locked.modelId, 'ollama:zen');
    assert.equal(locked.conversationModel, 'ollama:zen');
    assert.equal(locked.creativeModel, 'ollama:zen');
    assert.equal(locked.codingModel, 'ollama:zen');
    assert.equal(locked.configJson?.simLock?.locked, true);
    assert.equal(locked.configJson?.simRefreshContract?.lineage, 'lin-derived sim');
    assert.deepEqual(locked.configJson?.simRefreshContract?.refreshInputs, [
      'identity',
      'settings',
      'knowledge',
      'transcript_calibration',
      'vsi_standards',
    ]);
  });

  it('prefers a forged sim row over a stale preferred-user lin row', () => {
    const stalePreferredUserRow = {
      id: 'gpt-zen-001-seed',
      user_id: 'preferred-user',
      construct_callsign: 'zen-001',
      provider: 'openrouter',
      orchestration_mode: 'lin',
      model_id: 'openrouter:auto',
      updated_at: '2026-04-30T12:00:00.000Z',
      __source_table: 'gpts',
    };
    const forgedSimRow = {
      id: 'gpt-zen-001-forged',
      user_id: 'other-user',
      construct_callsign: 'zen-001',
      provider: 'ollama',
      orchestration_mode: 'sim',
      model_id: 'ollama:zen',
      updated_at: '2026-04-29T12:00:00.000Z',
      config_json: JSON.stringify(buildForgedSimConfigJson({}, {
        constructCallsign: 'zen-001',
        lockedModel: 'ollama:zen',
      })),
      __source_table: 'gpts',
    };

    const picked = pickPreferredRuntimeConfigRecord(
      [stalePreferredUserRow, forgedSimRow],
      { preferredUserIds: ['preferred-user'] },
    );

    assert.equal(picked?.id, 'gpt-zen-001-forged');
  });
});
