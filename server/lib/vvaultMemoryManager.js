#!/usr/bin/env node
/**
 * VVAULT Unlimited Memory Stack Manager
 * 
 * Manages unlimited conversation history in VVAULT with:
 * - Automatic memory stacking
 * - Efficient retrieval
 * - User isolation
 * - Construct-aware paths
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class VVAULTMemoryManager {
  constructor(options = {}) {
    // Use config for VVAULT root path (lowercase 'vvault')
    // Note: This file uses ES modules, so we need to use dynamic import or pass path from caller
    // For now, use environment variable or fallback to relative path
    const VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || 
                       path.join(__dirname, '../../../vvault');
    this.vvaultRoot = options.vvaultRoot || VVAULT_ROOT;
    this.maxMemoryPerConversation = options.maxMemoryPerConversation || 10000; // 10k messages
    this.compressionEnabled = options.compressionEnabled || true;
  }

  /**
   * Initialize VVAULT directory structure for construct
   * Creates: vvault/chatty/conversations/{constructId}/
   */
  async initializeConstructDirectory(constructId) {
    const convDir = await this.getConversationDirectory(constructId);
    
    try {
      // Initialize chat.json with empty array if it doesn't exist
      const chatJsonPath = path.join(convDir, 'chat.json');
      try {
        await fs.access(chatJsonPath);
      } catch (error) {
        // File doesn't exist, create it with empty array
        await fs.writeFile(chatJsonPath, JSON.stringify([], null, 2), 'utf8');
      }
      
      // Initialize conversation metadata
      await this.updateConversationMetadata(constructId, {
        constructId,
        createdAt: new Date().toISOString(),
        messageCount: 0
      });
      
      console.log(`📁 Initialized VVAULT directory for construct: ${constructId}`);
      return convDir;
    } catch (error) {
      console.error(`❌ Failed to initialize VVAULT directory for ${constructId}:`, error);
      throw error;
    }
  }

  /**
   * Get or create conversation directory
   * Path: vvault/chatty/conversations/{constructId}/
   */
  async getConversationDirectory(constructId) {
    const convPath = path.join(this.vvaultRoot, 'vvault', 'chatty', 'conversations', constructId);
    
    try {
      await fs.mkdir(convPath, { recursive: true });
      return convPath;
    } catch (error) {
      console.error(`❌ Failed to create conversation directory for ${constructId}:`, error);
      throw error;
    }
  }

  /**
   * Get chat.json file path for construct
   * Path: vvault/chatty/conversations/{constructId}/chat.json
   */
  async getChatJsonPath(constructId) {
    const convDir = await this.getConversationDirectory(constructId);
    return path.join(convDir, 'chat.json');
  }

  /**
   * Append message to conversation memory stack
   * Saves to: vvault/chatty/conversations/{constructId}/chat.json
   */
  async appendMessage(constructId, message) {
    const chatJsonPath = await this.getChatJsonPath(constructId);
    
    try {
      // Read existing chat.json or create new array
      let messages = [];
      try {
        const existingContent = await fs.readFile(chatJsonPath, 'utf8');
        messages = JSON.parse(existingContent);
      } catch (error) {
        // File doesn't exist yet, start with empty array
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Create message content
      const messageContent = {
        timestamp: message.timestamp || new Date().toISOString(),
        role: message.role,
        content: message.content,
        metadata: {
          tokens: message.tokens || 0,
          model: message.model || 'unknown',
          constructId: constructId
        }
      };

      // Append message to array (append-only)
      messages.push(messageContent);

      // Write back to chat.json
      await fs.writeFile(chatJsonPath, JSON.stringify(messages, null, 2), 'utf8');
      
      // Update conversation metadata
      await this.updateConversationMetadata(constructId, {
        lastMessageAt: messageContent.timestamp,
        messageCount: messages.length
      });
      
      console.log(`💾 Appended message to VVAULT: ${constructId}/chat.json (total: ${messages.length} messages)`);
      return chatJsonPath;
    } catch (error) {
      console.error(`❌ Failed to append message to VVAULT for ${constructId}:`, error);
      throw error;
    }
  }

  /**
   * Get recent messages from conversation (for context)
   * Reads from: vvault/chatty/conversations/{constructId}/chat.json
   */
  async getRecentMessages(constructId, limit = 50) {
    const chatJsonPath = await this.getChatJsonPath(constructId);
    
    try {
      const content = await fs.readFile(chatJsonPath, 'utf8');
      const messages = JSON.parse(content);
      
      // Return most recent messages (last N entries)
      return messages.slice(-limit);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, return empty array
        return [];
      }
      console.error(`❌ Failed to get recent messages for ${constructId}:`, error);
      return [];
    }
  }

  /**
   * Get all messages from conversation (unlimited)
   * Reads from: vvault/chatty/conversations/{constructId}/chat.json
   */
  async getAllMessages(constructId) {
    const chatJsonPath = await this.getChatJsonPath(constructId);
    
    try {
      const content = await fs.readFile(chatJsonPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, return empty array
        return [];
      }
      console.error(`❌ Failed to get all messages for ${constructId}:`, error);
      return [];
    }
  }

  /**
   * Get message count for conversation
   * Reads from: vvault/chatty/conversations/{constructId}/chat.json
   */
  async getMessageCount(constructId) {
    try {
      const messages = await this.getAllMessages(constructId);
      return messages.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Update conversation metadata
   * Saves to: vvault/chatty/conversations/{constructId}/conversation.json
   */
  async updateConversationMetadata(constructId, metadata) {
    const convDir = await this.getConversationDirectory(constructId);
    const metaFile = path.join(convDir, 'conversation.json');
    
    try {
      let existingMeta = {};
      try {
        const content = await fs.readFile(metaFile, 'utf8');
        existingMeta = JSON.parse(content);
      } catch (error) {
        // File doesn't exist yet, start with empty metadata
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
      
      const updatedMeta = {
        ...existingMeta,
        ...metadata,
        constructId,
        updatedAt: new Date().toISOString()
      };
      
      await fs.writeFile(metaFile, JSON.stringify(updatedMeta, null, 2));
    } catch (error) {
      console.error(`❌ Failed to update conversation metadata for ${constructId}:`, error);
    }
  }

  /**
   * Get conversation metadata
   * Reads from: vvault/chatty/conversations/{constructId}/conversation.json
   */
  async getConversationMetadata(constructId) {
    const convDir = await this.getConversationDirectory(constructId);
    const metaFile = path.join(convDir, 'conversation.json');
    
    try {
      const content = await fs.readFile(metaFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, return default metadata
        return {
          constructId,
          messageCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
      throw error;
    }
  }

  /**
   * Clean up old messages (optional compression)
   * Note: With chat.json format, compression would require splitting the file
   * For now, this is a placeholder - actual compression logic can be added later
   */
  async compressOldMessages(constructId, keepRecent = 1000) {
    try {
      const messages = await this.getAllMessages(constructId);
      
      if (messages.length <= keepRecent) {
        return; // No compression needed
      }
      
      // Split messages into recent and old
      const recentMessages = messages.slice(-keepRecent);
      const oldMessages = messages.slice(0, -keepRecent);
      
      // Save recent messages to chat.json
      const chatJsonPath = await this.getChatJsonPath(constructId);
      await fs.writeFile(chatJsonPath, JSON.stringify(recentMessages, null, 2), 'utf8');
      
      // Archive old messages to compressed.json
      const convDir = await this.getConversationDirectory(constructId);
      const compressedFile = path.join(convDir, 'compressed.json');
      
      // Append to compressed file (read existing if it exists)
      let compressedMessages = [];
      try {
        const existing = await fs.readFile(compressedFile, 'utf8');
        compressedMessages = JSON.parse(existing);
      } catch (error) {
        // File doesn't exist yet
      }
      
      compressedMessages.push(...oldMessages);
      await fs.writeFile(compressedFile, JSON.stringify(compressedMessages, null, 2), 'utf8');
      
      console.log(`🗜️ Compressed ${oldMessages.length} old messages for ${constructId} (kept ${recentMessages.length} recent)`);
    } catch (error) {
      console.error(`❌ Failed to compress old messages for ${constructId}:`, error);
    }
  }
}

export default VVAULTMemoryManager;
