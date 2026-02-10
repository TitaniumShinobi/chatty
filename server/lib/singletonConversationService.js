#!/usr/bin/env node
/**
 * Singleton Conversation Service
 * 
 * Manages singleton conversations with unlimited VVAULT memory stacking
 * - One conversation per user per model
 * - Automatic VVAULT integration
 * - Event-driven updates
 */

import SingletonConversation from '../models/SingletonConversation.js';
import VVAULTMemoryManager from './vvaultMemoryManager.js';
import { userRegistryEvents } from './userRegistryEvents.js';

class SingletonConversationService {
  constructor(options = {}) {
    this.memoryManager = new VVAULTMemoryManager(options);
    this.initialized = false;
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.initialized) return;
    
    console.log('🚀 Initializing Singleton Conversation Service...');
    
    // Set up event listeners
    this.setupEventListeners();
    
    this.initialized = true;
    console.log('✅ Singleton Conversation Service initialized');
  }

  /**
   * Set up event listeners for user registry events
   */
  setupEventListeners() {
    userRegistryEvents.on('USER_CREATED', async (event) => {
      try {
        await this.initializeUserConversations(event.data.id, event.data.constructId, event.data.email);
      } catch (error) {
        console.error('❌ Failed to initialize user conversations:', error);
      }
    });

    userRegistryEvents.on('USER_UPDATED', async (event) => {
      try {
        await this.updateUserConversations(event.data.constructId, event.data.email);
      } catch (error) {
        console.error('❌ Failed to update user conversations:', error);
      }
    });
  }

  /**
   * Initialize conversations for a new user
   */
  async initializeUserConversations(userId, constructId, userEmail) {
    try {
      // Initialize VVAULT directory for construct
      await this.memoryManager.initializeConstructDirectory(constructId);
      
      // Create base Chatty conversation
      const baseConversation = await SingletonConversation.getOrCreateSingleton(
        constructId,
        userEmail,
        'chatty-base',
        'Chatty',
        'base'
      );
      
      console.log(`🏗️ Initialized conversations for construct: ${constructId} (${userEmail})`);
      return baseConversation;
    } catch (error) {
      console.error(`❌ Failed to initialize conversations for ${constructId}:`, error);
      throw error;
    }
  }

  /**
   * Get or create singleton conversation for user and model
   */
  async getOrCreateConversation(constructId, userEmail, modelId, modelName, modelType = 'base') {
    try {
      const conversation = await SingletonConversation.getOrCreateSingleton(
        constructId,
        userEmail,
        modelId,
        modelName,
        modelType
      );
      
      // Update memory stack size from VVAULT
      const messageCount = await this.memoryManager.getMessageCount(constructId);
      await conversation.updateMemoryStack(messageCount);
      
      return conversation;
    } catch (error) {
      console.error(`❌ Failed to get/create conversation for ${constructId}/${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Add message to conversation
   */
  async addMessage(constructId, modelId, message) {
    try {
      // Append to VVAULT
      await this.memoryManager.appendMessage(constructId, message);
      
      // Update conversation record
      const conversation = await SingletonConversation.findOne({ userId: constructId, modelId });
      if (conversation) {
        await conversation.updateActivity();
        
        // Update memory stack size
        const messageCount = await this.memoryManager.getMessageCount(constructId);
        await conversation.updateMemoryStack(messageCount);
      }
      
      console.log(`💬 Added message to ${constructId}/${modelId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to add message to ${constructId}/${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Get recent messages for context
   */
  async getRecentMessages(constructId, limit = 50) {
    try {
      return await this.memoryManager.getRecentMessages(constructId, limit);
    } catch (error) {
      console.error(`❌ Failed to get recent messages for ${constructId}:`, error);
      return [];
    }
  }

  /**
   * Get all messages from conversation
   */
  async getAllMessages(constructId) {
    try {
      return await this.memoryManager.getAllMessages(constructId);
    } catch (error) {
      console.error(`❌ Failed to get all messages for ${constructId}:`, error);
      return [];
    }
  }

  /**
   * Get user's conversations (by constructId)
   */
  async getUserConversations(constructId) {
    try {
      return await SingletonConversation.find({ userId: constructId, isActive: true })
        .sort({ updatedAt: -1 });
    } catch (error) {
      console.error(`❌ Failed to get conversations for construct ${constructId}:`, error);
      return [];
    }
  }

  /**
   * Create GPT conversation
   */
  async createGPTConversation(constructId, userEmail, gptId, gptName) {
    try {
      const conversation = await SingletonConversation.getOrCreateSingleton(
        constructId,
        userEmail,
        gptId,
        gptName,
        'gpt'
      );
      
      console.log(`🤖 Created GPT conversation: ${gptName} for ${constructId}`);
      return conversation;
    } catch (error) {
      console.error(`❌ Failed to create GPT conversation for ${constructId}/${gptId}:`, error);
      throw error;
    }
  }

  /**
   * Update user conversations (when user info changes)
   */
  async updateUserConversations(constructId, userEmail) {
    try {
      await SingletonConversation.updateMany(
        { userId: constructId },
        { userEmail, updatedAt: new Date() }
      );
      
      console.log(`🔄 Updated conversations for construct: ${constructId}`);
    } catch (error) {
      console.error(`❌ Failed to update conversations for ${constructId}:`, error);
    }
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(constructId) {
    try {
      const conversations = await SingletonConversation.find({ userId: constructId, isActive: true });
      
      const stats = {
        totalConversations: conversations.length,
        totalMessages: conversations.reduce((sum, conv) => sum + conv.messageCount, 0),
        totalMemoryStack: conversations.reduce((sum, conv) => sum + conv.memoryStackSize, 0),
        conversations: conversations.map(conv => ({
          modelId: conv.modelId,
          modelName: conv.modelName,
          modelType: conv.modelType,
          messageCount: conv.messageCount,
          memoryStackSize: conv.memoryStackSize,
          lastMessageAt: conv.lastMessageAt,
          updatedAt: conv.updatedAt
        }))
      };
      
      return stats;
    } catch (error) {
      console.error(`❌ Failed to get conversation stats for ${constructId}:`, error);
      return { totalConversations: 0, totalMessages: 0, totalMemoryStack: 0, conversations: [] };
    }
  }
}

// Export singleton instance
export const singletonConversationService = new SingletonConversationService();
export default SingletonConversationService;
