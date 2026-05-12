import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AIManager } from '../lib/aiManager.js';

const aiManager = AIManager.getInstance();

describe('AIManager avatar normalization', () => {
  it('does not invent canonical avatar routes for callsign-only rows', () => {
    const normalized = aiManager.normalizeAvatarUrlForRow({
      id: 'legacy-gpt-row',
      construct_callsign: 'nova-001',
      avatar: null,
    });

    assert.equal(normalized, null);
  });

  it('preserves real avatar evidence and rewrites backend routes to the construct callsign', () => {
    assert.equal(
      aiManager.normalizeAvatarUrlForRow({
        id: 'legacy-gpt-row',
        construct_callsign: 'nova-001',
        avatar: 'instances/nova-001/identity/avatar.png',
      }),
      '/api/ais/nova-001/avatar',
    );

    assert.equal(
      aiManager.normalizeAvatarUrlForRow({
        id: 'legacy-gpt-row',
        construct_callsign: 'nova-001',
        avatar: '/api/ais/legacy-gpt-row/avatar?v=123',
      }),
      '/api/ais/nova-001/avatar',
    );

    assert.equal(
      aiManager.normalizeAvatarUrlForRow({
        id: 'legacy-gpt-row',
        construct_callsign: 'nova-001',
        avatar: 'https://cdn.example.com/nova.png',
      }),
      'https://cdn.example.com/nova.png',
    );
  });
});
