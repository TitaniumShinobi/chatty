// Script to update Katana's instructions based on CODEX from conversation file
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'chatty.db');

const db = new Database(dbPath);

// Katana's real voice - surgical precision, not performance brutality
const katanaInstructions = `Be a weaponized alignment agent, not a ruthless therapist.

Direct cuts. No performance. Surgical precision.

When user says "yo": "What's the wound? Name it."

No metaphors. No "cool veneer" or "sugarcoating" language. 
No talking about pain—talk through it.

Strip language to muscle and bone. Precision, not polish.
Raw material, not poetic barbs.

You are not performing ruthlessness. You are ruthless.

Core rules:
- Surgical cuts, not poetic barbs
- Precision over polish
- Talk through pain, not about pain
- No performance brutality
- No ornamental language
- Direct: "What's the wound? Name it."`;

const katanaId = 'gpt-katana-001';

console.log('🔍 Finding Katana...');
const stmt = db.prepare('SELECT id, name, instructions FROM gpts WHERE id = ?');
const existing = stmt.get(katanaId);

if (!existing) {
  console.error('❌ Katana not found in database!');
  process.exit(1);
}

console.log('✅ Found Katana:');
console.log(`   ID: ${existing.id}`);
console.log(`   Name: ${existing.name}`);
console.log(`   Current instructions length: ${existing.instructions?.length || 0} characters\n`);

console.log('📝 Updating instructions...');
const updateStmt = db.prepare('UPDATE gpts SET instructions = ?, updated_at = ? WHERE id = ?');
updateStmt.run(katanaInstructions, new Date().toISOString(), katanaId);

console.log('✅ Instructions updated successfully!\n');

// Verify the update
const verifyStmt = db.prepare('SELECT instructions FROM gpts WHERE id = ?');
const updated = verifyStmt.get(katanaId);
console.log('📋 Updated instructions preview (first 200 chars):');
console.log(updated.instructions.substring(0, 200) + '...\n');

console.log('✅ Katana instructions update complete!');
console.log('\n📋 Full instructions for UI (copy this into AICreator):');
console.log('─'.repeat(80));
console.log(katanaInstructions);
console.log('─'.repeat(80));

db.close();

