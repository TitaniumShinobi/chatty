import {
  LIN_CONVERSATION_MODEL,
  LIN_DEFAULT_MODELS,
} from './modelProviders';
import {
  CREATOR_MODE_SECTION_TITLE,
  FORGED_OLLAMA_SECTION_TITLE,
  buildCreatorSimLockConfigJson,
  getCreatorModeSectionTitle,
  normalizeCreatorModelsForMode,
  resolveCreatorSimLock,
  shouldRenderCreatorModeTabs,
} from './creatorModelMode';

describe('creatorModelMode', () => {
  test('Lin mode normalizes stale cloud seats to local Lin defaults', () => {
    const normalized = normalizeCreatorModelsForMode(
      {
        orchestrationMode: 'custom',
        provider: 'openai',
        modelId: 'openai:gpt-4o',
        conversationModel: 'openai:gpt-4o',
        creativeModel: 'openai:gpt-4o',
        codingModel: 'openai:gpt-4o',
        constructCallsign: 'nova-001',
      },
      'lin',
    );

    expect(normalized.orchestrationMode).toBe('lin');
    expect(normalized.provider).toBe('');
    expect(normalized.modelId).toBe(LIN_CONVERSATION_MODEL);
    expect(normalized.conversationModel).toBe(LIN_CONVERSATION_MODEL);
    expect(normalized.creativeModel).toBe(LIN_DEFAULT_MODELS.creative);
    expect(normalized.codingModel).toBe(LIN_DEFAULT_MODELS.coding);
    expect(normalized.constructCallsign).toBe('nova-001');
  });

  test('Custom Models mode preserves manual seats as routing settings', () => {
    const normalized = normalizeCreatorModelsForMode(
      {
        orchestrationMode: 'lin',
        provider: 'openai',
        modelId: 'openai:gpt-4o',
        conversationModel: 'openai:gpt-4o',
        creativeModel: 'openrouter:anthropic/claude-3.5-sonnet',
        codingModel: 'ollama:deepseek-coder:latest',
        constructCallsign: 'zen-001',
      },
      'custom',
    );

    expect(normalized.orchestrationMode).toBe('custom');
    expect(normalized.provider).toBe('openai');
    expect(normalized.modelId).toBe('openai:gpt-4o');
    expect(normalized.conversationModel).toBe('openai:gpt-4o');
    expect(normalized.creativeModel).toBe('openrouter:anthropic/claude-3.5-sonnet');
    expect(normalized.codingModel).toBe('ollama:deepseek-coder:latest');
    expect(normalized.constructCallsign).toBe('zen-001');
  });

  test('Sim mode locks every seat to the selected local artifact', () => {
    const normalized = normalizeCreatorModelsForMode(
      {
        orchestrationMode: 'custom',
        provider: 'openai',
        modelId: 'openai:gpt-4o',
        conversationModel: 'openai:gpt-4o',
        creativeModel: 'openai:gpt-4o',
        codingModel: 'openai:gpt-4o',
        constructCallsign: 'katana-001',
      },
      'sim',
      'ollama:katana',
    );

    expect(normalized.orchestrationMode).toBe('sim');
    expect(normalized.provider).toBe('ollama');
    expect(normalized.modelId).toBe('ollama:katana');
    expect(normalized.conversationModel).toBe('ollama:katana');
    expect(normalized.creativeModel).toBe('ollama:katana');
    expect(normalized.codingModel).toBe('ollama:katana');
  });

  test('forged sim lock forces sim mode even if the user asks for custom or lin', () => {
    const configJson = buildCreatorSimLockConfigJson(
      {},
      {
        constructCallsign: 'zen-001',
        configJson: null,
      },
      'ollama:zen',
    );

    const normalized = normalizeCreatorModelsForMode(
      {
        orchestrationMode: 'custom',
        provider: 'openai',
        modelId: 'openai:gpt-4o',
        conversationModel: 'openai:gpt-4o',
        creativeModel: 'openai:gpt-4o',
        codingModel: 'openai:gpt-4o',
        constructCallsign: 'zen-001',
        configJson,
      },
      'custom',
      'ollama:zen',
    );

    expect(resolveCreatorSimLock(normalized, 'ollama:zen').locked).toBe(true);
    expect(normalized.orchestrationMode).toBe('sim');
    expect(normalized.provider).toBe('ollama');
    expect(normalized.modelId).toBe('ollama:zen');
    expect(normalized.conversationModel).toBe('ollama:zen');
    expect(normalized.creativeModel).toBe('ollama:zen');
    expect(normalized.codingModel).toBe('ollama:zen');
  });

  test('forged sim lock hides creator mode tabs and changes the section title', () => {
    expect(shouldRenderCreatorModeTabs(false)).toBe(true);
    expect(getCreatorModeSectionTitle(false)).toBe(CREATOR_MODE_SECTION_TITLE);

    expect(shouldRenderCreatorModeTabs(true)).toBe(false);
    expect(getCreatorModeSectionTitle(true)).toBe(FORGED_OLLAMA_SECTION_TITLE);
  });
});
