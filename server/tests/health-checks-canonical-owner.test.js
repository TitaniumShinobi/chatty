import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkCanonicalOwnerHealth } from '../lib/healthChecks.js';

describe('canonical owner health checks', () => {
  it('reports ready when the local fallback canonical owner is available', () => {
    const result = checkCanonicalOwnerHealth();

    assert.equal(result.ok, true);
    assert.equal(result.detail.configured, true);
    assert.equal(
      result.detail.canonicalOwnerSupabaseUserId,
      '7e34f6b8-e33a-48b5-8ddb-95b94d18e296',
    );
  });

  it('fails when the canonical owner uuid is explicitly unset', () => {
    const result = checkCanonicalOwnerHealth({
      CANONICAL_OWNER_SUPABASE_USER_ID: '',
      CHATTY_CANONICAL_OWNER_SUPABASE_USER_ID: '',
      CHATTY_ZEN_CANONICAL_OWNER_SUPABASE_USER_ID: '',
    });

    assert.equal(result.ok, false);
    assert.equal(result.detail.configured, false);
    assert.equal(result.detail.canonicalOwnerSupabaseUserId, null);
  });
});
