// src/lib/conversationAI.ts
// Simple, reliable chatbot responder

import type { AssistantPacket } from '../types';
import { composeEmpatheticReply } from '../engine/composers/empathy.js';
import type { AffectVector } from '../engine/composers/ToneAdapter.js';
import { IntentDetector } from '../engine/intent/IntentDetector.js';

// Context snapshot used by DebugPanel
export interface ConversationContext {
  topic: string
  mood: string
  userRole?: string
  currentIntent: string
  previousIntents: string[]
  conversationHistory: string[]
}

export class ConversationAI {
  public gptCreationMode = false;
  private detector = new IntentDetector();
  
  async processMessage(text: string, _files: File[] = []): Promise<AssistantPacket[]> {
    const msg = text.trim();

    const lowerMsg = msg.toLowerCase();

    // no web search path in this minimal fallback

    // --- Emotion / rant detection ---
    const rantKeywords = [
      'ugh', "why won't", 'this never works', "i'm tired", 'again?', 'seriously?', 'wtf', 'not you too'
    ];
    const hasKeyword = rantKeywords.some(k => lowerMsg.includes(k));
    const wordCount = msg.split(/\s+/).length;
    const punctuationDensity = (msg.match(/[.!?]/g) || []).length / Math.max(wordCount, 1);
    let tone: string | null = null;
    let affect: AffectVector | undefined;
    if (hasKeyword || (wordCount > 25 && punctuationDensity < 0.03)) {
      tone = hasKeyword ? 'frustrated' : 'venting';
      affect = { valence: -0.5, arousal: hasKeyword ? 0.3 : -0.3 };
    }

    if (tone) {
      return [{ op: 'answer.v1', payload: { content: composeEmpatheticReply(tone, msg, affect) } }];
    }

    // Handle empty messages
    if (!msg) {
      return [{ op: "answer.v1", payload: { content: "Hello! I'm Chatty, your AI assistant. How can I help you today?" } }];
    }

    // Note: File handling is done by aiService.ts, not here
    // This ensures file.summary.v1 is prepended by aiService if needed

    // Intent-based response generation via IntentDetector
    const intents = this.detector.detectIntent(msg);
    const intentType = intents[0]?.type ?? 'general';

    switch (intentType) {
      case 'greeting':
        return [{ op: 'answer.v1', payload: { content: "Hello! Nice to meet you. What can I help you with today?" } }];
      case 'question':
        return [{ op: 'answer.v1', payload: { content: "That's a great question! I'd be happy to help you with that. Could you tell me more about what specifically you'd like to know?" } }];
      case 'help':
        return [{ op: 'answer.v1', payload: { content: "I'm here to help! I can answer questions, have conversations, help with creative projects, and much more. What would you like to work on?" } }];
      case 'gratitude':
        return [{ op: 'answer.v1', payload: { content: "You're welcome! I'm happy to help. Is there anything else you'd like to discuss?" } }];
      default:
        break;
    }

    // Default response
    return [{ op: "answer.v1", payload: { content: `I understand you're saying "${msg}". That's interesting! Tell me more about what you're thinking or if you have any questions.` } }];
  }
}
