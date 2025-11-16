#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

const VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/VVAULT';
const USERS_DIR = path.join(VVAULT_ROOT, 'users');

async function addCallsigns() {
  const explicitTargets = process.argv.slice(2);
  let constructs = new Set(explicitTargets.map(name => name.toLowerCase()));

  if (constructs.size === 0) {
    constructs = await discoverConstructsFromSessions();
    if (constructs.size === 0) {
      console.log('ℹ️ [Callsigns] No constructs detected that require renaming.');
      return;
    }
  }

  for (const construct of constructs) {
    if (/-\d{3,}$/i.test(construct)) {
      console.log(`✅ [Callsigns] ${construct} already includes a callsign.`);
      continue;
    }

    const currentPath = path.join(VVAULT_ROOT, construct);
    const exists = await existsAsync(currentPath);
    if (!exists) {
      console.warn(`⚠️ [Callsigns] Skipping ${construct} (no directory at ${currentPath}).`);
      continue;
    }

    const targetName = `${construct}-001`;
    const targetPath = path.join(VVAULT_ROOT, targetName);
    const targetExists = await existsAsync(targetPath);
    if (targetExists) {
      console.warn(`⚠️ [Callsigns] Destination ${targetName} already exists. Skipping rename.`);
      continue;
    }

    await fs.rename(currentPath, targetPath);
    console.log(`🏷️  [Callsigns] ${construct} → ${targetName}`);
  }
}

async function discoverConstructsFromSessions() {
  const constructs = new Set();
  const userEntries = await safeReaddir(USERS_DIR);

  for (const userEntry of userEntries) {
    if (!userEntry.isDirectory()) continue;
    const transcriptsDir = path.join(USERS_DIR, userEntry.name, 'transcripts');
    const sessionEntries = await safeReaddir(transcriptsDir);
    for (const sessionEntry of sessionEntries) {
      if (!sessionEntry.isDirectory()) continue;
      const prefix = sessionEntry.name.split('_')[0];
      if (prefix && !/-\d{3,}$/.test(prefix)) {
        constructs.add(prefix.toLowerCase());
      }
    }
  }

  console.log(`🔍 [Callsigns] Detected constructs from legacy sessions: ${Array.from(constructs).join(', ') || 'none'}`);
  return constructs;
}

async function safeReaddir(dirPath) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function existsAsync(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

addCallsigns().catch(error => {
  console.error('❌ [Callsigns] Failed to apply construct callsigns:', error);
  process.exitCode = 1;
});
