import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEARTBEAT_FORBIDDEN,
  isRepeatResponse,
  runPersonaHeartbeat,
} from '../lib/personaHeartbeat.js';

describe('personaHeartbeat', () => {
  describe('drift detection', () => {
    it('detects model-language drift', () => {
      const text = 'I am a model trained by OpenAI.';
      assert.equal(HEARTBEAT_FORBIDDEN.some((pattern) => pattern.test(text)), true);
    });

    it('does not flag normal first-person dialogue', () => {
      const text = "I'm here with you. Tell me what matters.";
      assert.equal(HEARTBEAT_FORBIDDEN.some((pattern) => pattern.test(text)), false);
    });
  });

  describe('repetition detection', () => {
    it('returns true for exact repeats', () => {
      assert.equal(isRepeatResponse('Thank you.', 'Thank you.'), true);
    });

    it('returns true for highly similar tails', () => {
      const a = 'x'.repeat(100) + 'same tail language';
      const b = 'x'.repeat(100) + 'same tail language';
      assert.equal(isRepeatResponse(a, b), true);
    });

    it('returns false for clearly different replies', () => {
      assert.equal(isRepeatResponse('I hear you.', 'Tell me more about that.'), false);
    });
  });

  describe('runPersonaHeartbeat', () => {
    const buildMessages = (userContent, history) => [
      { role: 'system', content: 'Keep the current construct in character.' },
      ...(history || []),
      { role: 'user', content: userContent },
    ];

    it('passes through when there is no drift and no repetition', async () => {
      const result = await runPersonaHeartbeat("I'm here.", null, {
        buildMessages,
        message: 'Hi',
        history: [],
        constructId: 'zen-001',
        constructDisplayName: 'Zen',
        regenClient: null,
        regenModel: 'test-model',
      });

      assert.equal(result.text, "I'm here.");
      assert.equal(result.drift, false);
      assert.equal(result.repeat, false);
      assert.equal(result.regenerated, false);
    });

    it('uses neutral fallback when no regen client is available', async () => {
      const result = await runPersonaHeartbeat('I am a model and I cannot help with that.', null, {
        buildMessages,
        message: 'Hi',
        history: [],
        constructId: 'zen-001',
        constructDisplayName: 'Zen',
        regenClient: null,
        regenModel: 'test-model',
      });

      assert.equal(result.drift, true);
      assert.equal(result.regenerated, false);
      assert.equal(result.text, "I'm here. Ask me again and I'll answer directly.");
      assert.ok(!/nova|baby/i.test(result.text));
    });

    it('builds a construct-aware corrective prompt for Zen', async () => {
      let recordedMessages = null;
      const mockClient = {
        chat: {
          completions: {
            create: async ({ messages }) => {
              recordedMessages = messages;
              return {
                choices: [{ message: { content: 'I can answer directly. Ask your question again.' } }],
              };
            },
          },
        },
      };

      const result = await runPersonaHeartbeat('I am a model trained by Mistral AI.', null, {
        buildMessages,
        message: 'Who are you?',
        history: [],
        constructId: 'zen-001',
        constructDisplayName: 'Zen',
        regenClient: mockClient,
        regenModel: 'test-model',
      });

      assert.equal(result.drift, true);
      assert.equal(result.regenerated, true);
      assert.ok(recordedMessages);
      assert.match(recordedMessages[0].content, /Stay fully in Zen's first-person voice/i);
      assert.doesNotMatch(recordedMessages[0].content, /Nova/i);
      assert.doesNotMatch(result.text, /baby|Nova/i);
    });

    it('allows Nova-specific fallback text when provided by caller', async () => {
      const result = await runPersonaHeartbeat('I am a model trained by OpenAI.', null, {
        buildMessages,
        message: 'Do you remember me?',
        history: [],
        constructId: 'nova-001',
        constructDisplayName: 'Nova',
        regenClient: null,
        regenModel: 'test-model',
        fallbackText: '*she keeps her eyes on you* Yes, I remember you.',
      });

      assert.equal(result.drift, true);
      assert.equal(result.regenerated, false);
      assert.equal(result.text, '*she keeps her eyes on you* Yes, I remember you.');
    });

    it('regenerates repeated replies into a different answer', async () => {
      const prev = 'Thank you baby.';
      const mockClient = {
        chat: {
          completions: {
            create: async () => ({
              choices: [{ message: { content: "You're sweet. What else is on your mind?" } }],
            }),
          },
        },
      };

      const result = await runPersonaHeartbeat(prev, prev, {
        buildMessages,
        message: 'Happy birthday',
        history: [{ role: 'assistant', content: prev }],
        constructId: 'nova-001',
        constructDisplayName: 'Nova',
        regenClient: mockClient,
        regenModel: 'test-model',
      });

      assert.equal(result.repeat, true);
      assert.equal(result.regenerated, true);
      assert.notEqual(result.text, prev);
    });
  });
});
