/**
 * Unit tests for Markdown Writer
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { convertToMarkdown, writeConversationFile, ImportMeta } from '../../server/services/markdownWriter';
import { ParsedConversation } from '../../server/services/htmlParser';

describe('markdownWriter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('convertToMarkdown', () => {
    it('should generate markdown with IMPORT_METADATA', async () => {
      const parsed: ParsedConversation = {
        conversationId: 'test-123',
        title: 'Test Conversation',
        messages: [
          { role: 'user', text: 'Hello' },
          { role: 'assistant', text: 'Hi there!' }
        ]
      };

      const meta: ImportMeta = {
        source: 'chatgpt',
        importedAt: '2025-11-13T18:00:00Z',
        importSourceFilename: 'conversations.html',
        importedBy: 'devon@thewreck.org',
        runtimeId: 'chatgpt-devon',
        constructId: 'chatgpt-devon-001',
        conversationId: 'test-123',
        conversationTitle: 'Test Conversation'
      };

      const result = await convertToMarkdown(parsed, meta);

      expect(result.filename).toContain('chat_with_');
      expect(result.content).toContain('<!-- IMPORT_METADATA');
      expect(result.content).toContain('source: chatgpt');
      expect(result.content).toContain('constructId: chatgpt-devon-001');
      expect(result.content).toContain('# Test Conversation');
      expect(result.content).toContain('**User**: Hello');
      expect(result.content).toContain('**Assistant**: Hi there!');
    });

    it('should handle missing conversation ID', async () => {
      const parsed: ParsedConversation = {
        title: 'Test',
        messages: [{ role: 'user', text: 'Hello' }]
      };

      const meta: ImportMeta = {
        source: 'chatgpt',
        importedAt: '2025-11-13T18:00:00Z',
        importSourceFilename: 'conversations.html',
        importedBy: 'test@example.com',
        runtimeId: 'test',
        constructId: 'test-001',
        conversationId: 'generated-id',
        conversationTitle: 'Test'
      };

      const result = await convertToMarkdown(parsed, meta);

      expect(result.conversationId).toBeDefined();
      expect(result.content).toContain('conversationId:');
    });

    it('should escape special characters in title', async () => {
      const parsed: ParsedConversation = {
        title: 'Test "Quote" Conversation',
        messages: [{ role: 'user', text: 'Hello' }]
      };

      const meta: ImportMeta = {
        source: 'chatgpt',
        importedAt: '2025-11-13T18:00:00Z',
        importSourceFilename: 'conversations.html',
        importedBy: 'test@example.com',
        runtimeId: 'test',
        constructId: 'test-001',
        conversationId: 'test',
        conversationTitle: 'Test "Quote" Conversation'
      };

      const result = await convertToMarkdown(parsed, meta);

      expect(result.content).toContain('conversationTitle: "Test \\"Quote\\" Conversation"');
    });
  });

  describe('writeConversationFile', () => {
    it('should create directory if missing', async () => {
      const shardId = 'shard_0000';
      const userId = 'test_user';
      const constructId = 'test-001';
      const filename = 'chat_with_test-{NNN}.md';
      const content = '# Test\n\nHello';

      await writeConversationFile(
        tempDir,
        shardId,
        userId,
        constructId,
        filename,
        content
      );

      const expectedDir = path.join(tempDir, 'users', shardId, userId, 'instances', constructId, 'chatty');
      const dirExists = await fs.access(expectedDir).then(() => true).catch(() => false);
      
      expect(dirExists).toBe(true);
    });

    it('should write file with correct sequence number', async () => {
      const shardId = 'shard_0000';
      const userId = 'test_user';
      const constructId = 'test-001';
      const filename = 'chat_with_test-{NNN}.md';
      const content = '# Test\n\nHello';

      const relativePath = await writeConversationFile(
        tempDir,
        shardId,
        userId,
        constructId,
        filename,
        content
      );

      const expectedFile = path.join(
        tempDir,
        'users',
        shardId,
        userId,
        'instances',
        constructId,
        'chatty',
        'chat_with_test-001.md'
      );

      const fileExists = await fs.access(expectedFile).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      const writtenContent = await fs.readFile(expectedFile, 'utf-8');
      expect(writtenContent).toBe(content);
      expect(relativePath).toBe(path.join('chatty', 'chat_with_test-001.md'));
    });

    it('should increment sequence number for multiple files', async () => {
      const shardId = 'shard_0000';
      const userId = 'test_user';
      const constructId = 'test-001';
      const filename = 'chat_with_test-{NNN}.md';

      // Write first file
      await writeConversationFile(
        tempDir,
        shardId,
        userId,
        constructId,
        filename,
        '# First\n\nHello'
      );

      // Write second file
      await writeConversationFile(
        tempDir,
        shardId,
        userId,
        constructId,
        filename,
        '# Second\n\nHi'
      );

      const chattyDir = path.join(tempDir, 'users', shardId, userId, 'instances', constructId, 'chatty');
      const files = await fs.readdir(chattyDir);

      expect(files).toContain('chat_with_test-001.md');
      expect(files).toContain('chat_with_test-002.md');
    });

    it('should handle deduplication by conversationId', async () => {
      const shardId = 'shard_0000';
      const userId = 'test_user';
      const constructId = 'test-001';
      const filename = 'chat_with_test-{NNN}.md';
      const content1 = `<!-- IMPORT_METADATA\nconversationId: test-123\n-->\n# Test`;
      const content2 = `<!-- IMPORT_METADATA\nconversationId: test-123\n-->\n# Test 2`;

      // Write first file
      await writeConversationFile(
        tempDir,
        shardId,
        userId,
        constructId,
        filename,
        content1
      );

      // Try to write duplicate
      await expect(
        writeConversationFile(
          tempDir,
          shardId,
          userId,
          constructId,
          filename,
          content2,
          { dedupe: 'byConversationId', overwrite: false }
        )
      ).rejects.toThrow('already exists');
    });

    it('should overwrite if overwrite option is true', async () => {
      const shardId = 'shard_0000';
      const userId = 'test_user';
      const constructId = 'test-001';
      const filename = 'chat_with_test-{NNN}.md';
      const content1 = `<!-- IMPORT_METADATA\nconversationId: test-123\n-->\n# Test`;
      const content2 = `<!-- IMPORT_METADATA\nconversationId: test-123\n-->\n# Test Updated`;

      // Write first file
      await writeConversationFile(
        tempDir,
        shardId,
        userId,
        constructId,
        filename,
        content1
      );

      // Overwrite with new content
      await writeConversationFile(
        tempDir,
        shardId,
        userId,
        constructId,
        filename,
        content2,
        { dedupe: 'byConversationId', overwrite: true }
      );

      const chattyDir = path.join(tempDir, 'users', shardId, userId, 'instances', constructId, 'chatty');
      const files = await fs.readdir(chattyDir);
      const filePath = path.join(chattyDir, files[0]);
      const writtenContent = await fs.readFile(filePath, 'utf-8');

      expect(writtenContent).toContain('Test Updated');
    });
  });
});
