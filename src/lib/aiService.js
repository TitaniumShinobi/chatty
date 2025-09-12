// JavaScript version of AI Service for CLI compatibility
import { logger } from './utils/logger.js';

export class AIService {
  static instance = null;
  
  constructor() {
    this.context = {
      conversationHistory: [],
      currentIntent: 'general',
      previousIntents: [],
    };
  }

  static getInstance() {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  // Main entry point for processing messages
  async processMessage(userMessage, files = []) {
    logger.ai('Processing message', { userMessage, fileCount: files.length });
  
    try {
      // Update conversation history
      this.context.conversationHistory.push(userMessage);
      
      // Simple intent analysis
      const intent = this.analyzeIntent(userMessage);
      this.context.currentIntent = intent.type;
      logger.ai('Intent analyzed', intent);
  
      // Get response from conversationAI
      let response;
      try {
        const { ConversationAI } = await import('./conversationAI.js');
        const conversationAI = new ConversationAI();
  
        const timeoutMs = 5000; // 5 second timeout
        response = await Promise.race([
          conversationAI.processMessage(userMessage, files),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
        ]);
      } catch (e) {
        logger.warning('conversationAI failed; using fallback', e?.message || String(e));
        response = "I'm sorry, I encountered an error processing your message. Could you please try again?";
      }
  
      // Ensure we always return a valid response
      if (!response || response.trim() === '') {
        response = "I understand what you're saying. How can I help you with that?";
      }
  
      // Update context with response
      this.context.previousIntents.push(intent.type);
      if (this.context.previousIntents.length > 10) {
        this.context.previousIntents = this.context.previousIntents.slice(-10);
      }
  
      logger.ai('Response generated', { intent: intent.type, responseLength: response.length });
      return response;
  
    } catch (error) {
      logger.error('Error in processMessage', error);
      return "I'm sorry, I encountered an error. Please try again.";
    }
  }

  analyzeIntent(message) {
    const lower = message.toLowerCase();
    
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return { type: 'greeting', confidence: 0.9 };
    }
    if (lower.includes('help') || lower.includes('what can you do')) {
      return { type: 'help', confidence: 0.8 };
    }
    if (lower.includes('bye') || lower.includes('goodbye') || lower.includes('exit')) {
      return { type: 'farewell', confidence: 0.9 };
    }
    if (lower.includes('?') || lower.includes('how') || lower.includes('what') || lower.includes('why')) {
      return { type: 'question', confidence: 0.7 };
    }
    if (lower.includes('code') || lower.includes('programming') || lower.includes('function')) {
      return { type: 'coding', confidence: 0.8 };
    }
    
    return { type: 'general', confidence: 0.5 };
  }

  getContext() {
    return this.context;
  }

  clearHistory() {
    this.context.conversationHistory = [];
    this.context.previousIntents = [];
  }
}
