// Test browser-compatible memory system
import { browserStmBuffer } from '../../core/memory/BrowserSTMBuffer';
import { browserConstructRegistry } from '../../state/BrowserConstructs';

// Mock localStorage for Node.js environment
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] || null
  };
})();

// Set up localStorage mock if not available (Node.js environment)
if (typeof global.localStorage === 'undefined') {
  (global as any).localStorage = localStorageMock;
}

describe('Browser Memory System', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('BrowserSTMBuffer', () => {
    it('should add and retrieve messages', () => {
      const constructId = 'test-construct';
      const threadId = 'test-thread';
      
      const message = {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Hello, world!',
        timestamp: Date.now()
      };
      
      browserStmBuffer.addMessage(constructId, threadId, message);
      
      const messages = browserStmBuffer.getWindow(constructId, threadId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello, world!');
    });

    it('should enforce sliding window', () => {
      const constructId = 'test-construct';
      const threadId = 'test-thread';
      
      // Add more messages than window size
      for (let i = 0; i < 60; i++) {
        browserStmBuffer.addMessage(constructId, threadId, {
          id: `msg-${i}`,
          role: 'user' as const,
          content: `Message ${i}`,
          timestamp: Date.now() + i
        });
      }
      
      const messages = browserStmBuffer.getWindow(constructId, threadId);
      expect(messages).toHaveLength(50); // Default window size
      expect(messages[0].content).toBe('Message 10'); // First message should be the 10th
    });

    it('should persist to localStorage', () => {
      const constructId = 'test-construct';
      const threadId = 'test-thread';
      
      const message = {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Persistent message',
        timestamp: Date.now()
      };
      
      browserStmBuffer.addMessage(constructId, threadId, message);
      
      // Check localStorage
      const key = `chatty_stm_${constructId}_${threadId}`;
      const stored = localStorage.getItem(key);
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].content).toBe('Persistent message');
    });
  });

  describe('BrowserConstructRegistry', () => {
    it('should register and retrieve constructs', async () => {
      const constructId = 'test-construct';
      
      await browserConstructRegistry.registerConstruct({
        id: constructId,
        name: 'Test Construct',
        description: 'A test construct',
        roleLock: {
          allowedRoles: ['assistant'],
          prohibitedRoles: ['admin'],
          contextBoundaries: ['test'],
          behaviorConstraints: ['be helpful']
        },
        legalDocSha256: 'test-hash',
        fingerprint: 'test-fingerprint'
      });
      
      const construct = await browserConstructRegistry.getConstruct(constructId);
      expect(construct).toBeTruthy();
      expect(construct!.constructId).toBe(constructId);
    });

    it('should validate role locks', async () => {
      const constructId = 'test-construct';
      
      await browserConstructRegistry.registerConstruct({
        id: constructId,
        name: 'Test Construct',
        roleLock: {
          allowedRoles: ['assistant'],
          prohibitedRoles: ['admin'],
          contextBoundaries: ['test'],
          behaviorConstraints: ['be helpful']
        },
        legalDocSha256: 'test-hash',
        fingerprint: 'test-fingerprint'
      });
      
      // Test allowed role
      const allowed = browserConstructRegistry.validateRoleLock(constructId, 'assistant', 'test context');
      expect(allowed).toBe(true);
      
      // Test prohibited role
      const prohibited = browserConstructRegistry.validateRoleLock(constructId, 'admin', 'test context');
      expect(prohibited).toBe(false);
    });

    it('should get all constructs', async () => {
      await browserConstructRegistry.registerConstruct({
        id: 'construct-1',
        name: 'Construct 1',
        roleLock: {
          allowedRoles: ['assistant'],
          prohibitedRoles: [],
          contextBoundaries: [],
          behaviorConstraints: []
        },
        legalDocSha256: 'hash-1',
        fingerprint: 'fingerprint-1'
      });
      
      await browserConstructRegistry.registerConstruct({
        id: 'construct-2',
        name: 'Construct 2',
        roleLock: {
          allowedRoles: ['helper'],
          prohibitedRoles: [],
          contextBoundaries: [],
          behaviorConstraints: []
        },
        legalDocSha256: 'hash-2',
        fingerprint: 'fingerprint-2'
      });
      
      const constructs = await browserConstructRegistry.getAllConstructs();
      expect(constructs).toHaveLength(2);
      expect(constructs[0].name).toBe('Construct 2'); // Should be sorted by creation time
    });
  });
});
