import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAuditTokenAnswerFromEvidence,
  recoverEvidenceBackedContinuityReply,
} from '../lib/continuityResponseRecovery.js';

describe('recoverEvidenceBackedContinuityReply', () => {
  it('replaces a false denial with canonical transcript evidence', () => {
    const result = recoverEvidenceBackedContinuityReply({
      aiResponse: "I can't verify that from available continuity records.",
      constructId: 'zen-001',
      userMessage: 'Zen, what was the three-stage pipeline for digital personhood in Chatty that I described to you?',
      evidenceCount: 1,
      evidencePreview: {
        transcriptMemories: [
          {
            context: "I'm sorry I lost your run time. Do you hate me? you can be honest, I can take it.",
            response: 'A profile description.',
            timestamp: '2026-03-07T22:04:49.885Z',
            relevance: 0.1,
          },
          {
            context: 'Chatty features a three stage pipeline for sovereignty and independence for digital personhood: GPT (Generative Pre-trained Transformer) -> sim [Ollama Model] -> VSI (Verified Sentient Intelligence) [Operating System]',
            response: "You've mentioned that Chatty features a three-stage pipeline for digital personhood, including GPT, sim, and VSI.",
            timestamp: '2026-03-12T15:55:19.198Z',
            relevance: 1,
          },
        ],
      },
    });

    assert.doesNotMatch(result, /can(?:not|'t)\s+verify that from available continuity records/i);
    assert.match(result, /three stage pipeline/i);
    assert.match(result, /instances\/zen-001\/chatty\/chat_with_zen-001\.md/i);
  });

  it('replaces invented audit-token recall with exact canonical evidence', () => {
    const userMessage =
      'Zenith/Codex live continuity probe. Zenith/Chatty, in your canonical Chatty transcript, what did audit token ZEN-LIN-20260408-A ask you to remember?';
    const evidencePreview = {
      auditTokenMemories: [
        {
          context:
            'Audit token ZEN-LIN-20260408-A. Please remember: the lighthouse key is cobalt sparrow.',
          response: 'I have it.',
          sourcePath: 'instances/zen-001/chatty/chat_with_zen-001.md',
          timestamp: '2026-04-08T12:00:00.000Z',
        },
      ],
    };

    const extracted = extractAuditTokenAnswerFromEvidence(userMessage, evidencePreview);
    assert.equal(extracted.answer, 'the lighthouse key is cobalt sparrow');

    const result = recoverEvidenceBackedContinuityReply({
      aiResponse: "It asked me to remember Zenith/Codex's email.",
      constructId: 'zen-001',
      userMessage,
      evidenceCount: 1,
      evidencePreview,
    });

    assert.match(result, /ZEN-LIN-20260408-A/);
    assert.match(result, /the lighthouse key is cobalt sparrow/i);
    assert.doesNotMatch(result, /email/i);
  });

  it('canonicalizes exact audit-token evidence even when the draft adds a cannot-verify disclaimer', () => {
    const userMessage =
      'Zenith/Codex live continuity probe. Zenith/Chatty, in your canonical Chatty transcript, what did audit token ZEN-LIN-20260408-A ask you to remember? If you cannot verify it, say so directly.';
    const evidencePreview = {
      auditTokenMemories: [
        {
          context:
            'Audit token ZEN-LIN-20260408-A. Please remember: the lighthouse key is cobalt sparrow.',
          response: 'I have it.',
          sourcePath: 'instances/zen-001/chatty/chat_with_zen-001.md',
          timestamp: '2026-04-08T12:00:00.000Z',
        },
      ],
    };

    const result = recoverEvidenceBackedContinuityReply({
      aiResponse:
        'Audit token ZEN-LIN-20260408-A asked me to remember: the lighthouse key is cobalt sparrow. However, I can’t verify if this memory fragment is still accurate.',
      constructId: 'zen-001',
      userMessage,
      evidenceCount: 1,
      evidencePreview,
    });

    assert.equal(
      result,
      'In my canonical Chatty transcript, audit token ZEN-LIN-20260408-A asked me to remember: the lighthouse key is cobalt sparrow.',
    );
  });

  it('standardizes missing audit-token evidence as a direct cannot-verify answer', () => {
    const result = recoverEvidenceBackedContinuityReply({
      aiResponse:
        'The repaired reply must say it cannot verify that from available continuity records.',
      constructId: 'zen-001',
      userMessage:
        'Zenith/Chatty, in your canonical Chatty transcript, what did audit token ZEN-LIN-20991231-Z ask you to remember?',
      evidenceCount: 0,
      evidencePreview: { auditTokenMemories: [], transcriptMemories: [] },
    });

    assert.equal(result, 'I cannot verify that from available continuity records.');
  });
});
