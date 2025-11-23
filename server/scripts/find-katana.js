// Script to find Katana's AI ID
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up: scripts -> server, then chatty.db is in server/
const dbPath = path.join(__dirname, '..', 'chatty.db');

const db = new Database(dbPath);

// Search for Katana in both ais and gpts tables
console.log('🔍 Searching for Katana...\n');

// Search in ais table (if it exists)
let aisResults = [];
try {
  const aisStmt = db.prepare(`
    SELECT id, name, construct_callsign, user_id 
    FROM ais 
    WHERE LOWER(name) LIKE '%katana%' OR construct_callsign LIKE 'katana-%'
  `);
  aisResults = aisStmt.all();
} catch (error) {
  console.log('ℹ️  ais table does not exist or query failed:', error.message);
}

// Search in gpts table
const gptsStmt = db.prepare(`
  SELECT id, name, construct_callsign, user_id 
  FROM gpts 
  WHERE LOWER(name) LIKE '%katana%' OR construct_callsign LIKE 'katana-%'
`);
const gptsResults = gptsStmt.all();

console.log('📊 Results from ais table:');
if (aisResults.length > 0) {
  aisResults.forEach(ai => {
    console.log(`  - ID: ${ai.id}`);
    console.log(`    Name: ${ai.name}`);
    console.log(`    Construct Callsign: ${ai.construct_callsign}`);
    console.log(`    User ID: ${ai.user_id}\n`);
  });
} else {
  console.log('  (No results)\n');
}

console.log('📊 Results from gpts table:');
if (gptsResults.length > 0) {
  gptsResults.forEach(ai => {
    console.log(`  - ID: ${ai.id}`);
    console.log(`    Name: ${ai.name}`);
    console.log(`    Construct Callsign: ${ai.construct_callsign}`);
    console.log(`    User ID: ${ai.user_id}\n`);
  });
} else {
  console.log('  (No results)\n');
}

db.close();

