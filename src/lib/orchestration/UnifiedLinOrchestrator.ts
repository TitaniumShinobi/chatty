import { UnifiedLinOrchestrator as EngineUnifiedLinOrchestrator } from '../../engine/orchestration/UnifiedLinOrchestrator';
import { logEvent } from '../utils/logger';

interface OrchestrateLinTurnParams {
  rawInput: string;
  userId: string;
}

export async function orchestrateLinTurn({ rawInput, userId }: OrchestrateLinTurnParams) {
  try {
    const orchestrator = new EngineUnifiedLinOrchestrator();
    const response = await orchestrator.orchestrateResponseWithAutoRuntime(
      rawInput,
      userId,
      `lin-legacy-${Date.now()}`,
      [],
      [],
      'lin-001'
    );

    logEvent('Orchestration successful', { userId, response });

    return response;
  } catch (error: unknown) {
    logEvent('Orchestration error', { userId, error });
    return { error: 'Orchestration failed', details: error instanceof Error ? error.message : String(error) };
  }
}

export { EngineUnifiedLinOrchestrator as UnifiedLinOrchestrator };
