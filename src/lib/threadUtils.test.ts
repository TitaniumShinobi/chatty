import {
  Thread,
  deduplicateThreadsById,
  getCanonicalIdForGPT,
  isGPTConstruct,
  routeIdForThread,
  normalizeZenThreadId,
  normalizeLinThreadId,
  DEFAULT_ZEN_CANONICAL_SESSION_ID,
  DEFAULT_LIN_CANONICAL_SESSION_ID,
} from './threadUtils';

describe('threadUtils', () => {
  describe('deduplicateThreadsById', () => {
    it('should keep thread with more messages when duplicates exist', () => {
      const threads: Thread[] = [
        { id: 'zen-001_chat_with_zen-001', title: 'empty', messages: [], constructId: 'zen-001' },
        { id: 'zen-001_chat_with_zen-001', title: 'with-messages', messages: [
          { role: 'user', text: 'Hello' },
          { role: 'assistant', text: 'Hi there!' },
        ], constructId: 'zen-001' },
      ];

      const result = deduplicateThreadsById(threads);
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('with-messages');
      expect(result[0].messages).toHaveLength(2);
    });

    it('should keep first thread when both have same message count', () => {
      const threads: Thread[] = [
        { id: 'test-id', title: 'first', messages: [{ role: 'user', text: 'a' }], constructId: 'test' },
        { id: 'test-id', title: 'second', messages: [{ role: 'user', text: 'b' }], constructId: 'test' },
      ];

      const result = deduplicateThreadsById(threads);
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('first');
    });

    it('should preserve unique threads', () => {
      const threads: Thread[] = [
        { id: 'thread-1', title: 'Thread 1', messages: [], constructId: 'zen-001' },
        { id: 'thread-2', title: 'Thread 2', messages: [], constructId: 'katana-001' },
        { id: 'thread-3', title: 'Thread 3', messages: [], constructId: 'lin-001' },
      ];

      const result = deduplicateThreadsById(threads);
      
      expect(result).toHaveLength(3);
    });

    it('should handle empty array', () => {
      const result = deduplicateThreadsById([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('getCanonicalIdForGPT', () => {
    it('should generate canonical ID for GPT', () => {
      expect(getCanonicalIdForGPT('katana-001')).toBe('katana-001_chat_with_katana-001');
      expect(getCanonicalIdForGPT('custom-gpt')).toBe('custom-gpt_chat_with_custom-gpt');
    });
  });

  describe('isGPTConstruct', () => {
    it('should return false for Zen constructs', () => {
      expect(isGPTConstruct('zen-001')).toBe(false);
      expect(isGPTConstruct('zen')).toBe(false);
      expect(isGPTConstruct('ZEN-001')).toBe(false);
    });

    it('should return false for Lin constructs', () => {
      expect(isGPTConstruct('lin-001')).toBe(false);
      expect(isGPTConstruct('lin')).toBe(false);
      expect(isGPTConstruct('LIN-001')).toBe(false);
    });

    it('should return true for GPT constructs', () => {
      expect(isGPTConstruct('katana-001')).toBe(true);
      expect(isGPTConstruct('custom-gpt')).toBe(true);
      expect(isGPTConstruct('my-ai')).toBe(true);
    });

    it('should return false for null/undefined', () => {
      expect(isGPTConstruct(null)).toBe(false);
    });
  });

  describe('routeIdForThread', () => {
    it('should route GPT thread to canonical ID', () => {
      const threads: Thread[] = [
        { id: 'session_123_abc', title: 'Katana', messages: [], constructId: 'katana-001' },
      ];

      const result = routeIdForThread('session_123_abc', threads);
      
      expect(result).toBe('katana-001_chat_with_katana-001');
    });

    it('should NOT re-route already canonical GPT thread', () => {
      const threads: Thread[] = [
        { id: 'katana-001_chat_with_katana-001', title: 'Katana', messages: [], constructId: 'katana-001' },
      ];

      const result = routeIdForThread('katana-001_chat_with_katana-001', threads);
      
      expect(result).toBe('katana-001_chat_with_katana-001');
    });

    it('should NOT route Zen thread to GPT canonical format', () => {
      const threads: Thread[] = [
        { id: 'session_123_abc', title: 'Zen', messages: [], constructId: 'zen-001' },
      ];

      const result = routeIdForThread('session_123_abc', threads);
      
      expect(result).toBe('session_123_abc');
    });

    it('should NOT route Lin thread to GPT canonical format', () => {
      const threads: Thread[] = [
        { id: 'session_123_abc', title: 'Lin', messages: [], constructId: 'lin-001' },
      ];

      const result = routeIdForThread('session_123_abc', threads);
      
      expect(result).toBe('session_123_abc');
    });

    it('should return threadId if thread not found', () => {
      const result = routeIdForThread('nonexistent', []);
      expect(result).toBe('nonexistent');
    });
  });

  describe('normalizeZenThreadId', () => {
    it('should normalize zen-001 constructId to canonical ID', () => {
      const result = normalizeZenThreadId('session_123', 'zen-001', 'Some Title');
      expect(result).toBe(DEFAULT_ZEN_CANONICAL_SESSION_ID);
    });

    it('should normalize "zen" constructId to canonical ID', () => {
      const result = normalizeZenThreadId('session_123', 'zen', 'Some Title');
      expect(result).toBe(DEFAULT_ZEN_CANONICAL_SESSION_ID);
    });

    it('should normalize "Zen" title to canonical ID', () => {
      const result = normalizeZenThreadId('session_123', 'other', 'Zen');
      expect(result).toBe(DEFAULT_ZEN_CANONICAL_SESSION_ID);
    });

    it('should NOT normalize non-Zen threads', () => {
      const result = normalizeZenThreadId('session_123', 'katana-001', 'Katana');
      expect(result).toBe('session_123');
    });
  });

  describe('normalizeLinThreadId', () => {
    it('should normalize lin-001 constructId to canonical ID', () => {
      const result = normalizeLinThreadId('session_123', 'lin-001', 'Some Title');
      expect(result).toBe(DEFAULT_LIN_CANONICAL_SESSION_ID);
    });

    it('should normalize "lin" constructId to canonical ID', () => {
      const result = normalizeLinThreadId('session_123', 'lin', 'Some Title');
      expect(result).toBe(DEFAULT_LIN_CANONICAL_SESSION_ID);
    });

    it('should normalize "Lin" title to canonical ID', () => {
      const result = normalizeLinThreadId('session_123', 'other', 'Lin');
      expect(result).toBe(DEFAULT_LIN_CANONICAL_SESSION_ID);
    });

    it('should NOT normalize non-Lin threads', () => {
      const result = normalizeLinThreadId('session_123', 'katana-001', 'Katana');
      expect(result).toBe('session_123');
    });
  });

  describe('regression: duplicate Zen threads with different message counts', () => {
    it('should pick the Zen thread with messages over empty one after normalization', () => {
      const threads: Thread[] = [
        { 
          id: 'zen-001_chat_with_zen-001', 
          title: 'chat_with_zen-001.md', 
          messages: [], 
          constructId: 'zen-001' 
        },
        { 
          id: 'zen-001_chat_with_zen-001', 
          title: 'zen-001', 
          messages: [
            { role: 'user', text: 'I want to make sure all is working' },
            { role: 'assistant', text: 'Thats a great goal!' },
            { role: 'user', text: 'I guess you dont really know' },
            { role: 'assistant', text: 'Im sorry, but as a language model' },
            { role: 'user', text: 'Compose a short synthwave track' },
          ], 
          constructId: 'zen-001' 
        },
      ];

      const result = deduplicateThreadsById(threads);
      
      expect(result).toHaveLength(1);
      expect(result[0].messages).toHaveLength(5);
      expect(result[0].title).toBe('zen-001');
    });
  });

  describe('regression: Katana Address Book routing', () => {
    it('should route random Katana session ID to canonical format', () => {
      const threads: Thread[] = [
        { id: 'session_1769298413180_78mro8v', title: 'Katana', messages: [], constructId: 'katana-001' },
      ];

      const result = routeIdForThread('session_1769298413180_78mro8v', threads);
      
      expect(result).toBe('katana-001_chat_with_katana-001');
    });
  });

  describe('regression: duplicate Lin threads with different message counts', () => {
    it('should pick the Lin thread with messages over empty one after normalization', () => {
      const threads: Thread[] = [
        { 
          id: 'lin-001_chat_with_lin-001', 
          title: 'chat_with_lin-001.md', 
          messages: [], 
          constructId: 'lin-001' 
        },
        { 
          id: 'lin-001_chat_with_lin-001', 
          title: 'lin-001', 
          messages: [
            { role: 'user', text: 'Help me create a character' },
            { role: 'assistant', text: 'I would be happy to help you create a character!' },
            { role: 'user', text: 'Make them mysterious' },
          ], 
          constructId: 'lin-001' 
        },
      ];

      const result = deduplicateThreadsById(threads);
      
      expect(result).toHaveLength(1);
      expect(result[0].messages).toHaveLength(3);
      expect(result[0].title).toBe('lin-001');
    });
  });

  describe('regression: Lin canonical session ID format', () => {
    it('should have Lin canonical ID following same pattern as Zen', () => {
      expect(DEFAULT_LIN_CANONICAL_SESSION_ID).toBe('lin-001_chat_with_lin-001');
      expect(DEFAULT_ZEN_CANONICAL_SESSION_ID).toBe('zen-001_chat_with_zen-001');
      
      // Verify congruent pattern: {constructId}_chat_with_{constructId}
      expect(DEFAULT_LIN_CANONICAL_SESSION_ID).toMatch(/^lin-001_chat_with_lin-001$/);
      expect(DEFAULT_ZEN_CANONICAL_SESSION_ID).toMatch(/^zen-001_chat_with_zen-001$/);
    });

    it('should normalize random Lin session to canonical format', () => {
      const result = normalizeLinThreadId('session_random_123', 'lin-001', 'Lin Chat');
      expect(result).toBe('lin-001_chat_with_lin-001');
    });

    it('should normalize random Zen session to canonical format', () => {
      const result = normalizeZenThreadId('session_random_456', 'zen-001', 'Zen Chat');
      expect(result).toBe('zen-001_chat_with_zen-001');
    });
  });

  describe('regression: system constructs must NOT use GPT routing', () => {
    it('Zen should not be treated as GPT', () => {
      expect(isGPTConstruct('zen-001')).toBe(false);
      expect(isGPTConstruct('zen')).toBe(false);
    });

    it('Lin should not be treated as GPT', () => {
      expect(isGPTConstruct('lin-001')).toBe(false);
      expect(isGPTConstruct('lin')).toBe(false);
    });

    it('Custom GPTs should be treated as GPT', () => {
      expect(isGPTConstruct('katana-001')).toBe(true);
      expect(isGPTConstruct('my-custom-ai')).toBe(true);
    });
  });

  describe('regression: GPT canonical session format', () => {
    it('Katana should use canonical format: katana-001_chat_with_katana-001', () => {
      const canonicalId = getCanonicalIdForGPT('katana-001');
      expect(canonicalId).toBe('katana-001_chat_with_katana-001');
    });

    it('All GPTs should follow same pattern as system constructs', () => {
      // Pattern: {constructId}_chat_with_{constructId}
      expect(getCanonicalIdForGPT('katana-001')).toBe('katana-001_chat_with_katana-001');
      expect(getCanonicalIdForGPT('my-custom-ai')).toBe('my-custom-ai_chat_with_my-custom-ai');
      
      // Same pattern as Zen and Lin
      expect(DEFAULT_ZEN_CANONICAL_SESSION_ID).toBe('zen-001_chat_with_zen-001');
      expect(DEFAULT_LIN_CANONICAL_SESSION_ID).toBe('lin-001_chat_with_lin-001');
    });

    it('should route random Katana session to canonical format', () => {
      const threads: Thread[] = [
        { id: 'session_random_katana', title: 'Katana', messages: [], constructId: 'katana-001' },
      ];

      const result = routeIdForThread('session_random_katana', threads);
      expect(result).toBe('katana-001_chat_with_katana-001');
    });
  });

  describe('regression: duplicate GPT threads with different message counts', () => {
    it('should pick the Katana thread with messages over empty one', () => {
      const threads: Thread[] = [
        { 
          id: 'katana-001_chat_with_katana-001', 
          title: 'chat_with_katana-001.md', 
          messages: [], 
          constructId: 'katana-001' 
        },
        { 
          id: 'katana-001_chat_with_katana-001', 
          title: 'katana-001', 
          messages: [
            { role: 'user', text: 'Hello Katana' },
            { role: 'assistant', text: 'Greetings, warrior.' },
          ], 
          constructId: 'katana-001' 
        },
      ];

      const result = deduplicateThreadsById(threads);
      
      expect(result).toHaveLength(1);
      expect(result[0].messages).toHaveLength(2);
      expect(result[0].title).toBe('katana-001');
    });
  });
});
