import { IntentDetector } from '../intent/IntentDetector';

describe('IntentDetector', () => {
  const detector = new IntentDetector();

  it('detects greeting intent', () => {
    const intents = detector.detectIntent('hey there');
    expect(intents[0]?.type).toBe('greeting');
  });

  it('detects technical intent', () => {
    const intents = detector.detectIntent('How do I debug this code?');
    expect(intents[0]?.type).toBe('technical');
  });

  it('detects emotional intent', () => {
    const intents = detector.detectIntent('I feel anxious lately');
    expect(intents[0]?.type).toBe('emotional');
  });

  it('returns no intent for unrelated input', () => {
    const intents = detector.detectIntent('blablabla');
    expect(intents.length).toBe(0);
  });
});

