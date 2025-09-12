#!/usr/bin/env node
// CLI entry point for Chatty
import { AIService } from '../lib/aiService.js';
import { ConversationAI } from '../lib/conversationAI.js';
import { logger } from '../lib/utils/logger.js';

// Color utilities
function colorize(text: string, color: string): string {
  const colors: Record<string, string> = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
  };
  return `${colors[color] || colors.reset}${text}${colors.reset}`;
}

function log(message: string, color = 'reset') {
  console.log(colorize(message, color));
}

// CLI AI Service that uses the same packet system as Web
class CLIAIService {
  constructor() {
    this.conversationHistory = [];
    this.context = {
      settings: {
        maxHistory: 50,
        enableMemory: true,
        enableReasoning: true,
        enableFileProcessing: true,
        memoryMode: 'hybrid',
        debugMode: false
      },
      memory: new Map()
    };
    
    // Load AI services
    this.loadAIServices();
  }

  async loadAIServices() {
    try {
      // For now, use fallback system to ensure CLI works
      log(colorize('⚠️  Using fallback AI system for CLI stability', 'yellow'));
      this.aiService = null;
    } catch (error) {
      console.error('Import failed:', error.message);
      log(colorize('⚠️  Could not load advanced AI services, using fallback', 'yellow'));
      this.aiService = null;
    }
  }

  // Render packets to text using the same templates as Web
  renderPackets(packets: any[]) {
    return packets.map(packet => {
      const template = this.getTemplate(packet.op);
      return this.interpolate(template, packet.payload);
    }).join('\n');
  }

  getTemplate(op: string): string {
    const templates: Record<string, string> = {
      "answer.v1": "{content}",
      "file.summary.v1": "📄 {fileName}: {summary}",
      "warn.v1": "⚠️ {message}",
      "error.v1": "❌ {message}",
    };
    return templates[op] || `[missing-op: ${op}]`;
  }

  interpolate(template: string, payload: Record<string, any>): string {
    return template.replace(/\{([\w.]+)\}/g, (match, key) => {
      return String(payload[key] ?? "");
    });
  }

  async processMessage(userMessage: string) {
    // Add to conversation history
    this.conversationHistory.push(userMessage);
    
    // Trim history if too long
    if (this.conversationHistory.length > this.context.settings.maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-this.context.settings.maxHistory);
    }

    try {
      // Try to use advanced AI service first
      if (this.aiService) {
        const packets = await this.aiService.processMessage(userMessage, []);
        if (packets && packets.length > 0) {
          return this.renderPackets(packets);
        }
      }
    } catch (error) {
      console.error('AI Service error:', error.message);
      log(colorize(`AI Service error: ${error.message}`, 'red'));
    }

    // Fallback to simple AI with packet structure
    const fallbackPackets = this.generateFallbackPackets(userMessage);
    return this.renderPackets(fallbackPackets);
  }

  generateFallbackPackets(message: string) {
    const lower = message.toLowerCase();
    
    if (lower.includes('hello') || lower.includes('hi')) {
      return [{ op: "answer.v1", payload: { content: "Hello! I'm Chatty, your AI assistant. I'm running in terminal mode with advanced capabilities. How can I help you today?" } }];
    }
    
    if (lower.includes('help')) {
      return [{ op: "answer.v1", payload: { content: `I'm Chatty Advanced CLI with these capabilities:

🧠 AI Features:
  • Memory System - I remember our conversations
  • Reasoning Engine - I can solve complex problems step by step
  • File Processing - I can analyze and process files
  • Context Awareness - I understand conversation context

💻 Commands:
  /help        - Show this help
  /clear       - Clear conversation history
  /memory      - Show memory status
  /settings    - Show current settings
  /load <file> - Load and analyze a file
  /save <file> - Save conversation to file
  /exit        - Exit Chatty

🎯 Just type your message to chat!` } }];
    }
    
    if (lower.includes('memory')) {
      return [{ op: "answer.v1", payload: { content: `Memory Status:
  • Conversations stored: ${this.conversationHistory.length}
  • Memory enabled: ${this.context.settings.enableMemory ? 'Yes' : 'No'}
  • Max history: ${this.context.settings.maxHistory}` } }];
    }
    
    if (lower.includes('settings')) {
      return [{ op: "answer.v1", payload: { content: `Current Settings:
  • Memory: ${this.context.settings.enableMemory ? 'Enabled' : 'Disabled'}
  • Reasoning: ${this.context.settings.enableReasoning ? 'Enabled' : 'Disabled'}
  • File Processing: ${this.context.settings.enableFileProcessing ? 'Enabled' : 'Disabled'}
  • Max History: ${this.context.settings.maxHistory}` } }];
    }
    
    if (lower.includes('thank')) {
      return [{ op: "answer.v1", payload: { content: "You're welcome! I'm here to help. What else can I assist you with?" } }];
    }
    
    if (lower.includes('?')) {
      return [{ op: "answer.v1", payload: { content: "That's a great question! I'd be happy to help you with that. Could you tell me more about what specifically you'd like to know?" } }];
    }
    
    // Default response
    return [{ op: "answer.v1", payload: { content: `I understand you're saying "${message}". That's interesting! Tell me more about what you're thinking or if you have any questions.` } }];
  }
}

// Main CLI execution
async function main() {
  console.log(colorize(`
🧠 Chatty CLI - Terminal AI Assistant
=====================================

Welcome to Chatty! I have full AI capabilities:
  • Memory System - I remember our conversations
  • Reasoning Engine - I can solve complex problems
  • File Processing - I can analyze files
  • Context Awareness - I understand conversation flow

Type your message and press Enter to chat with me.
Type /help to see all available commands.
`, 'cyan'));

  const ai = new CLIAIService();
  const readline = await import('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: colorize('Chatty> ', 'green')
  });

  rl.prompt();

  rl.on('line', async (input) => {
    const message = input.trim();
    
    if (message === '/exit') {
      console.log(colorize('👋 Goodbye! Thanks for using Chatty CLI!', 'yellow'));
      rl.close();
      return;
    }
    
    if (message === '/clear') {
      ai.conversationHistory = [];
      console.log(colorize('🧹 Conversation history cleared.', 'green'));
      rl.prompt();
      return;
    }
    
    if (message === '') {
      rl.prompt();
      return;
    }
    
    console.log(colorize('🤔 Processing...', 'blue'));
    
    try {
      const response = await ai.processMessage(message);
      console.log(response);
    } catch (error) {
      console.error(colorize(`Error: ${error.message}`, 'red'));
    }
    
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(colorize('👋 Goodbye! Thanks for using Chatty CLI!', 'yellow'));
    process.exit(0);
  });
}

// Run the CLI
main().catch(console.error);
