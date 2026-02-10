#!/usr/bin/env node

/**
 * Consolidate numbered files that have no originals:
 * - Rename "2" versions to originals (remove number)
 * - Delete "3" versions (since they're identical to "2")
 * - For files with only "3", rename to original
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Files to consolidate: [numbered2, numbered3, originalName]
const filesToConsolidate = [
  ['docs/DEBUG_BACKUPS 2.md', 'docs/DEBUG_BACKUPS 3.md', 'docs/DEBUG_BACKUPS.md'],
  ['docs/DOCUMENTATION_OVERLAP_ANALYSIS 2.md', 'docs/DOCUMENTATION_OVERLAP_ANALYSIS 3.md', 'docs/DOCUMENTATION_OVERLAP_ANALYSIS.md'],
  ['docs/README 2.md', 'docs/README 3.md', 'docs/README.md'],
  ['docs/legal/CHATTY_EUROPEAN_ELECTRONIC_COMMUNICATIONS_CODE_DISCLOSURE 2.md', 'docs/legal/CHATTY_EUROPEAN_ELECTRONIC_COMMUNICATIONS_CODE_DISCLOSURE 3.md', 'docs/legal/CHATTY_EUROPEAN_ELECTRONIC_COMMUNICATIONS_CODE_DISCLOSURE.md'],
  ['docs/legal/CHATTY_PRIVACY_NOTICE 2.md', 'docs/legal/CHATTY_PRIVACY_NOTICE 3.md', 'docs/legal/CHATTY_PRIVACY_NOTICE.md'],
  ['docs/legal/README 2.md', 'docs/legal/README 3.md', 'docs/legal/README.md'],
];

// Files with only "3" version
const filesWithOnly3 = [
  ['docs/legal/CHATTY_TERMS_OF_SERVICE 3.md', 'docs/legal/CHATTY_TERMS_OF_SERVICE.md'],
];

console.log('🔄 CONSOLIDATING NUMBERED-ONLY FILES');
console.log('='.repeat(80));
console.log();

let renamedCount = 0;
let deletedCount = 0;
let errorCount = 0;

// Process files with both "2" and "3" versions
for (const [file2, file3, original] of filesToConsolidate) {
  const path2 = path.join(projectRoot, file2);
  const path3 = path.join(projectRoot, file3);
  const pathOriginal = path.join(projectRoot, original);

  try {
    // Check if "2" version exists
    if (fs.existsSync(path2)) {
      // Rename "2" to original
      fs.renameSync(path2, pathOriginal);
      console.log(`  ✅ Renamed: ${file2} → ${original}`);
      renamedCount++;
    } else {
      console.log(`  ⚠️  Missing: ${file2}`);
    }

    // Delete "3" version (identical to "2")
    if (fs.existsSync(path3)) {
      fs.unlinkSync(path3);
      console.log(`  🗑️  Deleted: ${file3}`);
      deletedCount++;
    } else {
      console.log(`  ⚠️  Missing: ${file3}`);
    }
  } catch (error) {
    console.error(`  ❌ Error processing ${file2}: ${error.message}`);
    errorCount++;
  }
}

console.log();

// Process files with only "3" version
for (const [file3, original] of filesWithOnly3) {
  const path3 = path.join(projectRoot, file3);
  const pathOriginal = path.join(projectRoot, original);

  try {
    if (fs.existsSync(path3)) {
      fs.renameSync(path3, pathOriginal);
      console.log(`  ✅ Renamed: ${file3} → ${original}`);
      renamedCount++;
    } else {
      console.log(`  ⚠️  Missing: ${file3}`);
    }
  } catch (error) {
    console.error(`  ❌ Error processing ${file3}: ${error.message}`);
    errorCount++;
  }
}

console.log();
console.log('='.repeat(80));
console.log('📊 CONSOLIDATION SUMMARY');
console.log('='.repeat(80));
console.log(`✅ Renamed to originals: ${renamedCount}`);
console.log(`🗑️  Deleted duplicates: ${deletedCount}`);
if (errorCount > 0) {
  console.log(`❌ Errors: ${errorCount}`);
}
console.log();
console.log('✨ Consolidation complete!');
console.log();

