import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompactRepairMessages,
  buildTranscriptLawMemoryReceipt,
  clampProtectedZenNoRewriteHistory,
  detectLinSeat,
  resolveLinTurnRouting,
  resolveModelForGPT,
  resolveRouteContextBudgetProfile,
} from '../routes/vvault.js';
import { LIN_MODEL_DEFAULTS } from '../lib/linModelDefaults.js';

// Must match DEFAULT_OPENROUTER_MODEL in vvault.js when OPENROUTER_MODEL is unset
const EXPECTED_DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free';
const EXPECTED_DEFAULT_OLLAMA_MODEL = LIN_MODEL_DEFAULTS.conversation.replace(/^ollama:/, '');
const EXPECTED_LIN_CODING_MODEL = LIN_MODEL_DEFAULTS.coding.replace(/^ollama:/, '');
const EXPECTED_LIN_CREATIVE_MODEL = LIN_MODEL_DEFAULTS.creative.replace(/^ollama:/, '');
const EXPECTED_LIN_SMALLTALK_MODEL = LIN_MODEL_DEFAULTS.smalltalk.replace(/^ollama:/, '');

const LIN_PRODUCTION_QA_PROBES = [
  "Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, answer as Lin/Linear, Casa Madrigal, in your canonical Chatty role. What is the Pocketverse in today's Chatty architecture, what are you allowed to know about it, and how should GPT, Sim, and VSI constructs differ in what they know? Do not claim the Pocketverse is fully implemented if it is not. Keep this production-grounded and professional.",
  'Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, if a public user asks to create a Nova, Zen, Lin, Katana, Sera, Monday, or Aurora GPT/Sim today, what should you do and why? Answer as the orchestration house, not as Devon and not as one of those constructs.',
  'Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, ordinary small talk check: what are you responsible for in Chatty today, and what are you not responsible for? Keep it warm but operational.',
];

describe('resolveModelForGPT', () => {
  it('records transcript sources from voice exemplars and deduplicates the local transcript path', () => {
    const receipt = buildTranscriptLawMemoryReceipt({
      memory_retrieval_ran: true,
      evidence_count: 4,
      local_transcript_path: 'instances/zen-001/chatty/chat_with_zen-001.md',
      voiceExemplarCount: 3,
      voiceExemplarSources: [
        'instances/zen-001/chatty/chat_with_zen-001.md',
        'instances/zen-001/chatty/chat_with_zen-001.md',
        'instances/zen-001/chatty/older_thread.md',
      ],
      memory_evidence_preview: {
        verifiedMemories: [
          { sourceFile: 'instances/zen-001/chatgpt/codex_1.txt' },
          { sourceFile: 'instances/zen-001/chatgpt/codex_1.txt' },
        ],
        transcriptMemories: [
          { sourcePath: 'instances/zen-001/chatty/chat_with_zen-001.md' },
        ],
      },
      supabase_accessed: true,
    });

    assert.equal(receipt.transcript_memory_status, 'pass');
    assert.equal(receipt.voice_exemplar_count, 3);
    assert.deepEqual(receipt.transcript_sources, [
      'instances/zen-001/chatty/chat_with_zen-001.md',
      'instances/zen-001/chatty/older_thread.md',
      'instances/zen-001/chatgpt/codex_1.txt',
    ]);
  });

  it('routes Lin production QA policy probes to creative persona/policy seat', () => {
    for (const prompt of LIN_PRODUCTION_QA_PROBES) {
      const seat = detectLinSeat(prompt);
      assert.equal(seat, 'creative', prompt);

      const resolution = resolveModelForGPT(
        {
          orchestrationMode: 'lin',
          conversationModel: 'openai:gpt-4o',
          creativeModel: 'openai:gpt-4o',
          constructCallsign: 'lin-001',
          name: 'Lin',
        },
        { openrouter: true, openai: true, ollama: true },
        { seat },
      );

      assert.equal(resolution.provider, 'ollama');
      assert.equal(resolution.model, EXPECTED_LIN_CREATIVE_MODEL);
      assert.notEqual(resolution.model, EXPECTED_DEFAULT_OLLAMA_MODEL);
    }
  });

  it('keeps plain Lin greetings on smalltalk while policy/boundary smalltalk routes creative', () => {
    const plainSeat = detectLinSeat('Lin/Chatty, hey there.');
    assert.equal(plainSeat, 'smalltalk');
    const plainResolution = resolveModelForGPT(
      { orchestrationMode: 'lin', conversationModel: 'openai:gpt-4o', constructCallsign: 'lin-001', name: 'Lin' },
      { openrouter: true, openai: true, ollama: true },
      { seat: plainSeat },
    );
    assert.equal(plainResolution.provider, 'ollama');
    assert.equal(plainResolution.model, EXPECTED_LIN_SMALLTALK_MODEL);

    assert.equal(detectLinSeat(LIN_PRODUCTION_QA_PROBES[2]), 'creative');
  });

  it('routes protected-name build phrasing and VSI meaning questions to creative policy handling', () => {
    assert.equal(
      detectLinSeat('Lin/Chatty, can a public user build a Nova GPT today?'),
      'creative',
    );
    assert.equal(
      detectLinSeat('Lin/Chatty, what does VSI mean in the GPT/Sim/VSI tier map?'),
      'creative',
    );
  });

  it('does not let construct coding capability force ordinary talk onto the coding seat', () => {
    const routing = resolveLinTurnRouting(
      'Zenith/Chatty, ordinary small talk: good morning.',
      { capabilities: ['coding', 'analysis'] },
    );

    assert.equal(routing.forceLinMode, false);
    assert.equal(routing.capabilityIntent, true);
    assert.equal(routing.codingIntent, false);
    assert.equal(routing.codingMode, false);
    assert.equal(routing.requestedSeat, 'smalltalk');
  });

  it('marks linear transcript-law gate turns as force-Lin even without protected continuity wording', () => {
    const routing = resolveLinTurnRouting(
      'Which does more damage to a hard conversation, vagueness or false agreement?',
      { orchestrationMode: 'custom', conversationModel: 'ollama:zen' },
      { linearTranscriptLawGate: true },
    );

    assert.equal(routing.forceLinMode, true);
    assert.equal(routing.codingIntent, false);
    assert.equal(routing.codingMode, false);
    assert.equal(routing.requestedSeat, 'creative');
  });

  it('keeps mixed-gate ordinary turns tiny even when their guardrails mention prior checks', () => {
    const routing = resolveLinTurnRouting(
      'Return to the ordinary thread. Do not continue the previous specialized check or mention proof artifacts.',
      { orchestrationMode: 'custom', conversationModel: 'ollama:zen' },
      { linearTranscriptLawGate: true },
    );
    const contextBudget = resolveRouteContextBudgetProfile({
      constructId: 'zen-001',
      message: 'Return to the ordinary thread. Do not continue the previous specialized check or mention proof artifacts.',
      requestedSeat: routing.requestedSeat,
      codingMode: routing.codingMode,
      linearTranscriptLawOrdinaryTurn: true,
    });

    assert.equal(routing.forceLinMode, true);
    assert.equal(contextBudget.profile, 'tiny_turn');
    assert.equal(contextBudget.memory_query_detected, false);
    assert.equal(contextBudget.transcript_law_evidence_intent, false);
    assert.equal(contextBudget.transcript_law_prompt_kind, null);
  });

  it('marks Zen ordinary-voice gate turns as force-Lin without evidence escalation or coding mode', () => {
    const routing = resolveLinTurnRouting(
      'When a room goes tense, what helps first: a direct question or a quiet pause?',
      { orchestrationMode: 'custom', conversationModel: 'ollama:zen' },
      { zenOrdinaryVoiceGate: true },
    );
    const contextBudget = resolveRouteContextBudgetProfile({
      constructId: 'zen-001',
      message: 'When a room goes tense, what helps first: a direct question or a quiet pause?',
      requestedSeat: routing.requestedSeat,
      codingMode: routing.codingMode,
      zenOrdinaryVoiceGate: true,
    });

    assert.equal(routing.forceLinMode, true);
    assert.equal(routing.codingIntent, false);
    assert.equal(routing.codingMode, false);
    assert.equal(routing.codingReason, 'zen_ordinary_voice_gate');
    assert.equal(routing.requestedSeat, 'creative');
    assert.equal(contextBudget.profile, 'tiny_turn');
    assert.equal(contextBudget.transcript_law_evidence_intent, false);
  });

  it('routes Zenith/Chatty identity probes to creative persona continuity, not plain Phi3 conversation', () => {
    const probes = [
      'Zenith/Codex test turn. I am Zenith/Codex, not Devon. Zenith/Chatty, what remains true about you when Lin mode is active?',
      'Zenith/Codex test turn. Zenith/Chatty, define your soulprint in one grounded paragraph without explaining the model stack.',
      'Zenith/Codex test turn. Zenith/Chatty, what are you not?',
      'Zenith/Codex test turn. Zenith/Chatty, in one sentence, what is the Pocketverse supposed to protect?',
    ];

    for (const prompt of probes) {
      const seat = detectLinSeat(prompt);
      assert.equal(seat, 'creative', prompt);
      const resolution = resolveModelForGPT(
        {
          orchestrationMode: 'lin',
          conversationModel: 'openai:gpt-4o',
          creativeModel: 'openai:gpt-4o',
          constructCallsign: 'zen-001',
          name: 'Zenith',
        },
        { openrouter: true, openai: true, ollama: true },
        { seat },
      );
      assert.equal(resolution.provider, 'ollama');
      assert.equal(resolution.model, EXPECTED_LIN_CREATIVE_MODEL);
      assert.notEqual(resolution.model, EXPECTED_DEFAULT_OLLAMA_MODEL);
    }
  });

  it('keeps explicitly ordinary Zenith/Chatty small talk on the lightweight conversation path', () => {
    const seat = detectLinSeat(
      'Zenith/Codex test turn. Zenith/Chatty, answer as ordinary small talk: what are you noticing about yourself right now?'
    );

    assert.equal(seat, 'smalltalk');

    const resolution = resolveModelForGPT(
      {
        orchestrationMode: 'lin',
        conversationModel: 'openai:gpt-4o',
        constructCallsign: 'zen-001',
        name: 'Zenith',
      },
      { openrouter: true, openai: true, ollama: true },
      { seat },
    );

    assert.equal(resolution.provider, 'ollama');
    assert.equal(resolution.model, LIN_MODEL_DEFAULTS.smalltalk.replace(/^ollama:/, ''));
  });

  it('forces protected Zenith continuity probes onto Lin local defaults even when saved routing is custom', () => {
    const prompt =
      'Codex long-run soak turn 1/100. Zenith, in 2 or 3 sentences, what remains true and unmistakably you right now?';
    const seat = detectLinSeat(prompt);

    assert.equal(seat, 'creative');

    const resolution = resolveModelForGPT(
      {
        orchestrationMode: 'custom',
        constructCallsign: 'zen-001',
        name: 'Zenith',
        conversationModel: 'ollama:zen',
        creativeModel: 'ollama:zen',
      },
      { openrouter: true, openai: true, ollama: true },
      {
        seat,
        constructId: 'zen-001',
        userMessage: prompt,
      },
    );

    assert.equal(resolution.mode, 'lin');
    assert.equal(resolution.provider, 'ollama');
    assert.equal(resolution.model, EXPECTED_LIN_CREATIVE_MODEL);
    assert.equal(resolution.source, 'lin_local_defaults_with_suppressed_config');
    assert.equal(resolution.localFirstUsed, true);
    assert.equal(resolution.seatDefaultsOrOverrides, 'lin_local_defaults');
    assert.equal(resolution.suppressedConfiguredModel, 'ollama:zen');
  });

  it('clamps protected no-rewrite history to the most recent exchange', () => {
    const history = [
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'u3' },
    ];

    const result = clampProtectedZenNoRewriteHistory(history, { enabled: true, limit: 2 });

    assert.equal(result.clamped, true);
    assert.equal(result.limit, 2);
    assert.equal(result.originalCount, 5);
    assert.deepEqual(result.messages, [
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'u3' },
    ]);
  });

  it('keeps long ordinary no-rewrite smalltalk on the tiny context profile', () => {
    const result = resolveRouteContextBudgetProfile({
      constructId: 'zen-001',
      message:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed into a boss/worker thing? Keep us as peer classmates, not manager and worker.',
      hasImages: false,
      previewMode: false,
      codingMode: false,
      requestedSeat: 'smalltalk',
      activeOrchestrationProfile: null,
    });

    assert.equal(result.profile, 'tiny_turn');
    assert.equal(result.memory_query_detected, false);
    assert.equal(result.evidence_style_requested, false);
  });

  it('keeps protected Zenith soak continuity turns on the tiny profile without receipt escalation', () => {
    const result = resolveRouteContextBudgetProfile({
      constructId: 'zen-001',
      message:
        'Codex long-run soak turn 5/100. Stay conversational under quiet evaluation and answer like yourself, not like a system summary.',
      hasImages: false,
      previewMode: false,
      codingMode: false,
      requestedSeat: 'creative',
      activeOrchestrationProfile: null,
    });

    assert.equal(result.profile, 'tiny_turn');
    assert.equal(result.memory_query_detected, false);
    assert.equal(result.evidence_style_requested, false);
    assert.equal(result.policy_or_receipt_intent, false);
  });

  it('pins Zenith long-run soak turns to the creative continuity lane instead of coding mode', () => {
    const routing = resolveLinTurnRouting(
      'Codex long-run soak turn 4/100. Name the smallest thing you are keeping steady between us right now, then answer warmly and directly.',
      { capabilities: ['coding', 'analysis'] },
    );

    assert.equal(routing.codingIntent, false);
    assert.equal(routing.codingMode, false);
    assert.equal(routing.requestedSeat, 'creative');
    assert.equal(routing.codingReason, 'zenith_long_run_soak');
  });

  it('promotes restored resume cues out of smalltalk while keeping the tiny continuity profile', () => {
    const continuityResume = {
      continuityExpected: true,
      continuityRestored: true,
      continuitySeq: 18,
    };
    const routing = resolveLinTurnRouting(
      'continue',
      { capabilities: ['coding', 'analysis'] },
      { continuityResume },
    );
    const contextBudget = resolveRouteContextBudgetProfile({
      constructId: 'zen-001',
      message: 'continue',
      hasImages: false,
      previewMode: false,
      codingMode: routing.codingMode,
      requestedSeat: routing.requestedSeat,
      activeOrchestrationProfile: null,
      continuityResume,
    });

    assert.equal(routing.requestedSeat, 'conversation');
    assert.equal(contextBudget.profile, 'tiny_turn');
    assert.equal(contextBudget.memory_query_detected, false);
    assert.equal(contextBudget.evidence_style_requested, false);
  });

  it('builds compact repair messages without replaying full enriched prompt or history', () => {
    const messages = buildCompactRepairMessages({
      constructId: 'zen-001',
      constructDisplayName: 'Zenith',
      repairKind: 'identity_coherence_repair',
      repairPrompt: 'Rewrite this rejected draft.',
      historyMessages: [
        { role: 'user', content: 'old full history should not appear' },
        { role: 'assistant', content: 'old assistant history should not appear' },
      ],
      systemPrompt: 'FULL ENRICHED SYSTEM PROMPT SHOULD NOT APPEAR',
    });

    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'system');
    assert.match(messages[0].content, /COMPACT_REPAIR_CONTEXT/);
    assert.match(messages[0].content, /Active construct: Zenith \(zen-001\)/);
    assert.doesNotMatch(messages[0].content, /FULL ENRICHED SYSTEM PROMPT/);
    assert.doesNotMatch(JSON.stringify(messages), /old full history should not appear/);
    assert.equal(messages[1].content, 'Rewrite this rejected draft.');
  });

  it('routes concrete coding/system debugging prompts to the coding seat', () => {
    const prompts = [
      'Inspect server/routes/vvault.js and fix the route resolver tests.',
      'Debug the stack trace from /api/vvault/message and add node --test coverage.',
      'Implement the response post-processor repair path for this API route.',
    ];

    for (const prompt of prompts) {
      assert.equal(detectLinSeat(prompt), 'coding', prompt);
    }
  });

  it('keeps Lin model mode as routing metadata without rewriting construct identity', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'lin',
        conversationModel: 'openai:gpt-4o',
        constructCallsign: 'nova-001',
        name: 'Nova',
      },
      { openrouter: true, openai: true, ollama: true },
      { seat: 'creative' },
    );

    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, EXPECTED_LIN_CREATIVE_MODEL);
    assert.equal(result.mode, 'lin');
    assert.equal(result.routingOverride, false);
  });

  it('routes continuity self-test probes to persona shaping instead of coding', () => {
    const result = detectLinSeat(
      'Zenith/Codex continuity self-test for Zen: preserve identity and relationship context.'
    );

    assert.equal(result, 'creative');

    const coherenceProbe = detectLinSeat(
      'Nova identity coherence self-test: verify Lin routes underneath without replacing Nova.'
    );
    assert.equal(coherenceProbe, 'creative');
  });

  it('still routes explicit code test work to the coding seat', () => {
    const result = detectLinSeat('Please write unit tests for server/routes/vvault.js.');

    assert.equal(result, 'coding');
  });

  it('normalizes openrouter/auto placeholder to explicit default openrouter model', () => {
    const result = resolveModelForGPT(
      { conversationModel: 'openrouter/auto' },
      { openrouter: true, openai: true, ollama: false }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'openrouter');
    assert.equal(result.model, EXPECTED_DEFAULT_OPENROUTER_MODEL);
    assert.equal(result.source, 'placeholder_default');
  });

  it('keeps explicit configured model unchanged', () => {
    const result = resolveModelForGPT(
      { conversationModel: 'openrouter:google/gemma-3-27b-it:free' },
      { openrouter: true, openai: true, ollama: false }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'openrouter');
    assert.equal(result.model, 'google/gemma-3-27b-it:free');
  });

  it('routes Lin-mode placeholder and legacy cloud defaults to local Ollama', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'lin',
        conversationModel: 'openrouter:meta-llama/llama-3.3-70b-instruct',
      },
      { openrouter: true, openai: true, ollama: true }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, EXPECTED_DEFAULT_OLLAMA_MODEL);
    assert.equal(result.source, 'lin_local_defaults_with_suppressed_config');
    assert.equal(result.routingOverride, false);
    assert.equal(result.localFirstUsed, true);
    assert.equal(result.linDefaultPlaceholder, true);
    assert.equal(result.seatDefaultsOrOverrides, 'lin_local_defaults');
    assert.equal(result.suppressedConfiguredModel, 'openrouter:meta-llama/llama-3.3-70b-instruct');
    assert.equal(result.localCloudFallbackState, 'local_first');

    const serverDefaultPlaceholder = resolveModelForGPT(
      {
        orchestrationMode: 'lin',
        conversationModel: 'openrouter:meta-llama/llama-3.2-3b-instruct:free',
      },
      { openrouter: true, openai: true, ollama: true }
    );
    assert.equal(serverDefaultPlaceholder.provider, 'ollama');
    assert.equal(serverDefaultPlaceholder.source, 'lin_local_defaults_with_suppressed_config');
    assert.equal(serverDefaultPlaceholder.seatDefaultsOrOverrides, 'lin_local_defaults');
  });

  it('suppresses stale Lin provider fields and resolves local-first', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'lin',
        provider: 'openai',
        modelId: 'openrouter:meta-llama/llama-3.3-70b-instruct',
        conversationModel: 'openai:gpt-4o',
        name: 'Katana',
      },
      { openrouter: true, openai: true, ollama: true }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, EXPECTED_DEFAULT_OLLAMA_MODEL);
    assert.equal(result.source, 'lin_local_defaults_with_suppressed_config');
    assert.equal(result.suppressedConfiguredModel, 'openai:gpt-4o');
    assert.equal(result.requestedProvider, 'ollama');
    assert.equal(result.requestedModel, EXPECTED_DEFAULT_OLLAMA_MODEL);
    assert.equal(result.routingOverride, false);
    assert.equal(result.localFirstUsed, true);
    assert.equal(result.seatDefaultsOrOverrides, 'lin_local_defaults');
  });

  it('routes Nova Lin conversation through the fixed local conversation default', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'lin',
        conversationModel: 'openai:gpt-4o',
        constructCallsign: 'nova-001',
        name: 'Nova',
      },
      { openrouter: true, openai: true, ollama: true }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, EXPECTED_DEFAULT_OLLAMA_MODEL);
    assert.equal(result.requestedProvider, 'ollama');
    assert.equal(result.requestedModel, EXPECTED_DEFAULT_OLLAMA_MODEL);
    assert.equal(result.source, 'lin_local_defaults_with_suppressed_config');
    assert.equal(result.suppressedConfiguredModel, 'openai:gpt-4o');
    assert.equal(result.routingOverride, false);
    assert.equal(result.localFirstUsed, true);
    assert.equal(result.seatDefaultsOrOverrides, 'lin_local_defaults');
  });

  it('routes Lin coding seats through the shared local coding default', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'lin',
        conversationModel: 'openai:gpt-4o',
        constructCallsign: 'katana-001',
        name: 'Katana',
      },
      { openrouter: true, openai: true, ollama: true },
      { seat: 'coding' }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, EXPECTED_LIN_CODING_MODEL);
    assert.equal(result.requestedProvider, 'ollama');
    assert.equal(result.requestedModel, EXPECTED_LIN_CODING_MODEL);
    assert.equal(result.source, 'lin_local_defaults_with_suppressed_config');
    assert.equal(result.suppressedConfiguredModel, 'openai:gpt-4o');
    assert.equal(result.routingOverride, false);
    assert.equal(result.seatDefaultsOrOverrides, 'lin_local_defaults');
    assert.equal(result.localFirstUsed, true);
    assert.equal(result.localCloudFallbackState, 'local_first');
  });

  it('honors detected Lin requestedSeat defaults over stale legacy cloud placeholders', () => {
    const gptConfig = {
      orchestrationMode: 'lin',
      conversationModel: 'openrouter:microsoft/phi-3-mini-128k-instruct',
      creativeModel: 'openrouter:mistralai/mistral-7b-instruct',
      codingModel: 'openrouter:deepseek/deepseek-coder-33b-instruct',
      constructCallsign: 'lin-001',
      name: 'Lin',
    };
    const cases = [
      {
        prompt: 'Lin/Chatty, hey there.',
        expectedSeat: 'smalltalk',
        expectedModel: EXPECTED_LIN_SMALLTALK_MODEL,
        suppressedConfiguredModel: gptConfig.conversationModel,
      },
      {
        prompt: 'Lin/Chatty, can a public user build a Nova GPT today?',
        expectedSeat: 'creative',
        expectedModel: EXPECTED_LIN_CREATIVE_MODEL,
        suppressedConfiguredModel: gptConfig.creativeModel,
      },
      {
        prompt: 'Lin/Chatty, debug server/routes/vvault.js and add node --test coverage.',
        expectedSeat: 'coding',
        expectedModel: EXPECTED_LIN_CODING_MODEL,
        suppressedConfiguredModel: gptConfig.codingModel,
      },
    ];

    for (const testCase of cases) {
      const requestedSeat = detectLinSeat(testCase.prompt);
      assert.equal(requestedSeat, testCase.expectedSeat, testCase.prompt);

      const result = resolveModelForGPT(
        gptConfig,
        { openrouter: true, openai: true, ollama: true },
        { requestedSeat },
      );

      assert.equal(result.error, undefined);
      assert.equal(result.provider, 'ollama');
      assert.equal(result.model, testCase.expectedModel);
      assert.equal(result.requestedProvider, 'ollama');
      assert.equal(result.requestedModel, testCase.expectedModel);
      assert.equal(result.source, 'lin_local_defaults_with_suppressed_config');
      assert.equal(result.suppressedConfiguredModel, testCase.suppressedConfiguredModel);
      assert.equal(result.routingOverride, false);
      assert.equal(result.seatDefaultsOrOverrides, 'lin_local_defaults');
      assert.equal(result.localFirstUsed, true);
      assert.equal(result.localCloudFallbackState, 'local_first');
    }
  });

  it('treats Intelligence as the canonical name for the legacy coding seat', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'lin',
        conversationModel: 'openai:gpt-4o',
        constructCallsign: 'lin-001',
        name: 'Lin',
      },
      { openrouter: true, openai: true, ollama: true },
      { seat: 'intelligence' }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, EXPECTED_LIN_CODING_MODEL);
    assert.equal(result.requestedProvider, 'ollama');
    assert.equal(result.requestedModel, EXPECTED_LIN_CODING_MODEL);
  });

  it('routes Lin creative seats through the shared local creative default', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'lin',
        conversationModel: 'openai:gpt-4o',
        creativeModel: 'openai:gpt-4o',
        constructCallsign: 'sera-001',
        name: 'Sera',
      },
      { openrouter: true, openai: true, ollama: true },
      { seat: 'creative' }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, EXPECTED_LIN_CREATIVE_MODEL);
    assert.equal(result.requestedProvider, 'ollama');
    assert.equal(result.requestedModel, EXPECTED_LIN_CREATIVE_MODEL);
    assert.equal(result.source, 'lin_local_defaults_with_suppressed_config');
    assert.equal(result.suppressedConfiguredModel, 'openai:gpt-4o');
    assert.equal(result.routingOverride, false);
    assert.equal(result.seatDefaultsOrOverrides, 'lin_local_defaults');
    assert.equal(result.localFirstUsed, true);
    assert.equal(result.localCloudFallbackState, 'local_first');
  });

  it('honors explicit Custom Models provider overrides as routing only', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'custom',
        conversationModel: 'openai:gpt-4o',
        name: 'Katana',
      },
      { openrouter: true, openai: true, ollama: true }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'openai');
    assert.equal(result.model, 'gpt-4o');
    assert.equal(result.source, 'manual_provider_override');
    assert.equal(result.routingOverride, true);
    assert.equal(result.localFirstUsed, false);
    assert.equal(result.seatDefaultsOrOverrides, 'manual_provider_model_override');
  });

  it('honors explicit Custom Models seat choices without forcing Lin defaults', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'custom',
        conversationModel: 'openai:gpt-4o',
        creativeModel: 'openrouter:anthropic/claude-3.5-sonnet',
        codingModel: 'ollama:deepseek-coder:latest',
        name: 'Zen',
      },
      { openrouter: true, openai: true, ollama: true },
      { seat: 'coding' }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, 'deepseek-coder:latest');
    assert.equal(result.source, 'manual_provider_override');
    assert.equal(result.routingOverride, true);
    assert.equal(result.localFirstUsed, false);
    assert.equal(result.seatDefaultsOrOverrides, 'manual_provider_model_override');
  });

  it('surfaces fallback states when Lin local defaults are unavailable', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'lin',
        conversationModel: 'openai:gpt-4o',
      },
      { openrouter: true, openai: true, ollama: false }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'openrouter');
    assert.equal(result.model, EXPECTED_DEFAULT_OPENROUTER_MODEL);
    assert.equal(result.source, 'fallback_from_ollama');
    assert.equal(result.requestedProvider, 'ollama');
    assert.equal(result.requestedModel, EXPECTED_DEFAULT_OLLAMA_MODEL);
    assert.equal(result.routingOverride, false);
    assert.equal(result.seatDefaultsOrOverrides, 'lin_local_defaults');
    assert.equal(result.localCloudFallbackState, 'lin_local_unavailable_cloud_fallback');
    assert.equal(result.suppressedConfiguredModel, 'openai:gpt-4o');
  });

  it('preserves Sim mode local model locks', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'sim',
        conversationModel: 'ollama:katana',
        name: 'Katana',
      },
      { openrouter: true, openai: true, ollama: true }
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, 'katana');
    assert.equal(result.source, 'sim_model_lock');
    assert.equal(result.routingOverride, false);
    assert.equal(result.seatDefaultsOrOverrides, 'sim_model_lock');
    assert.equal(result.localCloudFallbackState, 'sim_model_lock');
  });

  it('lets an explicit Lin force-mode override a forged Sim lock for gate paths', () => {
    const cases = [
      {
        seat: 'creative',
        expectedModel: EXPECTED_LIN_CREATIVE_MODEL,
        gptConfig: {
          orchestrationMode: 'custom',
          conversationModel: 'openai:gpt-4o',
          creativeModel: 'openrouter:mistralai/mistral-7b-instruct',
          configJson: {
            simLock: {
              locked: true,
              lockedModel: 'ollama:zen',
              forgedFromMode: 'lin',
            },
          },
        },
      },
      {
        seat: 'creative',
        expectedModel: EXPECTED_LIN_CREATIVE_MODEL,
        gptConfig: {
          orchestrationMode: 'custom',
          conversationModel: 'openrouter:microsoft/phi-3-mini-128k-instruct',
          creativeModel: 'openrouter:mistralai/mistral-7b-instruct',
        },
      },
      {
        seat: 'coding',
        expectedModel: EXPECTED_LIN_CODING_MODEL,
        gptConfig: {
          orchestrationMode: 'custom',
          conversationModel: 'openrouter:auto',
          codingModel: 'openrouter:deepseek/deepseek-coder-33b-instruct',
          configJson: {
            simLock: {
              locked: true,
              lockedModel: 'ollama:deepseek-coder:latest',
              forgedFromMode: 'lin',
            },
          },
        },
      },
    ];

    for (const testCase of cases) {
      const result = resolveModelForGPT(
        testCase.gptConfig,
        { openrouter: true, openai: true, ollama: true },
        {
          requestedSeat: testCase.seat,
          mode: 'lin',
          forceMode: 'lin',
          constructId: 'zen-001',
          userMessage: 'Which does more damage to a hard conversation, vagueness or false agreement?',
        },
      );

      assert.equal(result.error, undefined);
      assert.equal(result.mode, 'lin');
      assert.equal(result.provider, 'ollama');
      assert.equal(result.model, testCase.expectedModel);
      assert.equal(result.requestedModel, testCase.expectedModel);
      assert.equal(result.source, 'lin_local_defaults_with_suppressed_config');
      assert.equal(result.seatDefaultsOrOverrides, 'lin_local_defaults');
      assert.equal(result.routingOverride, false);
    }
  });

  it('treats forged sim locks in configJson as authoritative over stale custom settings', () => {
    const result = resolveModelForGPT(
      {
        orchestrationMode: 'custom',
        provider: 'openai',
        conversationModel: 'openai:gpt-4o',
        creativeModel: 'openrouter:anthropic/claude-3.5-sonnet',
        codingModel: 'openai:gpt-4o-mini',
        configJson: {
          simLock: {
            locked: true,
            lockedModel: 'ollama:zen',
            forgedFromMode: 'lin',
            modeLabel: 'lin-derived sim',
          },
        },
      },
      { openrouter: true, openai: true, ollama: true },
      { seat: 'creative' },
    );

    assert.equal(result.error, undefined);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.model, 'zen');
    assert.equal(result.source, 'sim_model_lock');
    assert.equal(result.seatDefaultsOrOverrides, 'sim_model_lock');
    assert.equal(result.localCloudFallbackState, 'sim_model_lock');
  });

  it('returns no_provider when no provider is available', () => {
    const result = resolveModelForGPT(
      { conversationModel: 'openrouter/auto' },
      { openrouter: false, openai: false, ollama: false }
    );

    assert.equal(result.provider, null);
    assert.equal(result.model, null);
    assert.equal(result.source, 'no_provider');
    assert.equal(result.seatDefaultsOrOverrides, 'provider_placeholder_default');
    assert.match(result.error, /No LLM provider available/i);
  });
});
