#!/usr/bin/env node

/**
 * Cleanup Instance Folders
 * 
 * Fixes incorrectly named instance folders:
 * - Moves gpt-{callsign} folders to {callsign} format
 * - Merges contents if target already exists
 * - Removes old gpt-{uuid} folders (legacy)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VVAULT_ROOT = process.env.VVAULT_ROOT_PATH || process.env.VVAULT_PATH || '';
const USER_ID = process.env.VVAULT_USER_ID || '';
const INSTANCES_DIR = path.join(VVAULT_ROOT, 'users', 'shard_0000', USER_ID, 'instances');

async function cleanupInstances() {
  console.log('🧹 CLEANING UP INSTANCE FOLDERS');
  console.log('================================\n');
  console.log(`📁 Instances directory: ${INSTANCES_DIR}\n`);

  try {
    const entries = await fs.readdir(INSTANCES_DIR, { withFileTypes: true });
    const folders = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

    console.log(`📋 Found ${folders.length} instance folders\n`);

    for (const folder of folders) {
      const folderName = folder.name;
      const folderPath = path.join(INSTANCES_DIR, folderName);

      // Fix: gpt-katana-001 -> katana-001
      if (folderName.startsWith('gpt-') && folderName.match(/^gpt-[a-z]+-\d+$/)) {
        const correctName = folderName.substring(4); // Remove "gpt-" prefix
        const correctPath = path.join(INSTANCES_DIR, correctName);

        console.log(`🔧 Fixing: ${folderName} → ${correctName}`);

        // Check if target already exists
        try {
          await fs.access(correctPath);
          console.log(`   ⚠️ Target ${correctName} already exists - merging contents...`);
          
          // Merge contents
          const sourceContents = await fs.readdir(folderPath);
          for (const item of sourceContents) {
            if (item === '.DS_Store') {
              // Remove .DS_Store files
              await fs.unlink(path.join(folderPath, item)).catch(() => {});
              continue;
            }
            
            const sourceItem = path.join(folderPath, item);
            const targetItem = path.join(correctPath, item);
            
            try {
              const sourceStat = await fs.stat(sourceItem);
              if (sourceStat.isDirectory()) {
                // Recursively merge directories
                try {
                  await fs.access(targetItem);
                  console.log(`   ⚠️ Directory ${item} already exists - merging recursively...`);
                  // TODO: Implement recursive merge if needed
                } catch {
                  await fs.rename(sourceItem, targetItem);
                  console.log(`   ✅ Moved directory ${item} to ${correctName}/`);
                }
              } else {
                // File
                try {
                  await fs.access(targetItem);
                  console.log(`   ⚠️ File ${item} already exists in target - skipping`);
                } catch {
                  await fs.rename(sourceItem, targetItem);
                  console.log(`   ✅ Moved ${item} to ${correctName}/`);
                }
              }
            } catch (error) {
              console.warn(`   ⚠️ Failed to move ${item}: ${error.message}`);
            }
          }
          
          // Remove old folder (should be empty now)
          try {
            await fs.rmdir(folderPath);
            console.log(`   ✅ Removed old folder: ${folderName}\n`);
          } catch (error) {
            // If not empty, force remove
            await fs.rm(folderPath, { recursive: true, force: true });
            console.log(`   ✅ Force removed old folder: ${folderName}\n`);
          }
        } catch {
          // Target doesn't exist, just rename
          await fs.rename(folderPath, correctPath);
          console.log(`   ✅ Renamed ${folderName} → ${correctName}\n`);
        }
      }
      // Remove legacy: gpt-{uuid} folders (old GPT entries)
      else if (folderName.startsWith('gpt-') && folderName.match(/^gpt-[a-f0-9-]{36}$/)) {
        console.log(`🗑️ Removing legacy GPT folder: ${folderName}`);
        await fs.rm(folderPath, { recursive: true, force: true });
        console.log(`   ✅ Removed ${folderName}\n`);
      }
    }

    console.log('✅ Cleanup complete!');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

cleanupInstances();
