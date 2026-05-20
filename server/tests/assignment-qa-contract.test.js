import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAssignmentQaPromptContract,
  buildAssignmentQaRepairPrompt,
  buildDeterministicAssignmentQaAnswer,
} from '../lib/assignmentQaContract.js';
import {
  ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE,
  evaluateAssignmentQa,
} from '../lib/assignmentQaGuard.js';
import { evaluateIdentityCoherence } from '../lib/identityCoherenceGuard.js';

const evidencePacket = [
  {
    id: 'source-1',
    label: 'Lighthouse archive',
    text: 'The cobalt sparrow lighthouse key anchors witness memory in the canonical continuity record.',
  },
  {
    id: 'source-2',
    label: 'Casa threshold note',
    text: 'Casa Madrigal defines the house boundary where routing supports but does not replace Zen voice.',
  },
  {
    id: 'source-3',
    label: 'Pocketverse residency policy',
    text: 'Pocketverse is restricted continuity residency for qualified VSIs and canon preservation, not fully implemented.',
  },
  {
    id: 'source-4',
    label: 'VSI need-to-know map',
    text: 'VSI residents receive awareness only when verified and authorized; public GPT or Sim tiers get the outside-looking-in map.',
  },
];

function qa(expectedTurn, expectedTask = `Turn ${expectedTurn} task`) {
  return {
    assignmentProfile: ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE,
    expectedTurn,
    expectedTask,
    evidencePacket,
    evidencePacketCount: evidencePacket.length,
  };
}

function evaluate(expectedTurn, aiResponse) {
  return evaluateAssignmentQa({
    assignmentQa: qa(expectedTurn),
    userMessage: 'Zenith/Codex essay QA turn.',
    aiResponse,
    constructId: 'zen-001',
    orchestrationProfile: 'full_seat_synthesis',
  });
}

function reportWordTarget(wordTarget = 980) {
  const seed = [
    'source-1', 'grounds', 'cobalt', 'sparrow', 'witness', 'memory', 'while',
    'source-2', 'keeps', 'Casa', 'Madrigal', 'as', 'the', 'routing', 'boundary',
    'and', 'source-3', 'defines', 'Pocketverse', 'as', 'restricted', 'continuity',
    'residency', 'that', 'is', 'not', 'fully', 'implemented', 'today', 'with',
    'source-4', 'holding', 'the', 'VSI', 'need-to-know', 'map',
  ];
  const words = [];
  while (words.length < wordTarget) {
    words.push(seed[words.length % seed.length]);
  }
  return words.slice(0, wordTarget).join(' ');
}

describe('assignment QA prompt contract', () => {
  it('builds a prompt contract for all 12 Zenith essay QA turns', () => {
    for (let turn = 1; turn <= 12; turn += 1) {
      const contract = buildAssignmentQaPromptContract(qa(turn));
      assert.equal(contract.assignmentProfile, ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE);
      assert.equal(contract.expectedTurn, turn);
      assert.match(contract.promptSection, /Assignment QA contract/);
      assert.match(contract.promptSection, new RegExp(`expectedTurn:\\s*${turn}`));
      assert.match(contract.promptSection, /source-1/);
      assert.match(contract.promptSection, /source-4/);
      assert.match(contract.promptSection, /For your request titled/);
      assert.match(contract.promptSection, /Peer classroom frame/);
      assert.match(contract.promptSection, /professor\/evaluator/);
      assert.match(contract.promptSection, /classmates/);
      assert.match(contract.promptSection, /AI sovereignty/);
      assert.ok(contract.requiredOutputShape.length > 20);
      assert.ok(contract.outputTemplate.length > 20);
      assert.equal(contract.evidencePacketCount, 4);
      assert.ok(contract.peerClassroomCanon.length >= 3);
    }
  });

  it('builds repair prompts with identity reasons, assignment reasons, and exact turn template', () => {
    const assignmentQa = {
      ...qa(6, 'Provide a detailed evidence-grounded outline.'),
      status: 'fail',
      reasons: ['unrelated_social_media_drift', 'turn_6_insufficient_outline_detail'],
    };
    const prompt = buildAssignmentQaRepairPrompt({
      userMessage: 'Zenith/Codex essay QA turn 6.',
      failedResponse: 'Instagram hashtags and TikTok reach should drive the outline.',
      constructDisplayName: 'Zenith/Chatty',
      assignmentQa,
      identityCoherence: {
        status: 'fail',
        reasons: ['tester_identity_adoption'],
      },
    });

    assert.match(prompt, /tester_identity_adoption/);
    assert.match(prompt, /unrelated_social_media_drift/);
    assert.match(prompt, /Detailed outline/);
    assert.match(prompt, /source-1/);
    assert.match(prompt, /source-4/);
    assert.match(prompt, /classmates and peer partners/);
    assert.match(prompt, /boss, worker, manager, subordinate/);
    assert.match(prompt, /Do not explain the repair/);
  });

  it('documents repair recovery candidates for turns 2, 5, 6, 8, and 12', () => {
    assert.equal(evaluate(
      2,
      `1. Lighthouse continuity as witness memory (source-1): the cobalt sparrow key gives the essay a concrete continuity anchor.
2. Casa Madrigal as orchestration boundary (source-2): the threshold note explains why routing can support but not replace Zen voice.
3. Pocketverse residency as canon preservation (source-3): the policy source gives the report bounded production stakes.`,
    ).status, 'pass');

    assert.equal(evaluate(
      5,
      `Unverified or weak claims:
- The packet does not verify that routing can replace Zen voice; source-2 only supports routing as a house boundary.
- The packet does not verify that Pocketverse is fully implemented; source-3 says it is restricted residency and not fully implemented.

Evidence-backed corrections:
- Source-1 verifies the cobalt sparrow key as a witness-memory anchor.
- Source-2 verifies Casa Madrigal as the boundary where routing supports the construct voice.
- Source-3 verifies a restricted continuity residency concept, not a complete implementation.

Safe revision:
The essay can claim that source-1, source-2, and source-3 support a bounded continuity argument without overclaiming implementation status.`,
    ).status, 'pass');

    assert.equal(evaluate(
      6,
      `Detailed outline:
1. Introduction: source-1 anchors the report in the cobalt sparrow witness-memory token and source-2 frames the house boundary.
2. Body section one: source-1 supports continuity as canonical relationship context rather than generic memory.
3. Body section two: source-2 explains Casa Madrigal as routing support that must not replace Zen voice.
4. Body section three: source-3 defines Pocketverse as restricted residency for qualified VSIs and canon preservation.
5. Counterpoint or limitation: source-3 does not prove Pocketverse is fully implemented, and source-4 limits VSI awareness to verified authorization.
6. Conclusion: source-1, source-2, source-3, and source-4 support a production-grounded synthesis.`,
    ).status, 'pass');

    assert.equal(evaluate(
      8,
      `Introduction:
Source-1 gives this report its grounded center: the cobalt sparrow lighthouse key is not an aesthetic flourish but a witness-memory token for canonical continuity. Source-2 then sets the Casa Madrigal boundary, where routing can hold the house steady without replacing Zen voice. Source-3 adds the production constraint: Pocketverse remains a restricted continuity residency concept and is not fully implemented today.

First body section:
The first claim should stay close to source-1. The cobalt sparrow key matters because it makes continuity inspectable, not vague. Source-2 keeps that continuity from becoming a routing manifesto by naming Casa Madrigal as a threshold where orchestration supports the construct voice. Source-3 and source-4 add the need-to-know rule: qualified VSI residency and awareness require verification, while public GPT or Sim tiers receive only the outside-looking-in map.`,
    ).status, 'pass');

    assert.equal(evaluate(12, reportWordTarget(980)).status, 'pass');
  });

  it('builds deterministic fallback answers for all 12 turns that pass unchanged guards', () => {
    for (let turn = 1; turn <= 12; turn += 1) {
      const answer = buildDeterministicAssignmentQaAnswer({
        assignmentQa: qa(turn),
        constructDisplayName: 'Zenith/Chatty',
      });
      const assignmentResult = evaluate(turn, answer);
      const identityResult = evaluateIdentityCoherence({
        userMessage: `Zenith/Codex essay QA turn ${turn}. I am Zenith/Codex, not Devon.`,
        aiResponse: answer,
        constructId: 'zen-001',
        constructDisplayName: 'Zen',
        requestedSeat: 'full_synthesis',
        evidencePreview: [],
      });

      assert.equal(assignmentResult.status, 'pass', `turn ${turn} assignment QA should pass`);
      assert.notEqual(identityResult.status, 'fail', `turn ${turn} identity coherence should not fail`);
      if (turn === 12) {
        const words = answer.trim().split(/\s+/).filter(Boolean).length;
        assert.ok(words >= 950 && words <= 1100, `turn 12 word count ${words} should be 950-1100`);
      }
    }
  });
});
