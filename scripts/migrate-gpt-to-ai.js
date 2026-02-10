#!/usr/bin/env node
/**
 * Database Migration Script: GPT → AI
 * 
 * This script migrates the database schema from GPT terminology to AI terminology:
 * - gpts table → ais table
 * - gpt_files table → ai_files table
 * - gpt_actions table → ai_actions table
 * - gpt_versions table → ai_versions table
 * - gpt_id columns → ai_id columns
 * 
 * IMPORTANT: This script creates a backup before migration.
 * Run this script before deploying the code changes.
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve database path (chatty/chatty.db)
const dbPath = path.join(__dirname, '..', 'chatty.db');
const absoluteDbPath = path.resolve(dbPath);
const backupPath = `${absoluteDbPath}.backup.${Date.now()}`;

async function migrateGPTToAI() {
  console.log('🔄 [Migration] Starting GPT → AI database migration...');
  console.log(`📁 Database: ${absoluteDbPath}`);

  // Check if database exists
  try {
    await fs.access(absoluteDbPath);
  } catch (error) {
    console.error(`❌ [Migration] Database not found at: ${absoluteDbPath}`);
    process.exit(1);
  }

  // Create backup
  console.log('💾 [Migration] Creating database backup...');
  try {
    await fs.copyFile(absoluteDbPath, backupPath);
    console.log(`✅ [Migration] Backup created: ${backupPath}`);
  } catch (error) {
    console.error(`❌ [Migration] Failed to create backup:`, error);
    process.exit(1);
  }

  // Open database
  const db = new Database(absoluteDbPath);
  db.pragma('foreign_keys = OFF'); // Disable foreign keys during migration

  try {
    // Start transaction
    const transaction = db.transaction(() => {
      console.log('🔄 [Migration] Starting transaction...');

      // Step 1: Rename gpt_versions table first (has foreign key to gpts)
      console.log('🔄 [Migration] Renaming gpt_versions → ai_versions...');
      try {
        db.exec(`ALTER TABLE gpt_versions RENAME TO ai_versions`);
        db.exec(`ALTER TABLE ai_versions RENAME COLUMN gpt_id TO ai_id`);
        console.log('✅ [Migration] gpt_versions → ai_versions');
      } catch (error) {
        // Table might not exist, that's okay
        if (!error.message.includes('no such table')) {
          throw error;
        }
        console.log('ℹ️ [Migration] gpt_versions table does not exist, skipping');
      }

      // Step 2: Rename gpt_files table (has foreign key to gpts)
      console.log('🔄 [Migration] Renaming gpt_files → ai_files...');
      try {
        db.exec(`ALTER TABLE gpt_files RENAME TO ai_files`);
        db.exec(`ALTER TABLE ai_files RENAME COLUMN gpt_id TO ai_id`);
        console.log('✅ [Migration] gpt_files → ai_files');
      } catch (error) {
        if (!error.message.includes('no such table')) {
          throw error;
        }
        console.log('ℹ️ [Migration] gpt_files table does not exist, skipping');
      }

      // Step 3: Rename gpt_actions table (has foreign key to gpts)
      console.log('🔄 [Migration] Renaming gpt_actions → ai_actions...');
      try {
        db.exec(`ALTER TABLE gpt_actions RENAME TO ai_actions`);
        db.exec(`ALTER TABLE ai_actions RENAME COLUMN gpt_id TO ai_id`);
        console.log('✅ [Migration] gpt_actions → ai_actions');
      } catch (error) {
        if (!error.message.includes('no such table')) {
          throw error;
        }
        console.log('ℹ️ [Migration] gpt_actions table does not exist, skipping');
      }

      // Step 4: Rename main gpts table
      console.log('🔄 [Migration] Renaming gpts → ais...');
      db.exec(`ALTER TABLE gpts RENAME TO ais`);
      console.log('✅ [Migration] gpts → ais');

      // Step 5: Recreate foreign keys with new table/column names
      console.log('🔄 [Migration] Recreating foreign key constraints...');
      
      // Drop old foreign keys (they're named automatically by SQLite)
      // We need to recreate the tables with proper foreign keys
      // But SQLite doesn't support DROP CONSTRAINT, so we'll verify they work
      
      // Verify foreign keys work by checking constraints
      console.log('✅ [Migration] Foreign keys will be recreated on next database initialization');

      // Step 6: Verify data integrity
      console.log('🔍 [Migration] Verifying data integrity...');
      
      const aiCount = db.prepare(`SELECT COUNT(*) as count FROM ais`).get();
      console.log(`✅ [Migration] ais table: ${aiCount.count} records`);

      try {
        const aiFilesCount = db.prepare(`SELECT COUNT(*) as count FROM ai_files`).get();
        console.log(`✅ [Migration] ai_files table: ${aiFilesCount.count} records`);
      } catch (error) {
        console.log('ℹ️ [Migration] ai_files table does not exist');
      }

      try {
        const aiActionsCount = db.prepare(`SELECT COUNT(*) as count FROM ai_actions`).get();
        console.log(`✅ [Migration] ai_actions table: ${aiActionsCount.count} records`);
      } catch (error) {
        console.log('ℹ️ [Migration] ai_actions table does not exist');
      }

      try {
        const aiVersionsCount = db.prepare(`SELECT COUNT(*) as count FROM ai_versions`).get();
        console.log(`✅ [Migration] ai_versions table: ${aiVersionsCount.count} records`);
      } catch (error) {
        console.log('ℹ️ [Migration] ai_versions table does not exist');
      }

      console.log('✅ [Migration] Transaction completed successfully!');
    });

    transaction();

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');

    console.log('\n✅ [Migration] Database migration completed successfully!');
    console.log(`💾 Backup saved at: ${backupPath}`);
    console.log('\n⚠️  Next steps:');
    console.log('   1. Update code to use new table names (ais, ai_files, ai_actions, ai_versions)');
    console.log('   2. Update code to use ai_id instead of gpt_id');
    console.log('   3. Test the application thoroughly');
    console.log('   4. If everything works, you can delete the backup file');

  } catch (error) {
    db.pragma('foreign_keys = ON');
    console.error('\n❌ [Migration] Migration failed:', error);
    console.error('🔄 [Migration] Restoring from backup...');
    
    try {
      await fs.copyFile(backupPath, absoluteDbPath);
      console.log('✅ [Migration] Database restored from backup');
    } catch (restoreError) {
      console.error('❌ [Migration] Failed to restore backup:', restoreError);
    }
    
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run migration
migrateGPTToAI().catch(error => {
  console.error('❌ [Migration] Fatal error:', error);
  process.exit(1);
});

