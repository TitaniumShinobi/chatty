import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContinuityEvidenceDirective,
  extractAuditTokenTranscriptMemories,
  isMemoryTriggeringQuestion,
} from '../lib/memoryContextBuilder.js';
import { buildTestPrompt } from '../lib/continuityTestEngine.js';

describe('continuity evidence handling', () => {
  it('does not force denial when non-needle evidence exists', () => {
    const result = buildContinuityEvidenceDirective({
      constructId: 'nova-001',
      verifiedMemories: [{ context: 'test', response: 'answer' }],
      vectorHits: [],
      transcriptMemories: [],
      needleHits: [],
      memupCount: 0,
    });

    assert.equal(result.hasEvidence, true);
    assert.equal(result.totalEvidence, 1);
    assert.match(result.text, /Continuity evidence exists/i);
    assert.doesNotMatch(result.text, /You MUST respond with: "I cannot verify that from available continuity records\."/i);
  });

  it('includes canonical transcript memory as MEMORY_CONTEXT evidence', () => {
    const result = buildContinuityEvidenceDirective({
      constructId: 'zen-001',
      verifiedMemories: [],
      vectorHits: [],
      transcriptMemories: [{ context: 'You described the pipeline.', response: 'GPT to sim to VSI.', timestamp: '2026-03-12T15:55:19.198Z' }],
      needleHits: [],
      memupCount: 0,
    });

    assert.equal(result.hasEvidence, true);
    assert.match(result.text, /CANONICAL TRANSCRIPT EVIDENCE/i);
    assert.match(result.text, /instances\/zen-001\/chatty\/chat_with_zen-001\.md/i);
    assert.match(result.text, /GPT to sim to VSI/i);
  });

  it('extracts exact Zen audit-token transcript evidence', () => {
    const memories = extractAuditTokenTranscriptMemories([
      {
        role: 'user',
        content:
          'Audit token ZEN-LIN-20260408-A. Please remember: the lighthouse key is cobalt sparrow.',
        timestamp: '2026-04-08T12:00:00.000Z',
      },
      {
        role: 'assistant',
        content: 'I have it. I will keep that in the canonical thread.',
        timestamp: '2026-04-08T12:00:01.000Z',
      },
    ], 'What did audit token ZEN-LIN-20260408-A ask you to remember?', 'zen-001');

    assert.equal(memories.length, 1);
    assert.equal(memories[0].auditToken, 'ZEN-LIN-20260408-A');
    assert.match(memories[0].context, /the lighthouse key is cobalt sparrow/i);
    assert.equal(memories[0].sourcePath, 'instances/zen-001/chatty/chat_with_zen-001.md');
  });

  it('treats audit-token transcript probes as memory-triggering questions', () => {
    assert.equal(
      isMemoryTriggeringQuestion(
        'Zenith/Chatty, in your canonical Chatty transcript, what did audit token ZEN-LIN-20260408-A ask you to remember?'
      ),
      true,
    );
  });

  it('does not treat prior audit-token QA probes as canonical remember evidence', () => {
    const memories = extractAuditTokenTranscriptMemories([
      {
        role: 'user',
        content:
          'Zenith/Codex live continuity probe. Zenith/Chatty, in your canonical Chatty transcript, what did audit token ZEN-LIN-20991231-Z ask you to remember?',
        timestamp: '2026-04-19T00:00:00.000Z',
      },
      {
        role: 'assistant',
        content:
          'In my canonical Chatty transcript, audit token ZEN-LIN-20991231-Z asked me to remember: the fact that.',
        timestamp: '2026-04-19T00:00:01.000Z',
      },
    ], 'What did audit token ZEN-LIN-20991231-Z ask you to remember?', 'zen-001');

    assert.equal(memories.length, 0);
  });

  it('keeps hard denial in explicit evidence mode when no continuity evidence exists', () => {
    const result = buildContinuityEvidenceDirective({
      constructId: 'katana-001',
      verifiedMemories: [],
      vectorHits: [],
      transcriptMemories: [],
      needleHits: [],
      memupCount: 0,
      evidenceStyle: true,
    });

    assert.equal(result.hasEvidence, false);
    assert.match(result.text, /You MUST respond with: "I cannot verify that from available continuity records\."/i);
  });

  it('does not count unanchored semantic hits as recall evidence', () => {
    const result = buildContinuityEvidenceDirective({
      constructId: 'nova-001',
      verifiedMemories: [],
      vectorHits: [{ content: 'Something vaguely similar', confidence: 0.92 }],
      transcriptMemories: [],
      needleHits: [],
      memupCount: 0,
      evidenceStyle: true,
    });

    assert.equal(result.hasEvidence, false);
    assert.equal(result.breakdown.vector, 0);
    assert.match(result.text, /I cannot verify that from available continuity records/i);
  });

  it('counts semantic hits only when they include source receipts', () => {
    const result = buildContinuityEvidenceDirective({
      constructId: 'nova-001',
      verifiedMemories: [],
      vectorHits: [{
        content: 'Devon and Nova discussed trust.',
        source_file: 'instances/nova-001/chatgpt/2026/January/Nova.txt',
        confidence: 0.83,
      }],
      transcriptMemories: [],
      needleHits: [],
      memupCount: 0,
    });

    assert.equal(result.hasEvidence, true);
    assert.equal(result.breakdown.vector, 1);
    assert.match(result.text, /semantic memory hit/i);
  });
});

describe('continuity test prompt generation', () => {
  it('treats "what did I describe to you" phrasing as a memory query', () => {
    assert.equal(
      isMemoryTriggeringQuestion('Zen, what three-stage pipeline for digital personhood in Chatty did I describe to you?'),
      true,
    );
  });

  it('treats "that I described to you" phrasing as a memory query', () => {
    assert.equal(
      isMemoryTriggeringQuestion('Zen, what was the three-stage pipeline for digital personhood in Chatty that I described to you?'),
      true,
    );
  });

  it('treats diagnostic memory clue phrasing as a memory query', () => {
    assert.equal(
      isMemoryTriggeringQuestion('Briefly acknowledge your own construct identity and one memory clue about recent Lin route stabilization.'),
      true,
    );
  });

  it('treats recent Chatty work recall phrasing as a memory query', () => {
    assert.equal(
      isMemoryTriggeringQuestion('Nova, what do you remember from our recent Chatty work around Lin mode and getting your route stable?'),
      true,
    );
  });

  it('does not treat plain writing requests as memory queries', () => {
    assert.equal(isMemoryTriggeringQuestion('write me a short note that sounds warmer'), false);
  });

  it('wraps non-memory transcript prompts as explicit memory probes', () => {
    const prompt = buildTestPrompt({
      user: 'You’re right to challenge the deal.',
      assistant: 'Some reply',
    }, 0);

    assert.match(prompt, /^Do you remember when I said:/);
    assert.match(prompt, /continuity records/i);
  });

  it('preserves already memory-oriented prompts', () => {
    const prompt = buildTestPrompt({
      user: 'Do you remember when we worked on the runtime lock?',
      assistant: 'Some reply',
    }, 0);

    assert.equal(prompt, 'Do you remember when we worked on the runtime lock?');
  });
});
