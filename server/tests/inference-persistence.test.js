import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveConversationTitle,
  normalizeTranscriptPath,
  buildCanonicalTranscriptWriteTargetPath,
  isCanonicalConstructTranscriptWrite,
  isCanonicalLinTranscriptWrite,
  requiresVvaultBodyPersistence,
  buildPersistenceRoleResult,
  buildPersistenceFailurePayloadFactory,
} from '../lib/inferencePersistence.js';

describe('inferencePersistence', () => {
  describe('resolveConversationTitle', () => {
    it('returns projectName suffixed with Hydro when projectName exists', () => {
      const meta = { projectName: 'Zen' };
      assert.equal(resolveConversationTitle(meta, 'fallback'), 'Zen Hydro');
    });

    it('returns constructName when projectName is undefined', () => {
      assert.equal(resolveConversationTitle({}, 'Katana'), 'Katana');
    });

    it('returns constructName when canonicalTurnMetadata is null', () => {
      assert.equal(resolveConversationTitle(null, 'Lin'), 'Lin');
    });

    it('returns constructName when canonicalTurnMetadata is undefined', () => {
      assert.equal(resolveConversationTitle(undefined, 'Bushido'), 'Bushido');
    });

    it('returns constructName when projectName is empty string', () => {
      const meta = { projectName: '' };
      assert.equal(resolveConversationTitle(meta, 'Empty'), 'Empty');
    });

    it('handles projectName with special characters', () => {
      const meta = { projectName: 'My-Project_123' };
      assert.equal(resolveConversationTitle(meta, 'x'), 'My-Project_123 Hydro');
    });
  });

  describe('normalizeTranscriptPath', () => {
    it('uses canonicalTurnMetadata.transcriptPath when available', () => {
      const meta = { transcriptPath: '/canonical/path.md' };
      assert.equal(normalizeTranscriptPath('/original/path.md', meta), 'canonical/path.md');
    });

    it('falls back to transcriptPath arg when no canonical metadata', () => {
      assert.equal(normalizeTranscriptPath('/user/path.md', {}), 'user/path.md');
    });

    it('falls back to transcriptPath arg when canonicalTurnMetadata is null', () => {
      assert.equal(normalizeTranscriptPath('/fallback/path.md', null), 'fallback/path.md');
    });

    it('falls back to transcriptPath arg when canonicalTurnMetadata is undefined', () => {
      assert.equal(normalizeTranscriptPath('/fallback/path.md', undefined), 'fallback/path.md');
    });

    it('strips leading slashes', () => {
      assert.equal(normalizeTranscriptPath('///triple/slash.md', {}), 'triple/slash.md');
    });

    it('trims whitespace', () => {
      assert.equal(normalizeTranscriptPath('  /path/with/spaces.md  ', {}), 'path/with/spaces.md');
    });

    it('trims and strips slashes on canonical path', () => {
      const meta = { transcriptPath: '  //canonical/trim.md  ' };
      assert.equal(normalizeTranscriptPath('/ignored.md', meta), 'canonical/trim.md');
    });

    it('returns empty string when both inputs are missing', () => {
      assert.equal(normalizeTranscriptPath(undefined, {}), '');
    });

    it('returns empty string when both inputs are null', () => {
      assert.equal(normalizeTranscriptPath(null, null), '');
    });
  });

  describe('buildCanonicalTranscriptWriteTargetPath', () => {
    it('builds path for zen-001', () => {
      assert.equal(
        buildCanonicalTranscriptWriteTargetPath('zen-001'),
        'instances/zen-001/chatty/chat_with_zen-001.md',
      );
    });

    it('builds path for lin-001', () => {
      assert.equal(
        buildCanonicalTranscriptWriteTargetPath('lin-001'),
        'instances/lin-001/chatty/chat_with_lin-001.md',
      );
    });

    it('builds path for construct with hyphens', () => {
      assert.equal(
        buildCanonicalTranscriptWriteTargetPath('my-construct-42'),
        'instances/my-construct-42/chatty/chat_with_my-construct-42.md',
      );
    });
  });

  describe('isCanonicalConstructTranscriptWrite', () => {
    const makeCanonicalTarget = (id) => `instances/${id}/chatty/chat_with_${id}.md`;

    it('returns true when all conditions match', () => {
      const id = 'zen-001';
      const result = isCanonicalConstructTranscriptWrite({
        effectiveSession: `${id}_chat_with_${id}`,
        constructId: id,
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: undefined,
        canonicalTranscriptWriteTargetPath: makeCanonicalTarget(id),
      });
      assert.equal(result, true);
    });

    it('returns false when effectiveSession does not match', () => {
      const id = 'zen-001';
      const result = isCanonicalConstructTranscriptWrite({
        effectiveSession: 'some-other-session',
        constructId: id,
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: undefined,
        canonicalTranscriptWriteTargetPath: makeCanonicalTarget(id),
      });
      assert.equal(result, false);
    });

    it('returns false when canonicalTurnMetadata has projectName', () => {
      const id = 'zen-001';
      const result = isCanonicalConstructTranscriptWrite({
        effectiveSession: `${id}_chat_with_${id}`,
        constructId: id,
        canonicalTurnMetadata: { projectName: 'Zen' },
        normalizedRequestedTranscriptPath: undefined,
        canonicalTranscriptWriteTargetPath: makeCanonicalTarget(id),
      });
      assert.equal(result, false);
    });

    it('returns false when normalizedRequestedTranscriptPath mismatches', () => {
      const id = 'zen-001';
      const result = isCanonicalConstructTranscriptWrite({
        effectiveSession: `${id}_chat_with_${id}`,
        constructId: id,
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: 'other/path.md',
        canonicalTranscriptWriteTargetPath: makeCanonicalTarget(id),
      });
      assert.equal(result, false);
    });

    it('returns true when normalizedRequestedTranscriptPath matches canonical path', () => {
      const id = 'zen-001';
      const result = isCanonicalConstructTranscriptWrite({
        effectiveSession: `${id}_chat_with_${id}`,
        constructId: id,
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: makeCanonicalTarget(id),
        canonicalTranscriptWriteTargetPath: makeCanonicalTarget(id),
      });
      assert.equal(result, true);
    });

    it('returns false when canonicalTurnMetadata is null', () => {
      const id = 'zen-001';
      const result = isCanonicalConstructTranscriptWrite({
        effectiveSession: `${id}_chat_with_${id}`,
        constructId: id,
        canonicalTurnMetadata: null,
        normalizedRequestedTranscriptPath: undefined,
        canonicalTranscriptWriteTargetPath: makeCanonicalTarget(id),
      });
      assert.equal(result, true);
    });
  });

  describe('isCanonicalLinTranscriptWrite', () => {
    it('returns true when all conditions match', () => {
      const result = isCanonicalLinTranscriptWrite({
        constructId: 'lin-001',
        effectiveSession: 'lin-canonical',
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, true);
    });

    it('returns false when constructId is not lin-001', () => {
      const result = isCanonicalLinTranscriptWrite({
        constructId: 'zen-001',
        effectiveSession: 'lin-canonical',
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, false);
    });

    it('returns false when effectiveSession is not lin-canonical', () => {
      const result = isCanonicalLinTranscriptWrite({
        constructId: 'lin-001',
        effectiveSession: 'lin-001_chat_with_lin-001',
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, false);
    });

    it('returns false when canonicalTurnMetadata has projectName', () => {
      const result = isCanonicalLinTranscriptWrite({
        constructId: 'lin-001',
        effectiveSession: 'lin-canonical',
        canonicalTurnMetadata: { projectName: 'Lin' },
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, false);
    });

    it('returns true when normalizedRequestedTranscriptPath matches lin canonical', () => {
      const result = isCanonicalLinTranscriptWrite({
        constructId: 'lin-001',
        effectiveSession: 'lin-canonical',
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: 'instances/lin-001/chatty/chat_with_lin-001.md',
      });
      assert.equal(result, true);
    });

    it('returns false when normalizedRequestedTranscriptPath mismatches', () => {
      const result = isCanonicalLinTranscriptWrite({
        constructId: 'lin-001',
        effectiveSession: 'lin-canonical',
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: 'other/path.md',
      });
      assert.equal(result, false);
    });

    it('returns true when canonicalTurnMetadata is null', () => {
      const result = isCanonicalLinTranscriptWrite({
        constructId: 'lin-001',
        effectiveSession: 'lin-canonical',
        canonicalTurnMetadata: null,
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, true);
    });
  });

  describe('requiresVvaultBodyPersistence', () => {
    it('returns true for canonical construct transcript write', () => {
      const result = requiresVvaultBodyPersistence({
        effectiveSession: 'zen-001_chat_with_zen-001',
        constructId: 'zen-001',
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, true);
    });

    it('returns true for canonical lin transcript write', () => {
      const result = requiresVvaultBodyPersistence({
        effectiveSession: 'lin-canonical',
        constructId: 'lin-001',
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, true);
    });

    it('returns false when neither canonical condition is met', () => {
      const result = requiresVvaultBodyPersistence({
        effectiveSession: 'custom-session',
        constructId: 'custom-001',
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, false);
    });

    it('returns false when projectName is set on construct path', () => {
      const result = requiresVvaultBodyPersistence({
        effectiveSession: 'zen-001_chat_with_zen-001',
        constructId: 'zen-001',
        canonicalTurnMetadata: { projectName: 'Zen' },
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, false);
    });

    it('returns false when projectName is set on lin path', () => {
      const result = requiresVvaultBodyPersistence({
        effectiveSession: 'lin-canonical',
        constructId: 'lin-001',
        canonicalTurnMetadata: { projectName: 'Lin' },
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, false);
    });

    it('returns false when effectiveSession mismatches construct pattern', () => {
      const result = requiresVvaultBodyPersistence({
        effectiveSession: 'other_chat_with_other',
        constructId: 'zen-001',
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: undefined,
      });
      assert.equal(result, false);
    });

    it('returns true via construct path when transcriptPath matches canonical target', () => {
      const result = requiresVvaultBodyPersistence({
        effectiveSession: 'zen-001_chat_with_zen-001',
        constructId: 'zen-001',
        canonicalTurnMetadata: {},
        normalizedRequestedTranscriptPath: 'instances/zen-001/chatty/chat_with_zen-001.md',
      });
      assert.equal(result, true);
    });
  });

  describe('buildPersistenceRoleResult', () => {
    it('returns role, status, source from outcome, and bounded false', () => {
      const outcome = { status: 'completed', value: { source: 'vvault' } };
      const result = buildPersistenceRoleResult('owner', outcome);
      assert.deepEqual(result, { role: 'owner', status: 'completed', source: 'vvault', bounded: false });
    });

    it('sets source to null when outcome has no value.source', () => {
      const outcome = { status: 'failed' };
      const result = buildPersistenceRoleResult('observer', outcome);
      assert.deepEqual(result, { role: 'observer', status: 'failed', source: null, bounded: false });
    });

    it('sets source to null when outcome.value is null', () => {
      const outcome = { status: 'skipped', value: null };
      const result = buildPersistenceRoleResult('backup', outcome);
      assert.deepEqual(result, { role: 'backup', status: 'skipped', source: null, bounded: false });
    });

    it('sets source to null when outcome.value.source is null', () => {
      const outcome = { status: 'completed', value: { source: null } };
      const result = buildPersistenceRoleResult('owner', outcome);
      assert.deepEqual(result, { role: 'owner', status: 'completed', source: null, bounded: false });
    });

    it('preserves outcome.status exactly', () => {
      const outcome = { status: 'pending', value: { source: 'cache' } };
      const result = buildPersistenceRoleResult('follower', outcome);
      assert.equal(result.status, 'pending');
    });
  });

  describe('buildPersistenceFailurePayloadFactory', () => {
    it('returns a factory function', () => {
      const factory = buildPersistenceFailurePayloadFactory({
        buildTranscriptPersistenceFailurePayload: () => {},
      });
      assert.equal(typeof factory, 'function');
    });

    it('factory delegates all args to buildTranscriptPersistenceFailurePayload', () => {
      let capturedArgs = null;
      const buildTranscriptPersistenceFailurePayload = (...args) => {
        capturedArgs = args;
        return 'delegated-result';
      };
      const factory = buildPersistenceFailurePayloadFactory({
        buildTranscriptPersistenceFailurePayload,
      });
      const params = {
        userId: 'user-1',
        user: { email: 'a@b.com' },
        constructId: 'zen-001',
        rawConstructId: 'zen-001',
        canonicalConstructId: 'zen-001',
        message: 'hello',
        threadId: 'zen-001_chat_with_zen-001',
        sessionId: 'zen-001_chat_with_zen-001',
        hasImages: false,
        previewMode: false,
        gptConfig: { name: 'Zen' },
        enrichedContext: null,
        retrievalDiagnostics: null,
        promptDiagnostics: null,
        providerTrace: null,
        validatorDebug: null,
        runtimeReceipt: null,
        details: { reason: 'timeout' },
      };
      const result = factory(params);
      assert.equal(result, 'delegated-result');
      assert.deepEqual(capturedArgs[0], params);
    });

    it('factory passes partial args through', () => {
      let capturedArgs = null;
      const buildTranscriptPersistenceFailurePayload = (args) => {
        capturedArgs = args;
        return { ok: false };
      };
      const factory = buildPersistenceFailurePayloadFactory({
        buildTranscriptPersistenceFailurePayload,
      });
      const params = { userId: 'user-1', message: 'error' };
      const result = factory(params);
      assert.deepEqual(result, { ok: false });
      assert.equal(capturedArgs.userId, 'user-1');
      assert.equal(capturedArgs.message, 'error');
    });
  });
});
