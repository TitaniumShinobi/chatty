import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalizeConstructId } from '../lib/constructId.js';
import { resolveConstructWithPathExists } from '../lib/vvaultRegistry.js';

describe('canonicalizeConstructId', () => {
  it('keeps canonical ids unchanged', () => {
    assert.equal(canonicalizeConstructId('nova-001'), 'nova-001');
  });

  it('strips repeated prefixes', () => {
    assert.equal(canonicalizeConstructId('gpt-nova-001'), 'nova-001');
    assert.equal(canonicalizeConstructId('ai.gpt.katana-001'), 'katana-001');
  });

  it('collapses seed and variant suffix chains after the revision token', () => {
    assert.equal(canonicalizeConstructId('gpt-nova-001-seed'), 'nova-001');
    assert.equal(canonicalizeConstructId('gpt-lin-001-seed-clone'), 'lin-001');
    assert.equal(canonicalizeConstructId('katana-001-draft'), 'katana-001');
  });

  it('preserves canonical ids that include numeric segments before the final revision token', () => {
    assert.equal(
      canonicalizeConstructId('avatar-webp-alias-862214-001'),
      'avatar-webp-alias-862214-001',
    );
  });

  it('defaults ids without a numeric revision token to callsign 001', () => {
    assert.equal(canonicalizeConstructId('custom-bot'), 'custom-bot-001');
  });

  it('returns an empty string for nullish or blank values', () => {
    assert.equal(canonicalizeConstructId('   '), '');
    assert.equal(canonicalizeConstructId(null), '');
    assert.equal(canonicalizeConstructId(undefined), '');
  });
});

describe('resolveConstructWithPathExists', () => {
  it('queries canonical storage paths for variant ids', async () => {
    const calls = [];
    const construct = await resolveConstructWithPathExists(
      'gpt-nova-001-seed',
      'user-123',
      async (rootPath) => {
        calls.push(rootPath);
        return rootPath === 'intelligences/shard_0000/nova-001';
      },
    );

    assert.deepEqual(calls, ['intelligences/shard_0000/nova-001']);
    assert.equal(construct?.id, 'nova-001');
    assert.equal(construct?.rootPath, 'intelligences/shard_0000/nova-001');
    assert.ok(!calls.some((rootPath) => rootPath.includes('nova-001-seed')));
  });
});
