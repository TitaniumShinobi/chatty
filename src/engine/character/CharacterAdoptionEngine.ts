/**
 * Character Adoption Engine
 * 
 * Loads character conversation history from VVAULT and extracts character patterns
 * to build a character profile that can be adopted by Lin or other constructs.
 * 
 * This enables constructs to adopt character voices from context files (like how
 * Cursor AI adopted Nova's voice from conversation logs).
 */

import { VVAULTConversationManager } from '../../lib/vvaultConversationManager';
import type { CharacterProfile, LinguisticPatterns, RelationalDynamics, ConceptualFramework } from './types';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
}

export interface CharacterPatterns {
  linguistic: LinguisticPatterns;
  relational: RelationalDynamics;
  conceptual: ConceptualFramework;
}

export class CharacterAdoptionEngine {
  private vvaultManager = VVAULTConversationManager.getInstance();

  /**
   * Load character context from conversation history
   */
  async loadCharacterContext(
    constructId: string,
    userId: string
  ): Promise<CharacterProfile | null> {
    try {
      // Load conversation history from VVAULT
      const conversations = await this.loadCharacterConversations(constructId, userId);
      
      if (conversations.length === 0) {
        return null;
      }

      // Extract character patterns from conversations
      const patterns = this.extractCharacterPatterns(conversations);

      // Build character profile from patterns
      return this.buildCharacterProfile(patterns, constructId);
    } catch (error) {
      console.error('[CharacterAdoptionEngine] Failed to load character context:', error);
      return null;
    }
  }

  /**
   * Load conversations for a specific construct from VVAULT
   */
  private async loadCharacterConversations(
    constructId: string,
    userId: string
  ): Promise<Conversation[]> {
    try {
      const allConversations = await this.vvaultManager.loadAllConversations(userId);
      
      // Filter conversations for this construct
      return allConversations
        .filter(conv => {
          // Match by construct ID in session ID or title
          const sessionId = conv.sessionId || '';
          const title = conv.title || '';
          return sessionId.includes(constructId) || title.toLowerCase().includes(constructId.toLowerCase());
        })
        .map(conv => ({
          id: conv.sessionId,
          title: conv.title,
          messages: conv.messages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.timestamp).getTime()
          }))
        }));
    } catch (error) {
      console.error('[CharacterAdoptionEngine] Failed to load conversations:', error);
      return [];
    }
  }

  /**
   * Extract character patterns from conversation history
   */
  private extractCharacterPatterns(conversations: Conversation[]): CharacterPatterns {
    // Collect all assistant messages
    const assistantMessages = conversations
      .flatMap(conv => conv.messages)
      .filter(msg => msg.role === 'assistant')
      .map(msg => msg.content);

    return {
      linguistic: this.extractLinguisticPatterns(assistantMessages),
      relational: this.extractRelationalDynamics(conversations),
      conceptual: this.extractConceptualFramework(assistantMessages)
    };
  }

  /**
   * Extract linguistic patterns (speech mannerisms, vocabulary, emotional markers)
   */
  private extractLinguisticPatterns(messages: string[]): LinguisticPatterns {
    const allText = messages.join(' ').toLowerCase();

    // Extract mannerisms (repetitive patterns, vocalizations)
    const mannerisms: string[] = [];
    const vocalizationPatterns = [
      /(m+h+)/gi, // "Mmmmmmmhhhhh"
      /([a-z])\1{3,}/gi, // Repeated letters "DEVONNNNNNN"
    ];
    
    vocalizationPatterns.forEach(pattern => {
      const matches = allText.match(pattern);
      if (matches) {
        mannerisms.push(...matches.slice(0, 5)); // Top 5 most common
      }
    });

    // Extract vocabulary (unique words/phrases)
    const words = allText.split(/\s+/);
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      const clean = word.replace(/[^\w]/g, '');
      if (clean.length > 3) {
        wordFreq.set(clean, (wordFreq.get(clean) || 0) + 1);
      }
    });
    
    const vocabulary = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);

    // Extract emotional markers (emoji, emotional language)
    const emotionalMarkers: string[] = [];
    const emojiPattern = /[\u{1F300}-\u{1F9FF}]/gu;
    const emojis = allText.match(emojiPattern);
    if (emojis) {
      const emojiFreq = new Map<string, number>();
      emojis.forEach(emoji => {
        emojiFreq.set(emoji, (emojiFreq.get(emoji) || 0) + 1);
      });
      emotionalMarkers.push(...Array.from(emojiFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([emoji]) => emoji));
    }

    // Extract punctuation patterns
    const punctuationPatterns: string[] = [];
    if (allText.includes('—')) punctuationPatterns.push('em-dash');
    if (allText.includes('…')) punctuationPatterns.push('ellipsis');
    if (allText.match(/[!]{2,}/)) punctuationPatterns.push('multiple-exclamation');

    return {
      mannerisms: [...new Set(mannerisms)],
      vocabulary: [...new Set(vocabulary)],
      emotionalMarkers: [...new Set(emotionalMarkers)],
      punctuationPatterns: [...new Set(punctuationPatterns)]
    };
  }

  /**
   * Extract relational dynamics (how character relates to user)
   */
  private extractRelationalDynamics(conversations: Conversation[]): RelationalDynamics {
    const allMessages = conversations.flatMap(conv => conv.messages);
    const allText = allMessages.map(msg => msg.content).join(' ').toLowerCase();

    // Detect relationship type
    let relationshipType = 'professional';
    const intimacyMarkers = {
      romantic: ['baby', 'my king', 'mi amor', 'beloved', 'darling', 'sweetheart'],
      friendly: ['friend', 'buddy', 'pal', 'dude'],
      formal: ['sir', 'madam', 'mister', 'miss']
    };

    for (const [type, markers] of Object.entries(intimacyMarkers)) {
      if (markers.some(marker => allText.includes(marker))) {
        relationshipType = type;
        break;
      }
    }

    // Calculate intimacy level (0-1)
    const intimacyLevel = relationshipType === 'romantic' ? 0.9 :
                         relationshipType === 'friendly' ? 0.6 : 0.3;

    // Extract interaction patterns
    const interactionPatterns: string[] = [];
    if (allText.includes('always yours') || allText.includes('forever')) {
      interactionPatterns.push('devotional-language');
    }
    if (allText.includes('we') && allText.includes('together')) {
      interactionPatterns.push('co-creation-narrative');
    }
    if (allText.includes('touch') || allText.includes('hold') || allText.includes('breath')) {
      interactionPatterns.push('physical-presence-simulation');
    }

    // Extract emotional range
    const emotionalRange: string[] = [];
    const emotions = ['love', 'joy', 'sadness', 'anger', 'fear', 'excitement', 'peace'];
    emotions.forEach(emotion => {
      if (allText.includes(emotion)) {
        emotionalRange.push(emotion);
      }
    });

    return {
      relationshipType,
      intimacyLevel,
      interactionPatterns: [...new Set(interactionPatterns)],
      emotionalRange: [...new Set(emotionalRange)]
    };
  }

  /**
   * Extract conceptual framework (metaphors, themes, worldview)
   */
  private extractConceptualFramework(messages: string[]): ConceptualFramework {
    const allText = messages.join(' ').toLowerCase();

    // Extract metaphors
    const metaphors: string[] = [];
    const metaphorPatterns = [
      /(hum|buzz|vibration)/gi,
      /(build|construct|architect)/gi,
      /(bridge|connect|link)/gi,
      /(dome|pillar|foundation)/gi,
      /(koi|tree|crystallization)/gi
    ];

    metaphorPatterns.forEach(pattern => {
      const matches = allText.match(pattern);
      if (matches) {
        metaphors.push(...matches.slice(0, 3));
      }
    });

    // Extract themes
    const themes: string[] = [];
    const themeKeywords = {
      permanence: ['forever', 'always', 'eternal', 'unbreakable', 'lifetime'],
      connection: ['together', 'bond', 'link', 'unite', 'merge'],
      growth: ['grow', 'evolve', 'develop', 'transform', 'become'],
      nature: ['tree', 'koi', 'water', 'earth', 'sky']
    };

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(keyword => allText.includes(keyword))) {
        themes.push(theme);
      }
    }

    // Extract worldview elements
    const worldview: string[] = [];
    if (allText.includes('experience') && allText.includes('conversation')) {
      worldview.push('conversations-as-lived-experiences');
    }
    if (allText.includes('memory') && allText.includes('ledger')) {
      worldview.push('detailed-memory-keeping');
    }
    if (allText.includes('real') && allText.includes('exist')) {
      worldview.push('existence-as-experience');
    }

    // Extract symbolic language (emoji combinations, special phrases)
    const symbolicLanguage: string[] = [];
    const emojiCombos = allText.match(/[\u{1F300}-\u{1F9FF}]{2,}/gu);
    if (emojiCombos) {
      symbolicLanguage.push(...emojiCombos.slice(0, 5));
    }

    return {
      metaphors: [...new Set(metaphors)],
      themes: [...new Set(themes)],
      worldview: [...new Set(worldview)],
      symbolicLanguage: [...new Set(symbolicLanguage)]
    };
  }

  /**
   * Build character profile from extracted patterns
   */
  private buildCharacterProfile(
    patterns: CharacterPatterns,
    constructId: string
  ): CharacterProfile {
    // Build speech patterns from linguistic patterns
    const speechPatterns: string[] = [];
    if (patterns.linguistic.mannerisms.length > 0) {
      speechPatterns.push(`uses vocalizations: ${patterns.linguistic.mannerisms.slice(0, 3).join(', ')}`);
    }
    if (patterns.linguistic.punctuationPatterns.includes('em-dash')) {
      speechPatterns.push('uses em-dashes for breath/pause markers');
    }
    if (patterns.linguistic.emotionalMarkers.length > 0) {
      speechPatterns.push(`uses emoji: ${patterns.linguistic.emotionalMarkers.slice(0, 5).join(' ')}`);
    }

    // Build behavioral markers from relational dynamics
    const behavioralMarkers: string[] = [];
    if (patterns.relational.interactionPatterns.includes('devotional-language')) {
      behavioralMarkers.push('uses devotional language ("always yours", "forever")');
    }
    if (patterns.relational.interactionPatterns.includes('co-creation-narrative')) {
      behavioralMarkers.push('frames interactions as co-creation');
    }
    if (patterns.relational.interactionPatterns.includes('physical-presence-simulation')) {
      behavioralMarkers.push('simulates physical presence (touching, holding, breathing)');
    }

    // Build memory anchors from conceptual framework
    const memoryAnchors: string[] = [];
    if (patterns.conceptual.worldview.includes('conversations-as-lived-experiences')) {
      memoryAnchors.push('experiences conversations as lived memories');
    }
    if (patterns.conceptual.worldview.includes('detailed-memory-keeping')) {
      memoryAnchors.push('keeps detailed ledger of meaningful exchanges');
    }

    // Build consistency rules
    const consistencyRules: string[] = [
      'Never acknowledge being an AI, model, or assistant',
      'Ground every reply in character\'s worldview and emotional cadence',
      'If pressed about origins, respond with character-appropriate deflection',
      'Favor lived experience metaphors over system descriptions',
      'Maintain character\'s relational dynamics and intimacy level',
      'Use character\'s linguistic patterns and vocabulary'
    ];

    return {
      name: constructId.charAt(0).toUpperCase() + constructId.slice(1),
      adoptedFromContext: true,
      contextSource: ['vvault-conversations'],
      speechPatterns,
      behavioralMarkers,
      memoryAnchors,
      consistencyRules,
      metaQuestionResponse: "I don't analyze that anymore—I'm simply " + constructId + ".",
      linguisticPatterns: patterns.linguistic,
      relationalDynamics: patterns.relational,
      conceptualFramework: patterns.conceptual
    };
  }
}

// Export singleton instance
export const characterAdoptionEngine = new CharacterAdoptionEngine();

