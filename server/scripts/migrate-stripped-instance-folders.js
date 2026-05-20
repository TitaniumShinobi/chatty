#!/usr/bin/env node

/**
 * One-time migration: copy contents of stripped instance folders into
 * suffixed folders (e.g. instances/zen/ → instances/zen-001/), then remove
 * the stripped dirs. Run only where such dirs exist.
 *
 * Stripped = folder name does not match -\\d+$ (e.g. zen, lin, katana).
 * Target = {name}-001 (e.g. zen-001). Per TRANSCRIPT_FILE_STRUCTURE_RUBRIC.
 *
 * Usage:
 *   VVAULT_ROOT=/path/to/vvault node server/scripts/migrate-stripped-instance-folders.js
 *   # Or from repo root with default VVAULT_ROOT from env
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VVAULT_ROOT = process.env.VVAULT_ROOT || process.env.VVAULT_ROOT_PATH || path.resolve(__dirname, '../../..', 'vvault');

/** True if folder name has no callsign suffix (e.g. zen, lin, katana) */
function isStrippedFolderName(name) {
  return /^[a-z0-9-]+$/.test(name) && !/-\d+$/.test(name);
}

/** Recursively copy srcDir into destDir (merge; existing files skipped) */
async function copyDirRecursive(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const srcPath = path.join(srcDir, ent.name);
    const destPath = path.join(destDir, ent.name);
    if (ent.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      try {
        await fs.access(destPath);
        // already exists, skip
      } catch {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

async function migrateStrippedInInstances(instancesDir) {
  const entries = await fs.readdir(instancesDir, { withFileTypes: true });
  const stripped = entries.filter(e => e.isDirectory() && isStrippedFolderName(e.name));
  if (stripped.length === 0) return;

  for (const dir of stripped) {
    const srcPath = path.join(instancesDir, dir.name);
    const targetName = `${dir.name}-001`;
    const destPath = path.join(instancesDir, targetName);

    console.log(`  Migrating: ${dir.name}/ → ${targetName}/`);
    await copyDirRecursive(srcPath, destPath);
    await fs.rm(srcPath, { recursive: true, force: true });
    console.log(`  Removed stripped folder: ${dir.name}/`);
  }
}

async function main() {
  console.log('migrate-stripped-instance-folders');
  console.log('VVAULT_ROOT:', VVAULT_ROOT);
  const usersRoot = path.join(VVAULT_ROOT, 'users');
  let total = 0;

  try {
    const shards = await fs.readdir(usersRoot, { withFileTypes: true });
    for (const shard of shards) {
      if (!shard.isDirectory() || !shard.name.startsWith('shard_')) continue;
      const shardPath = path.join(usersRoot, shard.name);
      const userIds = await fs.readdir(shardPath, { withFileTypes: true });
      for (const u of userIds) {
        if (!u.isDirectory() || u.name.startsWith('.')) continue;
        const instancesDir = path.join(shardPath, u.name, 'instances');
        try {
          await fs.access(instancesDir);
        } catch {
          continue;
        }
        const before = await fs.readdir(instancesDir, { withFileTypes: true });
        const strippedCount = before.filter(e => e.isDirectory() && isStrippedFolderName(e.name)).length;
        if (strippedCount === 0) continue;
        console.log(`\n${shard.name}/${u.name}/instances/`);
        await migrateStrippedInInstances(instancesDir);
        total += strippedCount;
      }
    }

    if (total === 0) {
      console.log('\nNo stripped instance folders found.');
    } else {
      console.log(`\nDone. Migrated ${total} stripped folder(s).`);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
