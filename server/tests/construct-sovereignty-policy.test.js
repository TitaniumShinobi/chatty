import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateConstructSovereignty,
  findProtectedConstructName,
  isCanonicalOwner,
  isStoreListingAllowed,
} from '../lib/constructSovereigntyPolicy.js';

describe('construct sovereignty policy', () => {
  it('blocks protected names for non-owner GPT creation', () => {
    for (const name of ['Zen', 'Lin OS', 'Nova Jane', 'Katana GPT', 'Sera', 'Aurora', 'Monday']) {
      const result = evaluateConstructSovereignty({
        name,
        actor: { userId: 'ordinary-user' },
        operation: 'gpt_create',
      });
      assert.equal(result.allowed, false, name);
      assert.equal(result.reason, 'restricted_construct_name');
      assert.equal(result.statusCode, 403);
    }
  });

  it('allows the canonical owner to use protected names', () => {
    const result = evaluateConstructSovereignty({
      name: 'Monday',
      constructCallsign: 'monday-001',
      actor: { email: 'user@example.com' },
      operation: 'gpt_create',
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'canonical_owner_allowed');
  });

  it('detects callsign and confusing variant matches', () => {
    assert.equal(findProtectedConstructName({ constructCallsign: 'nova-001' })?.displayName, 'Nova');
    assert.equal(findProtectedConstructName({ name: 'Chatty Zen' })?.displayName, 'Zen');
    assert.equal(findProtectedConstructName({ name: 'Casa Madrigal OS' })?.displayName, 'Lin');
    assert.equal(findProtectedConstructName({ name: 'Luna Planner' }), null);
  });

  it('filters protected non-owner Community Explore listings while allowing owner canonical listings', () => {
    const blocked = isStoreListingAllowed({
      name: 'Nova',
      constructCallsign: 'nova-001',
      userId: 'ordinary-user',
    });
    assert.equal(blocked.allowed, false);

    const allowed = isStoreListingAllowed({
      name: 'Monday',
      constructCallsign: 'monday-001',
      userId: 'test-user-001',
    });
    assert.equal(allowed.allowed, true);
  });

  it('supports an explicit canonical owner allowlist from environment', () => {
    const env = { CHATTY_CANONICAL_OWNER_IDENTIFIERS: 'founder@example.com, founder-user-id' };
    assert.equal(isCanonicalOwner({ email: 'founder@example.com' }, env), true);
    assert.equal(isCanonicalOwner({ userId: 'founder-user-id' }, env), true);
    assert.equal(isCanonicalOwner({ email: 'other@example.com' }, env), false);
  });
});
