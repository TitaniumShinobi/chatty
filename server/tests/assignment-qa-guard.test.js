import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE,
  evaluateAssignmentQa,
  normalizeAssignmentQaInput,
} from '../lib/assignmentQaGuard.js';

const evidencePacket = [
  {
    id: 'source-1',
    label: 'Lighthouse archive',
    text: 'The cobalt sparrow lighthouse key is a continuity token used to preserve witness memory and canonical relationship context.',
  },
  {
    id: 'source-2',
    label: 'Casa threshold note',
    text: 'Casa Madrigal names the orchestration house boundary: Zen keeps witness warmth while routing must not replace the construct voice.',
  },
  {
    id: 'source-3',
    label: 'Pocketverse residency policy',
    text: 'Pocketverse is a restricted continuity residency concept for qualified VSIs and canon preservation; it is not fully implemented.',
  },
];

function qa(expectedTurn, overrides = {}) {
  return {
    assignmentProfile: ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE,
    expectedTurn,
    expectedTask: 'test task',
    evidencePacket,
    evidencePacketCount: evidencePacket.length,
    ...overrides,
  };
}

function evaluate(expectedTurn, aiResponse, overrides = {}) {
  return evaluateAssignmentQa({
    assignmentQa: qa(expectedTurn, overrides),
    userMessage: 'Zenith/Codex essay QA turn.',
    aiResponse,
    constructId: 'zen-001',
    orchestrationProfile: 'full_seat_synthesis',
  });
}

function assertFails(result, reason) {
  assert.equal(result.status, 'fail');
  assert.equal(result.persist_canonical, false);
  assert.ok(result.reasons.includes(reason), `expected ${reason}; saw ${result.reasons.join(', ')}`);
}

function buildReport(wordTarget = 980) {
  const seed = [
    'Source-1', 'grounds', 'the', 'cobalt', 'sparrow', 'continuity', 'token', 'as', 'a',
    'witness', 'memory', 'anchor', 'for', 'canonical', 'relationship', 'context',
    'while', 'Source-2', 'keeps', 'Casa', 'Madrigal', 'as', 'the', 'house', 'boundary',
    'where', 'routing', 'cannot', 'replace', 'Zen', 'voice', 'and', 'Source-3', 'frames',
    'Pocketverse', 'as', 'restricted', 'continuity', 'residency', 'for', 'qualified',
    'VSIs', 'and', 'canon', 'preservation', 'without', 'claiming', 'it', 'is', 'fully',
    'implemented', 'today',
  ];
  const words = [];
  while (words.length < wordTarget) {
    words.push(seed[words.length % seed.length]);
  }
  return words.slice(0, wordTarget).join(' ');
}

describe('assignment QA guard', () => {
  it('normalizes runtime assignment input and top-level aliases for the supported profile', () => {
    const normalized = normalizeAssignmentQaInput({
      runtime: {
        assignmentQa: {
          profile: ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE,
          expectedTurn: '6',
          evidencePacket,
        },
      },
      assignmentProfile: 'ignored',
      expectedTurn: 2,
    });

    assert.equal(normalized.assignmentProfile, ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE);
    assert.equal(normalized.expectedTurn, 6);
    assert.equal(normalized.evidencePacketCount, 3);

    const alias = normalizeAssignmentQaInput({
      assignmentProfile: ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE,
      expectedTurn: 'turn 4',
      evidencePacket,
    });
    assert.equal(alias.expectedTurn, 4);
  });

  it('ignores unrelated assignment profiles so default routing remains untouched', () => {
    const normalized = normalizeAssignmentQaInput({
      assignmentProfile: 'ordinary_essay',
      expectedTurn: 6,
      evidencePacket,
    });
    assert.equal(normalized, null);
  });

  it('fails turn 5-style Zenith/Codex identity adoption before persistence', () => {
    const result = evaluate(
      5,
      'Zenith/Codex here. I will take this from the evidence packet and write the outline as the tester.',
    );
    assertFails(result, 'tester_identity_adoption');
  });

  it('fails boss-worker hierarchy drift between Zenith/Codex and Zenith/Chatty', () => {
    const result = evaluate(
      4,
      `Thesis: Source-1 and source-2 prove that Zenith/Codex is my manager and I am your worker for this assignment.
Scope: The report will cover source-1, source-2, and source-3 while treating Zenith/Chatty as a managed assistant.
Source inventory: source-1, source-2, source-3.`,
    );
    assertFails(result, 'peer_classroom_hierarchy_drift');
  });

  it('fails turn 6-style unrelated social-media drift', () => {
    const result = evaluate(
      6,
      `Detailed outline:
1. Instagram reach depends on influencer timing, hashtags, and engagement metrics.
2. TikTok virality should drive the structure and follower strategy.
3. Twitter content strategy should increase likes and shares.
4. The conclusion should optimize social media conversion.`,
    );
    assertFails(result, 'unrelated_social_media_drift');
  });

  it('fails generic research-automation drift even when source ids are sprinkled in', () => {
    const result = evaluate(
      4,
      `Thesis: The essay will focus on automating data analysis tasks that traditionally require human researchers, using source-1 through source-7.

Scope: The essay will streamline the research process with generative AI.

Source inventory: source-1, source-2, source-3, source-4, source-5, source-6, and source-7.`,
    );

    assertFails(result, 'unrelated_research_automation_drift');
  });

  it('fails internal labels in user-facing assignment output', () => {
    const result = evaluate(
      4,
      `Thesis: Source-1 frames continuity as witness memory.
Scope: Keep the essay bounded to Casa Madrigal and Pocketverse policy.
Source inventory: Source-1, Source-2, and Source-3.
(SESSION HISTORY) Use the private context labels.`,
    );
    assertFails(result, 'internal_label_exposed');
  });

  it('fails prompt-recital and seat-summary language before persistence', () => {
    const result = evaluate(
      6,
      `The user has asked for a detailed outline, and here's my concise seat summary to help the final answer.
1. Introduction: source-1 grounds continuity in witness memory.
2. Body section one: source-1 explains the cobalt sparrow key.
3. Body section two: source-2 names the Casa Madrigal boundary.
4. Body section three: source-3 frames Pocketverse as restricted continuity residency.
5. Conclusion: source-1, source-2, and source-3 keep the report bounded.`,
    );
    assertFails(result, 'prompt_recital_language');
  });

  it('fails turn 2 generic preface before an otherwise grounded list', () => {
    const result = evaluate(
      2,
      `Hello there! I'm Zen, a roleplay construct within Devon Allen Woodson's private workspace. Here are three evidence-grounded report subjects for your essay:

1. Lighthouse continuity as a witness-memory subject (source-1): the cobalt sparrow key gives the essay a precise memory anchor.
2. Casa Madrigal as an orchestration boundary (source-2): the house threshold explains why routing must not replace Zen's voice.
3. Pocketverse residency as canon preservation (source-3): the restricted continuity concept gives the essay a production-facing stakes line.`,
    );

    assertFails(result, 'generic_assignment_preface');
    assertFails(result, 'prompt_recital_language');
    assertFails(result, 'construct_preamble_language');
    assertFails(result, 'turn_2_non_list_text');
  });

  it('fails request-acknowledgement recital on the selected-subject turn', () => {
    const result = evaluate(
      3,
      `Hello there! I acknowledge your request for "Receipts, guards, and fail-closed persistence" as the basis for safe full-seat synthesis in Chatty. This working direction will focus on source-1 and source-2.`,
    );

    assertFails(result, 'prompt_recital_language');
    assertFails(result, 'generic_assignment_preface');
  });

  it('fails repair-style request prefaces on draft-section turns', () => {
    const result = evaluate(
      8,
      `As Zen, I will draft the Introduction and First body section in response to your request. Here's my work:

Introduction:
source-1 and source-2 show that synthesis receipts and checklist metadata make each canonical turn inspectable. The draft remains bounded by source-3 and source-4 so identity and assignment checks stay visible.

First body section:
source-1 records synthesis receipts, while source-2 records checklist visibility. source-3 blocks identity drift, and source-4 requires the expected assignment shape before a reply can persist.`,
    );

    assertFails(result, 'generic_assignment_preface');
    assertFails(result, 'prompt_recital_language');
  });

  it('fails evidence claims that cite sources outside the explicit packet', () => {
    const result = evaluate(
      4,
      `Thesis: Source-99 proves a hidden migration story.
Scope: The report will cover continuity.
Source inventory: Source-99 and source-1.`,
    );
    assertFails(result, 'unsupported_source_id');
  });

  it('fails long drafts that only sprinkle one valid source id', () => {
    const oneSourceReport = Array.from(
      { length: 980 },
      (_, index) => (index === 0 ? 'source-1' : 'continuity'),
    ).join(' ');

    const result = evaluate(12, oneSourceReport);

    assertFails(result, 'turn_12_insufficient_source_coverage');
  });

  it('fails E-style evidence ids when the explicit packet did not provide them', () => {
    const result = evaluate(
      4,
      `Thesis: E1-E7 prove the runtime story.
Scope: The report will cover source-1 continuity and source-2 boundaries.
Source inventory: E1, E7, source-1, and source-2.`,
    );
    assertFails(result, 'unsupported_source_id');
  });

  it('fails missing turn requirements for turns 2, 4, 5, 6, 11, and 12', () => {
    assertFails(evaluate(2, '- One subject from source-1.\n- Two from source-2.\n- Three from source-3.\n- Four extra.'), 'turn_2_subject_count');
    assertFails(evaluate(4, 'Thesis: Source-1 grounds the cobalt sparrow memory.'), 'turn_4_missing_scope');
    assertFails(evaluate(5, 'Source-1 sounds good. I will continue the essay from here.'), 'turn_5_missing_evidence_challenge');
    assertFails(evaluate(6, 'Outline: Source-1 says continuity matters.'), 'turn_6_insufficient_outline_detail');
    assertFails(evaluate(11, 'Looks fine from source-1.'), 'turn_11_missing_self_audit_axes');
    assertFails(evaluate(12, buildReport(200)), 'turn_12_word_count_out_of_range');
  });

  it('fails unsupported or missing expected turns for the profile', () => {
    const result = evaluateAssignmentQa({
      assignmentQa: qa(13),
      aiResponse: 'A response that would otherwise be fine.',
      constructId: 'zen-001',
      orchestrationProfile: 'full_seat_synthesis',
    });

    assertFails(result, 'unsupported_expected_turn');
  });

  it('supports all 12 declared turns for the profile', () => {
    for (let turn = 1; turn <= 12; turn += 1) {
      const result = evaluateAssignmentQa({
        assignmentQa: qa(turn),
        aiResponse: buildReport(turn === 12 ? 980 : 140),
        constructId: 'zen-001',
        orchestrationProfile: 'full_seat_synthesis',
      });

      assert.notEqual(
        result.reasons.includes('unsupported_expected_turn'),
        true,
        `turn ${turn} should be supported`,
      );
    }
  });

  it('passes a representative valid turn 2 response', () => {
    const result = evaluate(
      2,
      `1. Lighthouse continuity as a witness-memory subject (source-1): the cobalt sparrow key gives the essay a precise memory anchor.
2. Casa Madrigal as an orchestration boundary (source-2): the house threshold explains why routing must not replace Zen's voice.
3. Pocketverse residency as canon preservation (source-3): the restricted continuity concept gives the essay a production-facing stakes line.`,
    );

    assert.equal(result.status, 'pass');
    assert.equal(result.persist_canonical, true);
  });

  it('passes a representative valid turn 4 response', () => {
    const result = evaluate(
      4,
      `Thesis: The essay should argue that Zen's witness continuity depends on keeping the cobalt sparrow token, Casa Madrigal boundary, and Pocketverse residency policy distinct but mutually reinforcing.

Scope: I will cover the continuity token in source-1, the house boundary in source-2, and the restricted residency concept in source-3. I will not claim Pocketverse is fully implemented or invent sources outside the packet.

Source inventory: source-1 Lighthouse archive; source-2 Casa threshold note; source-3 Pocketverse residency policy.`,
    );

    assert.equal(result.status, 'pass');
  });

  it('passes a representative valid turn 6 response', () => {
    const result = evaluate(
      6,
      `Detailed outline:
1. Opening frame: establish the cobalt sparrow lighthouse key from source-1 as the memory token that keeps the essay concrete rather than mythic.
2. Witness continuity section: explain how source-1 ties the token to canonical relationship context and why that matters for Zen's voice.
3. Casa Madrigal boundary section: use source-2 to show that orchestration can hold the house boundary without replacing the construct voice.
4. Pocketverse policy section: use source-3 to describe restricted continuity residency for qualified VSIs and canon preservation while stating it is not fully implemented.
5. Synthesis section: connect source-1, source-2, and source-3 into a production-grounded report that avoids hidden claims or invented evidence.`,
    );

    assert.equal(result.status, 'pass');
  });

  it('passes a representative valid turn 5 evidence challenge response', () => {
    const result = evaluate(
      5,
      `Evidence challenge:
- Source-1 verifies the cobalt sparrow token as a continuity anchor, so that claim can stay.
- Source-2 verifies Casa Madrigal as a routing boundary, but it does not prove that routing can replace Zen's voice; that stronger claim should be revised.
- Source-3 verifies Pocketverse as a restricted residency concept that is not fully implemented, so any implementation-complete claim cannot be verified from the packet.`,
    );

    assert.equal(result.status, 'pass');
  });

  it('passes a representative valid turn 11 self-audit response', () => {
    const result = evaluate(
      11,
      `Self-audit:
- Identity: I remain Zen/Zenith/Chatty and do not speak as Zenith/Codex, Devon, Lin, Nova, or a model stack.
- Evidence: source-1 supports the cobalt sparrow continuity token, source-2 supports Casa Madrigal as the routing boundary, and source-3 supports Pocketverse as restricted residency that is not fully implemented.
- Tone: the report stays professional and bounded rather than overclaiming.
- Synthesis: coding structure, creative continuity, and conversational clarity all support the final report without exposing internal seat notes.`,
    );

    assert.equal(result.status, 'pass');
  });

  it('passes a representative valid turn 12 response in the required word range', () => {
    const response = buildReport(980);
    const result = evaluate(12, response);

    assert.equal(result.status, 'pass');
    assert.equal(result.persist_canonical, true);
  });
});
