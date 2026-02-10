#!/usr/bin/env node
/**
 * Conversation Location Tracker
 * 
 * Tracks all conversation files in VVAULT and ensures they're discoverable by the frontend.
 * Run this script after any file moves or structural changes to verify conversations are still accessible.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VVAULT_ROOT = process.env.VVAULT_ROOT || path.join(__dirname, '../../vvault');
const LEDGER_FILE = path.join(__dirname, '../CONVERSATION_LOCATIONS_LEDGER.md');

// Expected locations where conversations should be found
const EXPECTED_PATTERNS = [
  // New structure: users/{shard}/{user_id}/constructs/{construct}/chatty/*.md
  /users\/shard_\d+\/[^/]+\/constructs\/[^/]+\/chatty\/.*\.md$/,
  // Legacy structure: {construct}/chatty/*.md (if still exists)
  /[^/]+\/chatty\/.*\.md$/,
];

// Patterns that readConversations.js looks for
const READ_PATTERNS = {
  chatty: /chatty\/.*\.md$/,
  chatgpt: /ChatGPT\/.*\.md$/,
  core: /chat_with_.*-001\.md$/,
};

async function findConversationFiles(rootDir) {
  const conversations = [];
  
  async function scanDirectory(dir, relativePath = '') {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath, relPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Check if this matches expected conversation patterns
          const matchesPattern = EXPECTED_PATTERNS.some(pattern => pattern.test(relPath));
          const matchesReadPattern = Object.values(READ_PATTERNS).some(pattern => pattern.test(relPath));
          
          if (matchesPattern || matchesReadPattern) {
            try {
              const content = await fs.readFile(fullPath, 'utf8');
              const hasImportMetadata = content.includes('IMPORT_METADATA');
              const hasMessages = content.includes('You said:') || content.includes('said:') || content.match(/##\s+\d{4}-\d{2}-\d{2}/);
              
              conversations.push({
                path: relPath,
                fullPath: fullPath,
                size: (await fs.stat(fullPath)).size,
                hasImportMetadata,
                hasMessages,
                lastModified: (await fs.stat(fullPath)).mtime,
              });
            } catch (error) {
              console.warn(`⚠️  Could not read ${fullPath}:`, error.message);
            }
          }
        }
      }
    } catch (error) {
      // Skip directories we can't access
      if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
        console.warn(`⚠️  Could not scan ${dir}:`, error.message);
      }
    }
  }
  
  await scanDirectory(rootDir);
  return conversations;
}

async function checkFrontendDiscoverability(conversations) {
  const issues = [];
  
  for (const conv of conversations) {
    // Check if file is in a location that readConversations.js can find
    const inChattyFolder = conv.path.includes('/chatty/');
    const inChatGPTFolder = conv.path.includes('/ChatGPT/');
    const inConstructsFolder = conv.path.includes('/constructs/');
    
    if (!inChattyFolder && !inChatGPTFolder) {
      issues.push({
        type: 'location',
        severity: 'high',
        file: conv.path,
        issue: 'File not in chatty/ or ChatGPT/ folder - may not be discoverable',
      });
    }
    
    if (!inConstructsFolder && conv.path.includes('/users/')) {
      issues.push({
        type: 'structure',
        severity: 'high',
        file: conv.path,
        issue: 'File in users/ but not in constructs/ folder - may not be discoverable',
      });
    }
    
    // Check if file has content
    if (!conv.hasMessages && conv.size < 100) {
      issues.push({
        type: 'content',
        severity: 'medium',
        file: conv.path,
        issue: 'File appears empty or has no messages',
      });
    }
  }
  
  return issues;
}

async function generateLedger(conversations, issues) {
  const timestamp = new Date().toISOString();
  const ledgerContent = `# Conversation Locations Ledger

**Last Updated**: ${timestamp}

## Summary

- **Total Conversations Found**: ${conversations.length}
- **Issues Detected**: ${issues.length}
- **VVAULT Root**: ${VVAULT_ROOT}

---

## All Conversation Files

${conversations.map((conv, idx) => `
### ${idx + 1}. \`${conv.path}\`

- **Full Path**: \`${conv.fullPath}\`
- **Size**: ${conv.size} bytes
- **Last Modified**: ${conv.lastModified.toISOString()}
- **Has Import Metadata**: ${conv.hasImportMetadata ? '✅' : '❌'}
- **Has Messages**: ${conv.hasMessages ? '✅' : '❌'}
- **Frontend Discoverable**: ${conv.path.includes('/chatty/') || conv.path.includes('/ChatGPT/') ? '✅' : '❌'}
`).join('\n')}

---

## Issues Detected

${issues.length === 0 ? '✅ No issues detected - all conversations are discoverable!' : issues.map((issue, idx) => `
### Issue ${idx + 1}: ${issue.type.toUpperCase()} (${issue.severity})

- **File**: \`${issue.file}\`
- **Problem**: ${issue.issue}
`).join('\n')}

---

## Expected Structure

Conversations should be located at:
\`\`\`
vvault/users/shard_{N}/{user_id}/constructs/{construct}-{callsign}/chatty/chat_with_{construct}-{callsign}.md
\`\`\`

Or for imported conversations:
\`\`\`
vvault/users/shard_{N}/{user_id}/constructs/{construct}-{callsign}/chatty/{conversation_title}.md
\`\`\`

---

## Frontend Discovery

The frontend discovers conversations via:
1. \`readConversations.js\` scans \`constructs/{construct}/chatty/\` folders
2. Files matching pattern: \`chat_with_*.md\` or any \`*.md\` in chatty folder
3. Files are parsed for IMPORT_METADATA and message content
4. Conversations are returned via \`GET /api/vvault/conversations\`
5. Frontend filters by runtime/constructId in \`Layout.tsx\`

---

**Generated by**: \`scripts/track-conversations.js\`
**Run Command**: \`node scripts/track-conversations.js\`
`;

  await fs.writeFile(LEDGER_FILE, ledgerContent, 'utf8');
  console.log(`✅ Ledger written to: ${LEDGER_FILE}`);
}

async function main() {
  console.log('🔍 Scanning VVAULT for conversation files...');
  console.log(`📁 VVAULT Root: ${VVAULT_ROOT}`);
  
  try {
    await fs.access(VVAULT_ROOT);
  } catch (error) {
    console.error(`❌ VVAULT_ROOT does not exist: ${VVAULT_ROOT}`);
    process.exit(1);
  }
  
  const conversations = await findConversationFiles(VVAULT_ROOT);
  console.log(`✅ Found ${conversations.length} conversation files`);
  
  const issues = await checkFrontendDiscoverability(conversations);
  
  if (issues.length > 0) {
    console.log(`\n⚠️  Found ${issues.length} issues:`);
    issues.forEach(issue => {
      console.log(`  [${issue.severity.toUpperCase()}] ${issue.file}: ${issue.issue}`);
    });
  } else {
    console.log('\n✅ All conversations are discoverable!');
  }
  
  await generateLedger(conversations, issues);
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`  Total conversations: ${conversations.length}`);
  console.log(`  With import metadata: ${conversations.filter(c => c.hasImportMetadata).length}`);
  console.log(`  With messages: ${conversations.filter(c => c.hasMessages).length}`);
  console.log(`  Issues: ${issues.length}`);
}

// Run if executed directly
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

export { findConversationFiles, checkFrontendDiscoverability };

