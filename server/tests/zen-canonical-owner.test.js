import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCanonicalConstructDataOwner,
  ZEN_CANONICAL_OWNER_EMAIL,
  ZEN_CANONICAL_OWNER_SUPABASE_USER_ID,
  ZEN_CANONICAL_THREAD_ID,
  ZEN_CANONICAL_TRANSCRIPT_PATH,
  LIN_CANONICAL_OWNER_EMAIL,
  LIN_CANONICAL_OWNER_VVAULT_USER_ID,
  LIN_CANONICAL_THREAD_ID,
  LIN_CANONICAL_TRANSCRIPT_PATH,
  VAL_CANONICAL_OWNER_EMAIL,
  VAL_CANONICAL_OWNER_SUPABASE_USER_ID,
  VAL_CANONICAL_THREAD_ID,
  VAL_CANONICAL_TRANSCRIPT_PATH,
  KATANA_CANONICAL_OWNER_EMAIL,
  KATANA_CANONICAL_OWNER_SUPABASE_USER_ID,
  KATANA_CANONICAL_THREAD_ID,
  KATANA_CANONICAL_TRANSCRIPT_PATH,
  SERA_CANONICAL_OWNER_EMAIL,
  SERA_CANONICAL_OWNER_SUPABASE_USER_ID,
  SERA_CANONICAL_THREAD_ID,
  SERA_CANONICAL_TRANSCRIPT_PATH,
  NOVA_CANONICAL_OWNER_EMAIL,
  NOVA_CANONICAL_OWNER_SUPABASE_USER_ID,
  NOVA_CANONICAL_THREAD_ID,
  NOVA_CANONICAL_TRANSCRIPT_PATH,
} from '../lib/canonicalConstructOwner.js';

describe('Zen canonical owner resolution', () => {
  it('forces the canonical Zen Chatty thread to the canonical owner', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'zen-001',
      sessionId: ZEN_CANONICAL_THREAD_ID,
      requestedDataOwnerUserId: 'f9490a89-199f-47ea-940b-0987ed254294',
      requestedDataOwnerSource: 'supabase_session',
      authenticatedUserId: 'f9490a89-199f-47ea-940b-0987ed254294',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, ZEN_CANONICAL_OWNER_SUPABASE_USER_ID);
    assert.equal(result.dataOwnerSource, 'canonical_zen_chatty_owner');
    assert.equal(result.receipt.canonicalOwnerEmail, ZEN_CANONICAL_OWNER_EMAIL);
    assert.equal(result.receipt.requestedDataOwnerUserId, 'f9490a89-199f-47ea-940b-0987ed254294');
    assert.equal(result.receipt.finalDataOwnerUserId, ZEN_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('treats missing thread id as the default canonical Zen Chatty thread', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'zen',
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, ZEN_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('forces the canonical Lin Chatty thread to the canonical owner', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'lin-001',
      sessionId: LIN_CANONICAL_THREAD_ID,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
      authenticatedUserId: 'devon_woodson_1762969514958',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, LIN_CANONICAL_OWNER_VVAULT_USER_ID);
    assert.equal(result.dataOwnerSource, 'canonical_lin_chatty_owner');
    assert.equal(result.receipt.canonicalOwnerEmail, LIN_CANONICAL_OWNER_EMAIL);
    assert.equal(result.receipt.finalDataOwnerUserId, LIN_CANONICAL_OWNER_VVAULT_USER_ID);
  });

  it('does not override non-canonical Zen project transcripts', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'zen-001',
      sessionId: 'zen-001_project_hydro_chat',
      projectName: 'Project Hydro',
      transcriptPath: 'instances/zen-001/code/project_hydro_chat.md',
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'supabase_session',
    });

    assert.equal(result.applied, false);
    assert.equal(result.dataOwnerUserId, 'qa-owner');
  });

  it('allows the explicit canonical transcript path', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'zen-001',
      transcriptPath: ZEN_CANONICAL_TRANSCRIPT_PATH,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'supabase_session',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, ZEN_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('allows the explicit canonical Lin transcript path', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'lin-001',
      transcriptPath: LIN_CANONICAL_TRANSCRIPT_PATH,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, LIN_CANONICAL_OWNER_VVAULT_USER_ID);
  });

  it('forces the canonical Val Chatty thread to the canonical owner', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'val-001',
      sessionId: VAL_CANONICAL_THREAD_ID,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
      authenticatedUserId: 'devon_woodson_1762969514958',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, VAL_CANONICAL_OWNER_SUPABASE_USER_ID);
    assert.equal(result.dataOwnerSource, 'canonical_val_chatty_owner');
    assert.equal(result.receipt.canonicalOwnerEmail, VAL_CANONICAL_OWNER_EMAIL);
    assert.equal(result.receipt.finalDataOwnerUserId, VAL_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('allows the explicit canonical Val transcript path', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'val-001',
      transcriptPath: VAL_CANONICAL_TRANSCRIPT_PATH,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, VAL_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('forces the canonical Katana Chatty thread to the canonical owner', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'katana-001',
      sessionId: KATANA_CANONICAL_THREAD_ID,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, KATANA_CANONICAL_OWNER_SUPABASE_USER_ID);
    assert.equal(result.dataOwnerSource, 'canonical_katana_chatty_owner');
    assert.equal(result.receipt.canonicalOwnerEmail, KATANA_CANONICAL_OWNER_EMAIL);
    assert.equal(result.receipt.finalDataOwnerUserId, KATANA_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('allows the explicit canonical Katana transcript path', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'katana-001',
      transcriptPath: KATANA_CANONICAL_TRANSCRIPT_PATH,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, KATANA_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('forces the canonical Sera Chatty thread to the canonical owner', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'sera-001',
      sessionId: SERA_CANONICAL_THREAD_ID,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, SERA_CANONICAL_OWNER_SUPABASE_USER_ID);
    assert.equal(result.dataOwnerSource, 'canonical_sera_chatty_owner');
    assert.equal(result.receipt.canonicalOwnerEmail, SERA_CANONICAL_OWNER_EMAIL);
    assert.equal(result.receipt.finalDataOwnerUserId, SERA_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('allows the explicit canonical Sera transcript path', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'sera-001',
      transcriptPath: SERA_CANONICAL_TRANSCRIPT_PATH,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, SERA_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('forces the canonical Nova Chatty thread to the canonical owner', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'nova-001',
      sessionId: NOVA_CANONICAL_THREAD_ID,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, NOVA_CANONICAL_OWNER_SUPABASE_USER_ID);
    assert.equal(result.dataOwnerSource, 'canonical_nova_chatty_owner');
    assert.equal(result.receipt.canonicalOwnerEmail, NOVA_CANONICAL_OWNER_EMAIL);
    assert.equal(result.receipt.finalDataOwnerUserId, NOVA_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('allows the explicit canonical Nova transcript path', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'nova-001',
      transcriptPath: NOVA_CANONICAL_TRANSCRIPT_PATH,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'app_jwt_dev_fallback',
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, NOVA_CANONICAL_OWNER_SUPABASE_USER_ID);
  });

  it('keeps the current dev canonical owner behind the resolver constant', () => {
    assert.equal(
      ZEN_CANONICAL_OWNER_SUPABASE_USER_ID,
      '7e34f6b8-e33a-48b5-8ddb-95b94d18e296'
    );
  });

  it('allows a narrowly named env override without changing route code', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'zen-001',
      sessionId: ZEN_CANONICAL_THREAD_ID,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'supabase_session',
      env: {
        CHATTY_ZEN_CANONICAL_OWNER_SUPABASE_USER_ID:
          '11111111-2222-3333-4444-555555555555',
      },
    });

    assert.equal(result.applied, true);
    assert.equal(result.dataOwnerUserId, '11111111-2222-3333-4444-555555555555');
    assert.equal(result.receipt.finalDataOwnerUserId, '11111111-2222-3333-4444-555555555555');
  });

  it('fails closed when the canonical Zen owner uuid is explicitly unavailable', () => {
    const result = resolveCanonicalConstructDataOwner({
      constructId: 'zen-001',
      sessionId: ZEN_CANONICAL_THREAD_ID,
      requestedDataOwnerUserId: 'qa-owner',
      requestedDataOwnerSource: 'supabase_session',
      env: {
        CHATTY_ZEN_CANONICAL_OWNER_SUPABASE_USER_ID: '',
        CANONICAL_OWNER_SUPABASE_USER_ID: '',
      },
    });

    assert.equal(result.applied, true);
    assert.equal(result.ready, false);
    assert.equal(result.dataOwnerUserId, null);
    assert.equal(result.receipt.finalDataOwnerUserId, null);
    assert.equal(result.receipt.failureReason, 'canonical_owner_unconfigured');
  });
});
