/**
 * Integration tests for HTML conversation extraction
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { processConversationsHtml, ProcessContext, ProcessOptions } from '../../server/services/importHtmlProcessor';

describe('HTML Conversation Extraction Integration', () => {
  let tempDir: string;
  let tempHtmlFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-integration-'));
    
    // Create sample conversations.html
    const sampleHtml = `
      <html>
        <head><title>ChatGPT Conversations</title></head>
        <body>
          <div data-conversation-id="conv-1">
            <h2>First Conversation</h2>
            <div class="user-message">Hello, how are you?</div>
            <div class="assistant-message">I'm doing well, thanks for asking!</div>
          </div>
          
          <div data-conversation-id="conv-2">
            <h2>Second Conversation</h2>
            <div class="user-message">What is the weather like?</div>
            <div class="assistant-message">I don't have access to real-time weather data.</div>
          </div>
        </body>
      </html>
    `;
    
    tempHtmlFile = path.join(tempDir, 'conversations.html');
    await fs.writeFile(tempHtmlFile, sampleHtml, 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should process conversations.html and create markdown files', async () => {
    const context: ProcessContext = {
      shardId: 'shard_0000',
      userId: 'test_user_123',
      userEmail: 'test@example.com',
      runtimeId: 'chatgpt-test',
      constructId: 'chatgpt-test-001',
      importSourceFilename: 'conversations.html',
      importedBy: 'test@example.com'
    };

    const options: ProcessOptions = {
      destRootPath: tempDir,
      overwrite: false,
      dedupe: 'byConversationId'
    };

    const summary = await processConversationsHtml(tempHtmlFile, context, options);

    expect(summary.totalProcessed).toBeGreaterThan(0);
    expect(summary.totalCreated).toBeGreaterThan(0);
    expect(summary.totalErrors).toBe(0);

    // Verify files were created
    const chattyDir = path.join(
      tempDir,
      'users',
      context.shardId,
      context.userId,
      'constructs',
      context.constructId,
      'chatty'
    );

    const files = await fs.readdir(chattyDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(f => f.startsWith('chat_with_'))).toBe(true);

    // Verify IMPORT_METADATA in files
    for (const file of files.filter(f => f.endsWith('.md'))) {
      const filePath = path.join(chattyDir, file);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('<!-- IMPORT_METADATA');
      expect(content).toContain('source: chatgpt');
      expect(content).toContain(`constructId: ${context.constructId}`);
      expect(content).toContain(`runtimeId: ${context.runtimeId}`);
      expect(content).toContain('conversationId:');
      expect(content).toContain('conversationTitle:');
    }
  });

  it('should handle duplicate conversations with deduplication', async () => {
    const context: ProcessContext = {
      shardId: 'shard_0000',
      userId: 'test_user_123',
      runtimeId: 'chatgpt-test',
      constructId: 'chatgpt-test-001',
      importSourceFilename: 'conversations.html',
      importedBy: 'test@example.com'
    };

    const options: ProcessOptions = {
      destRootPath: tempDir,
      overwrite: false,
      dedupe: 'byConversationId'
    };

    // First import
    const summary1 = await processConversationsHtml(tempHtmlFile, context, options);
    expect(summary1.totalCreated).toBeGreaterThan(0);

    // Second import (should skip duplicates)
    const summary2 = await processConversationsHtml(tempHtmlFile, context, options);
    expect(summary2.totalSkipped).toBeGreaterThan(0);
  });

  it('should create correct file structure', async () => {
    const context: ProcessContext = {
      shardId: 'shard_0000',
      userId: 'test_user_123',
      runtimeId: 'chatgpt-test',
      constructId: 'chatgpt-test-001',
      importSourceFilename: 'conversations.html',
      importedBy: 'test@example.com'
    };

    const options: ProcessOptions = {
      destRootPath: tempDir,
      overwrite: false,
      dedupe: 'none'
    };

    await processConversationsHtml(tempHtmlFile, context, options);

    // Verify directory structure
    const expectedPath = path.join(
      tempDir,
      'users',
      context.shardId,
      context.userId,
      'constructs',
      context.constructId,
      'chatty'
    );

    const dirExists = await fs.access(expectedPath).then(() => true).catch(() => false);
    expect(dirExists).toBe(true);

    const files = await fs.readdir(expectedPath);
    expect(files.length).toBeGreaterThan(0);
  });

  it('should return correct summary format', async () => {
    const context: ProcessContext = {
      shardId: 'shard_0000',
      userId: 'test_user_123',
      runtimeId: 'chatgpt-test',
      constructId: 'chatgpt-test-001',
      importSourceFilename: 'conversations.html',
      importedBy: 'test@example.com'
    };

    const options: ProcessOptions = {
      destRootPath: tempDir,
      overwrite: false,
      dedupe: 'none'
    };

    const summary = await processConversationsHtml(tempHtmlFile, context, options);

    expect(summary).toHaveProperty('created');
    expect(summary).toHaveProperty('skipped');
    expect(summary).toHaveProperty('errors');
    expect(summary).toHaveProperty('totalProcessed');
    expect(summary).toHaveProperty('totalCreated');
    expect(summary).toHaveProperty('totalSkipped');
    expect(summary).toHaveProperty('totalErrors');

    expect(Array.isArray(summary.created)).toBe(true);
    expect(Array.isArray(summary.skipped)).toBe(true);
    expect(Array.isArray(summary.errors)).toBe(true);

    if (summary.created.length > 0) {
      expect(summary.created[0]).toHaveProperty('filename');
      expect(summary.created[0]).toHaveProperty('conversationId');
      expect(summary.created[0]).toHaveProperty('title');
    }
  });
});

