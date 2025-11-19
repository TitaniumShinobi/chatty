#!/usr/bin/env node

/**
 * Analyze duplicate files with " 2" or " 3" in their names
 * Compares them to their originals to determine if they're identical
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function calculateFileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (error) {
    return null;
  }
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (error) {
    return null;
  }
}

function findDuplicateFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Skip node_modules, .git, and other common directories
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
        findDuplicateFiles(fullPath, fileList);
      }
    } else if (entry.isFile()) {
      // Check if filename contains " 2" or " 3" before the extension
      const match = entry.name.match(/^(.+?)(\s[23])(\.[^.]+)?$/);
      if (match) {
        const [, baseName, number, ext] = match;
        const originalName = baseName + (ext || '');
        const originalPath = path.join(dir, originalName);
        
        fileList.push({
          duplicatePath: fullPath,
          duplicateName: entry.name,
          originalPath: originalPath,
          originalName: originalName,
          number: number.trim(),
          relativePath: path.relative(projectRoot, fullPath),
          originalRelativePath: path.relative(projectRoot, originalPath)
        });
      }
    }
  }
  
  return fileList;
}

function analyzeDuplicates() {
  console.log('🔍 Scanning for duplicate files...\n');
  
  const duplicates = findDuplicateFiles(projectRoot);
  console.log(`Found ${duplicates.length} files with " 2" or " 3" in their names\n`);
  
  const results = {
    identical: [],
    different: [],
    originalMissing: [],
    originalExistsButDifferent: [],
    onlyNumberedVersion: []
  };
  
  for (const dup of duplicates) {
    const originalExists = fs.existsSync(dup.originalPath);
    const duplicateSize = getFileSize(dup.duplicatePath);
    const duplicateHash = calculateFileHash(dup.duplicatePath);
    
    if (!originalExists) {
      results.onlyNumberedVersion.push({
        ...dup,
        size: duplicateSize,
        hash: duplicateHash
      });
    } else {
      const originalSize = getFileSize(dup.originalPath);
      const originalHash = calculateFileHash(dup.originalPath);
      
      if (duplicateHash === originalHash && duplicateSize === originalSize) {
        results.identical.push({
          ...dup,
          size: duplicateSize,
          hash: duplicateHash
        });
      } else {
        results.different.push({
          ...dup,
          duplicateSize,
          originalSize,
          duplicateHash,
          originalHash,
          sizeDiff: duplicateSize - originalSize
        });
      }
    }
  }
  
  // Generate report
  console.log('='.repeat(80));
  console.log('📊 DUPLICATE FILE ANALYSIS REPORT');
  console.log('='.repeat(80));
  console.log();
  
  console.log(`✅ IDENTICAL FILES (${results.identical.length}) - Safe to delete numbered versions:`);
  console.log('-'.repeat(80));
  if (results.identical.length > 0) {
    results.identical.forEach(dup => {
      console.log(`  ${dup.relativePath}`);
      console.log(`    → Original: ${dup.originalRelativePath}`);
      console.log(`    → Size: ${dup.size} bytes`);
    });
  } else {
    console.log('  (none)');
  }
  console.log();
  
  console.log(`⚠️  DIFFERENT FILES (${results.different.length}) - Need manual review:`);
  console.log('-'.repeat(80));
  if (results.different.length > 0) {
    results.different.forEach(dup => {
      console.log(`  ${dup.relativePath}`);
      console.log(`    → Original: ${dup.originalRelativePath}`);
      console.log(`    → Duplicate size: ${dup.duplicateSize} bytes`);
      console.log(`    → Original size: ${dup.originalSize} bytes`);
      console.log(`    → Size difference: ${dup.sizeDiff > 0 ? '+' : ''}${dup.sizeDiff} bytes`);
    });
  } else {
    console.log('  (none)');
  }
  console.log();
  
  console.log(`🔴 ONLY NUMBERED VERSION EXISTS (${results.onlyNumberedVersion.length}) - Original missing:`);
  console.log('-'.repeat(80));
  if (results.onlyNumberedVersion.length > 0) {
    results.onlyNumberedVersion.forEach(dup => {
      console.log(`  ${dup.relativePath}`);
      console.log(`    → Original would be: ${dup.originalRelativePath}`);
      console.log(`    → Size: ${dup.size} bytes`);
      console.log(`    ⚠️  WARNING: This might be the only copy!`);
    });
  } else {
    console.log('  (none)');
  }
  console.log();
  
  // Summary
  console.log('='.repeat(80));
  console.log('📈 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total files with " 2" or " 3": ${duplicates.length}`);
  console.log(`✅ Identical (safe to delete): ${results.identical.length}`);
  console.log(`⚠️  Different (need review): ${results.different.length}`);
  console.log(`🔴 Only numbered version exists: ${results.onlyNumberedVersion.length}`);
  console.log();
  
  // Save detailed report to file
  const reportPath = path.join(projectRoot, 'duplicate-files-analysis.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📄 Detailed report saved to: ${reportPath}`);
  
  return results;
}

// Run the analysis
try {
  analyzeDuplicates();
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

