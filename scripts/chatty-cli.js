#!/usr/bin/env node

/**
 * Chatty CLI - Terminal chatbot with full AI capabilities
 * Integrates with the existing AI services from the web version
 */

import { createInterface } from 'readline';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

function colorize(text, color = 'reset') {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(message, color));
}

// Advanced AI Service that integrates with existing Chatty AI
class CLIAIService {
  constructor() {
    this.conversationHistory = [];
    this.context = {
      currentIntent: 'general',
      previousIntents: [],
      memory: new Map(),
      settings: {
        enableMemory: true,
        enableReasoning: true,
        enableFileProcessing: true,
        maxHistory: 50
      }
    };
    
    // Try to load existing AI services
    this.loadAIServices();
  }

  async loadAIServices() {
    try {
      // Try to import from built dist files first
      let AIService;
      try {
        const aiModule = await import('./dist/assets/index-rFx7h6u5.js');
        AIService = aiModule.AIService;
      } catch (distError) {
        // Fallback to source files if dist not available
        const { AIService: SourceAIService } = await import('./src/lib/aiService.js');
        AIService = SourceAIService;
      }
      
      this.aiService = AIService.getInstance();
      log(colorize('✅ Loaded advanced AI services', 'green'));
    } catch (error) {
      console.error('Import failed:', error.message);
      log(colorize('⚠️  Could not load advanced AI services, using fallback', 'yellow'));
      this.aiService = null;
    }
  }

  // Render packets to text using the same templates as Web
  renderPackets(packets) {
    return packets.map(packet => {
      const template = this.getTemplate(packet.op);
      return this.interpolate(template, packet.payload);
    }).join('\n');
  }

  getTemplate(op) {
    const templates = {
      "answer.v1": "{content}",
      "file.summary.v1": "📄 {fileName}: {summary}",
      "warn.v1": "⚠️ {message}",
      "error.v1": "❌ {message}",
    };
    return templates[op] || `[missing-op: ${op}]`;
  }

  interpolate(template, payload) {
    return template.replace(/\{([\w.]+)\}/g, (match, key) => {
      return String(payload[key] ?? "");
    });
  }

  async processMessage(userMessage) {
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

  generateFallbackPackets(message) {
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

  generateFallbackResponse(message) {
    // Legacy method - now just converts packets to text
    const packets = this.generateFallbackPackets(message);
    return this.renderPackets(packets);
  }

  async loadFile(filename) {
    try {
      if (!fs.existsSync(filename)) {
        return `File not found: ${filename}`;
      }
      
      const content = fs.readFileSync(filename, 'utf8');
      const lines = content.split('\n').length;
      const size = fs.statSync(filename).size;
      
      // Store file content in memory
      this.context.memory.set(`file:${filename}`, {
        content,
        lines,
        size,
        loadedAt: new Date().toISOString()
      });
      
      return `✅ Loaded file: ${filename}
${colorize('  • Lines:', 'cyan')} ${lines}
${colorize('  • Size:', 'cyan')} ${(size / 1024).toFixed(2)} KB
${colorize('  • Content preview:', 'cyan')} ${content.substring(0, 100)}...`;
      
    } catch (error) {
      return `❌ Error loading file: ${error.message}`;
    }
  }

  async saveConversation(filename) {
    try {
      const conversation = {
        timestamp: new Date().toISOString(),
        messages: this.conversationHistory,
        context: this.context
      };
      
      fs.writeFileSync(filename, JSON.stringify(conversation, null, 2));
      return `✅ Conversation saved to: ${filename}`;
    } catch (error) {
      return `❌ Error saving conversation: ${error.message}`;
    }
  }

  clearHistory() {
    this.conversationHistory = [];
    this.context.previousIntents = [];
  }

  getHistory() {
    return this.conversationHistory;
  }
}

class ChattyCLI {
  constructor() {
    this.ai = new CLIAIService();
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: colorize('Chatty> ', 'green')
    });
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.rl.on('line', async (input) => {
      const trimmed = input.trim();
      
      if (trimmed === '') {
        this.rl.prompt();
        return;
      }

      // Handle commands
      if (trimmed.startsWith('/')) {
        await this.handleCommand(trimmed);
        this.rl.prompt();
        return;
      }

      // Process regular message
      await this.processMessage(trimmed);
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      log('\n👋 Goodbye! Thanks for using Chatty CLI!', 'cyan');
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      log('\n\n👋 Goodbye! Thanks for using Chatty CLI!', 'cyan');
      this.rl.close();
    });
  }

  async handleCommand(command) {
    const [cmd, ...args] = command.split(' ');

    switch (cmd) {
      case '/help':
        log(this.ai.generateFallbackResponse('help'));
        break;
      
      case '/clear':
        this.ai.clearHistory();
        log(colorize('✅ Conversation history cleared!', 'green'));
        break;
      
      case '/memory':
        log(this.ai.generateFallbackResponse('memory'));
        break;
      
      case '/settings':
        log(this.ai.generateFallbackResponse('settings'));
        break;
      
      case '/load':
        if (args.length === 0) {
          log(colorize('Usage: /load <filename>', 'red'));
        } else {
          const result = await this.ai.loadFile(args[0]);
          log(result);
        }
        break;
      
      case '/save':
        if (args.length === 0) {
          log(colorize('Usage: /save <filename>', 'red'));
        } else {
          const result = await this.ai.saveConversation(args[0]);
          log(result);
        }
        break;
      
      case '/history':
        const history = this.ai.getHistory();
        if (history.length === 0) {
          log(colorize('No conversation history yet.', 'gray'));
        } else {
          log(colorize('\n📜 Conversation History:', 'yellow'));
          history.forEach((msg, i) => {
            log(`${colorize(`${i + 1}.`, 'gray')} ${msg}`);
          });
        }
        break;
      
      case '/exit':
      case '/quit':
        this.rl.close();
        break;
      
      default:
        log(colorize(`Unknown command: ${cmd}`, 'red'));
        log(colorize('Type /help for available commands.', 'yellow'));
    }
  }

  async processMessage(message) {
    try {
      // Show typing indicator
      process.stdout.write(colorize('🤔 Processing...', 'yellow'));
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 800));
      
      // Clear typing indicator
      process.stdout.write('\r' + ' '.repeat(20) + '\r');
      
      // Get AI response
      const response = await this.ai.processMessage(message);
      
      // Display response with formatting
      log(colorize('Chatty:', 'cyan') + ' ' + response);
      
    } catch (error) {
      log(colorize('❌ Error processing message:', 'red') + ' ' + error.message);
    }
  }

  start() {
    // Clear screen and show welcome
    console.clear();
    
    log(colorize('🧠 Chatty CLI - Terminal AI Assistant', 'magenta'));
    log(colorize('=====================================', 'magenta'));
    log('');
    log('Welcome to Chatty! I have full AI capabilities:');
    log(colorize('  • Memory System', 'green') + ' - I remember our conversations');
    log(colorize('  • Reasoning Engine', 'green') + ' - I can solve complex problems');
    log(colorize('  • File Processing', 'green') + ' - I can analyze files');
    log(colorize('  • Context Awareness', 'green') + ' - I understand conversation flow');
    log('');
    log('Type your message and press Enter to chat with me.');
    log('Type /help to see all available commands.');
    log('');
    
    // Start the conversation
    this.rl.prompt();
  }
}

// Main execution
function main() {
  const cli = new ChattyCLI();
  cli.start();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ChattyCLI, CLIAIService };
