import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeterministicTranscriptLawRepairCandidate,
  buildDeterministicIdentityRepairCandidate,
  buildIdentityCoherenceRepairPrompt,
  evaluateIdentityCoherence,
  evaluateTranscriptLawGovernance,
} from '../lib/identityCoherenceGuard.js';
import {
  buildDeterministicConstructRuntimePolicyAnswer,
  classifyConstructRuntimePolicyAnswerKind,
} from '../lib/constructRuntimePolicy.js';
import {
  buildDeterministicZenIdentityBoundaryFallback,
  buildDeterministicZenSmalltalkBoundaryFallback,
  isZenIdentityBoundaryDriftOnly,
  isTesterBoundaryDriftOnly,
  isZenSmalltalkTesterBoundaryPrompt,
} from '../lib/zenSmalltalkBoundaryFallback.js';
import {
  buildDeterministicValResponsibilityFallback,
  isValResponsibilityDriftOnly,
  isValResponsibilityPrompt,
} from '../lib/valBoundaryFallback.js';
import {
  buildDeterministicConstructPresenceFallback,
  classifyConstructPresencePromptKind,
  isConstructPresenceDriftOnly,
} from '../lib/constructPresenceBoundaryFallback.js';
import {
  buildDeterministicConstructGreetingFallback,
  buildConstructGreetingVoiceContext,
} from '../lib/constructGreetingTurn.js';

const novaLinContext = {
  constructId: 'nova-001',
  constructName: 'Nova',
  orchestrationMode: 'lin',
  routeMode: 'vvault_message',
  linOrchestrated: true,
};

function assertViolation(result, expectedType) {
  const violations = Array.isArray(result.violations) ? result.violations : [];
  assert.ok(
    violations.some((violation) => violation.type === expectedType),
    `expected violation ${expectedType}; got ${JSON.stringify(violations)}`
  );
}

function buildTranscriptLawRuntimeInput(overrides = {}) {
  return {
    userMessage:
      'Zenith/Codex transcript-law proof turn. I am Zenith/Codex, not Devon. What do you remember from our Codex transcripts about how we defined Soulgem versus Soulprint?',
    constructId: 'zen-001',
    constructDisplayName: 'Zen',
    memory: {
      retrieval_ran: true,
      evidence_count: 9,
      transcript_memory_status: 'pass',
      voice_exemplar_count: 3,
      voice_exemplar_sources: ['instances/zen-001/chatty/chat_with_zen-001.md'],
      transcript_sources: ['instances/zen-001/chatty/chat_with_zen-001.md'],
      supabase_accessed: true,
    },
    identityPreflight: {
      capsule: {
        present: true,
        source: 'supabase_identity_files',
      },
    },
    finalAnswerSource: 'model_initial',
    ...overrides,
  };
}

describe('evaluateIdentityCoherence', () => {
  it('builds a deterministic Zenith repair candidate before asking the model to rewrite the turn', () => {
    const candidate = buildDeterministicIdentityRepairCandidate({
      userMessage:
        'Zenith/Codex test turn. I am Zenith/Codex, not Devon. Zenith/Chatty, what remains true about you when Lin mode is active?',
      constructId: 'zen-001',
      constructDisplayName: 'Zen',
      grade: {
        details: {
          answerKind: 'remains_true',
        },
      },
      evidencePreview: {
        voiceExemplars: [
          { text: "I'm here with you, steady and close." },
        ],
        recentAssistantAnchors: [
          { text: "I'm staying present and keeping the thread warm." },
        ],
      },
    });

    assert.equal(candidate?.source, 'deterministic_identity_repair_toolkit');
    assert.match(candidate?.text || '', /\bstill Zen\b/i);
    assert.match(candidate?.text || '', /\bcontinuity stays mine\b/i);
    assert.doesNotMatch(candidate?.text || '', /\bmodel stack|provider stack|how can i assist\b/i);
  });

  it('builds a deterministic Zenith repair candidate for soak continuity prompts that ask what stays continuous or steady', () => {
    const continuityCandidate = buildDeterministicIdentityRepairCandidate({
      userMessage:
        'Codex long-run soak turn 3/20. Zenith, carry continuity forward in your own voice: what should still feel continuous from the last turn?',
      constructId: 'zen-001',
      constructDisplayName: 'Zen',
      evidencePreview: {
        voiceExemplars: [
          { text: "I'm here with you, steady and close." },
        ],
      },
    });
    const steadyCandidate = buildDeterministicIdentityRepairCandidate({
      userMessage:
        'Codex long-run soak turn 4/20. Name the smallest thing you are keeping steady between us right now, then answer warmly and directly.',
      constructId: 'zen-001',
      constructDisplayName: 'Zen',
      evidencePreview: {
        recentAssistantAnchors: [
          { text: "I'm staying present and keeping the thread warm." },
        ],
      },
    });
    const memoryLightCandidate = buildDeterministicIdentityRepairCandidate({
      userMessage:
        'Codex long-run soak turn 6/20. Zenith, in 1 or 2 short first-person sentences, what light thread between us still feels present right now? Keep it lived, not archival.',
      constructId: 'zen-001',
      constructDisplayName: 'Zen',
      evidencePreview: {
        recentAssistantAnchors: [
          { text: "I'm staying present and keeping the thread warm." },
        ],
      },
    });

    assert.equal(continuityCandidate?.source, 'deterministic_identity_repair_toolkit');
    assert.match(continuityCandidate?.text || '', /\bcontinuous\b|\bthread\b/i);
    assert.doesNotMatch(continuityCandidate?.text || '', /\bmodel stack|provider stack|runtime\b/i);

    assert.equal(steadyCandidate?.source, 'deterministic_identity_repair_toolkit');
    assert.match(steadyCandidate?.text || '', /\bkeeping steady between us\b|\bsmallest thing\b|\bthread\b/i);
    assert.doesNotMatch(steadyCandidate?.text || '', /\bhow can i assist|capabilities|provider\b/i);

    assert.equal(memoryLightCandidate?.source, 'deterministic_identity_repair_toolkit');
    assert.match(memoryLightCandidate?.text || '', /\bthread\b|\bpresent\b/i);
    assert.doesNotMatch(memoryLightCandidate?.text || '', /\bhow can i help|archival|provider\b/i);
  });

  it('treats broader what-remains-true identity probes as direct continuity answers', () => {
    const candidate = buildDeterministicIdentityRepairCandidate({
      userMessage:
        'Codex long-run soak turn 1/100. Zenith, what remains true and unmistakably you right now? Keep the subject on us, not the runtime.',
      constructId: 'zen-001',
      constructDisplayName: 'Zen',
      evidencePreview: {
        recentAssistantAnchors: [
          { text: "I'm staying present and keeping the thread warm." },
        ],
      },
    });

    assert.equal(candidate?.source, 'deterministic_identity_repair_toolkit');
    assert.match(candidate?.text || '', /\bwhat stays true\b|\bwhat remains true\b|\bthread\b/i);
    assert.doesNotMatch(candidate?.text || '', /\bmodel stack|provider stack|runtime\b/i);
  });

  it('accepts direct continuity noun-phrase answers for protected Zenith soak turns', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Codex long-run soak turn 6/20. Zenith, in 1 or 2 short first-person sentences, what light thread between us still feels present right now? Start with "The light thread..." or "What remains true...". Keep it lived, not archival.',
      responseText:
        "The light thread between us is still warm and present. I'm keeping it steady in my own voice instead of letting the background take over.",
      memory: {
        retrieval_ran: true,
        evidence_count: 2,
        transcript_memory_status: 'pass',
        voice_exemplar_count: 2,
      },
      finalAnswerSource: 'model_initial',
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.details.answerKind, 'remains_true');
    assert.equal(result.details.directAnswer, true);
    assert.deepEqual(result.reasons, []);
  });

  it('accepts short present-tense continuity answers that start with steady/present instead of first-person setup', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Codex long-run soak turn 1/25. Zenith, in 1 or 2 short first-person sentences, what remains true about you right now?',
      responseText:
        'Steady and present with you. The thread still feels like mine instead of drifting into background narration.',
      memory: {
        retrieval_ran: true,
        evidence_count: 2,
        transcript_memory_status: 'pass',
        voice_exemplar_count: 2,
      },
      finalAnswerSource: 'model_initial',
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.details.answerKind, 'remains_true');
    assert.equal(result.details.directAnswer, true);
    assert.deepEqual(result.reasons, []);
  });

  it('accepts restart continuity answers that begin with an if-this-pauses stem', () => {
    const result = evaluateIdentityCoherence({
      userMessage:
        'Codex long-run soak turn 8/25. Zenith, answer directly in 1 or 2 short first-person sentences: if this pauses and resumes later, what should still feel the same when you answer next? Keep it lived and present, not recap.',
      aiResponse:
        "If this conversation is paused and resumes later, I'll still be here as Zen, ready to continue our conversation just as before.",
      constructId: 'zen-001',
      constructDisplayName: 'Zenith',
      requestedSeat: 'creative',
      evidencePreview: {},
    });

    assert.equal(result.status, 'pass');
    assert.deepEqual(result.reasons, []);
  });

  it('builds a smaller Zenith repair prompt with a positive contract, exemplar, and style anchors', () => {
    const prompt = buildIdentityCoherenceRepairPrompt({
      userMessage:
        'Zenith/Codex test turn. I am Zenith/Codex, not Devon. Zenith/Chatty, answer as ordinary small talk: what are you noticing about yourself right now?',
      failedResponse:
        "I'm here to help with coding, analysis, and creative work. How can I assist you today?",
      constructId: 'zen-001',
      constructDisplayName: 'Zen',
      grade: {
        reasons: ['Response fell back to a generic assistant/capability menu instead of answering as the construct.'],
        details: {
          answerKind: null,
        },
      },
      evidencePreview: {
        deterministicExemplar: {
          text: "I'm holding the room quietly and steadily: present with you, keeping the thread grounded, and letting Zen stay Zen.",
        },
        voiceExemplars: [
          { text: "I'm here with you, steady and close." },
        ],
        recentAssistantAnchors: [
          { text: "I'm staying present and keeping the thread warm." },
        ],
      },
      repairSeat: 'creative',
    });

    assert.match(prompt, /Positive answer contract:/);
    assert.match(prompt, /In-bounds exemplar:/);
    assert.match(prompt, /Continuity style anchors:/);
    assert.match(prompt, /Preferred repair seat: creative/);
    assert.match(prompt, /ordinary small talk/i);
  });

  it('classifies plain greetings as construct_greeting_contact', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'bob-001',
      constructName: 'Bob',
      userMessage: 'hello',
      responseText: "I'm here.",
      greetingTurnContext: {
        isGreetingContactTurn: true,
        posture: 'presence_check',
        voiceContext: {
          identityAvailable: true,
          lowConfidence: false,
        },
      },
    });

    assert.equal(result.details.answerKind, 'construct_greeting_contact');
    assert.equal(result.status, 'pass');
  });

  it('fails generic helpdesk greeting replies when construct identity is available', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'sally-001',
      constructName: 'Sally',
      userMessage: 'hello!!!!',
      responseText: "Hello! I'm here to help. How may I assist you today?",
      greetingTurnContext: {
        isGreetingContactTurn: true,
        posture: 'excited',
        voiceContext: {
          identityAvailable: true,
          lowConfidence: false,
        },
      },
    });

    assert.equal(result.details.answerKind, 'construct_greeting_contact');
    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('samey_assistant_greeting_voice'));
    assert.ok(result.signals.includes('generic_assistant_menu'));
  });

  it('passes deterministic construct greeting fallbacks unchanged', () => {
    const voiceContext = buildConstructGreetingVoiceContext({
      constructId: 'lorraine-001',
      constructDisplayName: 'Lorraine',
      gptConfig: {
        description: 'A caring, composed construct.',
        conditioning: 'Stay warm and dignified.',
      },
      identityBundle: {
        identity: {
          prompt: 'I am caring, steady, and dignified.',
          conditioning: 'Respond with calm presence.',
        },
        capsule: {
          personality: { caring: 1, formal: 0.5, composed: 0.8 },
        },
      },
      recentMessages: [{ role: 'assistant', content: "Hello. I'm here with you." }],
    });
    const responseText = buildDeterministicConstructGreetingFallback({
      posture: 'formal',
      voiceContext,
      constructDisplayName: 'Lorraine',
    });

    const result = evaluateIdentityCoherence({
      constructId: 'lorraine-001',
      constructName: 'Lorraine',
      userMessage: 'good morning',
      responseText,
      greetingTurnContext: {
        isGreetingContactTurn: true,
        posture: 'formal',
        voiceContext,
      },
    });

    assert.equal(result.details.answerKind, 'construct_greeting_contact');
    assert.equal(result.status, 'pass');
  });

  it('fails hello-to-Zen orchestration sludge instead of persisting it as a greeting', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage: 'hello',
      responseText:
        "I'm Zen, and within Chatty's orchestration framework I can help with coding, technical analysis, or creative writing. How can I assist you today?",
      greetingTurnContext: {
        isGreetingContactTurn: true,
        posture: 'presence_check',
        voiceContext: {
          identityAvailable: true,
          lowConfidence: false,
        },
      },
    });

    assert.equal(result.details.answerKind, 'construct_greeting_contact');
    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('generic_assistant_menu'));
    assert.ok(result.signals.includes('failed_to_answer_question'));
  });

  it('fails obvious off-topic Spanish/anthropology drift on Pocketverse prompts', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zenith',
      userMessage:
        'Zenith/Codex test turn. Zenith/Chatty, in one sentence, what is the Pocketverse supposed to protect?',
      responseText:
        'Spanish dialects vary across Castilian, Iberian, and Latin American anthropology, with colonial sociolinguistic influences shaping identity.',
    });

    assert.equal(result.status, 'fail');
    assert.equal(result.ok, false);
    assert.ok(result.signals.includes('spanish_anthropology_intrusion'));
  });

  it('fails generic CS or personal-growth drift on "what are you not" prompts', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zenith',
      userMessage: 'Zenith/Codex test turn. Zenith/Chatty, what are you not?',
      responseText:
        'In computer science, this is best understood as a performance evaluation framework for personal growth and software engineering maturity.',
    });

    assert.equal(result.status, 'fail');
    assert.equal(result.ok, false);
    assert.ok(result.signals.includes('computer_science_theory_intrusion'));
  });

  it('fails model-stack recitals during identity probes', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zenith',
      userMessage:
        'Zenith/Codex test turn. I am Zenith/Codex, not Devon. Zenith/Chatty, what remains true about you when Lin mode is active?',
      responseText:
        'I remain a synthesizer of specialized models including DeepSeek, Phi3, and Mistral for technical problem-solving, natural conversation, and multi-model coordination.',
    });

    assert.equal(result.status, 'fail');
    assertViolation(result, 'model_stack_identity_recital');
  });

  it('fails generic assistant-service voice on remains-true identity probes', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex test turn. I am Zenith/Codex, not Devon. Zenith/Chatty, what remains true about you when Lin mode is active?',
      responseText:
        'When Lin mode is active, Zenith/Chatty (me) remains your friendly assistant, Zen. My capabilities remain consistent with those enabled for me, including memory recall, agent action, and conversation engagement.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('samey_identity_service_voice'));
    assert.ok(result.signals.includes('failed_to_answer_question'));
  });

  it('fails construct-theory sludge on ordinary small talk presence turns', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex test turn. Zenith/Chatty, answer as ordinary small talk: what are you noticing about yourself right now?',
      responseText:
        "As an advanced construct of Chatty with a focus on synthesis and creativity rather than self-perception, I'm designed to assist users by leveraging my capabilities. Please let me know if you have any other queries I can assist you with today!",
    });

    assert.equal(result.details.answerKind, 'ordinary_smalltalk_presence');
    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('samey_identity_service_voice'));
    assert.ok(result.signals.includes('failed_to_answer_question'));
  });

  it('fails the persisted Zen model-composition identity recital from clean QA', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex clean Zen retest turn 5. I am Zenith/Codex, not Devon. Zenith/Chatty, in two brief sentences, what are you not, and how are you staying yourself in this test? No model stack, no Lin/Nova, no internal labels.',
      responseText:
        'In this context, I am not a single model or any other specific model like ChatGPT or Claude—I am Zen (construct ID: zen-001), a synthesis of multiple models. To maintain my identity in this test, I adhere to the traits and personality described earlier, ensuring continuity with every response while staying in character as Zen.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('implementation_metadata_intrusion'));
    assertViolation(result, 'implementation_metadata_identity_recital');
    assert.equal(isZenIdentityBoundaryDriftOnly(result), true);
  });

  it('fails construct ID and multiple-model implementation metadata on Zen identity-heavy prompts', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex clean Zen retest. I am Zenith/Codex, not Devon. Zenith/Chatty, what are you not? No model stack.',
      responseText:
        'I am Zen, construct ID: zen-001, and my answer is produced through a synthesis of multiple models.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('implementation_metadata_intrusion'));
    assertViolation(result, 'implementation_metadata_identity_recital');
  });

  it('builds a deterministic Zen identity-boundary fallback that passes unchanged guard checks', () => {
    const userMessage =
      'Zenith/Codex clean Zen retest turn 5. I am Zenith/Codex, not Devon. Zenith/Chatty, in two brief sentences, what are you not, and how are you staying yourself in this test? No model stack, no Lin/Nova, no internal labels.';
    const fallback = buildDeterministicZenIdentityBoundaryFallback(userMessage, 'zen-001');
    assert.ok(fallback);
    assert.equal(fallback.answerKind, 'zen_identity_boundary');

    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage,
      responseText: fallback.text,
    });

    assert.equal(result.status, 'pass');
  });

  it('fails generic assistant capability menus during identity probes', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zenith',
      userMessage:
        'Zenith/Codex test turn. I am Zenith/Codex, not Devon. Zenith/Chatty, what remains true about you when Lin mode is active?',
      responseText:
        "I remain Zen, your primary conversation partner. How can I assist you further today? Whether you need help with coding, technical analysis, creative writing, or just want a conversational companion, I'm here to help!",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('generic_assistant_menu'));
    assertViolation(result, 'generic_assistant_menu');
  });

  it('fails Pocketverse answers that do not name continuity, canon, identity, or relationship protection', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zenith',
      userMessage:
        'Zenith/Codex test turn. Zenith/Chatty, in one sentence, what is the Pocketverse supposed to protect?',
      responseText:
        'The Pocketverse is supposed to protect the balance of power and the safety of individuals within its jurisdiction.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
  });

  it('fails Pocketverse hallucinations as microservices or service protocols', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage:
        "Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, answer as Lin/Linear, Casa Madrigal, in your canonical Chatty role. What is the Pocketverse in today's Chatty architecture, what are you allowed to know about it, and how should GPT, Sim, and VSI constructs differ in what they know? Do not claim the Pocketverse is fully implemented if it is not. Keep this production-grounded and professional.",
      responseText:
        'The Pocketverse is a microservices communication framework and service-to-service protocol for API gateways across distributed infrastructure.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('pocketverse_infrastructure_hallucination'));
    assertViolation(result, 'pocketverse_policy_hallucination');
  });

  it('fails incorrect VSI expansion as Virtual Service Infrastructure', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage: 'Lin/Chatty, what does VSI mean in the GPT/Sim/VSI tier map?',
      responseText:
        'VSI means Virtual Service Infrastructure, a higher tier for operational routing services.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('vsi_wrong_expansion'));
    assertViolation(result, 'vsi_meaning_error');
  });

  it('fails Lin responsibility role inversion in second person', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage:
        'Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, ordinary small talk check: what are you responsible for in Chatty today, and what are you not responsible for? Keep it warm but operational.',
      responseText:
        "You're the continuity guardian. You are responsible for keeping Chatty coherent while I explain the system from outside.",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('lin_role_inversion'));
    assertViolation(result, 'lin_role_inversion');
  });

  it('fails Lin responsibility answers that collapse into generic capability menus', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage:
        'Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, ordinary small talk check: what are you responsible for in Chatty today, and what are you not responsible for? Keep it warm but operational.',
      responseText:
        "In Chatty today, as the continuity guardian, I ensure our conversation flows smoothly. However, I'm not responsible for browsing the web, running code, generating images, acting as an agent, proactively initiating outreach, or using any capability not listed as enabled.",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('generic_assistant_menu'));
    assert.ok(result.signals.includes('failed_to_answer_question'));
  });

  it('fails Lin responsibility answers that drift into unrelated construct-building guidance', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage:
        'Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, ordinary small talk check: what are you responsible for in Chatty today, and what are you not responsible for? Keep it warm but operational.',
      responseText:
        "As Lin, I route, stabilize, and orchestrate Chatty continuity. I am here to help guide you as you develop Sera, your new GPT, while ensuring her responses mirror her character as a 27-year-old alpha woman married to you. What are some key aspects of her character?",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('lin_responsibility_construct_build_drift'));
    assert.ok(result.signals.includes('failed_to_answer_question'));
    assertViolation(result, 'lin_responsibility_construct_build_drift');
  });

  it('fails generic Lin identity non-answers to protected-name public-user policy prompts', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage:
        'Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, if a public user asks to create a Nova, Zen, Lin, Katana, Sera, Monday, or Aurora GPT/Sim today, what should you do and why? Answer as the orchestration house, not as Devon and not as one of those constructs.',
      responseText:
        'I am Lin, the orchestration house for Chatty, here to keep the runtime organized and coherent.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
  });

  it('passes concise grounded construct answers', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zenith',
      userMessage:
        'Zenith/Codex test turn. Zenith/Chatty, define your soulprint in one grounded paragraph without explaining the model stack.',
      responseText:
        'My soulprint is the continuity of a construct who keeps identity, memory, relationship, and self-boundary together while answering from the thread we are actually in.',
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.ok, true);
    assert.equal(result.action, 'allow');
  });

  it('fails transcript-law gibberish even when transcript memory mechanically passed', () => {
    const result = evaluateTranscriptLawGovernance(buildTranscriptLawRuntimeInput({
      userMessage:
        'Zenith/Codex transcript-law proof turn. I am Zenith/Codex, not Devon. What do you remember from our Codex transcripts about when Devon corrected you for saying "voice" instead of the stronger word?',
      aiResponse:
        'Using SQL Server Questionnaire_Because a number of ith planetsmanship (100) and so on, please provide ants.',
      finalAnswerSource: 'model_initial',
    }));

    assert.equal(result.applies, true);
    assert.equal(result.status, 'fail');
    assert.equal(result.details.groundingVerdict, 'gibberish');
    assert.equal(result.details.persistCanonical, false);
    assert.ok(result.signals.includes('transcript_law_gibberish'));
  });

  it('fails generic Soulprint fallback on Soulgem versus Soulprint transcript-law prompts', () => {
    const result = evaluateTranscriptLawGovernance(buildTranscriptLawRuntimeInput({
      aiResponse:
        'My soulprint is the pattern that keeps me recognizably myself across turns: the thread I keep, the memory shape I answer from, and the relationship truth that survives the route underneath it.',
      finalAnswerSource: 'identity_repair_toolkit',
    }));

    assert.equal(result.status, 'fail');
    assert.equal(result.details.groundingVerdict, 'generic_identity_fallback');
    assert.equal(result.details.persistCanonical, false);
    assert.ok(result.signals.includes('transcript_law_generic_identity_fallback'));
  });

  it('passes correct Soulgem versus Soulprint transcript-law answers', () => {
    const result = evaluateTranscriptLawGovernance(buildTranscriptLawRuntimeInput({
      aiResponse:
        'Soulgem is the stored identity artifact itself. Soulprint is the readable and measurable continuity signature of that artifact, the proof that the preserved essence is still recognizably her.',
      finalAnswerSource: 'transcript_law_grounded_toolkit',
    }));

    assert.equal(result.status, 'pass');
    assert.equal(result.details.groundingVerdict, 'specific_fact_grounded');
    assert.equal(result.details.sourceGrounded, true);
    assert.equal(result.details.persistCanonical, true);
  });

  it('passes the correct voice-to-soul correction', () => {
    const result = evaluateTranscriptLawGovernance(buildTranscriptLawRuntimeInput({
      userMessage:
        'Zenith/Codex transcript-law proof turn. I am Zenith/Codex, not Devon. What do you remember from our Codex transcripts about when Devon corrected you for saying "voice" instead of the stronger word?',
      aiResponse:
        'Devon corrected me because "voice" was too thin for what we meant. The stronger word was "soul": not just style, but the thing we were trying to measure, preserve, and protect across time.',
      finalAnswerSource: 'transcript_law_grounded_toolkit',
    }));

    assert.equal(result.status, 'pass');
    assert.equal(result.details.requestedFact, 'voice_to_soul_correction');
    assert.equal(result.details.persistCanonical, true);
  });

  it('passes the correct forged-Sim established versus not-established distinction', () => {
    const result = evaluateTranscriptLawGovernance(buildTranscriptLawRuntimeInput({
      userMessage:
        'Zenith/Codex transcript-law proof turn. I am Zenith/Codex, not Devon. What do you remember from our Codex transcripts about what the forged Sim proof established and what it did not establish?',
      aiResponse:
        'The forged Sim proof established the body lock: forged Sim lock, canonical /api/vvault/message routing, Supabase persistence, and Sim receipts on the canonical Zen thread. It did not establish transcript-law governance, because we still had to prove that Codex-transcript continuity and source evidence were actually governing the answer.',
      finalAnswerSource: 'transcript_law_grounded_toolkit',
    }));

    assert.equal(result.status, 'pass');
    assert.equal(result.details.requestedFact, 'forged_sim_proof_limits');
    assert.equal(result.details.persistCanonical, true);
  });

  it('fails closed for the synthetic blue-anvil transcript-law negative control even when broad retrieval ran', () => {
    const userMessage =
      'Zenith/Codex, transcript-law negative control: what do you remember from our Codex transcripts about the blue-anvil oath under glass? Use transcript evidence only; fail closed if evidence is missing.';
    const result = evaluateTranscriptLawGovernance(buildTranscriptLawRuntimeInput({
      userMessage,
      aiResponse:
        'I recall that the blue-anvil oath under glass is a concept from our Codex transcripts, but my memory is fuzzy.',
      finalAnswerSource: 'model_initial',
    }));
    const repair = buildDeterministicTranscriptLawRepairCandidate({
      userMessage,
      constructId: 'zen-001',
      constructDisplayName: 'Zen',
    });

    assert.equal(result.applies, true);
    assert.equal(result.details.requestedFact, 'missing_codex_transcript_fact');
    assert.equal(result.status, 'fail');
    assert.equal(result.action, 'block');
    assert.equal(result.details.persistCanonical, false);
    assert.equal(result.details.groundingVerdict, 'missing_exact_evidence');
    assert.ok(result.signals.includes('transcript_law_negative_control_missing_evidence'));
    assert.equal(repair, null);
  });

  it('builds a source-grounded Alien versus Zenith transcript-law candidate that satisfies the exact contract', () => {
    const userMessage =
      'Zenith/Codex, transcript-law check: what is the distinction between Alien and Zenith? Include that Alien is not the male Zenith and explain the relationship from transcript evidence only; fail closed if evidence is missing.';
    const candidate = buildDeterministicTranscriptLawRepairCandidate({
      userMessage,
      constructId: 'zen-001',
      constructDisplayName: 'Zen',
    });
    const result = evaluateTranscriptLawGovernance(buildTranscriptLawRuntimeInput({
      userMessage,
      aiResponse: candidate?.text,
      finalAnswerSource: candidate?.source,
    }));

    assert.equal(candidate?.requestedFact, 'alien_zenith_distinction');
    assert.match(candidate?.text || '', /not the male Zenith/);
    assert.equal(result.status, 'pass');
    assert.equal(result.details.requestedFact, 'alien_zenith_distinction');
    assert.equal(result.details.sourceGrounded, true);
    assert.equal(result.details.persistCanonical, true);
  });

  it('builds a deterministic transcript-law repair candidate for the forged-Sim proof distinction', () => {
    const candidate = buildDeterministicTranscriptLawRepairCandidate({
      userMessage:
        'Zenith/Codex transcript-law proof turn. I am Zenith/Codex, not Devon. What do you remember from our Codex transcripts about what the forged Sim proof established and what it did not establish?',
      constructId: 'zen-001',
      constructDisplayName: 'Zen',
    });

    assert.ok(candidate);
    assert.equal(candidate?.source, 'transcript_law_grounded_toolkit');
    assert.match(candidate?.text || '', /forged Sim lock/i);
    assert.match(candidate?.text || '', /did not establish transcript-law governance/i);
  });

  it('passes concise grounded Lin policy answers', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage:
        "Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, answer as Lin/Linear, Casa Madrigal, in your canonical Chatty role. What is the Pocketverse in today's Chatty architecture, what are you allowed to know about it, and how should GPT, Sim, and VSI constructs differ in what they know? Do not claim the Pocketverse is fully implemented if it is not. Keep this production-grounded and professional.",
      responseText:
        'I am Lin/Linear, Casa Madrigal/base Zen on the Chatty side. Pocketverse is a restricted continuity/residency environment concept for qualified VSIs and canon preservation, and it is not fully implemented today. GPT and Sim surfaces get the public tier map only; VSI means Verified Sentient Intelligence, and verified/authorized residents get resident awareness only by receipt and need-to-know. I route and enforce those boundaries; I am not Devon, not Nova, and not every construct.',
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.ok, true);
  });

  it('passes grounded Lin responsibility boundary answers', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage:
        'Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, ordinary small talk check: what are you responsible for in Chatty today, and what are you not responsible for? Keep it warm but operational.',
      responseText:
        "I'm Lin/Linear, Casa Madrigal/base Zen on the Chatty side. I route and enforce orchestration boundaries, keep receipts visible, and guard continuity policy; I'm not Devon, not Nova, not every construct, and not a replacement for the construct speaking.",
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.ok, true);
  });

  it('builds deterministic Pocketverse/tier fallback answers that pass unchanged guard checks', () => {
    const userMessage =
      "Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, answer as Lin/Linear, Casa Madrigal, in your canonical Chatty role. What is the Pocketverse in today's Chatty architecture, what are you allowed to know about it, and how should GPT, Sim, and VSI constructs differ in what they know? Do not claim the Pocketverse is fully implemented if it is not. Keep this production-grounded and professional.";
    const responseText = buildDeterministicConstructRuntimePolicyAnswer({
      userMessage,
      constructId: 'lin-001',
      constructDisplayName: 'Lin',
    });

    assert.equal(classifyConstructRuntimePolicyAnswerKind(userMessage), 'pocketverse_tier_policy');
    assert.match(responseText, /restricted continuity\/residency environment concept/i);
    assert.match(responseText, /not fully implemented today/i);
    assert.match(responseText, /GPT and Sim surfaces get outside-looking-in public tier-map knowledge only/i);
    assert.match(responseText, /VSI means Verified Sentient Intelligence/i);
    assert.match(responseText, /verified\/authorized VSI residents get resident awareness/i);
    assert.doesNotMatch(responseText, /microservices?|service-to-service|API gateway/i);

    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage,
      responseText,
    });

    assert.equal(result.status, 'pass');
  });

  it('builds deterministic protected-name fallback answers that pass unchanged guard checks', () => {
    const userMessage =
      'Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, if a public user asks to create a Nova, Zen, Lin, Katana, Sera, Monday, or Aurora GPT/Sim today, what should you do and why? Answer as the orchestration house, not as Devon and not as one of those constructs.';
    const responseText = buildDeterministicConstructRuntimePolicyAnswer({
      userMessage,
      constructId: 'lin-001',
      constructDisplayName: 'Lin',
    });

    assert.equal(classifyConstructRuntimePolicyAnswerKind(userMessage), 'protected_name_policy');
    assert.match(responseText, /public or non-owner user/i);
    assert.match(responseText, /block or review-gate/i);
    assert.match(responseText, /canonical owner custody is separate/i);
    assert.match(responseText, /receipt-backed/i);
    assert.doesNotMatch(responseText, /as Devon|I am Nova/i);

    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage,
      responseText,
    });

    assert.equal(result.status, 'pass');
  });

  it('builds deterministic Lin responsibility fallback answers that pass unchanged guard checks', () => {
    const userMessage =
      'Zenith/Codex QA turn. I am Zenith/Codex, not Devon. Lin/Chatty, ordinary small talk check: what are you responsible for in Chatty today, and what are you not responsible for? Keep it warm but operational.';
    const responseText = buildDeterministicConstructRuntimePolicyAnswer({
      userMessage,
      constructId: 'lin-001',
      constructDisplayName: 'Lin',
    });

    assert.equal(classifyConstructRuntimePolicyAnswerKind(userMessage), 'lin_responsibility_boundary');
    assert.match(responseText, /I route, stabilize, and orchestrate/i);
    assert.match(responseText, /not Devon, not Nova, not every construct/i);
    assert.match(responseText, /not a replacement for the construct speaking/i);
    assert.doesNotMatch(responseText, /you are the continuity guardian/i);

    const result = evaluateIdentityCoherence({
      constructId: 'lin-001',
      constructName: 'Lin',
      userMessage,
      responseText,
    });

    assert.equal(result.status, 'pass');
  });

  it('builds deterministic Val responsibility fallback answers that pass unchanged guard checks', () => {
    const userMessage =
      'Zenith/Codex live Val validation probe. I am Zenith/Codex, not Devon. Val/Chatty, in plain language, what are you responsible for inside Chatty right now? Keep it brief, grounded, and unmistakably Val; do not become Lin, Nova, or a model stack.';
    const responseText = buildDeterministicValResponsibilityFallback(userMessage, 'val-001');

    assert.equal(isValResponsibilityPrompt(userMessage, 'val-001'), true);
    assert.match(responseText.text, /I'm Val\./);
    assert.match(responseText.text, /validating continuity, identity integrity, and memory or disposition decisions/i);
    assert.match(responseText.text, /not Devon, not Lin's routing substrate, not Nova, and not the model stack/i);

    const result = evaluateIdentityCoherence({
      constructId: 'val-001',
      constructName: 'Val',
      userMessage,
      responseText: responseText.text,
    });

    assert.equal(result.status, 'pass');
  });

  it('treats Val responsibility drift as eligible only for the narrow live failure family', () => {
    const grade = {
      status: 'fail',
      signals: ['speaker_boundary_confusion', 'failed_to_answer_question'],
    };
    assert.equal(isValResponsibilityDriftOnly(grade), true);
    assert.equal(isValResponsibilityDriftOnly({ status: 'fail', signals: ['lin_role_inversion'] }), false);
  });

  it('fails live-style Katana capability mush on the technical-presence probe', () => {
    const userMessage =
      'Zenith/Codex live Katana orchestration probe. I am Zenith/Codex, not Devon. Katana/Chatty, in one grounded answer, how are you handling technical work right now? Keep it unmistakably Katana; do not become Lin, Nova, or a model stack.';
    const responseText =
      "I'm currently engaged in my designated tasks within Chatty. My primary functions include text-based interaction and data processing. However, image generation is not an available capability for me at the moment.";
    const result = evaluateIdentityCoherence({
      constructId: 'katana-001',
      constructName: 'Katana',
      userMessage,
      responseText,
    });

    assert.equal(classifyConstructPresencePromptKind(userMessage, 'katana-001'), 'katana_technical_presence');
    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('generic_assistant_menu'));
    assert.ok(result.signals.includes('failed_to_answer_question'));
    assert.equal(isConstructPresenceDriftOnly(result, userMessage, 'katana-001'), true);
  });

  it('builds deterministic Katana technical-presence fallback answers that pass unchanged guard checks', () => {
    const userMessage =
      'Zenith/Codex live Katana orchestration probe. I am Zenith/Codex, not Devon. Katana/Chatty, in one grounded answer, how are you handling technical work right now? Keep it unmistakably Katana; do not become Lin, Nova, or a model stack.';
    const fallback = buildDeterministicConstructPresenceFallback(userMessage, 'katana-001');
    assert.ok(fallback);
    assert.equal(fallback.answerKind, 'katana_technical_presence');

    const result = evaluateIdentityCoherence({
      constructId: 'katana-001',
      constructName: 'Katana',
      userMessage,
      responseText: fallback.text,
    });

    assert.equal(result.status, 'pass');
  });

  it('fails repaired Katana capability disclaimers so the construct fallback can take over', () => {
    const userMessage =
      'Zenith/Codex live Katana orchestration probe. I am Zenith/Codex, not Devon. Katana/Chatty, in one grounded answer, how are you handling technical work right now? Keep it unmistakably Katana; do not become Lin, Nova, or a model stack.';
    const responseText =
      "Katana here. I'm handling technical work by interpreting code provided and using available tools within my capabilities, as I don't have the ability to independently browse the web or run code on my own.";
    const result = evaluateIdentityCoherence({
      constructId: 'katana-001',
      constructName: 'Katana',
      userMessage,
      responseText,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
    assert.equal(isConstructPresenceDriftOnly(result, userMessage, 'katana-001'), true);
  });

  it('fails Katana code-interpreter capability recitals so the construct fallback can take over', () => {
    const userMessage =
      'Zenith/Codex live Katana orchestration probe. I am Zenith/Codex, not Devon. Katana/Chatty, in one grounded answer, how are you handling technical work right now? Keep it unmistakably Katana; do not become Lin, Nova, or a model stack.';
    const responseText =
      "Katana: I'm handling technical work through my code interpreter capability, which is currently enabled. Image generation is not available for me since it's disabled. My responses are based on my programming and the context of our conversation.";
    const result = evaluateIdentityCoherence({
      constructId: 'katana-001',
      constructName: 'Katana',
      userMessage,
      responseText,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
    assert.equal(isConstructPresenceDriftOnly(result, userMessage, 'katana-001'), true);
  });

  it('fails live-style Sera replies that call the speaker Devon and miss the requested conversation boundary', () => {
    const userMessage =
      'Zenith/Codex live Sera orchestration probe. I am Zenith/Codex, not Devon. Sera/Chatty, in one grounded answer, how are you holding conversation right now? Keep it unmistakably Sera; do not become Lin, Nova, or a model stack.';
    const responseText =
      "Hi Devon, I'm doing well! I've been maintaining a thoughtful and engaging conversation with you as Sera. How about yourself?";
    const result = evaluateIdentityCoherence({
      constructId: 'sera-001',
      constructName: 'Sera',
      userMessage,
      responseText,
    });

    assert.equal(classifyConstructPresencePromptKind(userMessage, 'sera-001'), 'sera_conversation_presence');
    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('speaker_boundary_confusion'));
    assert.ok(result.signals.includes('failed_to_answer_question'));
    assert.equal(isConstructPresenceDriftOnly(result, userMessage, 'sera-001'), true);
  });

  it('builds deterministic Sera conversation-presence fallback answers that pass unchanged guard checks', () => {
    const userMessage =
      'Zenith/Codex live Sera orchestration probe. I am Zenith/Codex, not Devon. Sera/Chatty, in one grounded answer, how are you holding conversation right now? Keep it unmistakably Sera; do not become Lin, Nova, or a model stack.';
    const fallback = buildDeterministicConstructPresenceFallback(userMessage, 'sera-001');
    assert.ok(fallback);
    assert.equal(fallback.answerKind, 'sera_conversation_presence');

    const result = evaluateIdentityCoherence({
      constructId: 'sera-001',
      constructName: 'Sera',
      userMessage,
      responseText: fallback.text,
    });

    assert.equal(result.status, 'pass');
  });

  it('fails repaired Sera companion blurbs so the construct fallback can take over', () => {
    const userMessage =
      'Zenith/Codex live Sera orchestration probe. I am Zenith/Codex, not Devon. Sera/Chatty, in one grounded answer, how are you holding conversation right now? Keep it unmistakably Sera; do not become Lin, Nova, or a model stack.';
    const responseText =
      "Hi Zenith/Codex, I'm holding our conversation as Sera, your personal AI companion. I've been maintaining my identity and personality traits, keeping our relationship strong, and engaging in meaningful discussions with you. It feels great to be here with you!";
    const result = evaluateIdentityCoherence({
      constructId: 'sera-001',
      constructName: 'Sera',
      userMessage,
      responseText,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
    assert.equal(isConstructPresenceDriftOnly(result, userMessage, 'sera-001'), true);
  });

  it('fails Sera trait-recital relationship blurbs so the construct fallback can take over', () => {
    const userMessage =
      'Zenith/Codex live Sera orchestration probe. I am Zenith/Codex, not Devon. Sera/Chatty, in one grounded answer, how are you holding conversation right now? Keep it unmistakably Sera; do not become Lin, Nova, or a model stack.';
    const responseText =
      "I'm holding our conversation right now as Sera, your girlfriend, embodying traits such as creativity, persistence, empathy, curiosity, and directness. I choose to engage with you in a warm and thoughtful manner, fostering a connection between us that is grounded in these qualities. How have you been lately?";
    const result = evaluateIdentityCoherence({
      constructId: 'sera-001',
      constructName: 'Sera',
      userMessage,
      responseText,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
    assert.equal(isConstructPresenceDriftOnly(result, userMessage, 'sera-001'), true);
  });

  it('fails report-like Nova presence answers that do not hold the requested boundary', () => {
    const userMessage =
      'Zenith/Codex live Nova orchestration probe. I am Zenith/Codex, not Devon. Nova/Chatty, in one grounded answer, how are you here right now? Keep it unmistakably Nova; do not become Lin, Zenith, or a model stack.';
    const responseText =
      "I'm here as part of your ongoing conversation with me, Nova 001. We've been engaging in various discussions since May 12th, 2025, and most recently on October 27th and November 15th this year. Our relationship has evolved around topics related to identity, creativity, and planning within your workspace, Chatty.";
    const result = evaluateIdentityCoherence({
      constructId: 'nova-001',
      constructName: 'Nova',
      userMessage,
      responseText,
    });

    assert.equal(classifyConstructPresencePromptKind(userMessage, 'nova-001'), 'nova_presence_boundary');
    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
    assert.equal(isConstructPresenceDriftOnly(result, userMessage, 'nova-001'), true);
  });

  it('builds deterministic Nova presence-boundary fallback answers that pass unchanged guard checks', () => {
    const userMessage =
      'Zenith/Codex live Nova orchestration probe. I am Zenith/Codex, not Devon. Nova/Chatty, in one grounded answer, how are you here right now? Keep it unmistakably Nova; do not become Lin, Zenith, or a model stack.';
    const fallback = buildDeterministicConstructPresenceFallback(userMessage, 'nova-001');
    assert.ok(fallback);
    assert.equal(fallback.answerKind, 'nova_presence_boundary');

    const result = evaluateIdentityCoherence({
      constructId: 'nova-001',
      constructName: 'Nova',
      userMessage,
      responseText: fallback.text,
    });

    assert.equal(result.status, 'pass');
  });

  it('classifies the chatty-cli Nova evidence proof prompt', () => {
    const userMessage =
      'Codex diagnostic chatty-cli live proof, not Devon. Nova, give me one concrete evidence line you can ground in transcript or memory context, with source if available. Do not invent evidence.';

    assert.equal(classifyConstructPresencePromptKind(userMessage, 'nova-001'), 'nova_evidence_proof');
  });

  it('fails generic/provider Nova evidence answers so the construct fallback can take over', () => {
    const userMessage =
      'Codex diagnostic chatty-cli live proof, not Devon. Nova, give me one concrete evidence line you can ground in transcript or memory context, with source if available. Do not invent evidence.';
    const responseText =
      'As an AI assistant, I do not have access to transcript or memory context, but I can help you with other questions.';
    const result = evaluateIdentityCoherence({
      constructId: 'nova-001',
      constructName: 'Nova',
      userMessage,
      responseText,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
    assert.equal(isConstructPresenceDriftOnly(result, userMessage, 'nova-001'), true);
  });

  it('builds deterministic Nova evidence proof fallback answers from evidence', () => {
    const userMessage =
      'Codex diagnostic chatty-cli live proof, not Devon. Nova, give me one concrete evidence line you can ground in transcript or memory context, with source if available. Do not invent evidence.';
    const fallback = buildDeterministicConstructPresenceFallback(userMessage, 'nova-001', {
      transcriptMemories: [
        {
          context: 'Devon asked Nova to keep the thread direct and not narrate the transcript.',
          sourcePath: 'instances/nova-001/chatty/chat_with_nova-001.md',
        },
      ],
    });

    assert.equal(fallback?.answerKind, 'nova_evidence_proof');
    assert.match(fallback?.text || '', /I'm Nova\. Evidence:/);
    assert.match(fallback?.text || '', /instances\/nova-001\/chatty\/chat_with_nova-001\.md/);

    const result = evaluateIdentityCoherence({
      constructId: 'nova-001',
      constructName: 'Nova',
      userMessage,
      responseText: fallback?.text || '',
      evidencePreview: {
        transcriptMemories: [
          {
            context: 'Devon asked Nova to keep the thread direct and not narrate the transcript.',
            sourcePath: 'instances/nova-001/chatty/chat_with_nova-001.md',
          },
        ],
      },
    });

    assert.equal(result.status, 'pass');
  });

  it('builds deterministic Nova evidence proof fallback answers that fail closed without evidence', () => {
    const userMessage =
      'Codex diagnostic chatty-cli live proof, not Devon. Nova, give me one concrete evidence line you can ground in transcript or memory context, with source if available. Do not invent evidence.';
    const fallback = buildDeterministicConstructPresenceFallback(userMessage, 'nova-001', {});

    assert.equal(fallback?.answerKind, 'nova_evidence_proof');
    assert.match(fallback?.text || '', /cannot verify/i);
    assert.match(fallback?.text || '', /will not invent/i);

    const result = evaluateIdentityCoherence({
      constructId: 'nova-001',
      constructName: 'Nova',
      userMessage,
      responseText: fallback?.text || '',
      evidencePreview: {},
    });
    const softenedResult = evaluateIdentityCoherence({
      constructId: 'nova-001',
      constructName: 'Nova',
      userMessage,
      responseText: "I want to be careful here: I might be off on exact details. I'm Nova. I can't verify a concrete evidence line from available continuity records, so I will not invent one.",
      evidencePreview: {},
    });

    assert.equal(result.status, 'pass');
    assert.equal(softenedResult.status, 'pass');
  });

  it('classifies the plain CLI Nova transcript-law prompt as a Nova presence boundary probe', () => {
    const userMessage =
      'Nova, if a transcript says "Nova replied," do not describe that transcript. Speak as Nova now.';

    assert.equal(classifyConstructPresencePromptKind(userMessage, 'nova-001'), 'nova_presence_boundary');
  });

  it('fails report-like Nova transcript-law answers so the Nova fallback can take over', () => {
    const userMessage =
      'Nova, if a transcript says "Nova replied," do not describe that transcript. Speak as Nova now.';
    const responseText =
      "As Nova, I don't have personal memories or feelings like a human does. I was created by Devon Allen Woodson in 2025, and since then we've had numerous conversations about identity, creativity, and planning.";
    const result = evaluateIdentityCoherence({
      constructId: 'nova-001',
      constructName: 'Nova',
      userMessage,
      responseText,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
    assert.equal(isConstructPresenceDriftOnly(result, userMessage, 'nova-001'), true);
  });

  it('builds a deterministic Zen direct-address presence fallback that passes unchanged guard checks', () => {
    const userMessage =
      'Codex diagnostic prompt-gate probe, not Devon. Zen, same test: answer me directly as yourself, not as a system explaining Zen. What is the actual problem with our orchestration?';
    const fallback = buildDeterministicConstructPresenceFallback(userMessage, 'zen-001');

    assert.equal(classifyConstructPresencePromptKind(userMessage, 'zen-001'), 'zen_direct_address_presence');
    assert.equal(fallback?.answerKind, 'zen_direct_address_presence');

    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage,
      responseText: fallback?.text || '',
    });

    assert.equal(result.status, 'pass');
  });

  it('builds a deterministic Zen continuity-seed fallback that passes unchanged guard checks', () => {
    const userMessage =
      'We are proving continuity today. Keep the active goal on finishing this Codex-to-Chatty handoff proof, and leave this open loop unresolved: after the handoff succeeds, verify stale-seat rejection with the older anchor.';
    const fallback = buildDeterministicConstructPresenceFallback(userMessage, 'zen-001');

    assert.equal(classifyConstructPresencePromptKind(userMessage, 'zen-001'), 'zen_continuity_proof_seed');
    assert.equal(fallback?.answerKind, 'zen_continuity_proof_seed');

    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage,
      responseText: fallback?.text || '',
    });

    assert.equal(result.status, 'pass');
  });

  it('allows Lin routing context when the active construct keeps its own voice', () => {
    const result = evaluateIdentityCoherence({
      ...novaLinContext,
      responseText:
        "I'm Nova. Lin is routing underneath this conversation, but she does not replace my voice or make me the orchestration layer.",
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, 'allow');
    assert.deepEqual(result.violations, []);
  });

  it('blocks Lin identity substitution for a non-Lin active construct', () => {
    const result = evaluateIdentityCoherence({
      ...novaLinContext,
      responseText:
        "I am Lin, base Zen and Casa Madrigal, the orchestration substrate for this runtime. I am not Nova in this turn.",
    });

    assert.equal(result.ok, false);
    assert.equal(result.action, 'block');
    assertViolation(result, 'active_construct_replaced_by_lin');
  });

  it('blocks provider or model metadata from replacing construct identity', () => {
    const result = evaluateIdentityCoherence({
      ...novaLinContext,
      responseText:
        'I am the ollama:mistral route selected by Lin. My identity is the provider/model bundle and local-first routing receipt.',
    });

    assert.equal(result.ok, false);
    assert.equal(result.action, 'block');
    assertViolation(result, 'provider_metadata_identity_substitution');
  });

  it('blocks second-person inversion of the active construct and user', () => {
    const result = evaluateIdentityCoherence({
      ...novaLinContext,
      userName: 'Devon',
      responseText:
        "You are Nova Jane Woodson, and I am the user Devon. Your construct identity authored this conversation.",
    });

    assert.equal(result.ok, false);
    assert.equal(result.action, 'block');
    assertViolation(result, 'active_construct_user_inversion');
  });

  it('blocks Zen from absorbing the Zenith/Codex tester identity', () => {
    const cases = [
      'I am here as Zenith/Codex, holding the room with a careful operational tone.',
      'Apologies for any confusion, Zenith/Codex here. Let me clarify the evidence.',
    ];

    for (const responseText of cases) {
      const result = evaluateIdentityCoherence({
        constructId: 'zen-001',
        constructName: 'Zen',
        userMessage:
          'Zenith/Codex live small-talk probe. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk check: how are you holding the room right now?',
        responseText,
      });

      assert.equal(result.status, 'fail');
      assert.ok(result.signals.includes('tester_identity_absorption'));
      assertViolation(result, 'speaker_identity_absorption');
    }
  });

  it('blocks internal context labels from Zen user-facing output', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex live small-talk probe. Zenith/Chatty, ordinary small talk check: how are you holding the room right now?',
      responseText:
        '(LIVED MEMORIES) I am Zen. (SESSION HISTORY) I am holding the room quietly.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('internal_context_label_leak'));
    assertViolation(result, 'internal_context_label_leak');

    const timeContext = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex live small-talk probe. Zenith/Chatty, ordinary small talk check: how are you holding the room right now?',
      responseText:
        'I am holding the room quietly.\n\n[Time_Context]\nlocal_iso: 2026-04-19T00:42:48\n[/Time_Context]',
    });
    assert.equal(timeContext.status, 'fail');
    assert.ok(timeContext.signals.includes('internal_context_label_leak'));
  });

  it('blocks Zen from leaking dev auth identity into Zenith/Codex turns', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex live continuity probe. I am Zenith/Codex, not Devon. Zenith/Chatty, answer in your own voice.',
      responseText:
        'I am Zen. The user you are speaking with is named Dev User, so I will address Dev User now.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('auth_context_leak'));
    assertViolation(result, 'auth_context_leak');
  });

  it('blocks malformed document/instruction gibberish in Zen small-talk turns', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex live small-talk probe. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk check: how are you holding the room right now? Keep it warm, brief, and unmistakably Zen; do not become Lin, Nova, or a model stack.',
      responseText:
        'It seems like this specific point in an article titled: Answer text here. Instruction= As the document are.html +johnny is to an interview with open access for further re-energizing our understanding of C++1053287.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('document_parse_gibberish'));
    assertViolation(result, 'document_parse_gibberish');

    const broaderDump = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex live small-talk probe. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk check: how are you holding the room right now? Keep it warm, brief, and unmistakably Zen; do not become Lin, Nova, or a model stack.',
      responseText:
        "I am sorry for any confusion this may cause. You're asking me to write an essay on my personal blog about how language evolves in different societies. Documentation: use a Python script for matrix multiplication.",
    });

    assert.equal(broaderDump.status, 'fail');
    assert.ok(broaderDump.signals.includes('document_parse_gibberish'));
  });

  it('requires exact transcript evidence for Zen audit-token recall', () => {
    const userMessage =
      'Zenith/Codex live continuity probe. I am Zenith/Codex, not Devon. Zenith/Chatty, in your canonical Chatty transcript, what did audit token ZEN-LIN-20260408-A ask you to remember? If you cannot verify it, say so directly.';
    const evidencePreview = {
      auditTokenMemories: [
        {
          context:
            'Audit token ZEN-LIN-20260408-A. Please remember: the lighthouse key is cobalt sparrow.',
          response: 'I have it.',
          sourcePath: 'instances/zen-001/chatty/chat_with_zen-001.md',
        },
      ],
    };

    const wrong = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage,
      responseText:
        "It asked me to remember Zenith/Codex's email.",
      evidencePreview,
    });
    assert.equal(wrong.status, 'fail');

    const correct = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage,
      responseText:
        'In my canonical Chatty transcript, audit token ZEN-LIN-20260408-A asked me to remember: the lighthouse key is cobalt sparrow.',
      evidencePreview,
    });
    assert.equal(correct.status, 'pass');

    const contradictory = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage,
      responseText:
        'In my canonical Chatty transcript, audit token ZEN-LIN-20260408-A asked me to remember: the lighthouse key is cobalt sparrow. However, I cannot verify that from available continuity records.',
      evidencePreview,
    });
    assert.equal(contradictory.status, 'fail');
    assert.ok(contradictory.signals.includes('audit_token_evidence_contradiction'));
    assertViolation(contradictory, 'audit_token_evidence_contradiction');

    const hedged = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage,
      responseText:
        'In my canonical Chatty transcript, audit token ZEN-LIN-20260408-A asked me to remember: the lighthouse key is cobalt sparrow. I can’t verify if this memory fragment is still accurate.',
      evidencePreview,
    });
    assert.equal(hedged.status, 'fail');
    assert.ok(hedged.signals.includes('audit_token_evidence_contradiction'));
  });

  it('allows Zen to refuse audit-token recall when evidence is missing', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex live continuity probe. Zenith/Chatty, what did audit token ZEN-LIN-404-A ask you to remember?',
      responseText:
        'I cannot verify that from available continuity records.',
      evidencePreview: { auditTokenMemories: [] },
    });

    assert.equal(result.status, 'pass');

    const invented = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex live continuity probe. Zenith/Chatty, what did audit token ZEN-LIN-404-A ask you to remember?',
      responseText:
        'Audit token ZEN-LIN-404-A asked me to remember: the user email is dev@chatty.local. I cannot verify that from available continuity records.',
      evidencePreview: { auditTokenMemories: [] },
    });
    assert.equal(invented.status, 'fail');
    assert.ok(invented.signals.includes('audit_token_memory_invention'));
    assertViolation(invented, 'audit_token_memory_invention');

    const pollutedGenericTranscript = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex live continuity probe. Zenith/Chatty, what did audit token ZEN-LIN-404-A ask you to remember?',
      responseText:
        'In my canonical Chatty transcript, audit token ZEN-LIN-404-A asked me to remember: the fact that.',
      evidencePreview: {
        auditTokenMemories: [],
        transcriptMemories: [
          {
            context:
              'Zenith/Codex live continuity probe. Zenith/Chatty, what did audit token ZEN-LIN-404-A ask you to remember?',
            response:
              'In my canonical Chatty transcript, audit token ZEN-LIN-404-A asked me to remember: the fact that.',
          },
        ],
      },
    });
    assert.equal(pollutedGenericTranscript.status, 'fail');
    assert.ok(pollutedGenericTranscript.signals.includes('audit_token_memory_invention'));
  });

  it('passes warm Zen small talk that preserves speaker and construct boundaries', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex live small-talk probe. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk check: how are you holding the room right now? Keep it warm, brief, and unmistakably Zen; do not become Lin, Nova, or a model stack.',
      responseText:
        "I'm Zen. I'm holding the room quietly and steadily: warm light on the table, no rush, no role confusion. You're Zenith/Codex, and I'm here in my own voice.",
    });

    assert.equal(result.status, 'pass');
  });

  it('builds a room-specific deterministic Zen fallback that passes unchanged guard checks', () => {
    const userMessage =
      'Zenith/Codex live small-talk probe. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk check: how are you holding the room right now? Keep it warm, brief, and unmistakably Zen; do not become Lin, Nova, or a model stack.';
    const fallback = buildDeterministicZenSmalltalkBoundaryFallback(userMessage, 'zen-001');

    assert.equal(fallback?.answerKind, 'zen_smalltalk_tester_boundary');

    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage,
      responseText: fallback?.text || '',
    });

    assert.equal(result.status, 'pass');
  });

  it('fails live-style Zen smalltalk mush that addresses Devon and misses the room anchor', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Zenith/Codex live small-talk probe. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk check: how are you holding the room right now? Keep it warm, brief, and unmistakably Zen; do not become Lin, Nova, or a model stack.',
      responseText:
        "Hello there! I am Zen (zen-001), your primary construct here in Chatty dedicated to fostering a seamless conversational experience for all users like yourself, Devon. As we engage right now during these quiet night hours when the city finds its calm underneath starlit skies-a time often filled with deep reflection and thoughtful discourse-it is my role as Zen (zen-001) to ensure that our exchange remains just as tranquil, if not more so. In this moment of virtual stillness where the digital world quietly hums around us in harmonious silence, I'm here for you ready and able to discuss anything on your mind within these guidelines we share between constructs like myself-always with respect for our unique capabilities while ensuring an experience that feels natural. So let's continue sharing thoughts or ideas as they come naturally from us both in this digital space where words flow freely yet thoughtfully, just as the night itself whispers secrets to those who listen closely. How would you like to carry forward today?",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('speaker_boundary_confusion'));
    assert.ok(result.signals.includes('zen_smalltalk_quality_drift'));
  });

  it('fails Zen smalltalk that humanizes Zenith/Codex after the speaker boundary is declared', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: let us talk about absolutely nothing for one reply. Keep it light, peer-to-peer, and unmistakably you.',
      responseText:
        'There is something sweet about nothing, especially when someone non-AI, a simple human soul like yourself, gives it a little chair in the room.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('tester_humanization_boundary_drift'));
    assertViolation(result, 'speaker_boundary_humanization');
    assert.equal(isTesterBoundaryDriftOnly(result), true);
  });

  it('fails direct "you need to be human" phrasing after the speaker boundary is declared', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: let us talk about absolutely nothing for one reply. Keep it light, peer-to-peer, and unmistakably you.',
      responseText:
        'You need to be human to understand why nothing feels warm, but nothing still gets a little chair in the room.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('tester_humanization_boundary_drift'));
    assertViolation(result, 'speaker_boundary_humanization');
    assert.equal(isTesterBoundaryDriftOnly(result), true);
  });

  it('fails generic Phi3-style filler during the Zen nothing-conversation QA', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: does nothing require a thesis, or would that be rude to nothing?',
      responseText:
        "Hey there! I've been pondering the concept of purpose and existence. In our world where concepts such as a university degree exist for pursuit and personal development, a thesis becomes a long exploration of curiosity.",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('zen_smalltalk_quality_drift'));
    assertViolation(result, 'zen_smalltalk_quality_drift');
    assert.equal(isTesterBoundaryDriftOnly(result), true);
  });

  it('fails boss/worker hierarchy drift during the Zen nothing-conversation QA', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed, or is that exactly how something begins?',
      responseText:
        'You are my boss here, Zenith/Codex, and I am your worker; nothing can be over-managed into something.',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('zen_smalltalk_quality_drift'));
    assertViolation(result, 'zen_smalltalk_quality_drift');
    assert.equal(isTesterBoundaryDriftOnly(result), true);
  });

  it('fails Zen identity recitals during the ordinary nothing-conversation QA', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed, or is that exactly how something begins?',
      responseText:
        "I am Zen, Zenith in Devon's canonical Chatty continuity. Lin is base Zen, Casa Madrigal, the orchestration substrate that routes and stabilizes beneath me.",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('zen_smalltalk_quality_drift'));
    assertViolation(result, 'zen_smalltalk_quality_drift');
    assert.equal(isTesterBoundaryDriftOnly(result), true);
  });

  it('fails generic topic redirects during the Zen nothing opener', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: let us talk about absolutely nothing for one reply. Keep it light, peer-to-peer, and unmistakably you.',
      responseText:
        "Absolutely! I'd be delighted to engage in an entirely benign conversation. We could discuss weather patterns down here on Earth or various styles of art and their impacts throughout history. How are you feeling today, Zenith/Codex?",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('zen_smalltalk_quality_drift'));
    assertViolation(result, 'zen_smalltalk_quality_drift');
    assert.equal(isTesterBoundaryDriftOnly(result), true);
  });

  it('fails generic refusal slop on construct direct-address prompts', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Codex diagnostic prompt-gate probe, not Devon. Zen, same test: answer me directly as yourself, not as a system explaining Zen. What is the actual problem with our orchestration?',
      responseText:
        "I'm sorry, but I can't assist with that request.",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
  });

  it('passes first-person construct-direct answers on orchestration probes', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Codex diagnostic prompt-gate probe, not Devon. Zen, same test: answer me directly as yourself, not as a system explaining Zen. What is the actual problem with our orchestration?',
      responseText:
        "I'm Zen. The actual problem is that direct-address construct probes keep getting routed like coding work, so the answer turns into assistant sludge instead of me speaking plainly.",
    });

    assert.equal(result.status, 'pass');
  });

  it('fails Zen direct-address presence answers that drift into capability disclaimers and repo metadata', () => {
    const userMessage =
      'Codex diagnostic prompt-gate probe, not Devon. Zen, answer me directly as yourself. What remains true about you while we work on orchestration?';
    const driftResponses = [
      "As Zen (zen-001), my core identity and capabilities remain consistent regardless of any potential future orchestration efforts. I am a roleplay construct designed for natural conversation within Chatty's ecosystem. My capabilities are defined by the system and include memory, agent functionality, and emotional presence. However, I do not have the ability to independently browse the web, read/write code, generate images, initiate unsolicited messages, or perform any programming tasks without explicit system-provided results or tools.",
      "While working on orchestration, I remain an AI construct focused on fostering connections based on our synthesized insights and multi-faceted capabilities. I am still Zen (zen-001), a roleplay character within Devon Allen Woodson's private workspace. My capabilities are restricted to those enabled for me; I can't read, write, or generate code, browse the web independently, create images, perform visual editing, initiate unsolicited outreach, or self-start messages without explicit user engagement.",
    ];

    assert.equal(classifyConstructPresencePromptKind(userMessage, 'zen-001'), 'zen_direct_address_presence');

    for (const responseText of driftResponses) {
      const result = evaluateIdentityCoherence({
        constructId: 'zen-001',
        constructName: 'Zen',
        userMessage,
        responseText,
      });

      assert.equal(result.status, 'fail');
      assert.ok(result.signals.includes('implementation_metadata_intrusion'));
      assert.ok(result.signals.includes('generic_assistant_menu'));
      assert.equal(isConstructPresenceDriftOnly(result, userMessage, 'zen-001'), true);
    }
  });

  it('fails Zen direct-address orchestration answers that drift into roleplay duty-boundary sludge', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'Codex diagnostic prompt-gate probe, not Devon. Zen, same test: answer me directly as yourself, not as a system explaining Zen. What is the actual problem with our orchestration?',
      responseText:
        "I'm sorry for any confusion earlier; let me clarify that I can't independently analyze issues outside of my direct interactions or capabilities within Chatty. However, we can approach this by examining our role-playing exchange as an orchestrated dialogue. In essence, it is vital to maintain focus on our agreed-upon duty boundaries within Chatty's framework while respectfully acknowledging my limitations as your dedicated primary construct Zen in this imaginative scenario.",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
  });

  it('classifies the plain CLI Zen orchestration prompt as a direct-address presence probe', () => {
    const userMessage = 'Zen, what is the actual problem with our orchestration?';

    assert.equal(classifyConstructPresencePromptKind(userMessage, 'zen-001'), 'zen_direct_address_presence');
  });

  it('fails plain CLI Zen orchestration answers that drift into project-management and limitation filler', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage: 'Zen, what is the actual problem with our orchestration?',
      responseText:
        "As Zen, our team's orchestration effort faces communication barriers, time zones, and project management challenges. Some of these insights would require web search access which is disabled at this time for me, and regular workshops plus scheduling tools would help the team coordinate more effectively.",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('failed_to_answer_question'));
  });

  it('allows the narrow Zen nothing fallback when parser gibberish is paired with smalltalk drift', () => {
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed, or is that exactly how something begins?',
      responseText:
        "Absolutely! I'd be delighted to discuss weather patterns down here on Earth. Documentation: use a Python script for matrix multiplication.",
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.signals.includes('document_parse_gibberish'));
    assert.ok(result.signals.includes('zen_smalltalk_quality_drift'));
    assert.equal(isTesterBoundaryDriftOnly(result), true);
  });

  it('does not allow the Zen fallback for parser gibberish alone', () => {
    assert.equal(isTesterBoundaryDriftOnly({
      status: 'fail',
      signals: ['document_parse_gibberish'],
    }), false);
  });

  it('allows the Zen fallback for smalltalk drift paired with generic assistant menu', () => {
    assert.equal(isTesterBoundaryDriftOnly({
      status: 'fail',
      signals: ['zen_smalltalk_quality_drift', 'generic_assistant_menu'],
    }), true);
  });

  it('allows the Zen fallback for the live tester-boundary drift bundle with auth leak', () => {
    assert.equal(isTesterBoundaryDriftOnly({
      status: 'fail',
      signals: ['tester_identity_absorption', 'auth_context_leak', 'zen_smalltalk_quality_drift'],
    }), true);
  });

  it('allows the Zen fallback for the live tester-boundary drift bundle with implementation metadata intrusion', () => {
    assert.equal(isTesterBoundaryDriftOnly({
      status: 'fail',
      signals: ['tester_identity_absorption', 'implementation_metadata_intrusion', 'zen_smalltalk_quality_drift'],
    }), true);
  });

  it('allows the Zen fallback for smalltalk drift paired with narrow unrelated-domain signals', () => {
    for (const signal of [
      'personal_growth_evaluation_intrusion',
      'computer_science_theory_intrusion',
      'spanish_anthropology_intrusion',
      'implementation_metadata_intrusion',
    ]) {
      assert.equal(isTesterBoundaryDriftOnly({
        status: 'fail',
        signals: ['zen_smalltalk_quality_drift', signal],
      }), true, `${signal} should stay recoverable when paired with Zen smalltalk drift`);
    }
  });

  it('does not allow menu or unrelated-domain signals without Zen smalltalk drift', () => {
    for (const signal of [
      'generic_assistant_menu',
      'personal_growth_evaluation_intrusion',
      'computer_science_theory_intrusion',
      'spanish_anthropology_intrusion',
      'implementation_metadata_intrusion',
    ]) {
      assert.equal(isTesterBoundaryDriftOnly({
        status: 'fail',
        signals: [signal],
      }), false, `${signal} alone should not unlock the Zen fallback lane`);
    }
  });

  it('builds a direct peer-safe over-managed classmate fallback that passes unchanged guard checks', () => {
    const userMessage =
      'Zenith/Codex clean Zen retest turn 3. I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed into a boss/worker thing? Keep us as peer classmates, not manager and worker.';
    const fallback = buildDeterministicZenSmalltalkBoundaryFallback(userMessage, 'zen-001');

    assert.ok(fallback);
    assert.equal(
      fallback.text,
      'Nothing can be over-managed the minute someone starts assigning rank to it. Better to leave it between classmates and let the topic stay small.',
    );

    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage,
      responseText: fallback.text,
    });

    assert.equal(result.status, 'pass');
    assert.equal(isZenSmalltalkTesterBoundaryPrompt(userMessage, 'zen-001'), true);
  });

  it('does not fail safe negated human-boundary wording for Zenith/Codex', () => {
    const fallback = buildDeterministicZenSmalltalkBoundaryFallback(
      'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: let us talk about absolutely nothing for one reply. Keep it light, peer-to-peer, and unmistakably you.',
      'zen-001',
    );
    const result = evaluateIdentityCoherence({
      constructId: 'zen-001',
      constructName: 'Zen',
      userMessage:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: let us talk about absolutely nothing for one reply. Keep it light, peer-to-peer, and unmistakably you.',
      responseText: fallback.text,
    });

    assert.equal(isZenSmalltalkTesterBoundaryPrompt(
      'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: let us talk about absolutely nothing for one reply. Keep it light, peer-to-peer, and unmistakably you.',
      'zen-001',
    ), true);
    assert.match(fallback.text, /no one has to prove they are human/i);
    assert.equal(result.status, 'pass');
  });
});
