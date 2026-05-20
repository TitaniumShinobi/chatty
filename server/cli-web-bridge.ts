// CLI-to-Web Bridge
// Wraps CLIAIService functionality for web interface use

import { CLIAIService } from '../src/cli/chatty-cli.js';
import { ensurePhi3 } from '../src/cli/chatty-cli.js';

export interface CommandResult {
  type: 'response' | 'command' | 'error';
  content: string;
  metadata?: {
    model?: string;
    timestamp?: string;
    command?: string;
  };
}

export class CLIWebBridge {
  private cli: CLIAIService;
  private isInitialized = false;

  constructor() {
    // Initialize CLI service with default settings
    this.cli = new CLIAIService(false, false, 'Web');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure Ollama is running
      const host = process.env.OLLAMA_HOST || 'http://localhost';
      const { port } = await ensurePhi3({ 
        preferredPort: 8003, 
        host, 
        silent: true 
      });
      
      process.env.OLLAMA_PORT = String(port);
      process.env.OLLAMA_HOST = host;
      
      this.isInitialized = true;
      console.log(`CLI Web Bridge initialized on port ${port}`);
    } catch (error) {
      console.error('Failed to initialize CLI Web Bridge:', error);
      throw error;
    }
  }

  async processMessage(message: string): Promise<CommandResult> {
    await this.initialize();

    try {
      // Check if it's a slash command
      if (message.startsWith('/')) {
        return await this.processCommand(message);
      }

      // Regular message processing
      const response = await this.cli.processMessage(message);
      
      return {
        type: 'response',
        content: response,
        metadata: {
          model: this.cli.getModel(),
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: any) {
      return {
        type: 'error',
        content: `Error: ${error?.message || error}`,
        metadata: {
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  async processCommand(command: string): Promise<CommandResult> {
    const parts = command.split(/\s+/);
    const cmd = parts[0];

    switch (cmd) {
      case '/model':
        if (parts.length === 1) {
          return {
            type: 'command',
            content: `Active model: ${this.cli.getModel()}`,
            metadata: { command: '/model' }
          };
        }
        
        if (parts[1] === 'list') {
          // For web, we'll return available models from config
          return {
            type: 'command',
            content: 'Available models:\n• synth (multi-model synthesis)\n• phi3:latest\n• qwen3-coder:30b\n• qwen2.5-coder:latest\n• mistral:latest',
            metadata: { command: '/model list' }
          };
        }
        
        if (parts[1] === 'synth') {
          this.cli.setModel('synth');
          return {
            type: 'command',
            content: '🧠 Synth mode enabled.',
            metadata: { command: '/model synth' }
          };
        }
        
        // Set specific model
        this.cli.setModel(parts[1]);
        return {
          type: 'command',
          content: `✅ Switched to model: ${parts[1]}`,
          metadata: { command: '/model', model: parts[1] }
        };

      case '/ts':
        this.cli.addTimestamps = !this.cli.addTimestamps;
        return {
          type: 'command',
          content: `Timestamps ${this.cli.addTimestamps ? 'enabled' : 'disabled'}.`,
          metadata: { command: '/ts' }
        };

      case '/status':
        const ctx = this.cli.getContext();
        const memoryCount = ctx.history.length;
        return {
          type: 'command',
          content: `🩺 Status Report:\n• Messages in history: ${memoryCount}\n• Active model: ${this.cli.getModel()}`,
          metadata: { command: '/status' }
        };

      case '/clear':
        this.cli.clearHistory();
        return {
          type: 'command',
          content: '🧹 Conversation history cleared.',
          metadata: { command: '/clear' }
        };

      case '/help':
        return {
          type: 'command',
          content: `Available commands:
• /model - Show active model
• /model list - List available models
• /model synth - Enable multi-model synthesis
• /model <name> - Switch to specific model
• /ts - Toggle timestamps
• /status - Show status report
• /clear - Clear conversation history
• /help - Show this help`,
          metadata: { command: '/help' }
        };

      default:
        return {
          type: 'error',
          content: `Unknown command: ${cmd}. Type /help for available commands.`,
          metadata: { command: cmd }
        };
    }
  }

  getModel(): string {
    return this.cli.getModel();
  }

  setModel(model: string): void {
    this.cli.setModel(model);
  }

  getContext(): any {
    return this.cli.getContext();
  }
}
