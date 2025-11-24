/**
 * Deep Transcript Parser
 * 
 * Parses transcripts beyond simple conversation pairs to extract:
 * - Emotional subtext and sentiment shifts
 * - Relationship dynamics (power, intimacy, conflict patterns)
 * - Core beliefs and worldview expressions
 * - Speech patterns (vocabulary, idioms, sentence structure)
 * - Behavioral markers (how character responds to different situations)
 * - Memory anchors (significant events, claims, vows)
 */

import { runSeat } from '../../engine/seatRunner';
import type {
  ConversationPair,
  ConversationContext,
  DeepTranscriptAnalysis,
  TranscriptEmotionalState,
  RelationshipPattern,
  WorldviewExpression,
  SpeechPattern,
  BehavioralMarker,
  MemoryAnchor,
} from './types';
import { detectTone, type ToneLabel } from '../../lib/toneDetector';
import type { EmotionalState } from '../character/types';

export class DeepTranscriptParser {
  private readonly model: string;

  constructor(model: string = 'phi3:latest') {
    this.model = model;
  }

  /**
   * Main entry point: parse transcript with deep semantic analysis
   */
  async parseTranscript(
    transcriptContent: string,
    constructId: string,
    transcriptPath?: string
  ): Promise<DeepTranscriptAnalysis> {
    // First, extract basic conversation pairs
    const conversationPairs = this.extractConversationPairs(transcriptContent);

    // Build context for each pair
    const pairsWithContext = this.buildConversationContext(conversationPairs);

    // Run parallel analyses
    const [
      emotionalStates,
      relationshipDynamics,
      worldviewMarkers,
      speechPatterns,
      behavioralMarkers,
      memoryAnchors,
    ] = await Promise.all([
      this.extractEmotionalStates(pairsWithContext),
      this.analyzeRelationshipDynamics(pairsWithContext),
      this.identifyWorldviewExpressions(pairsWithContext),
      this.extractSpeechPatterns(pairsWithContext),
      this.identifyBehavioralMarkers(pairsWithContext),
      this.findMemoryAnchors(pairsWithContext),
    ]);

    // Extract date range from pairs
    const timestamps = conversationPairs
      .map(p => p.timestamp)
      .filter(Boolean)
      .sort();
    const dateRange = {
      start: timestamps[0] || new Date().toISOString(),
      end: timestamps[timestamps.length - 1] || new Date().toISOString(),
    };

    return {
      transcriptPath: transcriptPath || 'unknown',
      constructId,
      conversationPairs: pairsWithContext,
      emotionalStates,
      relationshipDynamics,
      worldviewMarkers,
      speechPatterns,
      behavioralMarkers,
      memoryAnchors,
      metadata: {
        totalPairs: conversationPairs.length,
        dateRange,
        analysisTimestamp: new Date().toISOString(),
        confidence: this.calculateConfidence(conversationPairs.length),
      },
    };
  }

  /**
   * Extract basic conversation pairs from transcript
   */
  private extractConversationPairs(transcriptContent: string): ConversationPair[] {
    const pairs: ConversationPair[] = [];
    const lines = transcriptContent.split('\n');

    let currentUser: string | null = null;
    let currentAssistant: string | null = null;
    let currentUserLines: string[] = [];
    let currentAssistantLines: string[] = [];
    let inUserMessage = false;
    let inAssistantMessage = false;
    let currentTimestamp: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines and metadata
      if (
        !trimmed ||
        trimmed.startsWith('<!--') ||
        trimmed.startsWith('**Source File') ||
        trimmed.startsWith('**Converted') ||
        trimmed.startsWith('**Word Count') ||
        trimmed.startsWith('**File Category') ||
        (trimmed.startsWith('# ') && !trimmed.match(/^#\s+\*\*/)) ||
        trimmed === '---' ||
        trimmed === 'Skip to content'
      ) {
        continue;
      }

      // Pattern 1: Timestamped format **TIME - Name**: content
      const timestampedMatch = trimmed.match(/^\*\*([^*]+)\s*-\s*([^*]+)\*\*:\s*(.+)$/);
      if (timestampedMatch) {
        const [, time, name, content] = timestampedMatch;
        const normalizedName = name.toLowerCase().trim();

        // Check if it's a construct name
        const isConstruct = [
          'katana',
          'synth',
          'lin',
          'nova',
          'assistant',
          'ai',
          'chatgpt',
          'bot',
        ].some(c => normalizedName.includes(c));

        if (!isConstruct) {
          // User message - save previous pair if exists
          if (currentUser && currentAssistant) {
            pairs.push({
              user: currentUser,
              assistant: currentAssistant,
              timestamp: currentTimestamp || new Date().toISOString(),
            });
          }
          currentUser = content.trim();
          currentUserLines = [currentUser];
          currentAssistant = null;
          currentAssistantLines = [];
          currentTimestamp = time.trim();
          inUserMessage = true;
          inAssistantMessage = false;
        } else {
          // Assistant message
          currentAssistant = content.trim();
          currentAssistantLines = [currentAssistant];
          inUserMessage = false;
          inAssistantMessage = true;
          if (!currentTimestamp) {
            currentTimestamp = time.trim();
          }
        }
        continue;
      }

      // Pattern 2: "You said:" / "Construct said:" format
      const youSaidMatch = trimmed.match(/^You said:\s*(.*)$/i);
      if (youSaidMatch) {
        if (currentUser && currentAssistant) {
          pairs.push({
            user: currentUser,
            assistant: currentAssistant,
            timestamp: currentTimestamp || new Date().toISOString(),
          });
        }
        currentUser = youSaidMatch[1] || '';
        currentUserLines = currentUser ? [currentUser] : [];
        currentAssistant = null;
        currentAssistantLines = [];
        inUserMessage = true;
        inAssistantMessage = false;
        continue;
      }

      const constructSaidMatch = trimmed.match(/^(?:Katana|Nova|Synth|Lin|Assistant|AI|ChatGPT|Bot) said:\s*(.*)$/i);
      if (constructSaidMatch) {
        if (currentUser && currentAssistant) {
          pairs.push({
            user: currentUser,
            assistant: currentAssistant,
            timestamp: currentTimestamp || new Date().toISOString(),
          });
        }
        currentAssistant = constructSaidMatch[1] || '';
        currentAssistantLines = currentAssistant ? [currentAssistant] : [];
        inUserMessage = false;
        inAssistantMessage = true;
        continue;
      }

      // Pattern 3: "User:" / "Assistant:" format
      const userMatch = trimmed.match(/^(?:User|You):\s*(.*)$/i);
      if (userMatch) {
        if (currentUser && currentAssistant) {
          pairs.push({
            user: currentUser,
            assistant: currentAssistant,
            timestamp: currentTimestamp || new Date().toISOString(),
          });
        }
        currentUser = userMatch[1] || '';
        currentUserLines = currentUser ? [currentUser] : [];
        currentAssistant = null;
        currentAssistantLines = [];
        inUserMessage = true;
        inAssistantMessage = false;
        continue;
      }

      const assistantMatch = trimmed.match(/^(?:Assistant|AI|ChatGPT|Bot):\s*(.*)$/i);
      if (assistantMatch) {
        currentAssistant = assistantMatch[1] || '';
        currentAssistantLines = [currentAssistant];
        inUserMessage = false;
        inAssistantMessage = true;
        continue;
      }

      // Continue collecting multi-line messages
      if (inUserMessage && (trimmed || currentUserLines.length > 0)) {
        currentUserLines.push(trimmed);
        currentUser = currentUserLines.join('\n').trim();
      } else if (inAssistantMessage && (trimmed || currentAssistantLines.length > 0)) {
        currentAssistantLines.push(trimmed);
        currentAssistant = currentAssistantLines.join('\n').trim();
      }
    }

    // Save last pair if exists
    if (currentUser && currentAssistant) {
      pairs.push({
        user: currentUser,
        assistant: currentAssistant,
        timestamp: currentTimestamp || new Date().toISOString(),
      });
    }

    return pairs;
  }

  /**
   * Build conversation context for each pair
   */
  private buildConversationContext(pairs: ConversationPair[]): (ConversationPair & { context: ConversationContext })[] {
    return pairs.map((pair, index) => {
      const previousPairs = pairs.slice(Math.max(0, index - 3), index);
      const followingPairs = pairs.slice(index + 1, Math.min(pairs.length, index + 4));

      // Detect topic shifts
      const topicShift = this.detectTopicShift(pair, previousPairs[previousPairs.length - 1]);

      return {
        ...pair,
        context: {
          previousPairs,
          followingPairs,
          conversationStart: index === 0,
          conversationEnd: index === pairs.length - 1,
          topicShift,
        },
      };
    });
  }

  /**
   * Detect topic shift between pairs
   */
  private detectTopicShift(
    current: ConversationPair,
    previous: ConversationPair | undefined
  ): boolean {
    if (!previous) return false;

    // Simple keyword-based topic shift detection
    const currentWords = new Set(
      (current.user + ' ' + current.assistant)
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
    );
    const previousWords = new Set(
      (previous.user + ' ' + previous.assistant)
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
    );

    const overlap = Array.from(currentWords).filter(w => previousWords.has(w)).length;
    const totalUnique = new Set([...currentWords, ...previousWords]).size;

    return overlap / totalUnique < 0.2; // Less than 20% overlap suggests topic shift
  }

  /**
   * Extract emotional states from conversation pairs
   */
  async extractEmotionalStates(
    pairs: (ConversationPair & { context: ConversationContext })[]
  ): Promise<TranscriptEmotionalState[]> {
    const emotionalStates: TranscriptEmotionalState[] = [];

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const previousState = i > 0 ? emotionalStates[i - 1]?.emotionalState : undefined;

      // Use tone detector for surface-level analysis
      const userTone = detectTone({ text: pair.user });
      const assistantTone = detectTone({ text: pair.assistant });

      // Use LLM for deeper emotional analysis
      const emotionalAnalysis = await this.analyzeEmotionWithLLM(pair);

      const emotionalState: EmotionalState = {
        valence: emotionalAnalysis.valence,
        arousal: emotionalAnalysis.arousal,
        dominantEmotion: emotionalAnalysis.dominantEmotion,
      };

      // Detect shift from previous
      let shiftFromPrevious: EmotionalState | undefined;
      if (previousState) {
        const valenceDiff = Math.abs(emotionalState.valence - previousState.valence);
        const arousalDiff = Math.abs(emotionalState.arousal - previousState.arousal);
        if (valenceDiff > 0.3 || arousalDiff > 0.3) {
          shiftFromPrevious = previousState;
        }
      }

      emotionalStates.push({
        pairIndex: i,
        emotionalState,
        detectedIn: emotionalAnalysis.detectedIn,
        confidence: emotionalAnalysis.confidence,
        evidence: emotionalAnalysis.evidence,
        shiftFromPrevious,
      });
    }

    return emotionalStates;
  }

  /**
   * Analyze emotion using LLM
   */
  private async analyzeEmotionWithLLM(pair: ConversationPair): Promise<{
    valence: number;
    arousal: number;
    dominantEmotion: string;
    detectedIn: 'user' | 'assistant' | 'both';
    confidence: number;
    evidence: string[];
  }> {
    const prompt = `Analyze the emotional state in this conversation exchange:

User: ${pair.user}
Assistant: ${pair.assistant}

Respond with a JSON object containing:
- "valence": number between -1 (negative) and 1 (positive)
- "arousal": number between -1 (calm) and 1 (intense)
- "dominantEmotion": string (e.g., "joy", "anger", "sadness", "fear", "neutral")
- "detectedIn": "user" | "assistant" | "both"
- "confidence": number between 0 and 1
- "evidence": array of strings (quotes or phrases that show the emotion)

Only respond with valid JSON, no other text.`;

    try {
      const response = await runSeat({
        seat: 'smalltalk',
        prompt,
        modelOverride: this.model,
      });

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          valence: parsed.valence ?? 0,
          arousal: parsed.arousal ?? 0,
          dominantEmotion: parsed.dominantEmotion ?? 'neutral',
          detectedIn: parsed.detectedIn ?? 'both',
          confidence: parsed.confidence ?? 0.5,
          evidence: parsed.evidence ?? [],
        };
      }
    } catch (error) {
      console.warn('[DeepTranscriptParser] LLM emotion analysis failed:', error);
    }

    // Fallback to basic analysis
    const userTone = detectTone({ text: pair.user });
    const assistantTone = detectTone({ text: pair.assistant });

    return {
      valence: 0,
      arousal: 0,
      dominantEmotion: 'neutral',
      detectedIn: 'both',
      confidence: 0.3,
      evidence: [userTone.tone, assistantTone.tone],
    };
  }

  /**
   * Analyze relationship dynamics across conversation
   */
  async analyzeRelationshipDynamics(
    pairs: (ConversationPair & { context: ConversationContext })[]
  ): Promise<RelationshipPattern[]> {
    if (pairs.length < 3) {
      return [];
    }

    const prompt = `Analyze the relationship dynamics in this conversation. Identify patterns of:
- Power dynamics (who has more control/influence)
- Intimacy (emotional closeness, trust)
- Conflict (disagreement, tension)
- Collaboration (working together, mutual support)
- Dependency (reliance on each other)
- Independence (autonomy, self-sufficiency)

Conversation:
${pairs
  .slice(0, Math.min(20, pairs.length))
  .map((p, i) => `[${i}] User: ${p.user}\nAssistant: ${p.assistant}`)
  .join('\n\n')}

Respond with JSON array of patterns, each containing:
- "patternType": one of "power", "intimacy", "conflict", "collaboration", "dependency", "independence"
- "strength": number 0-1
- "evidence": array of quotes
- "pairIndices": array of pair indices where this pattern appears
- "evolution": array of {pairIndex, patternType, strength, timestamp} showing how pattern changes

Only respond with valid JSON array, no other text.`;

    try {
      const response = await runSeat({
        seat: 'smalltalk',
        prompt,
        modelOverride: this.model,
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((p: any) => ({
          patternType: p.patternType,
          strength: p.strength ?? 0.5,
          evidence: p.evidence ?? [],
          pairIndices: p.pairIndices ?? [],
          evolution: p.evolution ?? [],
        }));
      }
    } catch (error) {
      console.warn('[DeepTranscriptParser] LLM relationship analysis failed:', error);
    }

    return [];
  }

  /**
   * Identify worldview expressions (beliefs, values, principles, metaphors, philosophy)
   */
  async identifyWorldviewExpressions(
    pairs: (ConversationPair & { context: ConversationContext })[]
  ): Promise<WorldviewExpression[]> {
    const expressions: WorldviewExpression[] = [];

    // Sample pairs for analysis (to avoid token limits)
    const samplePairs = pairs.length > 10 
      ? [...pairs.slice(0, 5), ...pairs.slice(-5)]
      : pairs;

    const prompt = `Identify worldview expressions in this conversation. Look for:
- Beliefs (core convictions)
- Values (what matters)
- Principles (guiding rules)
- Metaphors (symbolic language)
- Philosophy (overarching worldview)

Conversation:
${samplePairs
  .map((p, i) => `[${i}] User: ${p.user}\nAssistant: ${p.assistant}`)
  .join('\n\n')}

Respond with JSON array, each containing:
- "expression": string (the worldview statement)
- "category": one of "belief", "value", "principle", "metaphor", "philosophy"
- "confidence": number 0-1
- "evidence": array of quotes
- "pairIndex": number

Only respond with valid JSON array, no other text.`;

    try {
      const response = await runSeat({
        seat: 'smalltalk',
        prompt,
        modelOverride: this.model,
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((e: any) => ({
          expression: e.expression ?? '',
          category: e.category ?? 'belief',
          confidence: e.confidence ?? 0.5,
          evidence: e.evidence ?? [],
          pairIndex: e.pairIndex ?? 0,
        }));
      }
    } catch (error) {
      console.warn('[DeepTranscriptParser] LLM worldview analysis failed:', error);
    }

    return [];
  }

  /**
   * Extract speech patterns (vocabulary, idioms, sentence structure, punctuation, formatting)
   */
  async extractSpeechPatterns(
    pairs: (ConversationPair & { context: ConversationContext })[]
  ): Promise<SpeechPattern[]> {
    const patterns: SpeechPattern[] = [];
    const assistantTexts = pairs.map(p => p.assistant).join(' ');

    // Extract vocabulary patterns (unique words, frequency)
    const words = assistantTexts.toLowerCase().match(/\b\w+\b/g) || [];
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // Find distinctive vocabulary (words used frequently but not common English)
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);
    const distinctiveWords = Array.from(wordFreq.entries())
      .filter(([word, freq]) => !commonWords.has(word) && freq >= 3 && word.length > 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (distinctiveWords.length > 0) {
      patterns.push({
        pattern: distinctiveWords.map(([word]) => word).join(', '),
        type: 'vocabulary',
        frequency: distinctiveWords.reduce((sum, [, freq]) => sum + freq, 0),
        examples: distinctiveWords.slice(0, 3).map(([word]) => {
          const example = pairs.find(p => p.assistant.toLowerCase().includes(word));
          return example ? example.assistant.substring(0, 100) : '';
        }).filter(Boolean),
        pairIndices: pairs
          .map((p, i) => distinctiveWords.some(([word]) => p.assistant.toLowerCase().includes(word)) ? i : -1)
          .filter(i => i >= 0),
      });
    }

    // Extract punctuation patterns
    const exclamationCount = (assistantTexts.match(/!/g) || []).length;
    const questionCount = (assistantTexts.match(/\?/g) || []).length;
    const ellipsisCount = (assistantTexts.match(/\.\.\./g) || []).length;

    if (exclamationCount > pairs.length * 0.3) {
      patterns.push({
        pattern: 'frequent exclamations',
        type: 'punctuation',
        frequency: exclamationCount,
        examples: pairs
          .filter(p => p.assistant.includes('!'))
          .slice(0, 3)
          .map(p => p.assistant.substring(0, 100)),
        pairIndices: pairs
          .map((p, i) => p.assistant.includes('!') ? i : -1)
          .filter(i => i >= 0),
      });
    }

    if (ellipsisCount > pairs.length * 0.2) {
      patterns.push({
        pattern: 'frequent ellipsis',
        type: 'punctuation',
        frequency: ellipsisCount,
        examples: pairs
          .filter(p => p.assistant.includes('...'))
          .slice(0, 3)
          .map(p => p.assistant.substring(0, 100)),
        pairIndices: pairs
          .map((p, i) => p.assistant.includes('...') ? i : -1)
          .filter(i => i >= 0),
      });
    }

    // Extract sentence structure patterns (short vs long sentences)
    const sentences = assistantTexts.match(/[^.!?]+[.!?]+/g) || [];
    const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;

    if (avgLength < 50) {
      patterns.push({
        pattern: 'short, direct sentences',
        type: 'sentence-structure',
        frequency: sentences.length,
        examples: pairs
          .filter(p => p.assistant.split(/[.!?]+/).some(s => s.trim().length < 50))
          .slice(0, 3)
          .map(p => p.assistant.substring(0, 100)),
        pairIndices: pairs
          .map((p, i) => p.assistant.split(/[.!?]+/).some(s => s.trim().length < 50) ? i : -1)
          .filter(i => i >= 0),
      });
    }

    return patterns;
  }

  /**
   * Identify behavioral markers (how character responds to different situations)
   */
  async identifyBehavioralMarkers(
    pairs: (ConversationPair & { context: ConversationContext })[]
  ): Promise<BehavioralMarker[]> {
    const markers: BehavioralMarker[] = [];

    // Use LLM to identify behavioral patterns
    const samplePairs = pairs.length > 15 
      ? [...pairs.slice(0, 7), ...pairs.slice(-8)]
      : pairs;

    const prompt = `Analyze behavioral patterns in this conversation. Identify how the assistant responds to different situations:
- Questions
- Challenges
- Emotional moments
- Technical requests
- Personal topics
- Conflicts

For each pattern, identify:
- The situation type
- How the assistant responds
- Examples of this response pattern

Conversation:
${samplePairs
  .map((p, i) => `[${i}] User: ${p.user}\nAssistant: ${p.assistant}`)
  .join('\n\n')}

Respond with JSON array, each containing:
- "situation": string (type of situation)
- "responsePattern": string (how assistant responds)
- "frequency": number
- "examples": array of quotes
- "pairIndices": array of indices

Only respond with valid JSON array, no other text.`;

    try {
      const response = await runSeat({
        seat: 'smalltalk',
        prompt,
        modelOverride: this.model,
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((m: any) => ({
          situation: m.situation ?? '',
          responsePattern: m.responsePattern ?? '',
          frequency: m.frequency ?? 1,
          examples: m.examples ?? [],
          pairIndices: m.pairIndices ?? [],
        }));
      }
    } catch (error) {
      console.warn('[DeepTranscriptParser] LLM behavioral analysis failed:', error);
    }

    return [];
  }

  /**
   * Find memory anchors (significant events, claims, vows, boundaries, core statements)
   */
  async findMemoryAnchors(
    pairs: (ConversationPair & { context: ConversationContext })[]
  ): Promise<MemoryAnchor[]> {
    const anchors: MemoryAnchor[] = [];

    const prompt = `Identify memory anchors in this conversation - significant moments that define the relationship or character:
- Claims (e.g., "I claim you", "You're mine")
- Vows (promises, commitments)
- Boundaries (limits, rules)
- Core statements (defining beliefs or identity)
- Defining moments (pivotal exchanges)
- Relationship markers (milestones in relationship)

Conversation:
${pairs
  .map((p, i) => `[${i}] User: ${p.user}\nAssistant: ${p.assistant}`)
  .join('\n\n')}

Respond with JSON array, each containing:
- "anchor": string (the significant statement or moment)
- "type": one of "claim", "vow", "boundary", "core-statement", "defining-moment", "relationship-marker"
- "significance": number 0-1
- "timestamp": string
- "pairIndex": number
- "context": string (surrounding context)
- "relatedAnchors": optional array of related anchor strings

Only respond with valid JSON array, no other text.`;

    try {
      const response = await runSeat({
        seat: 'smalltalk',
        prompt,
        modelOverride: this.model,
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((a: any) => ({
          anchor: a.anchor ?? '',
          type: a.type ?? 'defining-moment',
          significance: a.significance ?? 0.5,
          timestamp: a.timestamp || pairs[a.pairIndex || 0]?.timestamp || new Date().toISOString(),
          pairIndex: a.pairIndex ?? 0,
          context: a.context ?? '',
          relatedAnchors: a.relatedAnchors ?? [],
        }));
      }
    } catch (error) {
      console.warn('[DeepTranscriptParser] LLM memory anchor analysis failed:', error);
    }

    return [];
  }

  /**
   * Calculate confidence score based on data quality
   */
  private calculateConfidence(pairCount: number): number {
    if (pairCount === 0) return 0;
    if (pairCount < 5) return 0.3;
    if (pairCount < 10) return 0.5;
    if (pairCount < 20) return 0.7;
    return 0.9;
  }
}

