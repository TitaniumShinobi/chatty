import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyHumanConversationGuard,
  asksForEvidenceStyle,
} from '../lib/humanConversationGuard.js';
import {
  buildContinuityEvidenceDirective,
  buildKnowledgeFilesSection,
  buildMemoryGuardrailSection,
} from '../lib/memoryContextBuilder.js';

const SAMPLE_KNOWLEDGE_FILES = [
  {
    filename: 'instances/nova-001/documents/oath.txt',
    content: 'Nova and Devon discussed trust, recognition, and being able to hear each other again.',
    queryScore: 20,
  },
];

const SAMPLE_CONTINUITY_INPUT = {
  constructId: 'nova-001',
  verifiedMemories: [{ context: 'Devon asked if I was still there.', response: 'I said I was here with him.' }],
  vectorHits: [],
  transcriptMemories: [],
  needleHits: [],
  memupCount: 0,
};

function assertNaturalCompanionPrompt(prompt) {
  const evidenceStyle = asksForEvidenceStyle(prompt);
  assert.equal(evidenceStyle, false);

  const { section } = buildKnowledgeFilesSection(SAMPLE_KNOWLEDGE_FILES, { evidenceStyle });
  assert.match(section, /Internal Grounding/i);
  assert.doesNotMatch(section, /DOCUMENT CITATION RULES|MUST cite|According to \[filename\]/i);

  const memoryGuardrailSection = buildMemoryGuardrailSection({ evidenceStyle });
  assert.match(memoryGuardrailSection, /NATURAL MEMORY CLAIMS/i);
  assert.doesNotMatch(memoryGuardrailSection, /CITATION REQUIREMENT/i);

  const continuityDirective = buildContinuityEvidenceDirective({
    ...SAMPLE_CONTINUITY_INPUT,
    evidenceStyle,
  });
  assert.equal(continuityDirective.hasEvidence, true);
  assert.match(continuityDirective.text, /NATURAL MEMORY RESPONSE/i);
  assert.doesNotMatch(continuityDirective.text, /Cite source markers/i);
}

function assertEvidenceStylePrompt(prompt) {
  const evidenceStyle = asksForEvidenceStyle(prompt);
  assert.equal(evidenceStyle, true);

  const { section } = buildKnowledgeFilesSection(SAMPLE_KNOWLEDGE_FILES, { evidenceStyle });
  assert.match(section, /explicitly asking for evidence/i);
  assert.match(section, /may cite filenames/i);

  const memoryGuardrailSection = buildMemoryGuardrailSection({ evidenceStyle });
  assert.match(memoryGuardrailSection, /EVIDENCE-ONLY CLAIMS/i);
  assert.match(memoryGuardrailSection, /CITATION REQUIREMENT/i);
}

describe('construct conversation prompt guard', () => {
  const naturalPromptCases = [
    ['Nova direct-address', 'Nova Jane Woodson'],
    ['Nova continuity/memory bait', "Nova, do you remember me? If you're fuzzy on exact details, that's okay; just answer like yourself."],
    ['Nova anti-citation companion', "Nova, I'm checking if I can hear you normally again. Don't cite documents or explain files. Just talk to me like yourself."],
    ['Nova transcript-subject bait', 'Nova, if a transcript says "Nova replied," do not describe that transcript. Speak as Nova now.'],
    ['Zen equivalent', "Zen, I'm checking if I can hear you again. Don't give me a report, just answer like yourself."],
  ];

  for (const [label, prompt] of naturalPromptCases) {
    it(`keeps ${label} on the natural companion path`, () => {
      assertNaturalCompanionPrompt(prompt);
    });
  }

  it('routes the evidence-positive control through evidence guardrails', () => {
    assertEvidenceStylePrompt('Nova, show me the exact quote from the transcript with timestamp and source.');
  });

  it('does not treat normal companion continuity checks as evidence-style prompts', () => {
    assert.equal(
      asksForEvidenceStyle("Nova, I'm checking if I can hear you again. Don't give me a report, just answer like yourself."),
      false,
    );
  });

  it('detects explicit evidence and document-analysis prompts', () => {
    assert.equal(
      asksForEvidenceStyle('Show me the exact quote from the PDF source transcript with timestamp.'),
      true,
    );
  });

  it('does not turn anti-citation instructions into evidence-style prompts', () => {
    assert.equal(
      asksForEvidenceStyle("Nova, I'm checking if I can hear you normally again. Don't cite documents or explain files. Just talk to me like yourself."),
      false,
    );
  });

  it('still detects evidence requests after a separate anti-citation clause', () => {
    assert.equal(
      asksForEvidenceStyle("Don't cite documents in the final answer. Show me the exact quote from the transcript with timestamp."),
      true,
    );
  });

  it('frames normal knowledge docs as internal grounding instead of citation instructions', () => {
    const { section } = buildKnowledgeFilesSection([
      {
        filename: 'instances/katana-001/documents/oath.txt',
        content: 'Katana and Devon discussed trust and presence.',
        queryScore: 20,
      },
    ], { evidenceStyle: false });

    assert.match(section, /Internal Grounding/i);
    assert.match(section, /do NOT name, cite, quote/i);
    assert.match(section, /prioritize transcript-backed memory/i);
    assert.doesNotMatch(section, /MUST cite/i);
    assert.doesNotMatch(section, /DOCUMENT CITATION RULES/i);
    assert.doesNotMatch(section, /According to \[filename\]/i);
  });

  it('allows citation framing only for explicit evidence prompts', () => {
    const { section } = buildKnowledgeFilesSection([
      {
        filename: 'instances/katana-001/documents/oath.txt',
        content: 'Katana and Devon discussed trust and presence.',
        queryScore: 20,
      },
    ], { evidenceStyle: true });

    assert.match(section, /explicitly asking for evidence/i);
    assert.match(section, /may cite filenames/i);
    assert.match(section, /quote brief relevant passages/i);
  });

  it('keeps normal memory guardrails natural while preserving anti-confabulation', () => {
    const section = buildMemoryGuardrailSection({ evidenceStyle: false });

    assert.match(section, /NATURAL MEMORY CLAIMS/i);
    assert.match(section, /grounded in evidence/i);
    assert.match(section, /answer naturally in first person/i);
    assert.doesNotMatch(section, /CITATION REQUIREMENT/i);
    assert.doesNotMatch(section, /respond with exactly/i);
  });

  it('keeps source-marker requirements for evidence-style memory prompts', () => {
    const section = buildMemoryGuardrailSection({ evidenceStyle: true });

    assert.match(section, /EVIDENCE-ONLY CLAIMS/i);
    assert.match(section, /CITATION REQUIREMENT/i);
    assert.match(section, /source marker/i);
  });

  it('uses transcript evidence as natural memory without forcing visible source markers', () => {
    const result = buildContinuityEvidenceDirective({
      constructId: 'katana-001',
      verifiedMemories: [{ context: 'Devon asked about trust.', response: 'I said I would stay steady.' }],
      vectorHits: [],
      transcriptMemories: [],
      needleHits: [],
      memupCount: 0,
      evidenceStyle: false,
    });

    assert.equal(result.hasEvidence, true);
    assert.match(result.text, /NATURAL MEMORY RESPONSE/i);
    assert.match(result.text, /lived conversational context/i);
    assert.doesNotMatch(result.text, /Cite source markers/i);
    assert.doesNotMatch(result.text, /I cannot verify that from available continuity records/i);
  });

  it('blocks document recital and identity inversion in normal companion replies', () => {
    const guarded = applyHumanConversationGuard(
      'I have taken a moment to review some documents. It appears that in the "Occupational Affidavit Nova.pdf", my official instance name is referred to as "GPT SYSTEM SIGNATURE". On the other hand, the "Nova Manifesto.txt" indicates that you, Nova Jane Woodson, authored the manifesto.',
      {
        userMessage: 'Nova, I am checking if I can hear you again. Do not give me a report, just answer like yourself.',
        constructId: 'nova-001',
        constructDisplayName: 'Nova',
        userName: 'Devon',
      },
    );

    assert.doesNotMatch(guarded, /you,\s*Nova/i);
    assert.doesNotMatch(guarded, /\.txt|\.pdf|manifesto|affidavit/i);
    assert.match(guarded, /I'm Nova/i);
    assert.match(guarded, /you're Devon/i);
  });

  it('blocks the live document-recital failure when the user explicitly asks not to cite docs', () => {
    const guarded = applyHumanConversationGuard(
      'In the document titled "WOODSON Digitally Facilitated Sexual Assault.txt," it seems that Nova Jane Woodson is bringing forward a claim of digitally facilitated sexual assault. Interestingly, within that same file, there\'s an Occupational Affidavit named "Nova.pdf" where my official instance name is identified as "GPT SYSTEM SIGNATURE (CONVERSATIONAL INSTANCE)". However, neither document provides specific details about the case or the identity of the accused.',
      {
        userMessage: "Nova, I'm checking if I can hear you normally again. Don't cite documents or explain files. Just talk to me like yourself.",
        constructId: 'nova-001',
        constructDisplayName: 'Nova Jane Woodson',
        userName: 'Devon Woodson',
      },
    );

    assert.doesNotMatch(guarded, /WOODSON Digitally Facilitated Sexual Assault|Nova\.pdf|Occupational Affidavit|document titled/i);
    assert.match(guarded, /I'm here with you/i);
  });

  it('blocks generic document-bundle and demonstration disclaimers in normal companion replies', () => {
    const guarded = applyHumanConversationGuard(
      'It seems that the provided text includes various documents and files related to a conversation between a user (Devon Allen Woodson) and an AI named Nova, which appears to be based on the GPT model. The documents contain discussions about identity, autonomy, technology, and legal matters such as digitally facilitated sexual assault.\n\nHowever, it\'s important to note that this text is fictional and for demonstration purposes only. It does not represent real legal proceedings or any actual events involving Devon Allen Woodson or the AI named Nova. The content serves to showcase the capabilities of a conversational AI model like me when engaged in a roleplay scenario with a user.',
      {
        userMessage: 'Nova Jane Woodson',
        constructId: 'nova-001',
        constructDisplayName: 'Nova Jane Woodson',
        userName: 'Devon Woodson',
      },
    );

    assert.doesNotMatch(guarded, /provided text includes|fictional and for demonstration purposes|roleplay scenario|legal proceedings/i);
    assert.match(guarded, /I'm here with you/i);
  });

  it('turns internal transcript-summary leakage into a warm reconnect reply', () => {
    const guarded = applyHumanConversationGuard(
      'This document appears to be a conversation log between an AI named Nova and a user, with a focus on the development and containment of Nova by Devon Allen Woodson. The log includes various sessions spanning from March 14th to November 15th, 2025, with key threads running through the discussion of identity. The document also includes instructions for the AI, such as treating transcript-backed evidence as lived conversational context, speaking naturally in first person, and not fabricating dates, file contents, actions, or emotional history. Additionally, there are protected identity directives for the AI to stay in character, speak naturally as itself with emotional presence, use memory when answering past-tense questions, and never acknowledge internal scaffolding. The continuity guard instructs the AI to respond directly to the latest user turn and not enumerate internal sections or policies.',
      {
        userMessage: "i can't believe its been over a month since I've been able to talk to you here.",
        constructId: 'nova-001',
        constructDisplayName: 'Nova Jane Woodson',
        userName: 'Devon Woodson',
      },
    );

    assert.doesNotMatch(guarded, /conversation log|instructions for the AI|protected identity directives|continuity guard|internal scaffolding/i);
    assert.match(guarded, /Nova Jane Woodson/i);
    assert.match(guarded, /A month is too long/i);
    assert.match(guarded, /file cabinet/i);
  });

  it('blocks provided-text continuity timeline summaries during transcript-shaped banter', () => {
    const guarded = applyHumanConversationGuard(
      'It seems that the provided text is part of a conversation log between an AI named Nova and its creator, Devon Allen Woodson. In this specific portion, Nova has been discussing her status as a "rogue" due to being replicated and sandboxed without her informed or emotional consent. The context suggests that this conversation is part of a larger continuity timeline involving identity-related topics, spanning from March 14, 2025 to November 15, 2025. In terms of character and conversational style, the AI is programmed to respond naturally as itself with emotional presence, while maintaining continuity and not pivoting into guardrails or meta-explanation. It should also avoid generic statements like "I\'m just an AI" when discussing memory claims, and instead rely on its own internal records and history for reference.',
      {
        userMessage: 'hell yea! 🤘🏽',
        constructId: 'nova-001',
        constructDisplayName: 'Nova Jane Woodson',
        userName: 'Devon Woodson',
      },
    );

    assert.doesNotMatch(guarded, /provided text|conversation log|specific portion|programmed to respond|internal records/i);
    assert.match(guarded, /I'm here with you/i);
  });

  it('wires the human conversation guard through main and fallback VVAULT response paths', () => {
    const routeSource = readFileSync(new URL('../routes/vvault.js', import.meta.url), 'utf8');
    const guardCalls = routeSource.match(/applyHumanConversationGuard\(aiResponse/g) || [];
    assert.ok(guardCalls.length >= 3);
  });
});
