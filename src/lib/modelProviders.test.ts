import {
  LIN_CONVERSATION_MODEL,
  LIN_DEFAULT_MODELS,
  OLLAMA_MODELS,
  parseModelString,
} from './modelProviders';

describe('modelProviders Lin defaults', () => {
  it('exports the fixed local Lin triad', () => {
    expect(LIN_CONVERSATION_MODEL).toBe('ollama:phi4-mini:latest');
    expect(LIN_DEFAULT_MODELS.smalltalk).toBe('ollama:phi4-mini:latest');
    expect(LIN_DEFAULT_MODELS.creative).toBe('ollama:mistral-small3.2:24b');
    expect(LIN_DEFAULT_MODELS.coding).toBe('ollama:qwen3-coder:30b');
  });

  it('parses Lin local default model strings as Ollama routes', () => {
    expect(parseModelString(LIN_DEFAULT_MODELS.smalltalk)).toEqual({
      provider: 'ollama',
      model: 'phi4-mini:latest',
    });
    expect(parseModelString(LIN_DEFAULT_MODELS.creative)).toEqual({
      provider: 'ollama',
      model: 'mistral-small3.2:24b',
    });
    expect(parseModelString(LIN_DEFAULT_MODELS.coding)).toEqual({
      provider: 'ollama',
      model: 'qwen3-coder:30b',
    });
  });

  it('keeps every Lin default present in the live Ollama catalog', () => {
    const catalogValues = new Set(OLLAMA_MODELS.map((model) => model.value));
    for (const defaultModel of Object.values(LIN_DEFAULT_MODELS)) {
      expect(catalogValues.has(defaultModel)).toBe(true);
    }
  });
});
