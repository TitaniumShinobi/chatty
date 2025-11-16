#!/usr/bin/env node

/**
 * Migration Script: Add Construct-Aware Fields to Existing Users
 * 
 * This script migrates existing users to the new construct-aware user registry system.
 * It adds the required fields: id, constructId, vvaultPath, status, and audit fields.
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

// User Schema (matches the updated model)
const UserSchema = new mongoose.Schema({
  // Core Identity
  id: { type: String, required: true, unique: true }, // UUID
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  
  // Authentication
  password: String, // PBKDF2 hash for email users
  provider: { type: String, default: "email" }, // email|google|microsoft
  
  // Status & Lifecycle
  status: { type: String, default: "active" }, // active|deleted|suspended
  deletedAt: { type: Date, default: null },
  deletionReason: { type: String, default: null },
  canRestoreUntil: { type: Date, default: null },
  
  // Audit Trail
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: null },
  loginCount: { type: Number, default: 0 },
  
  // Construct-Aware Fields
  constructId: { type: String, unique: true }, // HUMAN-DEVON-001
  vvaultPath: { type: String, required: true }, // /vvault/users/email_devon_xyz123/
  
  // Security
  failedLoginAttempts: { type: Number, default: 0 },
  lastFailedLoginAt: { type: Date, default: null },
  ipAddresses: [{ type: String }], // Track login IPs
  
  // Legacy fields for backward compatibility
  uid: { type: String, unique: true, index: true }, // google sub or unique email ID
  picture: String,
  emailVerified: { type: Boolean, default: false },
  phoneE164: { type: String, index: true, sparse: true }, // +1...
  phoneVerifiedAt: { type: Date },
  tier: { type: String, default: "free" }, // free|pro|enterprise
});

const User = mongoose.model("User", UserSchema);

/**
 * Generate construct-aware fields for a user
 */
function generateConstructFields(user) {
  const userId = user.id || `email_${Date.now()}_${crypto.randomUUID()}`;
  const constructId = `HUMAN-${user.name.toUpperCase().replace(/\s+/g, '-')}-${Date.now()}`;
  const vvaultPath = `/vvault/users/${userId}/`;
  
  return {
    id: userId,
    constructId: constructId,
    vvaultPath: vvaultPath,
    status: user.isDeleted ? 'deleted' : 'active',
    createdAt: user.createdAt || new Date(),
    lastLoginAt: user.lastLoginAt || null,
    loginCount: user.loginCount || 0,
    failedLoginAttempts: user.failedLoginAttempts || 0,
    lastFailedLoginAt: user.lastFailedLoginAt || null,
    ipAddresses: user.ipAddresses || []
  };
}

/**
 * Main migration function
 */
async function migrateUsers() {
  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    // Get all existing users
    const existingUsers = await User.find({});
    console.log(`📋 Found ${existingUsers.length} existing users to migrate`);

    if (existingUsers.length === 0) {
      console.log('ℹ️ No users found to migrate');
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of existingUsers) {
      try {
        // Check if user already has construct fields
        if (user.constructId && user.vvaultPath && user.id) {
          console.log(`⏭️ Skipping user ${user.email} - already migrated`);
          skippedCount++;
          continue;
        }

        console.log(`🔄 Migrating user: ${user.email}`);

        // Generate construct-aware fields
        const constructFields = generateConstructFields(user);

        // Update user with new fields
        const updatedUser = await User.findByIdAndUpdate(
          user._id,
          {
            $set: {
              id: constructFields.id,
              constructId: constructFields.constructId,
              vvaultPath: constructFields.vvaultPath,
              status: constructFields.status,
              createdAt: constructFields.createdAt,
              lastLoginAt: constructFields.lastLoginAt,
              loginCount: constructFields.loginCount,
              failedLoginAttempts: constructFields.failedLoginAttempts,
              lastFailedLoginAt: constructFields.lastFailedLoginAt,
              ipAddresses: constructFields.ipAddresses
            }
          },
          { new: true }
        );

        console.log(`✅ Migrated user: ${user.email}`);
        console.log(`   - ID: ${constructFields.id}`);
        console.log(`   - Construct ID: ${constructFields.constructId}`);
        console.log(`   - VVAULT Path: ${constructFields.vvaultPath}`);
        console.log(`   - Status: ${constructFields.status}`);

        migratedCount++;

      } catch (error) {
        console.error(`❌ Failed to migrate user ${user.email}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successfully migrated: ${migratedCount} users`);
    console.log(`   ⏭️ Skipped (already migrated): ${skippedCount} users`);
    console.log(`   ❌ Errors: ${errorCount} users`);

    // Create indexes for performance
    console.log('\n🔧 Creating indexes...');
    await User.collection.createIndex({ email: 1, status: 1 });
    await User.collection.createIndex({ constructId: 1 });
    await User.collection.createIndex({ deletedAt: 1 });
    await User.collection.createIndex({ canRestoreUntil: 1 });
    await User.collection.createIndex({ status: 1 });
    console.log('✅ Indexes created successfully');

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📊 Database connection closed');
  }
}

// Run migration
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateUsers().catch(console.error);
}

export { migrateUsers };
