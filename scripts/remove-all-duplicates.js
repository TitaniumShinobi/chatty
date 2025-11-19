#!/usr/bin/env node

/**
 * Remove all remaining duplicate files:
 * 1. Files with both "2" and "3" versions that are identical - keep "2", delete "3"
 * 2. Files with originals that are identical - delete numbered versions
 * 3. Files with only numbered versions that are identical to each other - consolidate
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function calculateHash(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch {
    return null;
  }
}

function findNumberedFiles(dir) {
  const files = [];
  
  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(projectRoot, fullPath);
      
      // Skip node_modules, .git, and other ignored directories
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') {
        continue;
      }
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.includes(' 2.') || entry.name.includes(' 3.'))) {
        files.push(relativePath);
      }
    }
  }
  
  walk(dir);
  return files;
}

console.log('🔍 SCANNING FOR REMAINING DUPLICATES');
console.log('='.repeat(80));
console.log();

const numberedFiles = findNumberedFiles(projectRoot);
console.log(`Found ${numberedFiles.length} numbered files to analyze...\n`);

const toDelete = [];
const toRename = [];
const differentFiles = new Set(); // Track files that differ (from review list)

// Load the review list to avoid deleting files that differ
const reviewPath = path.join(projectRoot, 'duplicate-files-review-needed.txt');
if (fs.existsSync(reviewPath)) {
  const reviewContent = fs.readFileSync(reviewPath, 'utf-8');
  const reviewMatches = reviewContent.match(/File: (.+)/g);
  if (reviewMatches) {
    reviewMatches.forEach(match => {
      const filePath = match.replace('File: ', '').trim();
      differentFiles.add(filePath);
    });
  }
}

// Group files by base name
const fileGroups = {};
numberedFiles.forEach(file => {
  const baseName = file.replace(/ (2|3)(\.|$)/, '$2');
  if (!fileGroups[baseName]) {
    fileGroups[baseName] = [];
  }
  fileGroups[baseName].push(file);
});

let processed = 0;

for (const [baseName, numberedVersions] of Object.entries(fileGroups)) {
  const originalPath = path.join(projectRoot, baseName);
  const hasOriginal = fs.existsSync(originalPath);
  
  // Skip if this file is in the "different" review list
  if (numberedVersions.some(v => differentFiles.has(v))) {
    continue;
  }
  
  // Case 1: Has original - check if numbered versions are identical
  if (hasOriginal) {
    const originalHash = calculateHash(originalPath);
    if (!originalHash) continue;
    
    for (const numberedFile of numberedVersions) {
      const numberedPath = path.join(projectRoot, numberedFile);
      const numberedHash = calculateHash(numberedPath);
      
      if (numberedHash === originalHash) {
        toDelete.push(numberedFile);
      }
    }
  } 
  // Case 2: No original - check if "2" and "3" versions are identical
  else {
    const version2 = numberedVersions.find(v => v.includes(' 2.'));
    const version3 = numberedVersions.find(v => v.includes(' 3.'));
    
    if (version2 && version3) {
      const hash2 = calculateHash(path.join(projectRoot, version2));
      const hash3 = calculateHash(path.join(projectRoot, version3));
      
      if (hash2 && hash3 && hash2 === hash3) {
        // Keep "2", delete "3", rename "2" to original
        toDelete.push(version3);
        toRename.push({ from: version2, to: baseName });
      }
    } else if (version2) {
      // Only "2" exists - rename to original
      toRename.push({ from: version2, to: baseName });
    } else if (version3) {
      // Only "3" exists - rename to original
      toRename.push({ from: version3, to: baseName });
    }
  }
  
  processed++;
  if (processed % 50 === 0) {
    process.stdout.write(`  Processed ${processed}/${Object.keys(fileGroups).length} file groups...\r`);
  }
}

console.log(`\n  Processed ${processed} file groups\n`);

// Execute deletions
console.log('🗑️  DELETING DUPLICATES');
console.log('-'.repeat(80));

let deletedCount = 0;
let deleteErrors = 0;

for (const file of toDelete) {
  try {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`  ✅ Deleted: ${file}`);
      deletedCount++;
    }
  } catch (error) {
    console.error(`  ❌ Error deleting ${file}: ${error.message}`);
    deleteErrors++;
  }
}

console.log();

// Execute renames
console.log('🔄 RENAMING TO ORIGINALS');
console.log('-'.repeat(80));

let renamedCount = 0;
let renameErrors = 0;

for (const { from, to } of toRename) {
  try {
    const fromPath = path.join(projectRoot, from);
    const toPath = path.join(projectRoot, to);
    
    if (fs.existsSync(fromPath) && !fs.existsSync(toPath)) {
      fs.renameSync(fromPath, toPath);
      console.log(`  ✅ Renamed: ${from} → ${to}`);
      renamedCount++;
    } else if (fs.existsSync(toPath)) {
      // Original already exists, just delete the numbered version
      fs.unlinkSync(fromPath);
      console.log(`  🗑️  Deleted (original exists): ${from}`);
      deletedCount++;
    }
  } catch (error) {
    console.error(`  ❌ Error renaming ${from}: ${error.message}`);
    renameErrors++;
  }
}

console.log();
console.log('='.repeat(80));
console.log('📊 CLEANUP SUMMARY');
console.log('='.repeat(80));
console.log(`🗑️  Deleted duplicates: ${deletedCount}`);
console.log(`🔄 Renamed to originals: ${renamedCount}`);
if (deleteErrors > 0 || renameErrors > 0) {
  console.log(`❌ Errors: ${deleteErrors + renameErrors}`);
}
console.log();
console.log('✨ Cleanup complete!');
console.log();

