#!/usr/bin/env node
/**
 * Migration Script: Old Conversations → Singleton Architecture
 * 
 * This script migrates from the old multi-conversation system to the new
 * singleton conversation architecture with VVAULT unlimited memory stacking.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Import models
import User from './models/User.js';
import Conversation from './models/Conversation.js';
import Message from './models/Message.js';
import SingletonConversation from './models/SingletonConversation.js';

// Import services
import { singletonConversationService } from './lib/singletonConversationService.js';
import VVAULTMemoryManager from './lib/vvaultMemoryManager.js';

class ConversationMigration {
  constructor() {
    this.memoryManager = new VVAULTMemoryManager();
    this.migratedUsers = 0;
    this.migratedConversations = 0;
    this.migratedMessages = 0;
  }

  /**
   * Connect to MongoDB
   */
  async connectToDatabase() {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  /**
   * Run the complete migration
   */
  async runMigration() {
    console.log('🚀 Starting Conversation Migration to Singleton Architecture');
    console.log('========================================================');
    
    try {
      await this.connectToDatabase();
      await singletonConversationService.initialize();
      
      // Step 1: Migrate users
      await this.migrateUsers();
      
      // Step 2: Migrate conversations
      await this.migrateConversations();
      
      // Step 3: Clean up old data
      await this.cleanupOldData();
      
      console.log('\n🎉 Migration completed successfully!');
      console.log(`📊 Statistics:`);
      console.log(`   - Users migrated: ${this.migratedUsers}`);
      console.log(`   - Conversations migrated: ${this.migratedConversations}`);
      console.log(`   - Messages migrated: ${this.migratedMessages}`);
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    } finally {
      await mongoose.disconnect();
    }
  }

  /**
   * Migrate users to new structure
   */
  async migrateUsers() {
    console.log('\n👥 Migrating users...');
    
    const users = await User.find({ status: 'active' });
    
    for (const user of users) {
      try {
        // Initialize user conversations in VVAULT
        await singletonConversationService.initializeUserConversations(
          user.id,
          user.constructId,
          user.email
        );
        
        this.migratedUsers++;
        console.log(`✅ Migrated user: ${user.email}`);
      } catch (error) {
        console.error(`❌ Failed to migrate user ${user.email}:`, error.message);
      }
    }
  }

  /**
   * Migrate conversations to singleton structure
   */
  async migrateConversations() {
    console.log('\n💬 Migrating conversations...');
    
    const conversations = await Conversation.find().populate('owner');
    
    for (const conversation of conversations) {
      try {
        const user = conversation.owner;
        if (!user) {
          console.warn(`⚠️ Conversation ${conversation._id} has no owner, skipping`);
          continue;
        }
        
        // Determine model type and ID
        const modelId = conversation.model || 'chatty-base';
        const modelName = conversation.model || 'Chatty';
        const modelType = conversation.model ? 'gpt' : 'base';
        
        // Get or create singleton conversation
        const singletonConv = await singletonConversationService.getOrCreateConversation(
          user.id,
          user.email,
          modelId,
          modelName,
          modelType
        );
        
        // Migrate messages
        await this.migrateConversationMessages(conversation._id, user.id, modelId);
        
        this.migratedConversations++;
        console.log(`✅ Migrated conversation: ${conversation.title || 'Untitled'} for ${user.email}`);
      } catch (error) {
        console.error(`❌ Failed to migrate conversation ${conversation._id}:`, error.message);
      }
    }
  }

  /**
   * Migrate messages from old conversation to VVAULT
   */
  async migrateConversationMessages(oldConversationId, userId, modelId) {
    try {
      const messages = await Message.find({ conversation: oldConversationId })
        .sort({ createdAt: 1 });
      
      for (const message of messages) {
        try {
          const messageData = {
            role: message.role,
            content: message.content,
            timestamp: message.createdAt.toISOString(),
            tokens: message.tokens || 0,
            model: modelId
          };
          
          await this.memoryManager.appendMessage(userId, modelId, messageData);
          this.migratedMessages++;
        } catch (error) {
          console.warn(`⚠️ Failed to migrate message ${message._id}:`, error.message);
        }
      }
      
      console.log(`📝 Migrated ${messages.length} messages for ${userId}/${modelId}`);
    } catch (error) {
      console.error(`❌ Failed to migrate messages for conversation ${oldConversationId}:`, error);
    }
  }

  /**
   * Clean up old data (optional - commented out for safety)
   */
  async cleanupOldData() {
    console.log('\n🧹 Cleanup phase (DRY RUN - no data deleted)');
    
    const oldConversations = await Conversation.countDocuments();
    const oldMessages = await Message.countDocuments();
    
    console.log(`📊 Old data to clean up:`);
    console.log(`   - Conversations: ${oldConversations}`);
    console.log(`   - Messages: ${oldMessages}`);
    
    // Uncomment these lines to actually delete old data
    // console.log('🗑️ Deleting old conversations and messages...');
    // await Conversation.deleteMany({});
    // await Message.deleteMany({});
    // console.log('✅ Old data cleaned up');
    
    console.log('⚠️ To actually clean up old data, uncomment the deletion lines in the script');
  }

  /**
   * Create backup before migration
   */
  async createBackup() {
    console.log('💾 Creating backup...');
    
    const backupData = {
      users: await User.find({}),
      conversations: await Conversation.find({}),
      messages: await Message.find({}),
      timestamp: new Date().toISOString()
    };
    
    const backupPath = path.join(__dirname, `backup-${Date.now()}.json`);
    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
    
    console.log(`✅ Backup created: ${backupPath}`);
    return backupPath;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const migration = new ConversationMigration();
  
  // Ask for confirmation
  console.log('⚠️ This will migrate your conversation data to the new singleton architecture.');
  console.log('⚠️ Make sure you have a backup before proceeding.');
  console.log('⚠️ Press Ctrl+C to cancel, or wait 10 seconds to continue...');
  
  setTimeout(async () => {
    try {
      await migration.runMigration();
      process.exit(0);
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  }, 10000);
}

export default ConversationMigration;
