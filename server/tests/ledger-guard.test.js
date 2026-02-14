import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeLedgerSessionCount } from '../lib/memoryContextBuilder.js';

describe('safeLedgerSessionCount (production code path)', () => {

  it('handles undefined ledger without throwing', () => {
    assert.equal(safeLedgerSessionCount(undefined), 0);
  });

  it('handles null ledger without throwing', () => {
    assert.equal(safeLedgerSessionCount(null), 0);
  });

  it('handles truthy ledger with missing sessions property', () => {
    assert.equal(safeLedgerSessionCount({ someOtherProp: true }), 0);
  });

  it('handles truthy ledger with sessions = null', () => {
    assert.equal(safeLedgerSessionCount({ sessions: null }), 0);
  });

  it('handles truthy ledger with sessions = undefined', () => {
    assert.equal(safeLedgerSessionCount({ sessions: undefined }), 0);
  });

  it('handles truthy ledger with empty sessions array', () => {
    assert.equal(safeLedgerSessionCount({ sessions: [] }), 0);
  });

  it('handles truthy ledger with populated sessions array', () => {
    assert.equal(safeLedgerSessionCount({ sessions: [{ id: 1 }, { id: 2 }, { id: 3 }] }), 3);
  });

  it('does not throw for non-array sessions', () => {
    assert.doesNotThrow(() => safeLedgerSessionCount({ sessions: 'not-an-array' }));
  });
});
