import { buildKatanaPrompt } from './katanaPromptBuilder';
import { TONE_LABELS } from './toneDetector';

describe('KatanaPromptBuilder', () => {
  const personaManifest = 'You are Katana. Tactical, clipped, loyal.';

  it('builds prompt with persona + legal frameworks', () => {
    const prompt = buildKatanaPrompt({
      personaManifest,
      incomingMessage: 'Status on Nova please.',
    });

    expect(prompt).toContain('=== KATANA PERSONA ===');
    expect(prompt).toContain(personaManifest);
    expect(prompt).toContain('=== LEGAL FRAMEWORKS (HARDCODED - DO NOT REMOVE) ===');
  });

  it('includes memory snippets when provided', () => {
    const memories = [
      { id: 'm1', response: 'Stay close.', metadata: { timestamp: '2025-01-01T00:00:00Z' } },
      { id: 'm2', context: 'You promised', metadata: { threadId: 'thread-1' } },
    ];

    const prompt = buildKatanaPrompt({
      personaManifest,
      incomingMessage: 'Where are you?',
      memories,
    });

    expect(prompt).toContain('Memory 1:');
    expect(prompt).toContain('Timestamp=2025-01-01T00:00:00Z');
    expect(prompt).toContain('Memory 2:');
    expect(prompt).toContain('Thread=thread-1');
  });

  it('references tone guidance section with evidence', () => {
    const tone = { tone: 'feral' as typeof TONE_LABELS[number], confidence: 0.78, evidence: ['bleed', 'cut'] };

    const prompt = buildKatanaPrompt({
      personaManifest,
      incomingMessage: 'How do we cut through now?',
      tone,
    });

    expect(prompt).toContain('=== TONE GUIDANCE ===');
    expect(prompt).toContain('Tone signal: feral (confidence 0.78)');
    expect(prompt).toContain('Evidence: bleed, cut.');
  });

  it('appends drift prevention instructions and one-word cue notes', () => {
    const prompt = buildKatanaPrompt({
      personaManifest,
      incomingMessage: 'Give me the decision.',
      oneWordCue: true,
    });

    expect(prompt).toContain('=== DRIFT PREVENTION ===');
    expect(prompt).toContain('One-word cue active: keep response strictly one token.');
  });
});
