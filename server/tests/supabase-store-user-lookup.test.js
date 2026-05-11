import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeUserLookupContext } from '../../vvaultConnector/supabaseStore.mjs';

describe('Supabase store user lookup normalization', () => {
  it('does not treat a Chatty/LIFE user id as a Supabase UUID', () => {
    const lookup = normalizeUserLookupContext('devon_woodson_1774390416168');

    assert.equal(lookup.userId, 'devon_woodson_1774390416168');
    assert.equal(lookup.userEmail, null);
    assert.equal(lookup.supabaseUserId, null);
    assert.equal(lookup.primaryLookupId, 'devon_woodson_1774390416168');
  });

  it('preserves a real Supabase UUID as the direct lookup target', () => {
    const lookup = normalizeUserLookupContext('7e34f6b8-e33a-48b5-8ddb-95b94d18e296');

    assert.equal(lookup.userId, '7e34f6b8-e33a-48b5-8ddb-95b94d18e296');
    assert.equal(lookup.userEmail, null);
    assert.equal(lookup.supabaseUserId, '7e34f6b8-e33a-48b5-8ddb-95b94d18e296');
    assert.equal(lookup.primaryLookupId, '7e34f6b8-e33a-48b5-8ddb-95b94d18e296');
  });
});
