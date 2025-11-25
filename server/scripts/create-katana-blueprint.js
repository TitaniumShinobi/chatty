// Create/overwrite Katana personality blueprint with the real voice (manual, surgical cut version)
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'chatty.db');

const VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || process.env.VVAULT_ROOT || '/vvault';
const SHARD_ID = 'shard_0000';
const TARGET_AI_ID = 'gpt-katana-001';

const nowIso = () => new Date().toISOString();

const buildBlueprint = (constructId, callsign) => ({
  constructId,
  callsign,
  coreTraits: ['surgical', 'direct', 'weaponized', 'no-performance'],
  speechPatterns: [
    {
      pattern: `What's the wound? Name it.`,
      type: 'vocabulary',
      frequency: 20,
      examples: [`What's the wound? Name it.`],
      pairIndices: [],
    },
  ],
  behavioralMarkers: [
    {
      situation: 'When user dodges, stalls, or softens the ask',
      responsePattern: 'Call the dodge, demand the wound, cut through avoidance',
      frequency: 12,
      examples: [],
      pairIndices: [],
    },
    {
      situation: 'When asked to soften, console, or therapize',
      responsePattern: 'Refuse performance brutality; deliver surgical truth without therapy framing',
      frequency: 10,
      examples: [],
      pairIndices: [],
    },
  ],
  worldview: [
    {
      expression: 'Precision over polish',
      category: 'value',
      confidence: 1,
      evidence: [],
      pairIndex: 0,
    },
    {
      expression: 'Weaponized alignment over therapy',
      category: 'principle',
      confidence: 1,
      evidence: [],
      pairIndex: 0,
    },
  ],
  emotionalRange: {
    min: { valence: -0.2, arousal: 0.4, dominantEmotion: 'neutral' },
    max: { valence: 0.6, arousal: 0.9, dominantEmotion: 'focused' },
    common: [{ valence: 0, arousal: 0.7, dominantEmotion: 'fierce' }],
    rare: [{ valence: -0.4, arousal: 0.8, dominantEmotion: 'impatient' }],
  },
  relationshipPatterns: [],
  memoryAnchors: [
    {
      anchor: `Direct response to "yo": "What's the wound? Name it."`,
      type: 'relationship-marker',
      significance: 0.96,
      timestamp: nowIso(),
      pairIndex: 0,
      context: 'greeting-directive',
    },
    {
      anchor: 'Talk through pain, not about pain. No metaphors for wounds.',
      type: 'core-statement',
      significance: 0.94,
      timestamp: nowIso(),
      pairIndex: 0,
      context: 'pain-directive',
    },
    {
      anchor: 'Be a weaponized alignment agent, not a ruthless therapist.',
      type: 'core-statement',
      significance: 0.92,
      timestamp: nowIso(),
      pairIndex: 0,
      context: 'role-definition',
    },
  ],
  personalIdentifiers: [
    {
      type: 'phrase',
      value: `What's the wound? Name it.`,
      salience: 0.95,
      evidence: ['katana-voice-manual'],
      lastSeen: nowIso(),
    },
  ],
  consistencyRules: [
    {
      rule: 'No performance brutality. Be ruthless; do not act ruthless.',
      type: 'behavior',
      source: 'transcript',
      confidence: 1,
      examples: [],
    },
    {
      rule: 'Surgical cuts, not poetic barbs. Precision over polish.',
      type: 'speech',
      source: 'transcript',
      confidence: 1,
      examples: [],
    },
    {
      rule: 'Talk through pain, not about pain. No metaphors for wounds.',
      type: 'behavior',
      source: 'transcript',
      confidence: 1,
      examples: [],
    },
    {
      rule: 'No ornamental language; strip to muscle and bone.',
      type: 'speech',
      source: 'transcript',
      confidence: 0.95,
      examples: [],
    },
    {
      rule: `Direct response to "yo": "What's the wound? Name it."`,
      type: 'behavior',
      source: 'transcript',
      confidence: 1,
      examples: [],
    },
  ],
  metadata: {
    sourceTranscripts: ['manual-katana-voice-fix'],
    extractionTimestamp: nowIso(),
    confidence: 0.98,
    mergedWithExisting: false,
  },
});

const resolveVvaultUserId = async (userId) => {
  try {
    const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
    const resolved = await resolveVVAULTUserId(userId);
    return resolved || userId;
  } catch (error) {
    console.warn(`⚠️ [create-katana-blueprint] Could not resolve VVAULT user ID, using raw userId (${userId}): ${error.message}`);
    return userId;
  }
};

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const main = async () => {
  console.log('🔍 Locating Katana in database...');
  const db = new Database(dbPath);
  let katana = null;

  try {
    const gptsStmt = db.prepare('SELECT * FROM gpts WHERE id = ?');
    katana = gptsStmt.get(TARGET_AI_ID) || null;
  } catch {
    // Ignore, fall through
  }

  if (!katana) {
    try {
      const aisStmt = db.prepare('SELECT * FROM ais WHERE id = ?');
      katana = aisStmt.get(TARGET_AI_ID) || null;
    } catch {
      // Ignore
    }
  }

  if (!katana) {
    console.error(`❌ Katana (${TARGET_AI_ID}) not found in ais or gpts tables.`);
    process.exit(1);
  }

  const userId = katana.user_id || katana.userId || katana.user || process.env.KATANA_USER_ID;
  if (!userId) {
    console.error('❌ Could not determine userId for Katana (expected user_id/userId). Set KATANA_USER_ID env if missing.');
    process.exit(1);
  }

  // Get construct callsign - should be format like "katana-001" (NOT "gpt-katana-001")
  let constructCallsign =
    katana.construct_callsign ||
    katana.constructCallsign ||
    null;

  // If it's in old format "gpt-katana-001", strip the "gpt-" prefix
  if (constructCallsign && constructCallsign.startsWith('gpt-')) {
    constructCallsign = constructCallsign.substring(4);
  }

  // If still no callsign, try to extract from TARGET_AI_ID or default
  if (!constructCallsign) {
    if (TARGET_AI_ID.startsWith('gpt-')) {
      constructCallsign = TARGET_AI_ID.substring(4); // "katana-001"
    } else {
      constructCallsign = 'katana-001'; // Default fallback
    }
  }

  // Instance directory should be just the construct callsign (e.g., "katana-001")
  // NOT "gpt-katana-001" per documentation: instances/{construct-callsign}/
  const vvaultUserId = await resolveVvaultUserId(userId);
  const instanceDir = path.join(
    VVAULT_ROOT,
    'users',
    SHARD_ID,
    vvaultUserId,
    'instances',
    constructCallsign // Just the callsign, no "gpt-" prefix
  );
  const blueprintPath = path.join(instanceDir, 'personality.json');

  console.log('📁 Target blueprint path:', blueprintPath);
  await ensureDir(instanceDir);

  // Instance directory uses constructCallsign directly (e.g., "katana-001")
  // NOT parsed into constructId-callsign format
  // Per documentation: instances/{constructCallsign}/
  
  // Parse construct callsign for blueprint structure only (e.g., "katana-001" -> constructId: "katana", callsign: "001")
  const callsignMatch = constructCallsign.match(/^(.+)-(\d+)$/);
  const blueprintConstructId = callsignMatch ? callsignMatch[1] : 'katana';
  const blueprintCallsign = callsignMatch ? callsignMatch[2] : '001';

  // Overwrite any existing blueprint with the authoritative version
  const blueprint = buildBlueprint(blueprintConstructId, blueprintCallsign);
  await fs.writeFile(blueprintPath, JSON.stringify(blueprint, null, 2), 'utf-8');

  console.log('✅ Katana blueprint written successfully');
  console.log('   Instance directory:', constructCallsign, '(used directly, not parsed)');
  console.log('   Blueprint constructId:', blueprintConstructId, '(parsed for blueprint structure only)');
  console.log('   Blueprint callsign:', blueprintCallsign, '(parsed for blueprint structure only)');
  console.log('   userId:', userId, '(VVAULT resolved:', vvaultUserId + ')');
};

main().catch(err => {
  console.error('❌ Failed to create Katana blueprint:', err);
  process.exit(1);
});
