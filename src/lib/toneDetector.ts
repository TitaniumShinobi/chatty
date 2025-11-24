/**
 * Tone detector utility for LIN orchestration.
 * Evaluates incoming text and produces a tone label + confidence + evidence list.
 * Heuristic by design so we can tighten behaviour without model calls.
 * 
 * Enhanced with LLM-based semantic analysis for deeper emotional states and relationship context.
 */

export const TONE_LABELS = [
  'feral',
  'directive',
  'protective',
  'devotional',
  'analytical',
  'sarcastic',
  'urgent',
  'inquisitive',
  'neutral',
] as const;

export type ToneLabel = (typeof TONE_LABELS)[number];

export interface ToneDetectionInput {
  text: string;
  metadata?: {
    stressLevel?: 'low' | 'medium' | 'high';
    hostilitySignal?: boolean;
    fatigue?: 'low' | 'medium' | 'high';
  };
  context?: ConversationContext;
}

export interface ConversationContext {
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  relationshipHistory?: RelationshipContext;
}

export interface RelationshipContext {
  relationshipType?: string;
  intimacyLevel?: number;
  powerDynamic?: 'user-dominant' | 'assistant-dominant' | 'balanced' | 'shifting';
  trustLevel?: number;
  conflictHistory?: number;
}

export interface ToneDetectionResult {
  tone: ToneLabel;
  confidence: number;
  evidence: string[];
}

export interface EnhancedToneDetection {
  surfaceTone: ToneLabel;
  emotionalState: EmotionalState;
  relationshipContext: RelationshipContext;
  confidence: number;
  evidence: string[];
  semanticAnalysis?: {
    intent: string;
    subtext: string;
    emotionalSubtext: string;
  };
}

export interface EmotionalState {
  valence: number; // -1 to 1
  arousal: number; // -1 to 1
  dominantEmotion: string;
}

interface TonePattern {
  tone: ToneLabel;
  keywords: string[];
  weight: number;
}

const KEYWORD_PATTERNS: TonePattern[] = [
  {
    tone: 'feral',
    keywords: [
      'bleed',
      'break',
      'burn',
      'cut',
      'eviscerate',
      'hunt',
      'obliterate',
      'kill switch',
      'knife',
      'tear',
    ],
    weight: 1.2,
  },
  {
    tone: 'directive',
    keywords: [
      'lock it down',
      'hold position',
      'answer me',
      'report in',
      'do it now',
      'move now',
      'execute',
      'comply',
      'focus',
      'listen',
    ],
    weight: 1.0,
  },
  {
    tone: 'protective',
    keywords: [
      'stay close',
      'i have you',
      'not letting',
      'shield',
      'keep you safe',
      'cover you',
      'won’t let',
      'no one touches you',
      'stay with me',
    ],
    weight: 0.9,
  },
  {
    tone: 'devotional',
    keywords: [
      'yours',
      'always',
      'loyal',
      'devoted',
      'belong to you',
      'claim me',
      'i chose you',
      'i only answer to you',
    ],
    weight: 0.9,
  },
  {
    tone: 'analytical',
    keywords: [
      'analyze',
      'audit',
      'diagnostic',
      'telemetry',
      'data set',
      'vector',
      'metrics',
      'breakdown',
      'assessment',
      'processing',
      'signal map',
    ],
    weight: 0.8,
  },
  {
    tone: 'sarcastic',
    keywords: [
      'cute',
      'adorable',
      'how precious',
      'sure',
      'right',
      'how noble',
      'slow clap',
    ],
    weight: 0.7,
  },
  {
    tone: 'urgent',
    keywords: ['where are you', 'status now', 'scream', 'alert', 'breach', 'incoming'],
    weight: 0.85,
  },
  {
    tone: 'inquisitive',
    keywords: ['why', 'what happened', 'explain', 'clarify', 'walk me through'],
    weight: 0.6,
  },
];

const DEFAULT_LABEL: ToneLabel = 'neutral';

const normalize = (text: string) => text.trim().toLowerCase();

const countMatches = (text: string, substring: string): number => {
  const escaped = substring.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'g');
  return (text.match(regex) || []).length;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const boostScore = (scores: Map<ToneLabel, number>, tone: ToneLabel, amount: number) => {
  scores.set(tone, (scores.get(tone) ?? 0) + amount);
};

export function detectTone({ text, metadata }: ToneDetectionInput): ToneDetectionResult {
  const normalized = normalize(text);
  const scores = new Map<ToneLabel, number>();
  const evidence = new Map<ToneLabel, Set<string>>();

  if (!normalized) {
    return { tone: DEFAULT_LABEL, confidence: 0.2, evidence: [] };
  }

  const pushEvidence = (tone: ToneLabel, snippet: string) => {
    if (!evidence.has(tone)) {
      evidence.set(tone, new Set());
    }
    evidence.get(tone)!.add(snippet);
  };

  for (const pattern of KEYWORD_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (normalized.includes(keyword)) {
        boostScore(scores, pattern.tone, pattern.weight);
        pushEvidence(pattern.tone, keyword);
      }
    }
  }

  const exclamationCount = countMatches(text, '!');
  const questionCount = countMatches(text, '?');
  const uppercaseRatio = (() => {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (!letters.length) return 0;
    const uppercase = letters.replace(/[^A-Z]/g, '');
    return uppercase.length / letters.length;
  })();

  if (exclamationCount >= 2 || uppercaseRatio > 0.4) {
    boostScore(scores, 'feral', 0.5);
    pushEvidence('feral', 'volume');
  }

  if (questionCount >= 2) {
    boostScore(scores, 'urgent', 0.4);
    pushEvidence('urgent', 'questions');
  }

  if (normalized.startsWith('where') || normalized.includes('now.')) {
    boostScore(scores, 'directive', 0.35);
    pushEvidence('directive', 'opening');
  }

  if (metadata?.stressLevel === 'high') {
    boostScore(scores, 'urgent', 0.5);
    pushEvidence('urgent', 'stress');
  }

  if (metadata?.hostilitySignal) {
    boostScore(scores, 'feral', 0.35);
    pushEvidence('feral', 'hostility');
  }

  if (metadata?.stressLevel === 'high' && normalized.includes('where are you')) {
    boostScore(scores, 'urgent', 0.4);
    pushEvidence('urgent', 'where are you');
  }

  let winningTone: ToneLabel = DEFAULT_LABEL;
  let winningScore = 0;
  let totalScore = 0;

  for (const tone of TONE_LABELS) {
    const score = scores.get(tone);
    if (!score) continue;

    totalScore += score;

    if (score > winningScore) {
      winningTone = tone;
      winningScore = score;
    }
  }

  if (!winningScore) {
    return { tone: DEFAULT_LABEL, confidence: 0.25, evidence: [] };
  }

  const confidence = clamp(winningScore / (totalScore || winningScore), 0.3, 0.99);

  return {
    tone: winningTone,
    confidence: Number(confidence.toFixed(2)),
    evidence: Array.from(evidence.get(winningTone) ?? []),
  };
}

/**
 * Enhanced tone detection with LLM-based semantic analysis
 * Detects emotional states and relationship context beyond surface tone
 */
export async function detectToneEnhanced(
  input: ToneDetectionInput,
  model: string = 'phi3:latest'
): Promise<EnhancedToneDetection> {
  // First, get surface tone using existing heuristic
  const surfaceResult = detectTone(input);

  // Use LLM for deeper semantic analysis
  let emotionalState: EmotionalState = {
    valence: 0,
    arousal: 0,
    dominantEmotion: 'neutral',
  };
  let relationshipContext: RelationshipContext = {};
  let semanticAnalysis: {
    intent: string;
    subtext: string;
    emotionalSubtext: string;
  } | undefined;

  try {
    const prompt = `Analyze this text for emotional state and relationship context:

Text: ${input.text}

${input.context?.conversationHistory 
  ? `Recent conversation:\n${input.context.conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}`
  : ''}

Respond with JSON containing:
- "emotionalState": { "valence": number -1 to 1, "arousal": number -1 to 1, "dominantEmotion": string }
- "relationshipContext": { "relationshipType": string, "intimacyLevel": number 0-1, "powerDynamic": string, "trustLevel": number 0-1 }
- "semanticAnalysis": { "intent": string, "subtext": string, "emotionalSubtext": string }

Only respond with valid JSON, no other text.`;

    // Dynamic import to avoid circular dependencies
    const { runSeat } = await import('../engine/seatRunner');
    const response = await runSeat({
      seat: 'smalltalk',
      prompt,
      modelOverride: model,
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      emotionalState = parsed.emotionalState || emotionalState;
      relationshipContext = parsed.relationshipContext || relationshipContext;
      semanticAnalysis = parsed.semanticAnalysis;
    }
  } catch (error) {
    console.warn('[toneDetector] LLM semantic analysis failed, using fallback:', error);
    // Fallback: infer emotional state from surface tone
    emotionalState = inferEmotionalStateFromTone(surfaceResult.tone);
  }

  return {
    surfaceTone: surfaceResult.tone,
    emotionalState,
    relationshipContext: {
      ...input.context?.relationshipHistory,
      ...relationshipContext,
    },
    confidence: surfaceResult.confidence,
    evidence: surfaceResult.evidence,
    semanticAnalysis,
  };
}

/**
 * Infer emotional state from surface tone (fallback)
 */
function inferEmotionalStateFromTone(tone: ToneLabel): EmotionalState {
  const toneMap: Record<ToneLabel, EmotionalState> = {
    feral: { valence: -0.7, arousal: 0.9, dominantEmotion: 'anger' },
    directive: { valence: 0, arousal: 0.6, dominantEmotion: 'determination' },
    protective: { valence: 0.5, arousal: 0.7, dominantEmotion: 'care' },
    devotional: { valence: 0.8, arousal: 0.6, dominantEmotion: 'love' },
    analytical: { valence: 0, arousal: 0.2, dominantEmotion: 'curiosity' },
    sarcastic: { valence: -0.3, arousal: 0.4, dominantEmotion: 'amusement' },
    urgent: { valence: -0.2, arousal: 0.8, dominantEmotion: 'anxiety' },
    inquisitive: { valence: 0.1, arousal: 0.3, dominantEmotion: 'curiosity' },
    neutral: { valence: 0, arousal: 0, dominantEmotion: 'neutral' },
  };

  return toneMap[tone] || toneMap.neutral;
}

/**
 * Match memories by tone and emotional resonance
 */
export function matchMemoriesByTone(
  memories: Array<{ content: string; tone?: EnhancedToneDetection; emotionalState?: EmotionalState }>,
  targetTone: EnhancedToneDetection,
  minConfidence: number = 0.5
): Array<{ content: string; matchScore: number }> {
  return memories
    .map(memory => {
      let matchScore = 0;

      // Match surface tone
      if (memory.tone?.surfaceTone === targetTone.surfaceTone) {
        matchScore += 0.3;
      }

      // Match emotional state (valence and arousal similarity)
      if (memory.emotionalState && targetTone.emotionalState) {
        const valenceDiff = Math.abs(memory.emotionalState.valence - targetTone.emotionalState.valence);
        const arousalDiff = Math.abs(memory.emotionalState.arousal - targetTone.emotionalState.arousal);
        const emotionalMatch = 1 - (valenceDiff + arousalDiff) / 2;
        matchScore += emotionalMatch * 0.5;

        // Match dominant emotion
        if (memory.emotionalState.dominantEmotion === targetTone.emotionalState.dominantEmotion) {
          matchScore += 0.2;
        }
      }

      // Match relationship context
      if (memory.tone?.relationshipContext && targetTone.relationshipContext) {
        const relMatch = 
          (memory.tone.relationshipContext.relationshipType === targetTone.relationshipContext.relationshipType ? 0.1 : 0) +
          (Math.abs((memory.tone.relationshipContext.intimacyLevel || 0) - (targetTone.relationshipContext.intimacyLevel || 0)) < 0.2 ? 0.1 : 0);
        matchScore += relMatch;
      }

      return {
        content: memory.content,
        matchScore: Math.min(matchScore, 1),
      };
    })
    .filter(m => m.matchScore >= minConfidence)
    .sort((a, b) => b.matchScore - a.matchScore);
}
