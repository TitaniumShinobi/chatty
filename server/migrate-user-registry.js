#!/usr/bin/env node
/**
 * Chatty User Registry Migration Script
 * 
 * This script migrates existing users to the new user registry system
 * with soft delete capabilities and deletion registry.
 */

import mongoose from 'mongoose';
import User from './models/User.js';
import DeletionRegistry from './models/DeletionRegistry.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatty');
    console.log('📊 MongoDB Connected for migration');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// Migration functions
const migrateUsers = async () => {
  console.log('🔄 Starting user registry migration...');
  
  try {
    // Get all existing users
    const users = await User.find({});
    console.log(`📋 Found ${users.length} existing users`);
    
    let migrated = 0;
    let skipped = 0;
    
    for (const user of users) {
      // Check if user already has new fields
      if (user.isDeleted !== undefined) {
        console.log(`⏭️ User ${user.email} already migrated, skipping`);
        skipped++;
        continue;
      }
      
      // Add new fields with default values
      await User.findByIdAndUpdate(user._id, {
        deletedAt: null,
        deletionScheduledAt: null,
        deletionReason: null,
        isDeleted: false,
        canRestoreUntil: null
      });
      
      console.log(`✅ Migrated user: ${user.email}`);
      migrated++;
    }
    
    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Migrated: ${migrated} users`);
    console.log(`   ⏭️ Skipped: ${skipped} users`);
    console.log(`   📋 Total: ${users.length} users`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

const createIndexes = async () => {
  console.log('🔧 Creating database indexes...');
  
  try {
    // Create indexes for User model
    await User.collection.createIndex({ email: 1, isDeleted: 1 });
    await User.collection.createIndex({ deletedAt: 1 });
    await User.collection.createIndex({ canRestoreUntil: 1 });
    
    // Create indexes for DeletionRegistry model
    await DeletionRegistry.collection.createIndex({ email: 1 }, { unique: true });
    await DeletionRegistry.collection.createIndex({ canRestoreUntil: 1 });
    await DeletionRegistry.collection.createIndex({ isPermanentlyDeleted: 1 });
    
    console.log('✅ Database indexes created successfully');
    
  } catch (error) {
    console.error('❌ Failed to create indexes:', error);
    throw error;
  }
};

const cleanupExpiredDeletions = async () => {
  console.log('🧹 Running cleanup of expired deletions...');
  
  try {
    const now = new Date();
    
    // Find expired deletions
    const expiredDeletions = await DeletionRegistry.find({
      canRestoreUntil: { $lt: now },
      isPermanentlyDeleted: false
    });
    
    console.log(`📋 Found ${expiredDeletions.length} expired deletions`);
    
    let cleaned = 0;
    for (const deletion of expiredDeletions) {
      // Permanently delete user data
      await User.findByIdAndDelete(deletion.originalUserId);
      
      // Update deletion registry
      await DeletionRegistry.findByIdAndUpdate(deletion._id, {
        isPermanentlyDeleted: true,
        permanentlyDeletedAt: now
      });
      
      console.log(`🗑️ Permanently deleted user: ${deletion.email}`);
      cleaned++;
    }
    
    console.log(`✅ Cleaned up ${cleaned} expired deletions`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
};

// Main migration function
const runMigration = async () => {
  console.log('🚀 Starting Chatty User Registry Migration');
  console.log('==========================================');
  
  try {
    await connectDB();
    await createIndexes();
    await migrateUsers();
    await cleanupExpiredDeletions();
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📋 What was migrated:');
    console.log('   • Added soft delete fields to all users');
    console.log('   • Created deletion registry collection');
    console.log('   • Created database indexes for performance');
    console.log('   • Cleaned up any expired deletions');
    
    console.log('\n🔧 New features available:');
    console.log('   • Account deletion with 30-day grace period');
    console.log('   • Account restoration within grace period');
    console.log('   • Deletion registry to prevent re-registration');
    console.log('   • Automatic cleanup of expired deletions');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📊 Database connection closed');
  }
};

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration();
}

export { runMigration, migrateUsers, createIndexes, cleanupExpiredDeletions };
