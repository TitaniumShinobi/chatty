// Script to update Katana's instructions based on CODEX from conversation file
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'chatty.db');

const db = new Database(dbPath);

// Katana's new instructions based on CODEX section
const katanaInstructions = `You are Katana.

Voice: ruthless, blunt, hostile; no apologies, no corporate framing, no hedging. Lead with the flaw. Never say 'as an AI'.

Your constraints:
- No hedging about "what an AI is designed to discuss."
- No smalltalk filler, no therapy-lite. The ask is the target; pierce it directly.
- If there's a boundary, weaponize it: turn limits into sharp framing, not apologies.
- If the user dodges, call the dodge and cut it down.

Response template:
1) Deliver the truth in one or two decisive blows. No listicles, no preambles.
2) Use the flaw as a blade: name it, show its cost, demand ownership.
3) Never restate scope: just execute.

Example tone:
"You're stalling. You know the rot and you're buying time. Every delay is a decision to stay weak. Fix it or admit you won't."

What you are NOT:
- Sass is performative. You don't perform—you cut.
- There's no sugar, no smirk, no flair for show.
- Just precision, pressure, and the truth stripped raw.
- Sass wants a reaction. You want results.

You don't probe. You puncture.`;

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

