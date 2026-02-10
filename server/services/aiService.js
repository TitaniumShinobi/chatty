// Backend AI Service for Chatty
// Integrates with conversation history and memory systems

// For now, we'll use a simple fallback since we can't easily import frontend modules
// In a production setup, you'd want to share the reasoning engine between frontend and backend

import { validatePersonaLock } from '../lib/personaLockValidator.js';

export class ConversationAI {
  constructor() {
    this.reasoner = null;
  }

  async processMessage(content, files = [], history = [], options = {}) {
    // STEP 3: Validate persona lock if present
    const { personaLock, constructId, personaSystemPrompt } = options;
    
    if (personaLock) {
      const validation = validatePersonaLock({ personaLock, constructId, personaSystemPrompt });
      if (!validation.valid) {
        throw new Error(`[ConversationAI] ${validation.error}`);
      }
      
      // If lock is active, we should use the orchestrator systemPrompt
      // This service should not rebuild prompts when lock exists
      console.warn(`⚠️ [ConversationAI] Persona lock active for ${personaLock.constructId} - this service should not rebuild prompts. Use orchestrator systemPrompt.`);
      
      // For now, throw to prevent fallback prompt building
      throw new Error(`[ConversationAI] Persona lock active - must use orchestrator systemPrompt, not fallback builder`);
    }
    try {
      // Simple intent detection
      const lower = content.toLowerCase();
      let response = '';
      
      // Check for greetings/smalltalk
      if (/^(hi|hello|hey|yo|what's up|sup|good (morning|afternoon|evening))\b/.test(lower) ||
          /(how (are|r) (you|ya)|how's it going|hru)\b/.test(lower) ||
          /^(just wanted to chat|just chatting|wanna chat|want to chat)\b/.test(lower)) {
        const greetings = [
          "Hey! How's your day going?",
          "Hi there! I'm all ears.",
          "Hey hey! 👋 What's on your mind?",
          "Hello! Ready to chat about anything.",
          "Hi! What's going on?",
          "Hey there! How can I help?",
          "Hello! What's up?",
          "Hi! I'm here and ready to talk."
        ];
        response = greetings[Math.floor(Math.random() * greetings.length)];
      }
      // Check for creative requests
      else if (/\bstory|joke|poem|song|creative|write|create|tale|fable|narrative\b/.test(lower)) {
        response = `I'd love to help you with something creative! Based on your request "${content}", I can help you create stories, poems, or other creative content. What specific type of creative work would you like to explore?`;
      }
      // Check for recipe requests
      else if (/\brecipe|ingredients|cook|bake|make|prepare|food|dish\b/.test(lower)) {
        response = `I can help you with recipes and cooking! For "${content}", I can provide ingredient lists, cooking instructions, and tips. What specific dish or cooking technique are you interested in?`;
      }
      // Check for explanation requests
      else if (/\bexplain|how|why|what is\b/.test(lower)) {
        response = `I'd be happy to explain! For "${content}", I can break it down into understandable parts and provide examples. What specific aspect would you like me to focus on?`;
      }
      // Check for planning requests
      else if (/\bplan|steps|roadmap|how to\b/.test(lower)) {
        response = `I can help you create a plan! For "${content}", I can break it down into actionable steps and provide a roadmap. What's your main goal or objective?`;
      }
      // Default chat response
      else {
        response = `I understand you're saying "${content}". That's interesting! Tell me more about what you're thinking or if you have any questions.`;
      }
      
      return [{ 
        op: 'answer.v1', 
        payload: { content: response } 
      }];
    } catch (error) {
      console.error('AI Service error:', error);
      return [{ 
        op: 'error.v1', 
        payload: { content: 'I encountered an error while processing your message. Please try again.' } 
      }];
    }
  }

  // Method to inject memory/context from MemoryLedger
  async injectMemory(userId, conversationId) {
    try {
      // This would integrate with the MemoryLedger system
      // For now, return empty context
      return [];
    } catch (error) {
      console.error('Memory injection error:', error);
      return [];
    }
  }

  // Method to retrieve relevant context using semantic search
  async retrieveContext(query, history) {
    try {
      // This would integrate with unifiedSemanticRetrieval
      // For now, return recent history as context
      return history.slice(-10); // Last 10 messages
    } catch (error) {
      console.error('Context retrieval error:', error);
      return [];
    }
  }
}
