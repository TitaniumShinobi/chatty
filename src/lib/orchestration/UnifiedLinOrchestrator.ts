import { triadSanityCheck } from '../triad/triadValidator';
import { buildFinalPrompt } from '../context/buildFinalPrompt';
import { routeLLM } from '../runtime/routeLLM';
import { injectUndertoneCapsule } from '../capsules/undertoneInjector';
import { logEvent } from '../utils/logger';

interface OrchestrateLinTurnParams {
  rawInput: string;
  userId: string;
}

export async function orchestrateLinTurn({ rawInput, userId }: OrchestrateLinTurnParams) {
  try {
    // Step 1: Perform triad sanity check
    const triadResult = triadSanityCheck(rawInput);
    if (!triadResult.isValid) {
      logEvent('Triad validation failed', { userId, issues: triadResult.issues });
      return { error: 'Triad validation failed', details: triadResult.issues };
    }

    // Step 2: Inject undertone capsule if drift detected
    if (triadResult.driftDetected) {
      rawInput = injectUndertoneCapsule(rawInput, 'lin-001');
    }

    // Step 3: Build the final prompt
    const { prompt, metadata } = await buildFinalPrompt(rawInput, userId);

    // Step 4: Route the prompt through LLM
    const response = await routeLLM(prompt, metadata);

    // Step 5: Log the successful orchestration
    logEvent('Orchestration successful', { userId, response });

    return response;
  } catch (error) {
    logEvent('Orchestration error', { userId, error });
    return { error: 'Orchestration failed', details: error.message };
  }
}