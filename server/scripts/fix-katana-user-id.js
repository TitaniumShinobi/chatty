#!/usr/bin/env node

/**
 * Fix Katana User ID
 * 
 * Updates Katana's user_id to match the current logged-in user's resolved VVAULT ID
 */

import { AIManager } from '../lib/aiManager.js';

const aiManager = AIManager.getInstance();

async function fixKatanaUserId() {
  console.log('🔧 FIXING KATANA USER ID');
  console.log('========================\n');
  
  // Get all Katana entries
  const allAIs = await aiManager.db.prepare('SELECT * FROM ais WHERE construct_callsign = ? OR name = ?').all('katana-001', 'Katana');
  
  if (allAIs.length === 0) {
    console.log('❌ No Katana entries found');
    process.exit(1);
  }
  
  console.log(`📋 Found ${allAIs.length} Katana entry/entries:\n`);
  allAIs.forEach((ai, i) => {
    console.log(`${i + 1}. ID: ${ai.id}`);
    console.log(`   Name: ${ai.name}`);
    console.log(`   Current User ID: ${ai.user_id}`);
    console.log(`   Construct Callsign: ${ai.construct_callsign || 'N/A'}\n`);
  });
  
  // Get target user ID from command line
  const targetUserId = process.argv[2];
  if (!targetUserId) {
    console.log('💡 Usage: node fix-katana-user-id.js <targetUserId>');
    console.log('💡 Example: node fix-katana-user-id.js devon_woodson_1762969514958');
    console.log('\n💡 To find your user ID, check browser console:');
    console.log('   fetch("/api/me").then(r => r.json()).then(d => console.log(d.user))');
    process.exit(1);
  }
  
  console.log(`🎯 Target User ID: ${targetUserId}\n`);
  
  // Update all Katana entries
  for (const ai of allAIs) {
    try {
      const stmt = aiManager.db.prepare('UPDATE ais SET user_id = ?, updated_at = ? WHERE id = ?');
      stmt.run(targetUserId, new Date().toISOString(), ai.id);
      console.log(`✅ Updated Katana ${ai.id} → user_id: ${targetUserId}`);
    } catch (error) {
      console.error(`❌ Failed to update ${ai.id}: ${error.message}`);
    }
  }
  
  console.log('\n🎉 Done! Refresh "My AIs" page to see Katana.');
}

fixKatanaUserId().catch(error => {
  console.error('❌ Failed:', error);
  process.exit(1);
});

