// Simple AI Service for Chatty
import { logger } from './utils/logger';

export class AIService {
  private static instance: AIService;
  private context = {
    conversationHistory: [] as string[],
    currentIntent: 'general',
    previousIntents: [] as string[],
  };

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  // Main entry point for processing messages
  async processMessage(userMessage: string, files: File[] = []): Promise<string> {
    logger.ai('Processing message', { userMessage, fileCount: files.length });
  
    try {
      // Update conversation history
      this.context.conversationHistory.push(userMessage);
      
      // Simple intent analysis
      const intent = this.analyzeIntent(userMessage);
      this.context.currentIntent = intent.type;
      logger.ai('Intent analyzed', intent);
  
      // Get response from conversationAI
      let response: string;
      try {
        const { ConversationAI } = await import('./conversationAI');
        const conversationAI = new ConversationAI();
  
        const timeoutMs = 5000; // 5 second timeout
        response = await Promise.race([
          conversationAI.processMessage(userMessage, files),
          new Promise<string>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
        ]);
      } catch (e: any) {
        logger.warning('conversationAI failed; using fallback', e?.message || String(e));
        response = "I'm sorry, I encountered an error processing your message. Could you please try again?";
      }
  
      // Ensure we always return a valid response
      if (!response || response.trim() === '') {
        response = "I understand what you're saying. How can I help you with that?";
      }
  
      // Log and return
      logger.ai('Generated response', { response: response.substring(0, 100) + '...' });
      return response;
  
    } catch (error: any) {
      logger.error('processMessage failed', error);
      return "I'm sorry, I encountered a system error. Please try again.";
    }
  }

  // Simple intent analysis
  private analyzeIntent(message: string): { type: string; confidence: number } {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
      return { type: 'greeting', confidence: 0.9 };
    }
    
    if (lowerMsg.includes('?')) {
      return { type: 'question', confidence: 0.8 };
    }
    
    if (lowerMsg.includes('help') || lowerMsg.includes('assist')) {
      return { type: 'help', confidence: 0.9 };
    }
    
    if (lowerMsg.includes('thank')) {
      return { type: 'gratitude', confidence: 0.8 };
    }
    
    return { type: 'general', confidence: 0.5 };
  }

  // Get conversation context
  getContext() {
    return {
      conversationHistory: [...this.context.conversationHistory],
      currentIntent: this.context.currentIntent,
      previousIntents: [...this.context.previousIntents],
    };
  }

  // Clear conversation history
  clearHistory() {
    this.context.conversationHistory = [];
    this.context.previousIntents = [];
    this.context.currentIntent = 'general';
  }
}

// Legacy compatibility - keep the old interface for now
export async function uploadAndParse(files: File[]): Promise<{ ok: File[]; fail: any[] }> {
  logger.file('File upload requested', { count: files.length });
  
  // Simple file validation
  const ok: File[] = [];
  const fail: any[] = [];
  
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      fail.push({ name: file.name, reason: 'file_too_large' });
    } else {
      ok.push(file);
    }
  }
  
  return { ok, fail };
}