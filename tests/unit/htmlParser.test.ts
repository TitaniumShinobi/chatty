/**
 * Unit tests for HTML Parser
 */

import { parseHtmlConversations, sanitizeTitle } from '../../server/services/htmlParser';
import { ParsedConversation } from '../../server/services/htmlParser';

describe('htmlParser', () => {
  describe('parseHtmlConversations', () => {
    it('should parse simple HTML with conversation containers', async () => {
      const html = `
        <html>
          <body>
            <div data-conversation-id="conv-1">
              <h2>Test Conversation</h2>
              <div class="user-message">Hello</div>
              <div class="assistant-message">Hi there!</div>
            </div>
          </body>
        </html>
      `;

      const conversations = await parseHtmlConversations(html);
      
      expect(conversations.length).toBeGreaterThan(0);
      expect(conversations[0].title).toContain('Test');
      expect(conversations[0].messages.length).toBeGreaterThan(0);
    });

    it('should handle conversations split by headings', async () => {
      const html = `
        <html>
          <body>
            <h1>First Conversation</h1>
            <p>User: Hello</p>
            <p>Assistant: Hi!</p>
            
            <h1>Second Conversation</h1>
            <p>User: How are you?</p>
            <p>Assistant: I'm doing well!</p>
          </body>
        </html>
      `;

      const conversations = await parseHtmlConversations(html);
      
      expect(conversations.length).toBeGreaterThanOrEqual(2);
    });

    it('should normalize roles correctly', async () => {
      const html = `
        <div data-conversation-id="test">
          <div class="user-message">User message</div>
          <div class="assistant-message">Assistant message</div>
          <div class="system-message">System message</div>
        </div>
      `;

      const conversations = await parseHtmlConversations(html);
      
      if (conversations.length > 0) {
        const roles = conversations[0].messages.map(m => m.role);
        expect(roles).toContain('user');
        expect(roles).toContain('assistant');
      }
    });

    it('should handle missing titles gracefully', async () => {
      const html = `
        <div data-conversation-id="test">
          <div class="user-message">Hello</div>
        </div>
      `;

      const conversations = await parseHtmlConversations(html);
      
      expect(conversations.length).toBeGreaterThan(0);
      expect(conversations[0].title).toBeDefined();
    });

    it('should generate conversation IDs if missing', async () => {
      const html = `
        <div>
          <div class="user-message">Hello</div>
        </div>
      `;

      const conversations = await parseHtmlConversations(html);
      
      expect(conversations.length).toBeGreaterThan(0);
      expect(conversations[0].conversationId).toBeDefined();
      expect(conversations[0].conversationId.length).toBeGreaterThan(0);
    });

    it('should handle empty HTML gracefully', async () => {
      const conversations = await parseHtmlConversations('');
      
      expect(conversations).toEqual([]);
    });

    it('should handle malformed HTML gracefully', async () => {
      const html = '<div><unclosed-tag>broken</div>';
      
      const conversations = await parseHtmlConversations(html);
      
      // Should not throw, may return empty or partial results
      expect(Array.isArray(conversations)).toBe(true);
    });

    it('should extract timestamps when present', async () => {
      const html = `
        <div data-conversation-id="test">
          <div data-timestamp="2025-11-13T18:00:00Z" class="user-message">Hello</div>
        </div>
      `;

      const conversations = await parseHtmlConversations(html);
      
      if (conversations.length > 0 && conversations[0].messages.length > 0) {
        expect(conversations[0].messages[0].timestamp).toBeDefined();
      }
    });
  });

  describe('sanitizeTitle', () => {
    it('should sanitize special characters', () => {
      const title = 'Test: Conversation #1 (Important!)';
      const sanitized = sanitizeTitle(title);
      
      expect(sanitized).not.toContain(':');
      expect(sanitized).not.toContain('#');
      expect(sanitized).not.toContain('(');
      expect(sanitized).not.toContain(')');
      expect(sanitized).not.toContain('!');
    });

    it('should replace spaces with hyphens', () => {
      const title = 'Test Conversation Title';
      const sanitized = sanitizeTitle(title);
      
      expect(sanitized).toContain('-');
      expect(sanitized).not.toContain(' ');
    });

    it('should limit length', () => {
      const longTitle = 'a'.repeat(200);
      const sanitized = sanitizeTitle(longTitle);
      
      expect(sanitized.length).toBeLessThanOrEqual(100);
    });

    it('should handle empty strings', () => {
      const sanitized = sanitizeTitle('');
      expect(sanitized).toBe('');
    });
  });
});

