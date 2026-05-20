import { IdentityUnavailableError } from '../OrchestrationErrors';
import { PersonalityOrchestrator } from '../PersonalityOrchestrator';

describe('PersonalityOrchestrator identity boundary behavior', () => {
  it('fails closed when nova construct has no stored persona blueprint', async () => {
    const orchestrator = new PersonalityOrchestrator('/does/not/matter');

    (orchestrator as any).identityMatcher = {
      loadPersonalityBlueprint: jest.fn().mockResolvedValue(null),
    };

    await expect(
      orchestrator.orchestrateResponse(
        'hello',
        'nova-001',
        'Nova',
        'user-123',
        [],
        undefined,
        undefined,
        undefined,
        undefined
      )
    ).rejects.toMatchObject({
      errorCode: 'IDENTITY_UNAVAILABLE',
    });
  });

  it('keeps degraded empty-blueprint behavior for non-strict constructs only', async () => {
    const orchestrator = new PersonalityOrchestrator('/does/not/matter');

    (orchestrator as any).identityMatcher = {
      loadPersonalityBlueprint: jest.fn().mockResolvedValue(null),
    };

    const result = await orchestrator.orchestrateResponse(
      'hello',
      'sample-001',
      'Sample',
      'user-123',
      [],
      undefined,
      undefined,
      undefined,
      undefined
    );

    expect(result).toBeDefined();
    expect(result.personalityContext).toBeDefined();
    expect(result.personalityContext.blueprint.constructId).toBe('sample-001');
    expect(result.personalityContext.blueprint.coreTraits).toEqual([]);
    expect(result.personalityContext.blueprint.metadata.confidence).toBe(0);
    expect(typeof result.response).toBe('string');
  });

  it('uses the typed identity unavailable error for strict constructs', async () => {
    const error = new IdentityUnavailableError('lin-001', 'Lin');

    expect(error.errorCode).toBe('IDENTITY_UNAVAILABLE');
    expect(error.userMessage).toMatch(/will not speak from an empty or generic persona/i);
  });
});
