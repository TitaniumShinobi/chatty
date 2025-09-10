import { ConversationAI } from '../lib/conversationAI';

describe('Assistant Contract Tests', () => {
  test('assistant never returns prose', async () => {
    const ai = new ConversationAI();
    
    // Test various inputs
    const testCases = [
      "hello",
      "what can you do?",
      "I am your developer",
      "help me with code",
      "tell me a story"
    ];
    
    for (const input of testCases) {
      const response = await ai.processMessage(input);
      
      // Must be an object (packet)
      expect(typeof response).toBe('object');
      expect(response).not.toBeNull();
      
      // Must have op property
      expect(response).toHaveProperty('op');
      expect(typeof (response as any).op).toBe('number');
      
      // Must not be a string (prose)
      expect(typeof response).not.toBe('string');
      
      // Must not contain prose-like content
      const responseStr = JSON.stringify(response);
      expect(responseStr).not.toContain('I\'ll help you build');
      expect(responseStr).not.toContain('What would you like to make');
      expect(responseStr).not.toContain('Hello! I\'m Chatty');
    }
  });

  test('assistant returns valid opcodes', async () => {
    const ai = new ConversationAI();
    
    const response = await ai.processMessage("hello");
    
    // Must have a valid opcode
    expect((response as any).op).toBeGreaterThan(0);
    expect((response as any).op).toBeLessThan(1000); // Reasonable range
    
    // Must have timestamp
    expect((response as any).ts).toBeDefined();
    expect(typeof (response as any).ts).toBe('number');
  });

  test('assistant handles files correctly', async () => {
    const ai = new ConversationAI();
    
    // Mock file for testing
    const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
    
    const response = await ai.processMessage("I uploaded a file", [mockFile]);
    
    // Must be packet, not prose
    expect(typeof response).toBe('object');
    expect((response as any).op).toBeDefined();
    expect(typeof (response as any).op).toBe('number');
  });

  test('assistant handles GPT creation mode', async () => {
    const ai = new ConversationAI();
    ai.gptCreationMode = true;
    
    const response = await ai.processMessage("hello");
    
    // Must be packet, not prose
    expect(typeof response).toBe('object');
    expect((response as any).op).toBeDefined();
    expect(typeof (response as any).op).toBe('number');
  });
});
