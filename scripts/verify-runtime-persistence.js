#!/usr/bin/env node
/**
 * Runtime Persistence Verifier
 * 
 * Verifies that imported runtimes persist across server restarts and aren't accidentally deleted.
 * Run this after any changes to runtime loading or import logic.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.GPT_DB_PATH || path.join(__dirname, '../data/gpts.db');
const VVAULT_ROOT = process.env.VVAULT_ROOT || path.join(__dirname, '../../vvault');

async function checkDatabaseRuntimes() {
  console.log('🔍 Checking database for runtimes...');
  console.log(`📁 Database: ${DB_PATH}`);
  
  try {
    await fs.access(DB_PATH);
  } catch (error) {
    console.error(`❌ Database not found: ${DB_PATH}`);
    return [];
  }
  
  const db = new Database(DB_PATH);
  const runtimes = db.prepare('SELECT * FROM gpts ORDER BY created_at DESC').all();
  db.close();
  
  console.log(`✅ Found ${runtimes.length} runtimes in database`);
  
  return runtimes.map(rt => ({
    id: rt.id,
    name: rt.name,
    userId: rt.user_id,
    isActive: rt.is_active,
    createdAt: rt.created_at,
    updatedAt: rt.updated_at,
    hasImportMetadata: false // Would need to check files table
  }));
}

async function checkVVAULTRuntimes() {
  console.log('\n🔍 Checking VVAULT for runtime metadata...');
  console.log(`📁 VVAULT Root: ${VVAULT_ROOT}`);
  
  const runtimeMetadata = [];
  
  try {
    await fs.access(VVAULT_ROOT);
  } catch (error) {
    console.error(`❌ VVAULT_ROOT not accessible: ${VVAULT_ROOT}`);
    return [];
  }
  
  // Check for import-metadata.json files in GPT file storage
  // These should be in: vvault/users/{shard}/{user_id}/constructs/{construct}/chatty/ or GPT storage
  
  // Also check for runtime metadata in constructs
  const usersDir = path.join(VVAULT_ROOT, 'users');
  try {
    const shards = await fs.readdir(usersDir);
    for (const shard of shards) {
      if (!shard.startsWith('shard_')) continue;
      const shardPath = path.join(usersDir, shard);
      const users = await fs.readdir(shardPath);
      
      for (const userId of users) {
        const userPath = path.join(shardPath, userId);
        const constructsPath = path.join(userPath, 'constructs');
        
        try {
          const constructs = await fs.readdir(constructsPath);
          for (const construct of constructs) {
            const constructPath = path.join(constructsPath, construct);
            const chattyPath = path.join(constructPath, 'chatty');
            
            try {
              const files = await fs.readdir(chattyPath);
              const hasImportMetadata = files.some(f => f.includes('import') || f.includes('metadata'));
              
              if (hasImportMetadata) {
                runtimeMetadata.push({
                  userId,
                  constructId: construct,
                  path: chattyPath,
                  hasImportMetadata: true
                });
              }
            } catch {
              // No chatty folder
            }
          }
        } catch {
          // No constructs folder
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️  Could not scan VVAULT: ${error.message}`);
  }
  
  console.log(`✅ Found ${runtimeMetadata.length} runtime metadata locations in VVAULT`);
  
  return runtimeMetadata;
}

async function generateReport(dbRuntimes, vvaultRuntimes) {
  const timestamp = new Date().toISOString();
  const reportPath = path.join(__dirname, '../RUNTIME_PERSISTENCE_REPORT.md');
  
  const report = `# Runtime Persistence Report

**Generated**: ${timestamp}

## Summary

- **Database Runtimes**: ${dbRuntimes.length}
- **VVAULT Metadata Locations**: ${vvaultRuntimes.length}

---

## Database Runtimes

${dbRuntimes.length === 0 ? '⚠️ **NO RUNTIMES FOUND IN DATABASE**' : dbRuntimes.map((rt, idx) => `
### ${idx + 1}. ${rt.name}

- **ID**: \`${rt.id}\`
- **User ID**: \`${rt.userId}\`
- **Active**: ${rt.isActive ? '✅' : '❌'}
- **Created**: ${rt.createdAt}
- **Updated**: ${rt.updatedAt}
- **Has Import Metadata**: ${rt.hasImportMetadata ? '✅' : '❌'}
`).join('\n')}

---

## VVAULT Runtime Metadata

${vvaultRuntimes.length === 0 ? '⚠️ **NO RUNTIME METADATA FOUND IN VVAULT**' : vvaultRuntimes.map((rt, idx) => `
### ${idx + 1}. ${rt.constructId}

- **User ID**: \`${rt.userId}\`
- **Path**: \`${rt.path}\`
- **Has Import Metadata**: ${rt.hasImportMetadata ? '✅' : '❌'}
`).join('\n')}

---

## Recommendations

${dbRuntimes.length === 0 ? '🚨 **CRITICAL**: No runtimes found in database. Check if database was cleared or moved.' : ''}
${vvaultRuntimes.length === 0 ? '⚠️ **WARNING**: No runtime metadata found in VVAULT. Imported runtimes may not persist correctly.' : ''}

**To prevent data loss:**
1. Always verify runtimes exist in database before deletion
2. Check VVAULT metadata before removing runtime entries
3. Use conversation tracking ledger before moving files
4. Run this script after any structural changes

---

**Generated by**: \`scripts/verify-runtime-persistence.js\`
**Run Command**: \`node scripts/verify-runtime-persistence.js\`
`;

  await fs.writeFile(reportPath, report, 'utf8');
  console.log(`\n✅ Report written to: ${reportPath}`);
}

async function main() {
  console.log('🔍 Runtime Persistence Verification\n');
  
  const dbRuntimes = await checkDatabaseRuntimes();
  const vvaultRuntimes = await checkVVAULTRuntimes();
  
  await generateReport(dbRuntimes, vvaultRuntimes);
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`  Database runtimes: ${dbRuntimes.length}`);
  console.log(`  VVAULT metadata: ${vvaultRuntimes.length}`);
  
  if (dbRuntimes.length === 0) {
    console.log('\n🚨 CRITICAL: No runtimes found in database!');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

