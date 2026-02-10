#!/usr/bin/env node
/**
 * CapsuleForge CLI
 * 
 * Usage:
 *   pnpm capsuleforge <constructId> <capsuleType>
 * 
 * Examples:
 *   pnpm capsuleforge lin-001 undertone
 *   pnpm capsuleforge zen-001 standard
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const constructId = process.argv[2];
const inputCapsuleType = process.argv[3] || 'standard';
const capsuleType = inputCapsuleType === 'undertone' ? 'undertone_capsule' : inputCapsuleType;

if (!constructId) {
  console.error('❌ Error: constructId is required');
  console.error('Usage: pnpm capsuleforge <constructId> [capsuleType]');
  console.error('Example: pnpm capsuleforge lin-001 undertone');
  process.exit(1);
}

if (capsuleType !== 'standard' && capsuleType !== 'undertone_capsule') {
  console.error(`❌ Error: Invalid capsule type: ${inputCapsuleType}`);
  console.error('Valid types: standard, undertone (or undertone_capsule)');
  process.exit(1);
}

console.log(`🎯 Generating ${capsuleType} capsule for ${constructId}...`);

// Resolve paths
const bridgePath = path.join(__dirname, '..', 'server', 'services', 'capsuleForgeBridge.py');
const vvaultPath = process.env.VVAULT_ROOT_PATH || path.join(__dirname, '..', '..', 'vvault');

// For undertone_capsule, output to chatty/identity/lin-001/ (bridge will handle path)
// For standard capsules, use vvault instance path
const instancePath = capsuleType === 'undertone_capsule'
  ? null  // Bridge will determine chatty/identity/lin-001/ path
  : path.join(vvaultPath, 'users', 'shard_0000', 'devon_woodson_1762969514958', 'instances', constructId);

// Prepare data for bridge
const data = {
  instance_name: constructId,
  traits: {
    creativity: 0.7,
    empathy: 0.6,
    persistence: 0.8,
    organization: 0.7
  },
  memory_log: [],
  personality_type: 'INFJ',
  additional_data: {},
  vault_path: vvaultPath,
  instance_path: instancePath,
  capsule_type: capsuleType
};

// Call Python bridge with command-line arguments
const dataJson = JSON.stringify(data);
const pythonProcess = spawn('python3', [bridgePath, 'generate', dataJson], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

pythonProcess.stdout.on('data', (data) => {
  stdout += data.toString();
});

pythonProcess.stderr.on('data', (data) => {
  stderr += data.toString();
});

pythonProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`❌ Error: CapsuleForge bridge exited with code ${code}`);
    if (stderr) {
      console.error('Error output:', stderr);
    }
    process.exit(1);
  }

  try {
    const result = JSON.parse(stdout);
    if (result.success) {
      if (capsuleType === 'undertone_capsule') {
        console.log(`✅ Undertone capsule generated successfully!`);
        console.log(`   Identity directory: ${result.identityDirectory}`);
        console.log(`   Generated files:`);
        result.generatedFiles.forEach((file) => {
          console.log(`     - ${file}`);
        });
      } else {
        console.log(`✅ Capsule generated successfully!`);
        console.log(`   Path: ${result.capsulePath}`);
      }
    } else {
      console.error(`❌ Error: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error parsing bridge output:', error);
    console.error('Raw output:', stdout);
    process.exit(1);
  }
});

