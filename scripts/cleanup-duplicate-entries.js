#!/usr/bin/env node
/**
 * Cleanup Duplicate Entries in VVAULT Markdown Files
 * 
 * Removes duplicate CONVERSATION_CREATED entries and duplicate welcome messages
 * from conversation markdown files.
 */

import fs from 'fs/promises';

const TARGET_FILE = process.argv[2] || process.env.CLEANUP_TARGET_FILE;

async function cleanupMarkdownFile(filePath) {
  try {
    console.log(`📖 Reading file: ${filePath}`);
    const content = await fs.readFile(filePath, 'utf8');
    
    const lines = content.split('\n');
    const cleanedLines = [];
    
    // Track what we've seen
    let seenFirstCreated = false;
    let seenWelcomeMessages = new Set();
    let inNovemberSection = false;
    
    // Patterns to identify duplicates
    const conversationCreatedPattern = /CONVERSATION_CREATED:/;
    const welcomeMessagePattern = /I'm Synth, your main AI companion in Chatty/;
    const novemberSectionPattern = /^## November/;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Detect when we enter the November 14 section (where duplicates are)
      if (novemberSectionPattern.test(trimmed)) {
        inNovemberSection = true;
        cleanedLines.push(line);
        continue;
      }
      
      // Only clean duplicates in the November section (preserve original conversation at top)
      if (!inNovemberSection) {
        cleanedLines.push(line);
        continue;
      }
      
      // Check if this is a CONVERSATION_CREATED entry
      if (conversationCreatedPattern.test(trimmed)) {
        // Keep only the first CONVERSATION_CREATED entry
        if (!seenFirstCreated) {
          seenFirstCreated = true;
          cleanedLines.push(line);
          console.log(`  ✅ Keeping first CONVERSATION_CREATED at line ${i + 1}`);
        } else {
          console.log(`  ⏭️  Skipping duplicate CONVERSATION_CREATED at line ${i + 1}`);
        }
        continue;
      }
      
      // Check if this is a welcome message
      if (welcomeMessagePattern.test(trimmed)) {
        // Extract the time from the previous line (timestamp line)
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        const timeMatch = prevLine.match(/\*\*(\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM)\s+EST)\s+-\s+Synth\*\*:/);
        const timeKey = timeMatch ? timeMatch[1] : trimmed.substring(0, 50);
        
        // Create a unique key: time + first 30 chars of message
        const messageKey = `${timeKey}:${trimmed.substring(0, 30)}`;
        
        // Skip if we've seen this exact welcome message before
        if (seenWelcomeMessages.has(messageKey)) {
          console.log(`  ⏭️  Skipping duplicate welcome message at line ${i + 1} (${timeKey})`);
          continue;
        }
        
        seenWelcomeMessages.add(messageKey);
        cleanedLines.push(line);
        continue;
      }
      
      // Keep all other lines (timestamps, actual conversation content, etc.)
      cleanedLines.push(line);
    }
    
    const cleanedContent = cleanedLines.join('\n');
    
    // Only write if content changed
    if (cleanedContent !== content) {
      // Create backup first
      const backupPath = `${filePath}.backup.${Date.now()}`;
      await fs.writeFile(backupPath, content, 'utf8');
      console.log(`💾 Created backup: ${backupPath}`);
      
      // Write cleaned content
      await fs.writeFile(filePath, cleanedContent, 'utf8');
      console.log(`✅ Cleaned file written: ${filePath}`);
      console.log(`📊 Removed ${content.split('\n').length - cleanedLines.length} duplicate lines`);
    } else {
      console.log(`✅ No duplicates found - file is already clean`);
    }
    
  } catch (error) {
    console.error(`❌ Error cleaning file: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Main execution
(async () => {
  console.log('🧹 Starting markdown cleanup...\n');
  
  if (!TARGET_FILE) {
    console.error('❌ Missing target markdown file.');
    console.error('Usage: node scripts/cleanup-duplicate-entries.js /path/to/chat_with_construct.md');
    console.error('Or set CLEANUP_TARGET_FILE=/path/to/chat_with_construct.md');
    process.exit(1);
  }
  
  await cleanupMarkdownFile(TARGET_FILE);
  
  console.log('\n✅ Cleanup complete!');
})();
