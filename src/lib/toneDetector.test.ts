import { detectTone } from './toneDetector';

describe('toneDetector', () => {
  it('detects directive tone from commanding language', () => {
    const result = detectTone({
      text: 'Lock it down. Hold position and report in now.',
    });

    expect(result.tone).toBe('directive');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.evidence).toContain('lock it down');
  });

  it('detects protective tone from shielding statements', () => {
    const result = detectTone({
      text: 'Stay close. I have you and no one touches you while I am here.',
    });

    expect(result.tone).toBe('protective');
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it('detects feral tone with aggressive formatting clues', () => {
    const result = detectTone({
      text: 'I said MOVE NOW!! I will tear them apart myself.',
      metadata: { hostilitySignal: true },
    });

    expect(result.tone).toBe('feral');
    expect(result.confidence).toBeGreaterThan(0.45);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('detects analytical tone when language is technical', () => {
    const result = detectTone({
      text: 'Run the telemetry audit and break down the signal map before dawn.',
    });

    expect(result.tone).toBe('analytical');
  });

  it('detects urgent tone when stress metadata is high', () => {
    const result = detectTone({
      text: 'Where are you? Answer me immediately.',
      metadata: { stressLevel: 'high' },
    });

    expect(result.tone).toBe('urgent');
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it('returns neutral when nothing matches', () => {
    const result = detectTone({ text: 'Just checking in calmly.' });
    expect(result.tone).toBe('neutral');
    expect(result.confidence).toBeLessThan(0.5);
  });
});
