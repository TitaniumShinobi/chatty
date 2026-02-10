#!/usr/bin/env node
/**
 * Migration Script: Migrate SQLite memories to VVAULT
 * 
 * This script reads construct memories from Chatty DB (SQLite) and migrates them to VVAULT ChromaDB.
 * 
 * Usage:
 *   node scripts/migrate-memories-to-vvault.js [options]
 * 
 * Options:
 *   --dry-run    Show what would be migrated without actually migrating
 *   --construct  Migrate only a specific construct (e.g., --construct synth-001)
 *   --batch-size Number of memories to migrate per batch (default: 10)
 * 
 * Prerequisites:
 *   - Chatty DB must be accessible
 *   - VVAULT API must be running and accessible
 *   - User must be authenticated (cookies/session)
 */

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CHATTY_DB_PATH = path.join(__dirname, '..', 'chatty.db');
const VVAULT_API_URL = process.env.VVAULT_API_URL || 'http://localhost:5173';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const constructFilter = args.find(arg => arg.startsWith('--construct='))?.split('=')[1];
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1];
const batchSize = batchSizeArg ? parseInt(batchSizeArg, 10) : BATCH_SIZE;

console.log('🔄 VVAULT Memory Migration Script');
console.log('==================================');
console.log(`Database: ${CHATTY_DB_PATH}`);
console.log(`API URL: ${VVAULT_API_URL}`);
console.log(`Dry Run: ${isDryRun ? 'YES' : 'NO'}`);
console.log(`Batch Size: ${batchSize}`);
if (constructFilter) {
  console.log(`Construct Filter: ${constructFilter}`);
}
console.log('');

// Check if database exists
if (!fs.existsSync(CHATTY_DB_PATH)) {
  console.error(`❌ Database not found: ${CHATTY_DB_PATH}`);
  process.exit(1);
}

// Open database
let db;
try {
  db = new Database(CHATTY_DB_PATH, { readonly: true });
  console.log('✅ Database opened successfully');
} catch (error) {
  console.error('❌ Failed to open database:', error.message);
  process.exit(1);
}

/**
 * Migrate vault_entries to VVAULT
 */
async function migrateVaultEntries() {
  console.log('\n📦 Migrating vault_entries...');
  
  let query = `
    SELECT id, construct_id, thread_id, kind, payload, ts, relevance_score, metadata
    FROM vault_entries
    WHERE 1=1
  `;
  const params = [];
  
  if (constructFilter) {
    query += ' AND construct_id = ?';
    params.push(constructFilter);
  }
  
  query += ' ORDER BY ts ASC';
  
  const stmt = db.prepare(query);
  const entries = stmt.all(...params);
  
  console.log(`Found ${entries.length} vault entries to migrate`);
  
  if (entries.length === 0) {
    return { migrated: 0, failed: 0, skipped: 0 };
  }
  
  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  
  // Process in batches
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1} (${batch.length} entries)...`);
    
    for (const entry of batch) {
      try {
        const payload = JSON.parse(entry.payload);
        const metadata = entry.metadata ? JSON.parse(entry.metadata) : {};
        
        // Determine context and response from payload
        let context = '';
        let response = '';
        
        if (payload.role === 'user') {
          context = payload.content || JSON.stringify(payload);
        } else if (payload.role === 'assistant') {
          response = payload.content || JSON.stringify(payload);
          context = metadata.context || 'Previous conversation';
        } else {
          context = `Message: ${entry.kind}`;
          response = payload.content || JSON.stringify(payload);
        }
        
        // Determine memory type based on age (7-day threshold)
        const ageDays = (Date.now() - entry.ts) / (1000 * 60 * 60 * 24);
        const memoryType = ageDays < 7 ? 'short-term' : 'long-term';
        
        if (isDryRun) {
          console.log(`  [DRY RUN] Would migrate: ${entry.construct_id} - ${entry.kind} (${memoryType})`);
          skipped++;
          continue;
        }
        
        // POST to VVAULT API
        const apiResponse = await fetch(`${VVAULT_API_URL}/api/vvault/identity/store`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            constructCallsign: entry.construct_id,
            context: context || 'Migrated entry',
            response: response || context,
            metadata: {
              timestamp: new Date(entry.ts).toISOString(),
              sessionId: entry.thread_id || entry.construct_id,
              source: 'migration',
              kind: entry.kind,
              memoryType,
              originalId: entry.id,
              relevanceScore: entry.relevance_score,
              ...metadata
            }
          })
        });
        
        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          console.error(`  ❌ Failed to migrate entry ${entry.id}: ${apiResponse.status} ${errorText}`);
          failed++;
        } else {
          const result = await apiResponse.json();
          if (result.duplicate) {
            console.log(`  ⏭️  Skipped duplicate entry ${entry.id}`);
            skipped++;
          } else {
            console.log(`  ✅ Migrated entry ${entry.id}`);
            migrated++;
          }
        }
      } catch (error) {
        console.error(`  ❌ Error migrating entry ${entry.id}:`, error.message);
        failed++;
      }
    }
  }
  
  return { migrated, failed, skipped };
}

/**
 * Migrate stm_buffer entries to VVAULT
 */
async function migrateSTMBuffer() {
  console.log('\n📦 Migrating stm_buffer...');
  
  let query = `
    SELECT construct_id, thread_id, message_id, role, content, ts, sequence
    FROM stm_buffer
    WHERE 1=1
  `;
  const params = [];
  
  if (constructFilter) {
    query += ' AND construct_id = ?';
    params.push(constructFilter);
  }
  
  query += ' ORDER BY ts ASC';
  
  const stmt = db.prepare(query);
  const entries = stmt.all(...params);
  
  console.log(`Found ${entries.length} STM buffer entries to migrate`);
  
  if (entries.length === 0) {
    return { migrated: 0, failed: 0, skipped: 0 };
  }
  
  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  
  // Process in batches
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1} (${batch.length} entries)...`);
    
    for (const entry of batch) {
      try {
        const context = entry.role === 'user' ? entry.content : '';
        const response = entry.role === 'assistant' ? entry.content : '';
        
        if (isDryRun) {
          console.log(`  [DRY RUN] Would migrate: ${entry.construct_id} - ${entry.role} (short-term)`);
          skipped++;
          continue;
        }
        
        // POST to VVAULT API
        const apiResponse = await fetch(`${VVAULT_API_URL}/api/vvault/identity/store`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            constructCallsign: entry.construct_id,
            context: context || `Message ${entry.role}`,
            response: response || context,
            metadata: {
              timestamp: new Date(entry.ts).toISOString(),
              sessionId: entry.thread_id || entry.construct_id,
              source: 'migration-stm',
              memoryType: 'short-term', // STM entries are always short-term
              messageId: entry.message_id,
              role: entry.role,
              sequence: entry.sequence
            }
          })
        });
        
        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          console.error(`  ❌ Failed to migrate STM entry ${entry.message_id}: ${apiResponse.status} ${errorText}`);
          failed++;
        } else {
          const result = await apiResponse.json();
          if (result.duplicate) {
            console.log(`  ⏭️  Skipped duplicate STM entry ${entry.message_id}`);
            skipped++;
          } else {
            console.log(`  ✅ Migrated STM entry ${entry.message_id}`);
            migrated++;
          }
        }
      } catch (error) {
        console.error(`  ❌ Error migrating STM entry ${entry.message_id}:`, error.message);
        failed++;
      }
    }
  }
  
  return { migrated, failed, skipped };
}

/**
 * Main migration function
 */
async function main() {
  try {
    console.log('Starting migration...\n');
    
    const vaultResults = await migrateVaultEntries();
    const stmResults = await migrateSTMBuffer();
    
    console.log('\n📊 Migration Summary');
    console.log('===================');
    console.log('Vault Entries:');
    console.log(`  ✅ Migrated: ${vaultResults.migrated}`);
    console.log(`  ❌ Failed: ${vaultResults.failed}`);
    console.log(`  ⏭️  Skipped: ${vaultResults.skipped}`);
    console.log('\nSTM Buffer:');
    console.log(`  ✅ Migrated: ${stmResults.migrated}`);
    console.log(`  ❌ Failed: ${stmResults.failed}`);
    console.log(`  ⏭️  Skipped: ${stmResults.skipped}`);
    console.log('\nTotal:');
    console.log(`  ✅ Migrated: ${vaultResults.migrated + stmResults.migrated}`);
    console.log(`  ❌ Failed: ${vaultResults.failed + stmResults.failed}`);
    console.log(`  ⏭️  Skipped: ${vaultResults.skipped + stmResults.skipped}`);
    
    if (isDryRun) {
      console.log('\n⚠️  This was a dry run. No data was actually migrated.');
      console.log('   Run without --dry-run to perform the actual migration.');
    } else {
      console.log('\n✅ Migration complete!');
      console.log('   Note: Original SQLite data has not been deleted.');
      console.log('   You may want to add a migrated_to_vvault flag to mark migrated entries.');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run migration
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

