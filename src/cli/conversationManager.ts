// conversationManager.ts - Conversation save/load functionality for CLI

import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export interface ConversationEntry {
  text: string;
  timestamp: string;
  role: 'user' | 'assistant';
}

export interface SavedConversation {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  lastModified: string;
  messages: ConversationEntry[];
  metadata: {
    model: string;
    messageCount: number;
    totalTokens: number;
    tags: string[];
  };
}

export class ConversationManager {
  private conversationsDir: string;
  private currentConversation: SavedConversation | null = null;

  constructor(conversationsDir = './chatty-conversations') {
    this.conversationsDir = path.resolve(conversationsDir);
    this.ensureConversationsDir();
  }

  /**
   * Ensure conversations directory exists
   */
  private async ensureConversationsDir(): Promise<void> {
    try {
      await stat(this.conversationsDir);
    } catch {
      await mkdir(this.conversationsDir, { recursive: true });
    }
  }

  /**
   * Save current conversation to file
   */
  async saveConversation(
    messages: { text: string; timestamp: string }[],
    options: {
      title?: string;
      description?: string;
      tags?: string[];
      model?: string;
    } = {}
  ): Promise<string> {
    const id = this.generateConversationId();
    const now = new Date().toISOString();
    
    // Convert messages to conversation entries
    const conversationMessages: ConversationEntry[] = messages.map((msg, index) => ({
      text: msg.text,
      timestamp: msg.timestamp,
      role: index % 2 === 0 ? 'user' : 'assistant' // Simple alternating pattern
    }));

    const conversation: SavedConversation = {
      id,
      title: options.title || `Conversation ${new Date().toLocaleDateString()}`,
      description: options.description || 'Saved conversation from Chatty CLI',
      createdAt: now,
      lastModified: now,
      messages: conversationMessages,
      metadata: {
        model: options.model || 'synth',
        messageCount: conversationMessages.length,
        totalTokens: conversationMessages.reduce((sum, msg) => sum + msg.text.length, 0),
        tags: options.tags || []
      }
    };

    const filename = `${id}.json`;
    const filepath = path.join(this.conversationsDir, filename);
    
    await writeFile(filepath, JSON.stringify(conversation, null, 2));
    
    this.currentConversation = conversation;
    return id;
  }

  /**
   * Load conversation from file
   */
  async loadConversation(identifier: string): Promise<SavedConversation> {
    let filepath: string;
    
    // Check if identifier is a file path
    if (identifier.includes('/') || identifier.includes('\\')) {
      filepath = path.resolve(identifier);
    } else {
      // Check if it's an ID or filename
      if (identifier.endsWith('.json')) {
        filepath = path.join(this.conversationsDir, identifier);
      } else {
        filepath = path.join(this.conversationsDir, `${identifier}.json`);
      }
    }

    try {
      const content = await readFile(filepath, 'utf-8');
      const conversation = JSON.parse(content) as SavedConversation;
      
      // Validate conversation structure
      if (!conversation.id || !conversation.messages || !Array.isArray(conversation.messages)) {
        throw new Error('Invalid conversation file format');
      }

      this.currentConversation = conversation;
      return conversation;
    } catch (error: any) {
      throw new Error(`Failed to load conversation: ${error.message}`);
    }
  }

  /**
   * List all saved conversations
   */
  async listConversations(): Promise<SavedConversation[]> {
    try {
      const files = await readdir(this.conversationsDir);
      const conversationFiles = files.filter(file => file.endsWith('.json'));
      
      const conversations: SavedConversation[] = [];
      
      for (const file of conversationFiles) {
        try {
          const filepath = path.join(this.conversationsDir, file);
          const content = await readFile(filepath, 'utf-8');
          const conversation = JSON.parse(content) as SavedConversation;
          conversations.push(conversation);
        } catch (error) {
          console.warn(`Skipping invalid conversation file: ${file}`);
        }
      }

      // Sort by last modified date (newest first)
      conversations.sort((a, b) => 
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );

      return conversations;
    } catch (error: any) {
      throw new Error(`Failed to list conversations: ${error.message}`);
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(identifier: string): Promise<void> {
    let filepath: string;
    
    if (identifier.includes('/') || identifier.includes('\\')) {
      filepath = path.resolve(identifier);
    } else {
      if (identifier.endsWith('.json')) {
        filepath = path.join(this.conversationsDir, identifier);
      } else {
        filepath = path.join(this.conversationsDir, `${identifier}.json`);
      }
    }

    try {
      await fs.promises.unlink(filepath);
    } catch (error: any) {
      throw new Error(`Failed to delete conversation: ${error.message}`);
    }
  }

  /**
   * Export conversation to different formats
   */
  async exportConversation(
    identifier: string,
    format: 'json' | 'txt' | 'md' = 'json'
  ): Promise<string> {
    const conversation = await this.loadConversation(identifier);
    
    switch (format) {
      case 'json':
        return JSON.stringify(conversation, null, 2);
      
      case 'txt':
        return this.exportToText(conversation);
      
      case 'md':
        return this.exportToMarkdown(conversation);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Export conversation to plain text
   */
  private exportToText(conversation: SavedConversation): string {
    let output = `# ${conversation.title}\n`;
    output += `Created: ${conversation.createdAt}\n`;
    output += `Messages: ${conversation.metadata.messageCount}\n\n`;
    
    for (const message of conversation.messages) {
      const role = message.role === 'user' ? 'User' : 'Chatty';
      output += `[${message.timestamp}] ${role}: ${message.text}\n\n`;
    }
    
    return output;
  }

  /**
   * Export conversation to Markdown
   */
  private exportToMarkdown(conversation: SavedConversation): string {
    let output = `# ${conversation.title}\n\n`;
    output += `**Created:** ${conversation.createdAt}\n`;
    output += `**Messages:** ${conversation.metadata.messageCount}\n`;
    output += `**Model:** ${conversation.metadata.model}\n\n`;
    
    if (conversation.description) {
      output += `*${conversation.description}*\n\n`;
    }
    
    if (conversation.metadata.tags.length > 0) {
      output += `**Tags:** ${conversation.metadata.tags.join(', ')}\n\n`;
    }
    
    output += `---\n\n`;
    
    for (const message of conversation.messages) {
      const role = message.role === 'user' ? '**User**' : '**Chatty**';
      output += `${role} *(${message.timestamp})*\n\n`;
      output += `${message.text}\n\n`;
    }
    
    return output;
  }

  /**
   * Get current conversation
   */
  getCurrentConversation(): SavedConversation | null {
    return this.currentConversation;
  }

  /**
   * Clear current conversation
   */
  clearCurrentConversation(): void {
    this.currentConversation = null;
  }

  /**
   * Generate unique conversation ID
   */
  private generateConversationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `conv_${timestamp}_${random}`;
  }

  /**
   * Search conversations by title, description, or content
   */
  async searchConversations(query: string): Promise<SavedConversation[]> {
    const conversations = await this.listConversations();
    const lowerQuery = query.toLowerCase();
    
    return conversations.filter(conv => 
      conv.title.toLowerCase().includes(lowerQuery) ||
      conv.description.toLowerCase().includes(lowerQuery) ||
      conv.metadata.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      conv.messages.some(msg => msg.text.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get conversation statistics
   */
  async getStatistics(): Promise<{
    totalConversations: number;
    totalMessages: number;
    totalTokens: number;
    averageMessagesPerConversation: number;
    oldestConversation: string | null;
    newestConversation: string | null;
  }> {
    const conversations = await this.listConversations();
    
    if (conversations.length === 0) {
      return {
        totalConversations: 0,
        totalMessages: 0,
        totalTokens: 0,
        averageMessagesPerConversation: 0,
        oldestConversation: null,
        newestConversation: null
      };
    }

    const totalMessages = conversations.reduce((sum, conv) => sum + conv.metadata.messageCount, 0);
    const totalTokens = conversations.reduce((sum, conv) => sum + conv.metadata.totalTokens, 0);
    
    const sortedByDate = conversations.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return {
      totalConversations: conversations.length,
      totalMessages,
      totalTokens,
      averageMessagesPerConversation: totalMessages / conversations.length,
      oldestConversation: sortedByDate[0].title,
      newestConversation: sortedByDate[sortedByDate.length - 1].title
    };
  }
}
