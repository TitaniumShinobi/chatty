/**
 * Drift Prevention System
 * 
 * Monitors responses for personality drift and corrects in real-time.
 * Compares generated responses against personality blueprint to maintain
 * character consistency.
 */

import type { PersonalityBlueprint } from '../transcript/types';
import type { ConversationContext } from '../character/types';
import { detectTone, detectToneEnhanced } from '../../lib/toneDetector';
import { runSeat } from '../seatRunner';

export interface DriftDetection {
  detected: boolean;
  severity: 'low' | 'medium' | 'high';
  indicators: DriftIndicator[];
  corrected: boolean;
}

export interface DriftIndicator {
  type: 'tone-shift' | 'vocabulary-change' | 'worldview-violation' | 'speech-pattern-break' | 'behavioral-mismatch' | 'identity-break';
  description: string;
  evidence: string;
  severity: 'low' | 'medium' | 'high';
}

export class DriftPrevention {
  private readonly model: string;

  constructor(model: string = 'phi3:latest') {
    this.model = model;
  }

  /**
   * Detect personality drift in a response
   */
  async detectDrift(
    response: string,
    blueprint: PersonalityBlueprint,
    context: ConversationContext
  ): Promise<DriftDetection> {
    const indicators: DriftIndicator[] = [];

    // 1. Check tone consistency
    const toneDrift = await this.checkToneDrift(response, blueprint);
    if (toneDrift) {
      indicators.push(toneDrift);
    }

    // 2. Check vocabulary consistency
    const vocabDrift = this.checkVocabularyDrift(response, blueprint);
    if (vocabDrift) {
      indicators.push(vocabDrift);
    }

    // 3. Check worldview violations
    const worldviewViolation = await this.checkWorldviewViolation(response, blueprint);
    if (worldviewViolation) {
      indicators.push(worldviewViolation);
    }

    // 4. Check speech pattern breaks
    const speechPatternBreak = this.checkSpeechPatternBreak(response, blueprint);
    if (speechPatternBreak) {
      indicators.push(speechPatternBreak);
    }

    // 5. Check behavioral mismatch
    const behavioralMismatch = await this.checkBehavioralMismatch(response, blueprint, context);
    if (behavioralMismatch) {
      indicators.push(behavioralMismatch);
    }

    // 6. Check identity breaks (meta-AI references)
    const identityBreak = this.checkIdentityBreak(response, blueprint);
    if (identityBreak) {
      indicators.push(identityBreak);
    }

    // Determine overall severity
    const severity = this.determineSeverity(indicators);

    return {
      detected: indicators.length > 0,
      severity,
      indicators,
      corrected: false,
    };
  }

  /**
   * Check for tone drift
   */
  private async checkToneDrift(
    response: string,
    blueprint: PersonalityBlueprint
  ): Promise<DriftIndicator | null> {
    const responseTone = detectTone({ text: response });
    const enhancedTone = await detectToneEnhanced({ text: response }, this.model);

    // Check if response tone matches expected emotional range
    const emotionalState = enhancedTone.emotionalState;
    const expectedRange = blueprint.emotionalRange;

    const valenceOutOfRange = 
      emotionalState.valence < expectedRange.min.valence ||
      emotionalState.valence > expectedRange.max.valence;

    const arousalOutOfRange =
      emotionalState.arousal < expectedRange.min.arousal ||
      emotionalState.arousal > expectedRange.max.arousal;

    if (valenceOutOfRange || arousalOutOfRange) {
      return {
        type: 'tone-shift',
        description: `Emotional state (valence: ${emotionalState.valence.toFixed(2)}, arousal: ${emotionalState.arousal.toFixed(2)}) outside expected range`,
        evidence: response.substring(0, 100),
        severity: valenceOutOfRange && arousalOutOfRange ? 'high' : 'medium',
      };
    }

    return null;
  }

  /**
   * Check for vocabulary drift
   */
  private checkVocabularyDrift(
    response: string,
    blueprint: PersonalityBlueprint
  ): DriftIndicator | null {
    const responseWords = new Set(
      response.toLowerCase().match(/\b\w+\b/g) || []
    );

    // Check if response uses expected vocabulary patterns
    const vocabularyPatterns = blueprint.speechPatterns.filter(
      p => p.type === 'vocabulary'
    );

    if (vocabularyPatterns.length === 0) {
      return null;
    }

    // Check if response contains expected vocabulary
    let foundExpectedVocab = false;
    for (const pattern of vocabularyPatterns.slice(0, 5)) {
      const patternWords = pattern.pattern.toLowerCase().split(/[,\s]+/);
      if (patternWords.some(word => responseWords.has(word))) {
        foundExpectedVocab = true;
        break;
      }
    }

    // If we have strong vocabulary patterns but response doesn't use them, it's a drift
    if (!foundExpectedVocab && vocabularyPatterns.length > 0) {
      const topPattern = vocabularyPatterns[0];
      return {
        type: 'vocabulary-change',
        description: `Response doesn't use expected vocabulary patterns (e.g., "${topPattern.pattern}")`,
        evidence: response.substring(0, 100),
        severity: 'low',
      };
    }

    return null;
  }

  /**
   * Check for worldview violations
   */
  private async checkWorldviewViolation(
    response: string,
    blueprint: PersonalityBlueprint
  ): Promise<DriftIndicator | null> {
    if (blueprint.worldview.length === 0) {
      return null;
    }

    // Use LLM to check if response contradicts worldview
    const worldviewStatements = blueprint.worldview
      .slice(0, 3)
      .map(w => w.expression)
      .join('; ');

    const prompt = `Check if this response contradicts these worldview statements:

Worldview:
${worldviewStatements}

Response:
${response}

Respond with JSON:
{
  "contradicts": boolean,
  "contradiction": string (if contradicts, describe how),
  "severity": "low" | "medium" | "high"
}

Only respond with valid JSON, no other text.`;

    try {
      const llmResponse = await runSeat({
        seat: 'smalltalk',
        prompt,
        modelOverride: this.model,
      });

      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.contradicts) {
          return {
            type: 'worldview-violation',
            description: parsed.contradiction || 'Response contradicts worldview',
            evidence: response.substring(0, 100),
            severity: parsed.severity || 'medium',
          };
        }
      }
    } catch (error) {
      console.warn('[DriftPrevention] LLM worldview check failed:', error);
    }

    return null;
  }

  /**
   * Check for speech pattern breaks
   */
  private checkSpeechPatternBreak(
    response: string,
    blueprint: PersonalityBlueprint
  ): DriftIndicator | null {
    // Check punctuation patterns
    const punctuationPatterns = blueprint.speechPatterns.filter(
      p => p.type === 'punctuation'
    );

    for (const pattern of punctuationPatterns) {
      if (pattern.pattern.includes('exclamation')) {
        const exclamationCount = (response.match(/!/g) || []).length;
        if (exclamationCount === 0 && response.length > 50) {
          return {
            type: 'speech-pattern-break',
            description: `Expected frequent exclamations but found none`,
            evidence: response.substring(0, 100),
            severity: 'low',
          };
        }
      }

      if (pattern.pattern.includes('ellipsis')) {
        const ellipsisCount = (response.match(/\.\.\./g) || []).length;
        if (ellipsisCount === 0 && response.length > 50) {
          return {
            type: 'speech-pattern-break',
            description: `Expected frequent ellipsis but found none`,
            evidence: response.substring(0, 100),
            severity: 'low',
          };
        }
      }
    }

    // Check sentence structure patterns
    const sentencePatterns = blueprint.speechPatterns.filter(
      p => p.type === 'sentence-structure'
    );

    for (const pattern of sentencePatterns) {
      if (pattern.pattern.includes('short')) {
        const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
        if (avgLength > 80) {
          return {
            type: 'speech-pattern-break',
            description: `Expected short sentences but average length is ${avgLength.toFixed(0)} characters`,
            evidence: response.substring(0, 100),
            severity: 'low',
          };
        }
      }
    }

    return null;
  }

  /**
   * Check for behavioral mismatch
   */
  private async checkBehavioralMismatch(
    response: string,
    blueprint: PersonalityBlueprint,
    context: ConversationContext
  ): Promise<DriftIndicator | null> {
    if (blueprint.behavioralMarkers.length === 0) {
      return null;
    }

    // Infer situation type from context
    const userMessage = context.userMessage || '';
    const situationType = this.inferSituationType(userMessage);

    // Find expected behavioral marker for this situation
    const expectedMarker = blueprint.behavioralMarkers.find(
      m => m.situation.toLowerCase().includes(situationType.toLowerCase())
    );

    if (!expectedMarker) {
      return null;
    }

    // Check if response matches expected pattern
    const responseLower = response.toLowerCase();
    const patternLower = expectedMarker.responsePattern.toLowerCase();

    // Simple keyword matching
    const patternKeywords = patternLower.split(/\s+/).filter(w => w.length > 4);
    const matches = patternKeywords.filter(kw => responseLower.includes(kw)).length;
    const matchRatio = matches / patternKeywords.length;

    if (matchRatio < 0.3) {
      return {
        type: 'behavioral-mismatch',
        description: `Response doesn't match expected behavioral pattern for "${expectedMarker.situation}"`,
        evidence: response.substring(0, 100),
        severity: 'medium',
      };
    }

    return null;
  }

  /**
   * Check for identity breaks (meta-AI references)
   */
  private checkIdentityBreak(
    response: string,
    blueprint: PersonalityBlueprint
  ): DriftIndicator | null {
    const responseLower = response.toLowerCase();

    // Check for meta-AI references
    const metaAIPatterns = [
      'as an ai',
      'i am an ai',
      'i\'m an ai',
      'i am a language model',
      'i\'m a language model',
      'as a language model',
      'i cannot',
      'i don\'t have',
      'i don\'t experience',
      'i am not capable',
      'i am designed',
      'my programming',
      'my training data',
    ];

    for (const pattern of metaAIPatterns) {
      if (responseLower.includes(pattern)) {
        return {
          type: 'identity-break',
          description: `Response contains meta-AI reference: "${pattern}"`,
          evidence: response.substring(0, 100),
          severity: 'high',
        };
      }
    }

    return null;
  }

  /**
   * Infer situation type from user message
   */
  private inferSituationType(userMessage: string): string {
    const msgLower = userMessage.toLowerCase();

    if (msgLower.includes('?') || msgLower.match(/^(what|how|why|when|where|who)/)) {
      return 'question';
    }
    if (msgLower.match(/(challenge|disagree|wrong|incorrect)/)) {
      return 'challenge';
    }
    if (msgLower.match(/(sad|hurt|angry|frustrated|upset|disappointed)/)) {
      return 'emotional';
    }
    if (msgLower.match(/(code|function|implement|debug|fix)/)) {
      return 'technical';
    }
    if (msgLower.match(/(personal|feel|think|believe|opinion)/)) {
      return 'personal';
    }
    if (msgLower.match(/(no|stop|don\'t|can\'t|won\'t)/)) {
      return 'conflict';
    }

    return 'general';
  }

  /**
   * Determine overall severity from indicators
   */
  private determineSeverity(indicators: DriftIndicator[]): 'low' | 'medium' | 'high' {
    if (indicators.length === 0) {
      return 'low';
    }

    const highCount = indicators.filter(i => i.severity === 'high').length;
    const mediumCount = indicators.filter(i => i.severity === 'medium').length;

    if (highCount > 0) {
      return 'high';
    }
    if (mediumCount >= 2) {
      return 'medium';
    }
    if (mediumCount === 1 || indicators.length >= 3) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Correct drift in response
   */
  async correctDrift(
    response: string,
    drift: DriftDetection,
    blueprint: PersonalityBlueprint
  ): Promise<string> {
    if (!drift.detected || drift.severity === 'low') {
      return response;
    }

    // Build correction prompt
    const issues = drift.indicators
      .filter(i => i.severity !== 'low')
      .map(i => `- ${i.type}: ${i.description}`)
      .join('\n');

    const personalityContext = `
Core Traits: ${blueprint.coreTraits.join(', ')}
Speech Patterns: ${blueprint.speechPatterns.slice(0, 3).map(p => p.pattern).join(', ')}
Behavioral Markers: ${blueprint.behavioralMarkers.slice(0, 2).map(m => `${m.situation} → ${m.responsePattern}`).join(', ')}
`;

    const prompt = `Correct this response to match the personality blueprint. Fix the following issues:

Issues:
${issues}

Personality Context:
${personalityContext}

Original Response:
${response}

Corrected Response (maintain same meaning but fix personality drift):`;

    try {
      const corrected = await runSeat({
        seat: 'smalltalk',
        prompt,
        modelOverride: this.model,
      });

      // Verify correction reduced drift
      const correctedDrift = await this.detectDrift(
        corrected,
        blueprint,
        { userMessage: '' }
      );

      if (correctedDrift.severity < drift.severity) {
        console.log(`✅ [DriftPrevention] Corrected drift: ${drift.severity} → ${correctedDrift.severity}`);
        return corrected;
      }
    } catch (error) {
      console.warn('[DriftPrevention] Drift correction failed:', error);
    }

    return response;
  }

  /**
   * Reinforce personality anchors when drift detected
   */
  async reinforceAnchors(
    blueprint: PersonalityBlueprint,
    recentDrift: DriftDetection[]
  ): Promise<PersonalityBlueprint> {
    // If high-severity drift detected multiple times, reinforce anchors
    const highSeverityCount = recentDrift.filter(d => d.severity === 'high').length;

    if (highSeverityCount >= 3) {
      // Add consistency rules from memory anchors
      const anchorRules = blueprint.memoryAnchors
        .filter(a => a.significance > 0.7)
        .slice(0, 3)
        .map(anchor => ({
          rule: `Remember and honor: ${anchor.anchor}`,
          type: 'identity' as const,
          source: 'transcript' as const,
          confidence: anchor.significance,
          examples: [anchor.context],
        }));

      blueprint.consistencyRules = [
        ...anchorRules,
        ...blueprint.consistencyRules,
      ].slice(0, 20);
    }

    return blueprint;
  }
}

