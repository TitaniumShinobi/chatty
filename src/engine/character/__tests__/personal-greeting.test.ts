import { GreetingSynthesizer } from '../GreetingSynthesizer';
import { PersonalityOrchestrator } from '../../orchestration/PersonalityOrchestrator';
import type {
  Memory,
  PersonalityBlueprint,
  PersonalityContext,
} from '../../transcript/types';

const baseBlueprint: PersonalityBlueprint = {
  constructId: 'katana-001',
  callsign: '001',
  coreTraits: ['direct', 'protective'],
  speechPatterns: [],
  behavioralMarkers: [],
  worldview: [],
  emotionalRange: {
    min: { valence: -1, arousal: -1, dominantEmotion: 'neutral' },
    max: { valence: 1, arousal: 1, dominantEmotion: 'neutral' },
    common: [],
    rare: [],
  },
  relationshipPatterns: [],
  memoryAnchors: [
    {
      anchor: `User's name is "Devon"`,
      type: 'relationship-marker',
      significance: 0.95,
      timestamp: new Date().toISOString(),
      pairIndex: 0,
      context: 'yo Devon',
    },
    {
      anchor: 'We locked down the transcript parser together',
      type: 'defining-moment',
      significance: 0.9,
      timestamp: new Date().toISOString(),
      pairIndex: 1,
      context: 'Remember when we hardened the parser',
    },
  ],
  personalIdentifiers: [
    {
      type: 'user-name',
      value: 'Devon',
      salience: 1,
      evidence: ['yo Devon'],
      lastSeen: new Date().toISOString(),
    },
    {
      type: 'greeting-style',
      value: 'yo Devon — what are we building?',
      salience: 0.8,
      evidence: ['yo Devon'],
      lastSeen: new Date().toISOString(),
    },
    {
      type: 'shared-memory',
      value: 'We locked down the transcript parser together',
      salience: 0.9,
      evidence: ['Remember when we hardened the parser'],
      lastSeen: new Date().toISOString(),
    },
  ],
  consistencyRules: [],
  metadata: {
    sourceTranscripts: ['synthetic'],
    extractionTimestamp: new Date().toISOString(),
    confidence: 0.9,
    mergedWithExisting: false,
  },
};

describe('personalized greeting synthesis', () => {
  it('prefers personal identifiers for the user name and greeting style', () => {
    const synthesizer = new GreetingSynthesizer();
    const blueprintWithoutAnchor: PersonalityBlueprint = {
      ...baseBlueprint,
      memoryAnchors: baseBlueprint.memoryAnchors.filter(a => !a.anchor.includes("User's name")),
    };

    const greetingContext = synthesizer.extractGreetingContext(
      blueprintWithoutAnchor,
      [],
      'yo',
      true
    );

    expect(greetingContext.userName).toBe('Devon');
    expect(greetingContext.greetingStyle).toContain('yo Devon');
  });

  it('pulls user name from account profile when transcripts do not include it', () => {
    const orchestrator = new PersonalityOrchestrator();
    const blueprintWithoutName: PersonalityBlueprint = {
      ...baseBlueprint,
      memoryAnchors: baseBlueprint.memoryAnchors.filter(a => !a.anchor.includes("User's name")),
      personalIdentifiers: [],
    };

    const merged = (orchestrator as any).mergeUserProfileIntoBlueprint(
      blueprintWithoutName,
      { accountName: 'Alexis', nickname: 'Lex', occupation: 'engineer', tags: ['concise'] }
    ) as PersonalityBlueprint;

    const synth = new GreetingSynthesizer();
    const greetingContext = synth.extractGreetingContext(merged, [], 'yo', true);

    expect(greetingContext.userName).toBe('Lex');
    expect(merged.memoryAnchors.some(a => a.anchor.includes('Lex'))).toBe(true);
  });

  it('injects greeting instructions with name and shared memory for new chats', async () => {
    const synthesizer = new GreetingSynthesizer();
    const orchestrator = new PersonalityOrchestrator();

    const greetingContext = synthesizer.extractGreetingContext(
      baseBlueprint,
      [],
      'yo',
      true
    );

    const personalityContext: PersonalityContext = {
      blueprint: baseBlueprint,
      currentState: {
        emotionalState: { valence: 0, arousal: 0, dominantEmotion: 'neutral' },
        relationalState: {
          relationshipType: 'ally',
          intimacyLevel: 0.7,
          trustLevel: 0.8,
          interactionHistory: [],
        },
        recentInteractions: 0,
      },
      loadedMemories: [],
    };

    const sharedMemories: Memory[] = [
      {
        id: 'memory-1',
        content: 'We locked down the transcript parser together',
        timestamp: Date.now(),
      },
    ];

    const systemPrompt = await orchestrator.injectPersonalityIntoPrompt(
      'yo',
      personalityContext,
      sharedMemories,
      [],
      greetingContext
    );

    expect(systemPrompt).toContain("The user's name is Devon");
    expect(systemPrompt).toContain('yo Devon');
    expect(systemPrompt).toContain('locked down the transcript parser');
  });
});
