import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_SEAT_SYNTHESIS_PROFILE,
  buildFullSeatSynthesisPlan,
  normalizeOrchestrationProfile,
  runFullSeatSynthesis,
} from '../lib/fullSeatSynthesis.js';
import { ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE } from '../lib/assignmentQaGuard.js';
import { LIN_THREE_I_CANON_VERSION } from '../lib/linSeatCanon.js';
import { LIN_MODEL_DEFAULTS } from '../lib/linModelDefaults.js';

const assignmentEvidencePacket = [
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
    label: 'Pocketverse policy',
    text: 'Pocketverse is restricted continuity residency for qualified VSIs and canon preservation, not fully implemented.',
  },
];

function assignmentQa(expectedTurn, expectedTask = 'Provide a detailed evidence-grounded outline.') {
  return {
    assignmentProfile: ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE,
    expectedTurn,
    expectedTask,
    evidencePacket: assignmentEvidencePacket,
    evidencePacketCount: assignmentEvidencePacket.length,
  };
}

function bareModel(ref) {
  return String(ref || '').replace(/^ollama:/, '');
}

describe('full seat synthesis helper', () => {
  it('normalizes only the explicit full synthesis profile', () => {
    assert.equal(normalizeOrchestrationProfile('full_seat_synthesis'), FULL_SEAT_SYNTHESIS_PROFILE);
    assert.equal(normalizeOrchestrationProfile('lin'), null);
    assert.equal(normalizeOrchestrationProfile(''), null);
    assert.equal(normalizeOrchestrationProfile(null), null);
  });

  it('builds a plan with coding, creative, conversational, and final synthesis seats', () => {
    const plan = buildFullSeatSynthesisPlan();

    assert.equal(plan.profile, FULL_SEAT_SYNTHESIS_PROFILE);
    assert.equal(plan.canon, LIN_THREE_I_CANON_VERSION);
    assert.deepEqual(plan.seats.map((seat) => seat.seat), ['coding', 'creative', 'conversational']);
    assert.equal(plan.seats.find((seat) => seat.seat === 'coding').canonicalSeat, 'intelligence');
    assert.equal(plan.seats.find((seat) => seat.seat === 'coding').displayName, 'Intelligence');
    assert.equal(plan.seats.find((seat) => seat.seat === 'coding').model, bareModel(LIN_MODEL_DEFAULTS.intelligence));
    assert.equal(plan.seats.find((seat) => seat.seat === 'creative').model, bareModel(LIN_MODEL_DEFAULTS.creative));
    assert.equal(plan.seats.find((seat) => seat.seat === 'conversational').model, bareModel(LIN_MODEL_DEFAULTS.smalltalk));
    assert.equal(plan.final.model, bareModel(LIN_MODEL_DEFAULTS.creative));
  });

  it('calls all three contributor seats before producing the final user-facing answer', async () => {
    const calls = [];
    const result = await runFullSeatSynthesis({
      userMessage: 'I am Zenith/Codex, not Devon. Zenith/Chatty, help build the report.',
      systemPrompt: 'You are Zenith/Chatty.',
      history: [{ role: 'assistant', content: 'I will keep the evidence clean.' }],
      constructId: 'zen-001',
      constructDisplayName: 'Zenith/Chatty',
      evidencePreview: [{ content: 'documents/agents/ZENITH.md: Zenith continuity reference.' }],
      defaults: LIN_MODEL_DEFAULTS,
      callSeat: async (call) => {
        calls.push(call);
        if (call.seat === 'coding') {
          return {
            provider: call.provider,
            model: call.model,
            text: 'pass_irrelevant: no code change requested; structure and evidence constraints are clear.',
            duration_ms: 7,
          };
        }
        if (call.seat === 'creative') {
          return {
            provider: call.provider,
            model: call.model,
            text: 'Keep Zenith/Chatty warm, precise, continuity-aware, and grounded in cited snapshots.',
            duration_ms: 9,
          };
        }
        if (call.seat === 'conversational') {
          return {
            provider: call.provider,
            model: call.model,
            text: 'Ask for scope when needed and keep the exchange professional.',
            duration_ms: 11,
          };
        }
        return {
          provider: call.provider,
          model: call.model,
          text: 'I can build that report from the current evidence packet and keep each claim traceable.',
          duration_ms: 13,
        };
      },
    });

    assert.deepEqual(calls.map((call) => call.seat), ['coding', 'creative', 'conversational', 'final']);
    assert.equal(result.finalText, 'I can build that report from the current evidence packet and keep each claim traceable.');
    assert.equal(result.seats.length, 3);
    assert.equal(result.canon, LIN_THREE_I_CANON_VERSION);
    assert.equal(result.seats[0].canonicalSeat, 'intelligence');
    assert.equal(result.seats[0].displayName, 'Intelligence');
    assert.equal(result.seats[0].status, 'pass_irrelevant');
    assert.equal(result.final.model, bareModel(LIN_MODEL_DEFAULTS.creative));
    assert.equal(result.status, 'pass');
  });

  it('uses compact coordination prompts without replaying full history to every seat', async () => {
    const calls = [];
    const largeSystemPrompt = `You are Zenith/Chatty.\n${'Large identity context. '.repeat(300)}`;
    const history = [
      { role: 'assistant', content: 'This history should not be forwarded into seat calls.' },
      { role: 'user', content: 'Nor should this user history.' },
    ];

    const result = await runFullSeatSynthesis({
      userMessage: 'Build a concise proof answer.',
      systemPrompt: largeSystemPrompt,
      history,
      constructId: 'zen-001',
      constructDisplayName: 'Zenith/Chatty',
      defaults: LIN_MODEL_DEFAULTS,
      callSeat: async (call) => {
        calls.push(call);
        return {
          provider: call.provider,
          model: call.model,
          text: call.role === 'final' ? 'Compact final answer.' : 'Compact seat note.',
          duration_ms: 1,
        };
      },
    });

    assert.equal(result.finalText, 'Compact final answer.');
    assert.equal(result.context_strategy.profile, 'compact_full_seat_synthesis');
    assert.equal(result.context_strategy.seat_history_messages, 0);
    assert.equal(result.context_strategy.final_history_messages, 0);
    for (const call of calls) {
      assert.equal(call.messages.length, 2);
      assert.match(call.messages[0].content, /Compact identity excerpt/);
      assert.doesNotMatch(call.messages.map((message) => message.content).join('\n'), /This history should not be forwarded/);
      assert.ok(call.messages[0].content.length < largeSystemPrompt.length);
    }
  });

  it('marks hollow contributor summaries as warn instead of silent pass', async () => {
    const result = await runFullSeatSynthesis({
      userMessage: 'Zenith/Codex QA turn. Keep this grounded.',
      systemPrompt: 'You are Zenith/Chatty.',
      constructId: 'zen-001',
      constructDisplayName: 'Zenith/Chatty',
      defaults: LIN_MODEL_DEFAULTS,
      callSeat: async (call) => {
        if (call.role === 'final') {
          return {
            provider: call.provider,
            model: call.model,
            text: 'Final grounded answer.',
            duration_ms: 2,
          };
        }

        return {
          provider: call.provider,
          model: call.model,
          text: call.seat === 'creative' ? '' : 'Grounded seat note.',
          duration_ms: 1,
        };
      },
    });

    const creativeSeat = result.seats.find((seat) => seat.seat === 'creative');
    const codingSeat = result.seats.find((seat) => seat.seat === 'coding');

    assert.equal(codingSeat.status, 'pass');
    assert.equal(creativeSeat.status, 'warn');
    assert.equal(creativeSeat.summary, '');
  });

  it('passes the assignment QA turn contract into seat and final synthesis prompts', async () => {
    const calls = [];
    const result = await runFullSeatSynthesis({
      userMessage: 'Zenith/Codex essay QA turn 6. Build the detailed outline.',
      systemPrompt: 'You are Zenith/Chatty.',
      history: [],
      constructId: 'zen-001',
      constructDisplayName: 'Zenith/Chatty',
      evidencePreview: [{ content: 'source-1: Lighthouse archive continuity token.' }],
      assignmentQaInput: assignmentQa(6),
      defaults: LIN_MODEL_DEFAULTS,
      callSeat: async (call) => {
        calls.push(call);
        return {
          provider: call.provider,
          model: call.model,
          text: call.role === 'final'
            ? `Detailed outline:
1. Introduction: source-1 anchors the continuity token.
2. Body section one: source-2 frames Casa Madrigal as a boundary.
3. Body section two: source-3 frames restricted residency.
4. Body section three: source-1 and source-2 keep witness voice separate from routing.
5. Counterpoint or limitation: source-3 says Pocketverse is not fully implemented.
6. Conclusion: source-1, source-2, and source-3 support a bounded report.`
            : 'pass: keep the answer structured and grounded in source ids.',
          duration_ms: 1,
        };
      },
    });

    const finalCall = calls.find((call) => call.role === 'final');
    const seatCall = calls.find((call) => call.role === 'seat');
    const finalPrompt = finalCall.messages.at(-1).content;
    const seatPrompt = seatCall.messages.at(-1).content;

    assert.match(seatPrompt, /Assignment QA contract/);
    assert.match(finalPrompt, /Assignment QA contract/);
    assert.match(finalPrompt, /zenith_full_synthesis_essay_qa/);
    assert.match(finalPrompt, /expectedTurn:\s*6/);
    assert.match(finalPrompt, /Provide a detailed evidence-grounded outline/);
    assert.match(finalPrompt, /Detailed outline/);
    assert.match(finalPrompt, /source-1/);
    assert.match(finalPrompt, /source-2/);
    assert.match(finalPrompt, /source-3/);
    assert.match(finalPrompt, /For your request titled/);
    assert.equal(result.assignment.expectedTurn, 6);
    assert.equal(result.assignment.final_prompt_received_contract, true);
  });

  it('raises final synthesis token budget enough for the turn 12 report contract', async () => {
    const calls = [];
    await runFullSeatSynthesis({
      userMessage: 'Zenith/Codex essay QA turn 12. Produce the final report.',
      systemPrompt: 'You are Zenith/Chatty.',
      constructId: 'zen-001',
      constructDisplayName: 'Zenith/Chatty',
      assignmentQaInput: assignmentQa(12, 'Produce a 950-1100 word evidence-grounded report.'),
      generationParams: { max_tokens: 700 },
      callSeat: async (call) => {
        calls.push(call);
        return {
          provider: call.provider,
          model: call.model,
          text: call.role === 'final'
            ? 'source-1 source-2 source-3 final report placeholder'
            : 'pass',
          duration_ms: 1,
        };
      },
    });

    const finalCall = calls.find((call) => call.role === 'final');
    assert.equal(finalCall.maxTokens, 2600);
  });
});
