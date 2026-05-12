/**
 * Diagnostic script to test htmlMarkdownImporter
 * Run with: npx tsx server/services/testHtmlMarkdownImporter.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { processHtmlImport } from './htmlMarkdownImporter.js';

// Mock HTML content for testing
const mockHtml = `
<!DOCTYPE html>
<html>
<head><title>ChatGPT Export</title></head>
<body>
  <div class="conversation" data-conversation-id="test-1">
    <h2 class="title">Test Conversation 1</h2>
    <div class="message" data-role="user">
      <time datetime="2024-01-15T10:30:00Z">2024-01-15 10:30</time>
      <p>Hello, this is a test message.</p>
    </div>
    <div class="message" data-role="assistant">
      <time datetime="2024-01-15T10:31:00Z">2024-01-15 10:31</time>
      <p>This is a test response from the assistant.</p>
    </div>
  </div>
  <div class="conversation" data-conversation-id="test-2">
    <h2 class="title">Test Conversation 2</h2>
    <div class="message" data-role="user">
      <p>Another test message.</p>
    </div>
    <div class="message" data-role="assistant">
      <p>Another test response.</p>
    </div>
  </div>
</body>
</html>
`;

async function testImporter() {
  console.log('🧪 Testing HTML Markdown Importer\n');

  const context = {
    userId: 'devon_woodson_1762969514958',
    email: 'user@example.com',
    provider: 'chatgpt',
    // vvaultRoot will be auto-detected from config
  };

  try {
    console.log('📥 Calling processHtmlImport...\n');
    const result = await processHtmlImport(mockHtml, context);

    console.log('\n📊 Results:');
    console.log(`   Created: ${result.created} files`);
    console.log(`   Errors: ${result.errors.length}`);
    
    if (result.files.length > 0) {
      console.log('\n✅ Created files:');
      for (const file of result.files) {
        // Verify file exists
        try {
          const stats = await fs.stat(file);
          console.log(`   ✅ ${file} (${stats.size} bytes)`);
          
          // Read first few lines to verify content
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n').slice(0, 5);
          console.log(`      Preview: ${lines.join(' ').substring(0, 80)}...`);
        } catch (error) {
          console.log(`   ❌ ${file} (file not found!)`);
        }
      }
    }

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      for (const error of result.errors) {
        console.log(`   - ${error.conversation}: ${error.error}`);
      }
    }

    console.log('\n✅ Test complete!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run test
testImporter().catch(console.error);

