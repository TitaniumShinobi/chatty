import { getMemupMemoryService } from '../services/memupMemoryService.js';

describe('memup CLI adapter contract', () => {
  test('health command returns structured payload', async () => {
    const service = getMemupMemoryService();
    const result = await service.executePythonCommand('health', { constructCallsign: 'zen-001' });

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('success');
  });

  test('add_memory then query_memories round trip returns a memories array', async () => {
    const service = getMemupMemoryService();
    const sessionId = `jest_${Date.now()}`;

    await service.executePythonCommand('add_memory', {
      constructCallsign: 'zen-001',
      sessionId,
      context: 'remember this jest memory context',
      response: 'stored response from jest',
      memoryType: 'short-term',
      timestamp: new Date().toISOString(),
    });

    const query = await service.executePythonCommand('query_memories', {
      constructCallsign: 'zen-001',
      sessionId,
      query: ['jest memory context'],
      limit: 5,
    });

    expect(query).toBeTruthy();
    expect(query.success).toBe(true);
    expect(Array.isArray(query.memories)).toBe(true);
  });
});
