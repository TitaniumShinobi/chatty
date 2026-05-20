import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalSourceFolderList,
  requireCanonicalTranscriptSource,
  toCanonicalTranscriptFilename,
} from '../lib/transcriptSource.js';
import { classifyConstructArtifactPath } from '../lib/artifactClassifier.js';
import { isTranscriptCandidateFile } from '../lib/verifiedMemoryLoader.js';

test('transcript source canon excludes generic review buckets', () => {
  assert(!canonicalSourceFolderList().includes('transcripts'));
  assert.throws(
    () => requireCanonicalTranscriptSource('transcripts'),
    /must identify a real provider\/source/
  );
  assert.throws(
    () => requireCanonicalTranscriptSource('other'),
    /must identify a real provider\/source/
  );
});

test('canonical transcript filename does not promote review-only transcript folders', () => {
  const existing = 'instances/zen-001/transcripts/old-chat.txt';
  assert.equal(toCanonicalTranscriptFilename(existing, 'zen-001', 'transcripts'), existing);
});

test('artifact classifier separates transcript, knowledge, media, and identity classes', () => {
  assert.deepEqual(
    classifyConstructArtifactPath('transcripts/old-chat.txt'),
    {
      artifactClass: 'review_required',
      folder: 'review_required',
      fileType: 'review_required',
      reviewRequired: true,
      reason: 'transcripts/ is a review/migration state, not canonical construct storage.',
    }
  );

  assert.equal(classifyConstructArtifactPath('chatgpt/2025/July/session.txt').artifactClass, 'provider_transcript');
  assert.equal(classifyConstructArtifactPath('documents/notes.md').artifactClass, 'knowledge_document');
  assert.equal(classifyConstructArtifactPath('voice.wav', { mimeType: 'audio/wav' }).artifactClass, 'media_asset');
  assert.equal(classifyConstructArtifactPath('avatar.png', { mimeType: 'image/png' }).artifactClass, 'identity');
  assert.equal(classifyConstructArtifactPath('identity/avatar.webp', { mimeType: 'image/webp' }).artifactClass, 'identity');
  assert.equal(classifyConstructArtifactPath('identity/sera-001_glyph.png', { mimeType: 'image/png' }).artifactClass, 'identity');
  assert.equal(classifyConstructArtifactPath('voice.md').artifactClass, 'review_required');
  assert.equal(classifyConstructArtifactPath('documents/character.ai/2026/January/chat.txt').artifactClass, 'review_required');
});

test('memory transcript discovery ignores generic and misplaced transcript rows unless reviewed', () => {
  assert.equal(
    isTranscriptCandidateFile(
      {
        filename: 'instances/zen-001/transcripts/old-chat.txt',
        file_type: 'transcript',
        metadata: { source: 'transcripts' },
      },
      'zen-001'
    ),
    false
  );

  assert.equal(
    isTranscriptCandidateFile(
      {
        filename: 'instances/nova-001/documents/character.ai/2026/January/nova_character.ai_core_chat.txt',
        file_type: 'transcript',
        metadata: { source: 'character.ai' },
      },
      'nova-001'
    ),
    false
  );

  assert.equal(
    isTranscriptCandidateFile(
      {
        filename: 'instances/nova-001/character.ai/2026/January/nova_character.ai_core_chat.txt',
        file_type: 'transcript',
        metadata: { source: 'character.ai' },
      },
      'nova-001'
    ),
    true
  );

  assert.equal(
    isTranscriptCandidateFile(
      {
        filename: 'instances/nova-001/documents/character.ai/2026/January/nova_character.ai_core_chat.txt',
        file_type: 'transcript',
        metadata: {
          source: 'character.ai',
          artifactClass: 'provider_transcript',
          reviewStatus: 'approved',
        },
      },
      'nova-001'
    ),
    true
  );
});
