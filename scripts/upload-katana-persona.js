#!/usr/bin/env node
/**
 * Upload Katana persona file to VVAULT identity API
 * 
 * Usage: node scripts/upload-katana-persona.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const PERSONA_FILE = path.join(projectRoot, 'prompts', 'customAI', 'katana_lin.md');
const API_ENDPOINT = 'http://localhost:3000/api/vvault/identity/upload';
const CONSTRUCT_CALLSIGN = 'lin-001';

async function uploadKatanaPersona() {
  try {
    console.log('📤 Uploading Katana persona to VVAULT...');
    
    // Read the persona file
    const fileContent = await fs.readFile(PERSONA_FILE, 'utf8');
    console.log(`✅ Read persona file: ${PERSONA_FILE}`);
    
    // Create FormData-like structure for fetch
    const formData = new FormData();
    const blob = new Blob([fileContent], { type: 'text/markdown' });
    const file = new File([blob], 'katana_lin.md', { type: 'text/markdown' });
    formData.append('files', file);
    formData.append('constructCallsign', CONSTRUCT_CALLSIGN);
    
    // Note: This script requires authentication cookies
    // For now, it's better to upload via GPTCreator UI
    console.log('⚠️  This script requires authentication.');
    console.log('📝 To upload the persona file:');
    console.log('   1. Open Chatty and navigate to GPT Creator');
    console.log('   2. Ensure you have a GPT with constructCallsign "lin-001"');
    console.log('   3. Go to the Identity Files section');
    console.log('   4. Click "Upload Identity Files"');
    console.log('   5. Select: prompts/customAI/katana_lin.md');
    console.log('   6. The file will be uploaded to VVAULT at:');
    console.log(`      /instances/${CONSTRUCT_CALLSIGN}/identity/katana_lin-{hash}.md`);
    console.log('');
    console.log('✅ Persona file is ready at:', PERSONA_FILE);
    console.log('✅ GPTCreator will automatically load it when Lin mode is active');
    
  } catch (error) {
    console.error('❌ Failed to process persona file:', error);
    process.exit(1);
  }
}

uploadKatanaPersona();

