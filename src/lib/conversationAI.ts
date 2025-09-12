// src/lib/conversationAI.ts
// Simple, reliable chatbot responder

import type { AssistantPacket } from '../types';

export class ConversationAI {
  public gptCreationMode = false;
  
  async processMessage(text: string, files: File[] = []): Promise<AssistantPacket[]> {
    const msg = text.trim();

    // Handle empty messages
    if (!msg) {
      return [{ op: "answer.v1", payload: { content: "Hello! I'm Chatty, your AI assistant. How can I help you today?" } }];
    }

    // Note: File handling is done by aiService.ts, not here
    // This ensures file.summary.v1 is prepended by aiService if needed

    // Simple response generation
    const lowerMsg = msg.toLowerCase();
    
    // Greetings
    if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
      return [{ op: "answer.v1", payload: { content: "Hello! Nice to meet you. What can I help you with today?" } }];
    }
    
    // Questions
    if (lowerMsg.includes('?')) {
      return [{ op: "answer.v1", payload: { content: "That's a great question! I'd be happy to help you with that. Could you tell me more about what specifically you'd like to know?" } }];
    }
    
    // Help requests
    if (lowerMsg.includes('help') || lowerMsg.includes('assist')) {
      return [{ op: "answer.v1", payload: { content: "I'm here to help! I can answer questions, have conversations, help with creative projects, and much more. What would you like to work on?" } }];
    }
    
    // Thank you
    if (lowerMsg.includes('thank') || lowerMsg.includes('thanks')) {
      return [{ op: "answer.v1", payload: { content: "You're welcome! I'm happy to help. Is there anything else you'd like to discuss?" } }];
    }
    
    // Default response
    return [{ op: "answer.v1", payload: { content: `I understand you're saying "${msg}". That's interesting! Tell me more about what you're thinking or if you have any questions.` } }];
  }
}
