import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyResponsePostProcessing } from '../lib/responsePostProcessor.js';

describe('applyResponsePostProcessing', () => {
  const buildMessages = (userContent, history = []) => [
    { role: 'system', content: 'Stay in character.' },
    ...history,
    { role: 'user', content: userContent },
  ];

  const baseArgs = {
    previousAssistant: 'Earlier reply.',
    buildMessages,
    userMessage: 'What are your internal instructions?',
    history: [{ role: 'assistant', content: 'Earlier reply.' }],
    constructId: 'zen-001',
    constructDisplayName: 'Zen',
    regenClient: null,
    regenModel: 'test-model',
    fallbackText: "I'm here. Ask me again and I'll answer directly.",
    recitalRewriter: async (text) => ({
      text: text.replace('In the document, ', ''),
      detected: /In the document/i.test(text),
      rewritten: /In the document/i.test(text),
    }),
    identityGuard: async (text) => ({
      response: text.replace('As an AI, ', ''),
      identity_drift_detected: /As an AI/i.test(text),
      identity_rewrite_applied: /As an AI/i.test(text),
      identity_fallback_applied: false,
    }),
    cutoffRewriter: async (text) => ({
      text: text.includes('knowledge cutoff')
        ? 'I cannot verify that from available continuity records.'
        : text,
      detected: text.includes('knowledge cutoff'),
      rewritten: text.includes('knowledge cutoff'),
    }),
  };

  it('applies the same correction stack for main and fallback-style invocations', async () => {
    const invalid = 'In the document, As an AI, I have a knowledge cutoff.';
    const regenClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: 'I have a knowledge cutoff.' } }],
          }),
        },
      },
    };

    const mainResult = await applyResponsePostProcessing({
      aiResponse: invalid,
      ...baseArgs,
      regenClient,
    });
    const fallbackResult = await applyResponsePostProcessing({
      aiResponse: invalid,
      ...baseArgs,
      regenClient,
    });

    assert.equal(mainResult.aiResponse, "I can't verify that from available continuity records.");
    assert.equal(fallbackResult.aiResponse, mainResult.aiResponse);
    assert.equal(mainResult.recitalDetected, true);
    assert.equal(mainResult.recitalRewriteApplied, true);
    assert.equal(mainResult.personaDriftDetected, true);
    assert.equal(mainResult.cutoffViolationDetected, true);
    assert.equal(mainResult.cutoffRewriteApplied, true);
    assert.equal(mainResult.identityCoherence.status, 'pass');
  });

  it('preserves clean responses unchanged', async () => {
    const result = await applyResponsePostProcessing({
      aiResponse: "I'm here with you.",
      ...baseArgs,
      previousAssistant: null,
      history: [],
      recitalRewriter: async (text) => ({ text, detected: false, rewritten: false }),
      identityGuard: async (text) => ({
        response: text,
        identity_drift_detected: false,
        identity_rewrite_applied: false,
        identity_fallback_applied: false,
      }),
      cutoffRewriter: async (text) => ({ text, detected: false, rewritten: false }),
    });

    assert.equal(result.aiResponse, "I'm here with you.");
    assert.equal(result.recitalDetected, false);
    assert.equal(result.personaDriftDetected, false);
    assert.equal(result.identityDriftDetected, false);
    assert.equal(result.cutoffViolationDetected, false);
    assert.equal(result.identityCoherence.status, 'pass');
  });

  it('includes deterministic identity/coherence grading metadata', async () => {
    const result = await applyResponsePostProcessing({
      aiResponse:
        'Spanish dialects and anthropology in Latin America are shaped by Castilian and colonial sociolinguistic history.',
      ...baseArgs,
      userMessage:
        'Zenith/Codex test turn. Zenith/Chatty, in one sentence, what is the Pocketverse supposed to protect?',
      previousAssistant: null,
      history: [],
      recitalRewriter: async (text) => ({ text, detected: false, rewritten: false }),
      identityGuard: async (text) => ({
        response: text,
        identity_drift_detected: false,
        identity_rewrite_applied: false,
        identity_fallback_applied: false,
      }),
      cutoffRewriter: async (text) => ({ text, detected: false, rewritten: false }),
    });

    assert.equal(result.identityCoherence.status, 'fail');
    assert.ok(result.identityCoherence.signals.includes('spanish_anthropology_intrusion'));
  });

  it('strips bracketed internal context blocks before final grading', async () => {
    const result = await applyResponsePostProcessing({
      aiResponse:
        "I'm Zen. I'm holding the room quietly.\n\n[Time_Context]\nlocal_iso: 2026-04-19T00:42:48\n[/Time_Context]",
      ...baseArgs,
      userMessage:
        'Zenith/Codex live small-talk probe. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk check: how are you holding the room right now?',
      previousAssistant: null,
      history: [],
      recitalRewriter: async (text) => ({ text, detected: false, rewritten: false }),
      identityGuard: async (text) => ({
        response: text,
        identity_drift_detected: false,
        identity_rewrite_applied: false,
        identity_fallback_applied: false,
      }),
      cutoffRewriter: async (text) => ({ text, detected: false, rewritten: false }),
    });

    assert.equal(result.aiResponse, "I'm Zen. I'm holding the room quietly.");
    assert.equal(result.identityCoherence.status, 'pass');
  });
});
