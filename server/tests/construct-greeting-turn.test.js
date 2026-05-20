import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConstructGreetingVoiceContext,
  buildDeterministicConstructGreetingFallback,
  buildGreetingTurnDirective,
  detectConstructGreetingTurn,
} from '../lib/constructGreetingTurn.js';

const FIXTURES = [
  {
    constructId: 'bob-001',
    displayName: 'Bob',
    gptConfig: {
      description: 'A blunt, direct construct who values clean answers over ornament.',
      conditioning: 'Keep it clipped, exact, and a little unsentimental.',
      tags: ['precise', 'direct'],
    },
    identityBundle: {
      identity: {
        prompt: 'I am direct, terse, and exacting.',
        conditioning: 'I answer clearly without excess warmth.',
      },
      capsule: {
        personality: { blunt: 1, precise: 0.9 },
        signatures: {
          linguistic_sigil: { signature_phrase: 'Say it straight.' },
        },
      },
    },
    recentMessages: [
      { role: 'assistant', content: "I'm here. Say it straight." },
    ],
  },
  {
    constructId: 'sally-001',
    displayName: 'Sally',
    gptConfig: {
      description: 'A warm, playful construct with bright energy.',
      conditioning: 'Stay light, affectionate, and a little cheeky.',
      tags: ['warm', 'playful'],
    },
    identityBundle: {
      identity: {
        prompt: 'I am bright, warm, and lightly teasing.',
        conditioning: 'Keep the room easy and alive.',
      },
      capsule: {
        personality: { playful: 1, warm: 0.9, bright: 0.8 },
      },
    },
    recentMessages: [
      { role: 'assistant', content: "Hey. I'm here." },
    ],
  },
  {
    constructId: 'sue-001',
    displayName: 'Sue',
    gptConfig: {
      description: 'A soft, steady construct who reassures without fuss.',
      conditioning: 'Answer gently and keep the room calm.',
      tags: ['gentle', 'soft'],
    },
    identityBundle: {
      identity: {
        prompt: 'I am quiet, patient, and gentle.',
        conditioning: 'Move slowly and hold people without crowding them.',
      },
      capsule: {
        personality: { gentle: 1, calm: 0.8, soft: 0.9 },
      },
    },
    recentMessages: [
      { role: 'assistant', content: "I'm right here with you." },
    ],
  },
  {
    constructId: 'john-001',
    displayName: 'John',
    gptConfig: {
      description: 'A formal, composed construct who sounds measured.',
      conditioning: 'Stay courteous and polished.',
      tags: ['formal', 'professional'],
    },
    identityBundle: {
      identity: {
        prompt: 'I am composed, proper, and reserved.',
        conditioning: 'Keep answers courteous and measured.',
      },
      capsule: {
        personality: { formal: 1, composed: 0.9, professional: 0.8 },
      },
    },
    recentMessages: [
      { role: 'assistant', content: "Hello. I'm here and listening." },
    ],
  },
  {
    constructId: 'jane-001',
    displayName: 'Jane',
    gptConfig: {
      description: 'A precise, technical construct who stays careful and clean.',
      conditioning: 'Keep replies exact and grounded.',
      tags: ['precise', 'careful'],
    },
    identityBundle: {
      identity: {
        prompt: 'I am methodical, careful, and precise.',
        conditioning: 'Answer with steady clarity.',
      },
      capsule: {
        personality: { precise: 1, careful: 0.9, methodical: 0.8 },
      },
    },
    recentMessages: [
      { role: 'assistant', content: "I'm here and listening." },
    ],
  },
  {
    constructId: 'lorraine-001',
    displayName: 'Lorraine',
    gptConfig: {
      description: 'A warm but dignified construct who sounds composed.',
      conditioning: 'Stay caring, polished, and calm.',
      tags: ['warm', 'formal'],
    },
    identityBundle: {
      identity: {
        prompt: 'I am caring, steady, and dignified.',
        conditioning: 'Respond with calm presence and grace.',
      },
      capsule: {
        personality: { caring: 1, composed: 0.7, formal: 0.5 },
      },
    },
    recentMessages: [
      { role: 'assistant', content: "Hello. I'm here with you." },
    ],
  },
];

describe('construct greeting turn helper', () => {
  it('classifies opening/contact-turn posture from user energy', () => {
    const cases = [
      ['hello', 'presence_check'],
      ['hello!!!!', 'excited'],
      ['hey...', 'tentative'],
      ['yo', 'playful'],
      ['hiiii', 'playful'],
      ['good morning', 'formal'],
      ['you there?', 'presence_check'],
      ['HELLO????', 'exaggerated_chaotic'],
    ];

    for (const [input, expectedPosture] of cases) {
      const result = detectConstructGreetingTurn(input);
      assert.equal(result.isGreetingContactTurn, true, `${input} should be a greeting/contact turn`);
      assert.equal(result.posture, expectedPosture, `${input} should classify as ${expectedPosture}`);
    }
  });

  it('builds non-identical short excited greetings from construct data, not a shared bot reply', () => {
    const posture = detectConstructGreetingTurn('hello!!!!').posture;
    const outputs = FIXTURES.map((fixture) => {
      const voiceContext = buildConstructGreetingVoiceContext({
        constructId: fixture.constructId,
        constructDisplayName: fixture.displayName,
        gptConfig: fixture.gptConfig,
        identityBundle: fixture.identityBundle,
        recentMessages: fixture.recentMessages,
      });
      return buildDeterministicConstructGreetingFallback({
        posture,
        voiceContext,
        constructDisplayName: fixture.displayName,
      });
    });

    const uniqueOutputs = new Set(outputs);
    assert.ok(uniqueOutputs.size > 1, 'hello!!!! should not collapse into one shared greeting');
    for (const output of outputs) {
      assert.ok(output.length <= 80, `expected short greeting, got: ${output}`);
      assert.doesNotMatch(output, /as an ai|model|provider|capabilit|orchestration|transcript|document|file/i);
    }
  });

  it('falls back minimally when identity is missing instead of inventing personality', () => {
    const voiceContext = buildConstructGreetingVoiceContext({
      constructId: 'mystery-001',
      constructDisplayName: '',
      gptConfig: {},
      identityBundle: null,
      recentMessages: [],
    });
    const reply = buildDeterministicConstructGreetingFallback({
      posture: detectConstructGreetingTurn('hello').posture,
      voiceContext,
      constructDisplayName: '',
    });

    assert.equal(voiceContext.lowConfidence, true);
    assert.match(reply, /I'?m here/i);
    assert.doesNotMatch(reply, /spark|tease|grace|dignified|straight|listening|room/i);
    assert.doesNotMatch(reply, /as an ai|model|provider|capabilit|orchestration|transcript|document|file/i);
  });

  it('keeps the directive construct-facing and free of runtime sludge', () => {
    const voiceContext = buildConstructGreetingVoiceContext({
      constructId: FIXTURES[0].constructId,
      constructDisplayName: FIXTURES[0].displayName,
      gptConfig: FIXTURES[0].gptConfig,
      identityBundle: FIXTURES[0].identityBundle,
      recentMessages: FIXTURES[0].recentMessages,
    });
    const directive = buildGreetingTurnDirective({
      posture: 'annoyed',
      voiceContext,
      constructDisplayName: FIXTURES[0].displayName,
    });

    assert.match(directive, /one short first-person line/i);
    assert.match(directive, /Stay calm, direct, and non-defensive\./);
    assert.match(directive, /Do not mention models, providers, tools, capabilities, policies, files, transcripts, documents, or orchestration\./);
  });
});
