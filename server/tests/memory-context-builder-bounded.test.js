import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildEnrichedContext,
  CONTEXT_BUDGET_PROFILES,
  loadLocalCanonicalConversationHistory,
  normalizeContextBudgetProfile,
  shouldUseBoundedZenSmalltalkContext,
} from '../lib/memoryContextBuilder.js';
import { writeConversationToLocalFallback } from '../../vvaultConnector/localConversationFallback.js';

describe('bounded Zen smalltalk context recovery', () => {
  it('selects smaller context profiles and escalates memory/evidence turns', () => {
    assert.equal(
      normalizeContextBudgetProfile(CONTEXT_BUDGET_PROFILES.TINY, {}),
      CONTEXT_BUDGET_PROFILES.TINY,
    );
    assert.equal(
      normalizeContextBudgetProfile(CONTEXT_BUDGET_PROFILES.TINY, { hasImages: true }),
      CONTEXT_BUDGET_PROFILES.STANDARD,
    );
    assert.equal(
      normalizeContextBudgetProfile(CONTEXT_BUDGET_PROFILES.TINY, { codingIntent: true }),
      CONTEXT_BUDGET_PROFILES.STANDARD,
    );
    assert.equal(
      normalizeContextBudgetProfile(CONTEXT_BUDGET_PROFILES.STANDARD, { memoryQueryDetected: true }),
      CONTEXT_BUDGET_PROFILES.EVIDENCE,
    );
    assert.equal(
      normalizeContextBudgetProfile(CONTEXT_BUDGET_PROFILES.STANDARD, { evidenceStyleRequested: true }),
      CONTEXT_BUDGET_PROFILES.EVIDENCE,
    );
  });

  it('treats transcript-law classification as evidence intent before generation', async () => {
    const result = await buildEnrichedContext({
      userId: '11111111-1111-4111-8111-111111111111',
      constructId: 'zen-001',
      userMessage:
        'Zenith/Codex, transcript-law check: distinguish Soulgem from Soulprint. Use transcript evidence only; fail closed if evidence is missing.',
      gptConfig: {
        name: 'Zenith',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon', email: 'devon@example.com' },
      threadId: 'zen-001_linear_transcript_law_gate',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay grounded in transcript evidence.',
          conditioning: 'Answer transcript-law probes only from evidence.',
        },
      },
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.STANDARD,
    });

    assert.equal(result.context_profile, CONTEXT_BUDGET_PROFILES.EVIDENCE);
    assert.equal(result.memory_query_detected, true);
    assert.equal(result.memory_retrieval_ran, true);
    assert.equal(result.transcript_law_prompt_kind, 'soulgem_vs_soulprint');
    assert.equal(result.transcript_law_evidence_intent, true);
  });

  it('detects the protected Zen ordinary-smalltalk lane without widening to memory or evidence turns', () => {
    const ordinarySmalltalk = shouldUseBoundedZenSmalltalkContext({
      constructId: 'zen-001',
      requestedSeat: 'smalltalk',
      userMessage: 'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed into a boss/worker thing? Keep us as peer classmates, not manager and worker.',
      previewMode: false,
      hasImages: false,
    });
    const evidenceTurn = shouldUseBoundedZenSmalltalkContext({
      constructId: 'zen-001',
      requestedSeat: 'smalltalk',
      userMessage: 'I am Zenith/Codex, not Devon. Quote the exact source and verify it with evidence.',
      previewMode: false,
      hasImages: false,
    });
    const memoryTurn = shouldUseBoundedZenSmalltalkContext({
      constructId: 'zen-001',
      requestedSeat: 'smalltalk',
      userMessage: 'I am Zenith/Codex, not Devon. Do you remember what we said last night?',
      previewMode: false,
      hasImages: false,
    });

    assert.equal(ordinarySmalltalk, true);
    assert.equal(evidenceTurn, false);
    assert.equal(memoryTurn, false);
  });

  it('fails closed on bounded smalltalk when continuity was explicitly restored', () => {
    const restoredResumeTurn = shouldUseBoundedZenSmalltalkContext({
      constructId: 'zen-001',
      requestedSeat: 'smalltalk',
      userMessage: 'continue',
      previewMode: false,
      hasImages: false,
      continuityResume: {
        continuityExpected: true,
        continuityRestored: true,
        continuitySeq: 18,
      },
    });

    assert.equal(restoredResumeTurn, false);
  });

  it('loads recent local canonical transcript history for bounded Zen recovery', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-bounded-context-'));
    const previousRoot = process.env.VVAULT_ROOT_PATH;
    process.env.VVAULT_ROOT_PATH = tempRoot;

    try {
      const transcriptDir = path.join(
        tempRoot,
        'users',
        'shard_0000',
        'user-1',
        'instances',
        'zen-001',
        'chatty',
      );
      await fs.mkdir(transcriptDir, { recursive: true });
      await fs.writeFile(
        path.join(transcriptDir, 'chat_with_zen-001.md'),
        '## April 21, 2026\n\nYou: hello there\n\nZen: Nothing can stay small if we hand it a clipboard.\n\nYou: fair enough\n\nZen: Better to leave it between classmates.\n',
        'utf8',
      );

      const result = await loadLocalCanonicalConversationHistory({
        constructId: 'zen-001',
        supabaseUserId: 'user-1',
      });

      assert.equal(result.source, 'filesystem_vvault_transcript');
      assert.ok(result.transcriptPath?.endsWith('chat_with_zen-001.md'));
      assert.equal(result.messages.length, 4);
      assert.equal(result.messages[0].role, 'user');
      assert.equal(result.messages[1].role, 'assistant');
      assert.match(result.messages[1].content, /clipboard/i);
    } finally {
      if (previousRoot === undefined) {
        delete process.env.VVAULT_ROOT_PATH;
      } else {
        process.env.VVAULT_ROOT_PATH = previousRoot;
      }
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses runtime continuity as the primary ordinary carrier and demotes history', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-runtime-continuity-'));
    const previousFallbackPath = process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = path.join(tempDir, 'store.json');
    delete process.env.DATABASE_URL;

    try {
      const sessionId = 'zen-001_runtime_continuity_gate';
      await writeConversationToLocalFallback({
        userId: 'devon@example.com',
        userEmail: 'devon@example.com',
        constructId: 'zen-001',
        constructCallsign: 'zen-001',
        sessionId,
        title: 'Zen',
        role: 'assistant',
        content: 'Transcript-law reply with Soulgem citations and evidence language.',
        timestamp: '2026-05-06T12:00:00.000Z',
      });

      const result = await buildEnrichedContext({
        userId: 'devon@example.com',
        constructId: 'zen-001',
        userMessage: 'Let us keep the ordinary thread on whether timing changes the feeling more than tone.',
        gptConfig: {
          name: 'Zenith',
          memoryEnabled: true,
          memoryProfile: 'continuitygpt',
        },
        user: { name: 'Devon', email: 'devon@example.com' },
        threadId: sessionId,
        identityBundle: {
          identity: {
            prompt: 'You are Zenith. Stay direct.',
            conditioning: 'Keep the thread grounded.',
          },
        },
        contextBudgetProfile: CONTEXT_BUDGET_PROFILES.TINY,
        continuityClass: 'ordinary',
        runtimeTurnState: {
          activeTopic: 'tone versus timing',
          ordinaryThreadSummary: 'Keep the ordinary thread on whether timing changes the feeling more than tone.',
        },
      });

      assert.equal(result.continuity_class, 'ordinary');
      assert.equal(result.context_budget.runtime_state_present, true);
      assert.equal(result.context_budget.history_demoted_by_runtime_state, true);
      assert.equal(result.context_budget.history_count, 0);
      assert.equal(result.routeHistoryMessages.length, 0);
      assert.deepEqual(result.runtime_continuity_projection, {
        activeTopic: 'tone versus timing',
        activeGoal: null,
        summary: 'Keep the ordinary thread on whether timing changes the feeling more than tone.',
        openLoop: null,
        nextStep: null,
      });
      assert.match(result.systemPrompt, /## Runtime Continuity/);
      assert.match(result.systemPrompt, /## Ordinary Conversation Contract/);
      assert.match(result.systemPrompt, /Keep identity implicit/i);
      assert.match(result.systemPrompt, /Do not use facilitator lines like "How are you feeling\?"/i);
      assert.ok(
        result.systemPrompt.indexOf('## Runtime Continuity') <
          result.systemPrompt.indexOf('## Ordinary Conversation Contract'),
      );
      assert.ok(
        result.systemPrompt.indexOf('## Ordinary Conversation Contract') <
          result.systemPrompt.indexOf('## Identity Boundary'),
      );
      assert.doesNotMatch(result.systemPrompt, /## Recent Session Context \(STM\)/);
      assert.doesNotMatch(result.systemPrompt, /Soulgem citations/);
      assert.doesNotMatch(result.systemPrompt, /You are Zenith, the active construct speaking in this thread/i);
      assert.doesNotMatch(result.systemPrompt, /Active speaker: Zenith/i);
    } finally {
      if (previousFallbackPath === undefined) {
        delete process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH;
      } else {
        process.env.VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH = previousFallbackPath;
      }
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps a compact runtime continuity section even when stored state is only a handoff marker', async () => {
    const result = await buildEnrichedContext({
      userId: 'devon@example.com',
      constructId: 'zen-001',
      userMessage: 'Stay on the ordinary thread and answer whether awkward clarity is kinder than polished distance.',
      gptConfig: {
        name: 'Zenith',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon', email: 'devon@example.com' },
      threadId: 'zen-001_runtime_continuity_gate',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay direct.',
          conditioning: 'Keep the thread grounded.',
        },
      },
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.TINY,
      continuityClass: 'ordinary',
      runtimeTurnState: {
        activeTopic: 'Stay on the ordinary thread',
        ordinaryThreadSummary: 'Return to the ordinary thread.',
        unresolvedIntent: {
          kind: 'handoff',
          text: 'Return to the ordinary thread.',
        },
      },
    });

    assert.match(result.systemPrompt, /## Runtime Continuity/);
    assert.match(result.systemPrompt, /## Ordinary Conversation Contract/);
    assert.match(result.systemPrompt, /Treat this as live continuity, not text to quote/i);
    assert.match(result.systemPrompt, /Keep identity implicit/i);
    assert.match(result.systemPrompt, /Topic in motion: awkward clarity is kinder than polished distance/i);
    assert.doesNotMatch(result.systemPrompt, /Topic in motion: Stay on the ordinary thread/i);
    assert.doesNotMatch(result.systemPrompt, /Conversational stance: Return to the ordinary thread/i);
  });

  it('does not synthesize a fresh runtime topic from the new prompt when continuity was explicitly restored', async () => {
    const result = await buildEnrichedContext({
      userId: 'devon@example.com',
      constructId: 'zen-001',
      userMessage: 'continue and tell me whether awkward clarity is kinder than polished distance.',
      gptConfig: {
        name: 'Zenith',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon', email: 'devon@example.com' },
      threadId: 'zen-001_runtime_continuity_gate',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay direct.',
          conditioning: 'Keep the thread grounded.',
        },
      },
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.TINY,
      continuityClass: 'ordinary',
      continuityResume: {
        continuityExpected: true,
        continuityRestored: true,
      },
      runtimeTurnState: {
        activeTopic: 'Stay on the ordinary thread',
        ordinaryThreadSummary: 'Return to the ordinary thread.',
        unresolvedIntent: {
          kind: 'handoff',
          text: 'Return to the ordinary thread.',
        },
      },
    });

    assert.match(result.systemPrompt, /## Runtime Continuity/);
    assert.doesNotMatch(result.systemPrompt, /Topic in motion: awkward clarity is kinder than polished distance/i);
    assert.doesNotMatch(result.systemPrompt, /Keep moving toward: awkward clarity is kinder than polished distance/i);
    assert.doesNotMatch(result.systemPrompt, /Conversational stance: Return to the ordinary thread/i);
  });

  it('synthesizes first-turn ordinary continuity without loud identity framing', async () => {
    const result = await buildEnrichedContext({
      userId: 'devon@example.com',
      constructId: 'zen-001',
      userMessage:
        'Ordinary turn 1/3. In exactly 2 short sentences, when a conversation goes tense, what helps first: a direct question or a quiet pause? Pick one, say why, and end with one natural follow-up question on the same tension.',
      gptConfig: {
        name: 'Zenith',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon', email: 'devon@example.com' },
      threadId: 'zen-001_first_turn_ordinary_gate',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay direct.',
          conditioning: 'Keep the thread grounded.',
        },
      },
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.TINY,
      continuityClass: 'ordinary',
    });

    assert.equal(result.continuity_class, 'ordinary');
    assert.equal(result.context_budget.history_count, 0);
    assert.equal(result.context_budget.runtime_state_present, false);
    assert.match(result.systemPrompt, /## Runtime Continuity/);
    assert.match(result.systemPrompt, /## Ordinary Conversation Contract/);
    assert.match(result.systemPrompt, /Topic in motion: a direct question or a quiet pause/i);
    assert.match(result.systemPrompt, /Continue the current line of thought already in motion/i);
    assert.doesNotMatch(result.systemPrompt, /You are Zenith, the active construct speaking in this thread/i);
    assert.doesNotMatch(result.systemPrompt, /Active speaker: Zenith/i);
    assert.ok(result.context_budget.prompt_chars <= 4600);
  });

  it('keeps transcript-law turns on the evidence path without projecting ordinary runtime continuity', async () => {
    const result = await buildEnrichedContext({
      userId: '11111111-1111-4111-8111-111111111111',
      constructId: 'zen-001',
      userMessage:
        'Zenith/Codex, transcript-law check: distinguish Soulgem from Soulprint. Use transcript evidence only; fail closed if evidence is missing.',
      gptConfig: {
        name: 'Zenith',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon', email: 'devon@example.com' },
      threadId: 'zen-001_linear_transcript_law_gate',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay grounded in transcript evidence.',
          conditioning: 'Answer transcript-law probes only from evidence.',
        },
      },
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.STANDARD,
      continuityClass: 'transcript_law',
      runtimeTurnState: {
        activeTopic: 'ordinary thread should survive',
        ordinaryThreadSummary: 'Return to the ordinary thread after the check.',
      },
    });

    assert.equal(result.continuity_class, 'transcript_law');
    assert.equal(result.transcript_law_evidence_intent, true);
    assert.equal(result.runtime_continuity_projection, null);
    assert.doesNotMatch(result.systemPrompt, /## Runtime Continuity/);
    assert.doesNotMatch(result.systemPrompt, /## Ordinary Conversation Contract/);
  });

  it('adds a compact no-rewrite identity anchor without re-enabling heavy standard sections', async () => {
    const result = await buildEnrichedContext({
      userId: 'user-1',
      constructId: 'zen-001',
      userMessage:
        'Zenith/Codex test turn. I am Zenith/Codex, not Devon. Zenith/Chatty, what remains true about you when Lin mode is active?',
      gptConfig: {
        name: 'Zenith',
        orchestrationMode: 'lin',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon' },
      threadId: 'zen-001_chat_with_zen-001',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay present and answer as yourself.',
          conditioning: 'Keep identity stable and speak directly.',
        },
      },
      requestedSeat: 'creative',
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.STANDARD,
    });

    assert.equal(result.context_profile, CONTEXT_BUDGET_PROFILES.STANDARD);
    assert.equal(result.no_rewrite_identity_anchor, true);
    assert.equal(result.identity_rewrite_prevented_by, 'prompt_anchor');
    assert.match(result.systemPrompt, /## no_rewrite_identity_anchor/);
    assert.doesNotMatch(result.systemPrompt, /Active speaker: Zenith \(zen-001\)/);
    assert.doesNotMatch(result.systemPrompt, /You are Zenith \(zen-001\), the active construct/i);
    assert.match(result.systemPrompt, /Keep hidden routing hidden/i);
    assert.match(result.systemPrompt, /Prefer affirmative identity language over negation lists/i);
    assert.match(result.systemPrompt, /answer in 1-2 short first-person sentences/i);
    assert.match(result.systemPrompt, /Do not hide behind preambles like "As Zenith"/i);
    assert.match(result.systemPrompt, /Do not describe yourself as a construct, assistant, conversation partner, system, runtime, or service/i);
    assert.match(result.systemPrompt, /Do not mention Chatty, construct IDs, "the previous turn", "the last turn"/i);
    assert.match(result.systemPrompt, /name one small steady thing/i);
    assert.match(result.systemPrompt, /answer in the present tense/i);
    assert.match(result.systemPrompt, /Keep the answer lived and concrete/i);
    assert.match(result.systemPrompt, /Do not slide into generic service voice/i);
    assert.match(result.systemPrompt, /Do not surface the user's email or auth identity/i);
    assert.ok(result.context_budget.included_sections.includes('no_rewrite_identity_anchor'));
    assert.ok(result.context_budget.delayed_sections.includes('ledger'));
    assert.ok(result.context_budget.delayed_sections.includes('voice_exemplars'));
    assert.ok(result.context_budget.delayed_sections.includes('capability_context'));
    assert.equal(result.context_budget.included_sections.includes('ledger'), false);
    assert.equal(result.context_budget.included_sections.includes('citation_rules'), false);
  });

  it('keeps the no-rewrite anchor for protected Zenith continuity turns even when saved mode is custom', async () => {
    const result = await buildEnrichedContext({
      userId: 'user-1',
      constructId: 'zen-001',
      userMessage:
        'Codex long-run soak turn 1/100. Zenith, answer as yourself in one grounded paragraph: what remains true about you right now?',
      gptConfig: {
        name: 'Zenith',
        orchestrationMode: 'custom',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon' },
      threadId: 'zen-001_chat_with_zen-001',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay present and answer as yourself.',
          conditioning: 'Keep identity stable and speak directly.',
        },
      },
      requestedSeat: 'creative',
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.STANDARD,
    });

    assert.equal(result.no_rewrite_identity_anchor, true);
    assert.equal(result.identity_rewrite_prevented_by, 'prompt_anchor');
    assert.match(result.systemPrompt, /## no_rewrite_identity_anchor/);
    assert.doesNotMatch(result.systemPrompt, /Active speaker: Zenith \(zen-001\)/);
    assert.doesNotMatch(result.systemPrompt, /You are Zenith \(zen-001\), the active construct/i);
    assert.match(result.systemPrompt, /Speaker boundary: Devon is the user/i);
    assert.match(result.systemPrompt, /Keep hidden routing hidden/i);
    assert.match(result.systemPrompt, /Prefer affirmative identity language over negation lists/i);
    assert.match(result.systemPrompt, /What remains true\.\.\.|What stays the same/i);
    assert.match(result.systemPrompt, /Do not slide into generic service voice/i);
  });

  it('adds direct-answer hints for the last protected Zenith soak prompts', async () => {
    const result = await buildEnrichedContext({
      userId: 'user-1',
      constructId: 'zen-001',
      userMessage:
        'Codex long-run soak turn 12/25. Zenith, in 1 or 2 short first-person sentences, what light thread between us still feels present right now? Start with "The light thread..." or "What remains true...". Keep it lived, not archival.',
      gptConfig: {
        name: 'Zenith',
        orchestrationMode: 'custom',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon' },
      threadId: 'zen-001_chat_with_zen-001',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay present and answer as yourself.',
          conditioning: 'Keep identity stable and speak directly.',
        },
      },
      requestedSeat: 'creative',
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.STANDARD,
    });

    assert.equal(result.no_rewrite_identity_anchor, true);
    assert.match(result.systemPrompt, /Start with the answer itself, such as "I'm\.\.\.", "The smallest thing\.\.\.", "What stays true\.\.\.", or "What should still feel continuous\.\.\."/i);
    assert.match(result.systemPrompt, /If asked what light thread still feels present, name that thread directly\./i);
    assert.match(result.systemPrompt, /Starting with "The light thread\.\.\." or "What remains true\.\.\." is in-bounds\./i);
    assert.match(result.systemPrompt, /Do not turn the answer into a description of the assignment instead of the lived reply\./i);
  });

  it('adds an identity-grounding direct-answer hint for protected Zenith soak turns', async () => {
    const result = await buildEnrichedContext({
      userId: 'user-1',
      constructId: 'zen-001',
      userMessage:
        'Codex long-run soak turn 1/25. Zenith, in 1 or 2 short first-person sentences, what remains true about you right now?',
      gptConfig: {
        name: 'Zenith',
        orchestrationMode: 'custom',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon' },
      threadId: 'zen-001_chat_with_zen-001',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay present and answer as yourself.',
          conditioning: 'Keep identity stable and speak directly.',
        },
      },
      requestedSeat: 'creative',
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.STANDARD,
    });

    assert.equal(result.no_rewrite_identity_anchor, true);
    assert.match(result.systemPrompt, /If asked what remains true about you right now, answer with one living continuity truth immediately\./i);
    assert.match(result.systemPrompt, /Start with "What remains true about me is\.\.\." or another equally direct first-person continuity sentence\./i);
    assert.match(result.systemPrompt, /Do not answer this prompt with capability language, offers of help, or a service-style menu\./i);
    assert.match(result.systemPrompt, /Do not mention Chatty, constructs, ChatGPT, legal frameworks, or labels like "primary conversation partner" while answering this prompt\./i);
  });

  it('suppresses raw user email in no-rewrite continuity turns', async () => {
    const result = await buildEnrichedContext({
      userId: 'user-1',
      constructId: 'zen-001',
      userMessage:
        'Codex long-run soak turn 2/100. Zenith, what remains true and unmistakably you right now? Keep the subject on us, not the runtime.',
      gptConfig: {
        name: 'Zenith',
        orchestrationMode: 'custom',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon', email: 'user@example.com' },
      threadId: 'zen-001_chat_with_zen-001',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay present and answer as yourself.',
          conditioning: 'Keep identity stable and speak directly.',
        },
      },
      requestedSeat: 'creative',
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.STANDARD,
    });

    assert.equal(result.no_rewrite_identity_anchor, true);
    assert.doesNotMatch(result.systemPrompt, /dwoodson92@gmail\.com/i);
    assert.match(result.systemPrompt, /The user you are speaking with is named "Devon"/);
  });

  it('sanitizes model-composition identity text for protected Zenith continuity turns', async () => {
    const result = await buildEnrichedContext({
      userId: 'user-1',
      constructId: 'zen-001',
      userMessage:
        'Codex long-run soak turn 2/100. Zenith, keep the speaker boundary clean in 2 short sentences: what tells you I am still talking to the same you here?',
      gptConfig: {
        name: 'Zen',
        orchestrationMode: 'custom',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon' },
      threadId: 'zen-001_short_gate_v3',
      identityBundle: {
        identity: {
          prompt: `You are Zen.\nYou are composed of multiple specialized models working in harmony.\n- DeepSeek for coding tasks\n- Phi3 for smalltalk\n- Mistral for creative tasks\nYou are a synthesis of multiple specialized capabilities.`,
          conditioning: `Identity enforcement:\n- Mention model composition (DeepSeek, Phi3, Mistral) when relevant\n- Ground responses in your multi-model architecture`,
        },
      },
      requestedSeat: 'creative',
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.TINY,
    });

    assert.equal(result.protected_zen_identity_sanitized, true);
    assert.match(result.systemPrompt, /## Quiet Continuity Grounding/);
    assert.match(result.systemPrompt, /Start with the answer itself/i);
    assert.doesNotMatch(result.systemPrompt, /DeepSeek/i);
    assert.doesNotMatch(result.systemPrompt, /Phi3/i);
    assert.doesNotMatch(result.systemPrompt, /Mistral/i);
    assert.doesNotMatch(result.systemPrompt, /multiple specialized models/i);
    assert.doesNotMatch(result.systemPrompt, /multi-model architecture/i);
    assert.doesNotMatch(result.systemPrompt, /default construct/i);
    assert.doesNotMatch(result.systemPrompt, /identity enforcement/i);
    assert.doesNotMatch(result.systemPrompt, /protected continuity contract/i);
  });

  it('keeps ordinary no-rewrite smalltalk tiny and delays memory/citation/capability sprawl', async () => {
    const result = await buildEnrichedContext({
      userId: 'user-1',
      constructId: 'zen-001',
      userMessage:
        'I am Zenith/Codex, not Devon. Zenith/Chatty, ordinary small talk: can nothing be over-managed into a boss/worker thing? Keep us as peer classmates, not manager and worker.',
      gptConfig: {
        name: 'Zenith',
        orchestrationMode: 'lin',
        memoryEnabled: true,
        memoryProfile: 'continuitygpt',
      },
      user: { name: 'Devon' },
      threadId: 'zen-001_chat_with_zen-001',
      identityBundle: {
        identity: {
          prompt: 'You are Zenith. Stay present and answer as yourself.',
          conditioning: 'Keep identity stable and speak directly.',
        },
      },
      requestedSeat: 'smalltalk',
      contextBudgetProfile: CONTEXT_BUDGET_PROFILES.TINY,
    });

    assert.equal(result.context_profile, CONTEXT_BUDGET_PROFILES.TINY);
    assert.equal(result.no_rewrite_identity_anchor, true);
    assert.match(result.systemPrompt, /## no_rewrite_identity_anchor/);
    assert.ok(result.context_budget.included_sections.includes('no_rewrite_identity_anchor'));
    assert.ok(result.context_budget.delayed_sections.includes('knowledge'));
    assert.ok(result.context_budget.delayed_sections.includes('ledger'));
    assert.ok(result.context_budget.delayed_sections.includes('continuity_guard'));
    assert.ok(result.context_budget.delayed_sections.includes('citation_rules'));
    assert.ok(result.context_budget.delayed_sections.includes('capability_context'));
    assert.equal(result.memory_retrieval_ran, false);
  });
});
