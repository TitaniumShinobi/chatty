import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeZenCallsign } from '../lib/zenIdentity.js';

describe('normalizeZenCallsign', () => {
  it('normalizes zen to zen-001', () => {
    const result = normalizeZenCallsign('zen');
    assert.equal(result.ok, true);
    assert.equal(result.normalizedCallsign, 'zen-001');
  });

  it('accepts zen-001 directly', () => {
    const result = normalizeZenCallsign('zen-001');
    assert.equal(result.ok, true);
    assert.equal(result.normalizedCallsign, 'zen-001');
  });

  it('accepts mixed-case alias and normalizes', () => {
    const result = normalizeZenCallsign('Zen-001');
    assert.equal(result.ok, true);
    assert.equal(result.normalizedCallsign, 'zen-001');
  });

  it('rejects non-zen callsigns', () => {
    const result = normalizeZenCallsign('nova-001');
    assert.equal(result.ok, false);
    assert.match(result.error, /invalid callsign/i);
  });

  it('rejects missing or empty callsign', () => {
    const missing = normalizeZenCallsign();
    assert.equal(missing.ok, false);

    const empty = normalizeZenCallsign('');
    assert.equal(empty.ok, false);
  });
});
