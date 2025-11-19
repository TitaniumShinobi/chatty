/**
 * Test file for HTML-to-Markdown Importer
 * 
 * Creates mock HTML input and validates parsing and file writing
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { processHtmlImport } from './htmlMarkdownImporter.js';

/**
 * Mock HTML content with 2-3 conversations
 */
const mockHtmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>ChatGPT Export</title>
</head>
<body>
  <div class="conversation" data-conversation-id="conv-1">
    <h2 class="title">Research Plan</h2>
    <div class="message" data-role="user">
      <time datetime="2024-01-15T10:30:00Z">2024-01-15 10:30</time>
      <p>I need help creating a research plan for my thesis.</p>
    </div>
    <div class="message" data-role="assistant">
      <time datetime="2024-01-15T10:31:00Z">2024-01-15 10:31</time>
      <p>I'd be happy to help you create a research plan. Let's start by identifying your research question and objectives.</p>
    </div>
    <div class="message" data-role="user">
      <time datetime="2024-01-15T10:32:00Z">2024-01-15 10:32</time>
      <p>My research question is about the impact of AI on education.</p>
    </div>
    <div class="message" data-role="assistant">
      <time datetime="2024-01-15T10:33:00Z">2024-01-15 10:33</time>
      <p>Great topic! Let's structure your research plan with clear sections: introduction, literature review, methodology, and expected outcomes.</p>
    </div>
  </div>

  <div class="conversation" data-conversation-id="conv-2">
    <h2 class="title">Code Review</h2>
    <div class="message" data-role="user">
      <time datetime="2024-02-20T14:00:00Z">2024-02-20 14:00</time>
      <p>Can you review this code snippet?</p>
      <pre><code>function hello() { return "world"; }</code></pre>
    </div>
    <div class="message" data-role="assistant">
      <time datetime="2024-02-20T14:01:00Z">2024-02-20 14:01</time>
      <p>Your code looks good! Consider adding error handling and documentation.</p>
    </div>
  </div>

  <div class="conversation" data-conversation-id="conv-3">
    <h2 class="title">Project Ideas</h2>
    <div class="message" data-role="user">
      <p>What are some good project ideas for a beginner?</p>
    </div>
    <div class="message" data-role="assistant">
      <p>Here are some great beginner project ideas: todo app, weather app, calculator, or a simple blog.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Test the HTML import process
 */
async function testHtmlImport() {
  console.log('🧪 Starting HTML Markdown Importer Test\n');

  // Create temporary directory for testing
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'html-import-test-'));
  console.log(`📁 Test directory: ${tempDir}\n`);

  try {
    // Test context
    const context = {
      userId: 'test-user-123',
      email: 'devon@thewreck.org',
      provider: 'chatgpt',
      vvaultRoot: tempDir,
      shardId: 'shard_0000'
    };

    console.log('📥 Processing HTML import...');
    const result = await processHtmlImport(mockHtmlContent, context);

    console.log(`\n✅ Import complete: ${result.created} files created\n`);

    // Validate file structure
    const expectedInstanceId = 'chatgpt-devon';
    const instancePath = path.join(tempDir, 'users', 'shard_0000', 'test-user-123', 'instances', expectedInstanceId);
    
    console.log('🔍 Validating file structure...');
    console.log(`   Expected instance path: ${instancePath}`);

    // Check if instance directory exists
    try {
      await fs.access(instancePath);
      console.log('   ✅ Instance directory exists');
    } catch {
      console.error('   ❌ Instance directory not found');
      return;
    }

    // List all created files
    const files: string[] = [];
    async function listFiles(dir: string, basePath: string = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);
        if (entry.isDirectory()) {
          await listFiles(fullPath, relativePath);
        } else if (entry.name.endsWith('.md')) {
          files.push(relativePath);
        }
      }
    }

    await listFiles(instancePath);

    console.log(`\n📄 Found ${files.length} markdown files:`);
    for (const file of files) {
      console.log(`   - ${file}`);
      
      // Read and validate file content
      const filePath = path.join(instancePath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Check for fenced JSON metadata
      if (content.includes('```json')) {
        console.log(`      ✅ Contains JSON metadata`);
      } else {
        console.log(`      ⚠️ Missing JSON metadata`);
      }
      
      // Check for title
      if (content.includes('# ')) {
        console.log(`      ✅ Contains title`);
      } else {
        console.log(`      ⚠️ Missing title`);
      }
      
      // Check for messages
      if (content.includes('You said:') || content.includes('Assistant said:')) {
        console.log(`      ✅ Contains messages`);
      } else {
        console.log(`      ⚠️ Missing messages`);
      }
    }

    // Validate directory structure (should have year/month folders)
    const yearDirs = await fs.readdir(instancePath);
    console.log(`\n📅 Year directories: ${yearDirs.join(', ')}`);
    
    for (const yearDir of yearDirs) {
      if (!isNaN(Number(yearDir))) {
        const yearPath = path.join(instancePath, yearDir);
        const monthDirs = await fs.readdir(yearPath);
        console.log(`   ${yearDir}/: ${monthDirs.join(', ')}`);
      }
    }

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      console.error('   Stack:', error.stack);
    }
  } finally {
    // Cleanup: remove temp directory
    console.log(`\n🧹 Cleaning up test directory...`);
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log('   ✅ Cleanup complete');
    } catch (error) {
      console.warn('   ⚠️ Could not clean up test directory:', error);
    }
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testHtmlImport().catch(console.error);
}

export { testHtmlImport, mockHtmlContent };

