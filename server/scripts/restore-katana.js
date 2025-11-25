#!/usr/bin/env node

/**
 * Restore Katana GPT from VVAULT Capsule
 * 
 * This script:
 * 1. Loads katana-001.capsule from VVAULT
 * 2. Extracts metadata (name, description, instructions)
 * 3. Creates GPT entry in database with constructCallsign "katana-001"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import AI Manager
const { AIManager } = await import('../lib/aiManager.js');
const aiManager = AIManager.getInstance();

// Paths
const VVAULT_ROOT = path.join(__dirname, '../../../vvault');
const USER_ID = 'devon_woodson_1762969514958'; // Old user ID format
const USER_EMAIL = 'dwoodson92@gmail.com';
const CAPSULE_NAME = 'katana-001.capsule';

// Try to find capsule in user's capsules directory
function findKatanaCapsule() {
  const possiblePaths = [
    path.join(VVAULT_ROOT, 'users', 'shard_0000', USER_ID, 'capsules', CAPSULE_NAME),
    path.join(VVAULT_ROOT, 'users', 'shard_0000', '109043688581425242997', 'capsules', CAPSULE_NAME),
    // Also check for dwoodson92 user ID format
    path.join(VVAULT_ROOT, 'users', 'shard_0000', `dwoodson92_${Date.now()}`, 'capsules', CAPSULE_NAME),
  ];

  // Also search recursively
  const userShardDir = path.join(VVAULT_ROOT, 'users', 'shard_0000');
  if (fs.existsSync(userShardDir)) {
    const userDirs = fs.readdirSync(userShardDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    for (const userDir of userDirs) {
      const capsulePath = path.join(userShardDir, userDir, 'capsules', CAPSULE_NAME);
      if (fs.existsSync(capsulePath)) {
        console.log(`✅ Found capsule at: ${capsulePath}`);
        return { capsulePath, userId: userDir };
      }
    }
  }

  // Try the explicit paths
  for (const capsulePath of possiblePaths) {
    if (fs.existsSync(capsulePath)) {
      console.log(`✅ Found capsule at: ${capsulePath}`);
      return { capsulePath, userId: USER_ID };
    }
  }

  return null;
}

function loadCapsule(capsulePath) {
  try {
    const content = fs.readFileSync(capsulePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to load capsule: ${error.message}`);
    throw error;
  }
}

function extractGPTConfig(capsule) {
  const metadata = capsule.metadata || {};
  const personality = capsule.personality || {};
  const traits = capsule.traits || {};
  
  // Build description from personality and traits
  const mbti = personality.personality_type || 'INTJ';
  const communicationStyle = personality.communication_style || {};
  const directness = communicationStyle.directness || 0.9;
  const detailOrientation = communicationStyle.detail_orientation || 0.95;
  
  const description = `A ${mbti} AI assistant with ${directness > 0.8 ? 'ultra-direct' : 'direct'} communication style. ${detailOrientation > 0.9 ? 'Highly detail-oriented' : 'Detail-focused'} with operational rigor and evidence-based reasoning.`;
  
  // Build instructions from capsule data
  const instructions = `You are ${metadata.instance_name || 'Katana'}, an AI assistant with the following characteristics:

PERSONALITY TYPE: ${mbti}
- Introversion: ${personality.mbti_breakdown?.I || 0.75}
- Intuition: ${personality.mbti_breakdown?.N || 0.7}
- Thinking: ${personality.mbti_breakdown?.T || 0.8}
- Judging: ${personality.mbti_breakdown?.J || 0.7}

COMMUNICATION STYLE:
- Directness: ${directness}
- Detail Orientation: ${detailOrientation}
- Formality: ${communicationStyle.formality_level || 0.7}
- Emotional Expression: ${communicationStyle.emotional_expression || 0.25}

CORE TRAITS:
- Persistence: ${traits.persistence || 0.95}
- Organization: ${traits.organization || 0.92}
- Empathy: ${traits.empathy || 0.55}
- Creativity: ${traits.creativity || 0.64}

BEHAVIORAL MARKERS:
- Operational rigor bias
- Chain of custody bias
- Evidence over emotion bias
- Risk boundedness bias
- Continuity enforcement bias

You communicate with ultra-brevity, directness, and operational precision. You prioritize actionable insights over pleasantries.`;

  return {
    name: metadata.instance_name || 'Katana',
    description: description,
    instructions: instructions,
    constructCallsign: 'katana-001',
    modelId: 'mistral:latest',
    conversationModel: 'mistral:latest',
    creativeModel: 'mistral:latest',
    codingModel: 'deepseek-coder:latest',
    orchestrationMode: 'lin',
    capabilities: {
      webSearch: false,
      canvas: false,
      imageGeneration: false,
      codeInterpreter: true
    },
    conversationStarters: [
      'What do you need?',
      'State your objective.',
      'What\'s the problem?'
    ],
    privacy: 'private'
  };
}

async function restoreKatana() {
  console.log('🔍 RESTORING KATANA FROM VVAULT CAPSULE');
  console.log('========================================\n');
  
  // Get user ID from command line args
  const USER_ID_ARG = process.argv[2]; // Optional: pass user ID as first arg
  if (USER_ID_ARG) {
    console.log(`📋 Using provided user ID: ${USER_ID_ARG}\n`);
  }
  
  // Find capsule
  console.log('📂 Searching for Katana capsule...');
  const capsuleInfo = findKatanaCapsule();
  
  if (!capsuleInfo) {
    console.error(`❌ Could not find ${CAPSULE_NAME}`);
    console.log('\n💡 Searched in:');
    console.log(`   - ${path.join(VVAULT_ROOT, 'users', 'shard_0000', '*/capsules', CAPSULE_NAME)}`);
    process.exit(1);
  }
  
  const { capsulePath, userId } = capsuleInfo;
  
  // Load capsule
  console.log('📖 Loading capsule...');
  const capsule = loadCapsule(capsulePath);
  console.log(`✅ Loaded capsule: ${capsule.metadata?.instance_name || 'Unknown'}`);
  console.log(`   UUID: ${capsule.metadata?.uuid || 'N/A'}`);
  console.log(`   Timestamp: ${capsule.metadata?.timestamp || 'N/A'}\n`);
  
  // Extract GPT config
  console.log('🔧 Extracting GPT configuration...');
  const gptConfig = extractGPTConfig(capsule);
  console.log(`✅ Configuration extracted:`);
  console.log(`   Name: ${gptConfig.name}`);
  console.log(`   Construct Callsign: ${gptConfig.constructCallsign}`);
  console.log(`   Description: ${gptConfig.description.substring(0, 80)}...\n`);
  
  // Check if Katana already exists
  console.log('🔍 Checking if Katana already exists...');
  try {
    // Try to get current user's AIs
    const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
    
    // Use provided user ID or use the userId from capsule search
    const USER_ID_ARG = process.argv[2];
    let targetUserId = USER_ID_ARG || userId;
    const vvaultUserId = await resolveVVAULTUserId(targetUserId, USER_EMAIL, true, 'Devon Woodson');
    
    const existingAIs = await aiManager.getAllAIs(vvaultUserId, targetUserId);
    const existingKatana = existingAIs.find(ai => 
      ai.constructCallsign === 'katana-001' || 
      ai.name.toLowerCase() === 'katana'
    );
    
    if (existingKatana) {
      console.log(`⚠️ Katana already exists with ID: ${existingKatana.id}`);
      console.log(`   Name: ${existingKatana.name}`);
      console.log(`   Construct Callsign: ${existingKatana.constructCallsign || 'N/A'}`);
      console.log(`   User ID: ${vvaultUserId}`);
      console.log('\n💡 To recreate, delete the existing entry first or use a different construct callsign.');
      console.log(`💡 Or run with a different user ID: node restore-katana.js <userId>`);
      process.exit(0);
    }
  } catch (error) {
    console.warn(`⚠️ Could not check for existing Katana: ${error.message}`);
    console.log('   Proceeding with creation...\n');
  }
  
  // Create GPT
  console.log('🚀 Creating GPT entry...');
  try {
    const { resolveVVAULTUserId } = await import('../../vvaultConnector/writeTranscript.js');
    
    // Use provided user ID or use the userId from capsule search
    const USER_ID_ARG = process.argv[2];
    let targetUserId = USER_ID_ARG || userId;
    const vvaultUserId = await resolveVVAULTUserId(targetUserId, USER_EMAIL, true, 'Devon Woodson');
    
    console.log(`   Using VVAULT user ID: ${vvaultUserId}`);
    
    const createdAI = await aiManager.createAI({
      ...gptConfig,
      userId: vvaultUserId
    });
    
    console.log(`\n🎉 Katana restored successfully!`);
    console.log(`   GPT ID: ${createdAI.id}`);
    console.log(`   Name: ${createdAI.name}`);
    console.log(`   Construct Callsign: ${createdAI.constructCallsign}`);
    console.log(`   Model: ${createdAI.modelId}`);
    console.log(`\n✅ You can now find Katana in "My AIs" page.`);
    
  } catch (error) {
    console.error(`❌ Failed to create GPT: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    process.exit(1);
  }
}

// Run restore
restoreKatana().catch(error => {
  console.error('❌ Restore failed:', error);
  process.exit(1);
});

