#!/usr/bin/env node

/**
 * Cleanup duplicate files based on analysis results
 * - Deletes identical duplicates (safe to remove)
 * - Lists different files for manual review
 * - Preserves files where only numbered version exists
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load the analysis results
const analysisPath = path.join(projectRoot, 'duplicate-files-analysis.json');
if (!fs.existsSync(analysisPath)) {
  console.error('❌ Analysis file not found. Please run analyze-duplicate-files.js first.');
  process.exit(1);
}

const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));

console.log('🧹 DUPLICATE FILE CLEANUP');
console.log('='.repeat(80));
console.log();

// 1. Delete identical duplicates
console.log('🗑️  Step 1: Deleting identical duplicates...');
console.log('-'.repeat(80));

let deletedCount = 0;
let errorCount = 0;

for (const dup of analysis.identical) {
  try {
    const fullPath = path.join(projectRoot, dup.relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`  ✅ Deleted: ${dup.relativePath}`);
      deletedCount++;
    } else {
      console.log(`  ⚠️  Already gone: ${dup.relativePath}`);
    }
  } catch (error) {
    console.error(`  ❌ Error deleting ${dup.relativePath}: ${error.message}`);
    errorCount++;
  }
}

console.log();
console.log(`✅ Deleted ${deletedCount} identical duplicate files`);
if (errorCount > 0) {
  console.log(`⚠️  ${errorCount} errors encountered`);
}
console.log();

// 2. List different files for manual review
console.log('📋 Step 2: Files that need manual review (different content):');
console.log('-'.repeat(80));

if (analysis.different.length > 0) {
  const reviewPath = path.join(projectRoot, 'duplicate-files-review-needed.txt');
  const reviewLines = [];
  
  reviewLines.push('FILES WITH DIFFERENT CONTENT - MANUAL REVIEW REQUIRED');
  reviewLines.push('='.repeat(80));
  reviewLines.push('');
  reviewLines.push(`Total: ${analysis.different.length} files`);
  reviewLines.push('');
  
  for (const dup of analysis.different) {
    reviewLines.push(`File: ${dup.relativePath}`);
    reviewLines.push(`  Original: ${dup.originalRelativePath}`);
    reviewLines.push(`  Duplicate size: ${dup.duplicateSize} bytes`);
    reviewLines.push(`  Original size: ${dup.originalSize} bytes`);
    reviewLines.push(`  Size difference: ${dup.sizeDiff > 0 ? '+' : ''}${dup.sizeDiff} bytes`);
    reviewLines.push('');
    
    console.log(`  ⚠️  ${dup.relativePath}`);
    console.log(`     → Original: ${dup.originalRelativePath}`);
    console.log(`     → Size diff: ${dup.sizeDiff > 0 ? '+' : ''}${dup.sizeDiff} bytes`);
  }
  
  fs.writeFileSync(reviewPath, reviewLines.join('\n'));
  console.log();
  console.log(`📄 Review list saved to: ${reviewPath}`);
} else {
  console.log('  (none)');
}
console.log();

// 3. Summary of files preserved
console.log('🔒 Step 3: Files preserved (only numbered version exists):');
console.log('-'.repeat(80));
console.log(`  Total: ${analysis.onlyNumberedVersion.length} files`);
console.log('  These files have been preserved because their originals are missing.');
console.log('  They may be the only copy of the content.');
console.log();

// Final summary
console.log('='.repeat(80));
console.log('📊 CLEANUP SUMMARY');
console.log('='.repeat(80));
console.log(`✅ Deleted identical duplicates: ${deletedCount}`);
console.log(`⚠️  Files needing review: ${analysis.different.length}`);
console.log(`🔒 Files preserved: ${analysis.onlyNumberedVersion.length}`);
console.log();
console.log('✨ Cleanup complete!');
console.log();

