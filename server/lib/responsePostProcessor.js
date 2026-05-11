import { runPersonaHeartbeat } from './personaHeartbeat.js';
import { evaluateIdentityCoherence } from './identityCoherenceGuard.js';
import { applyHumanConversationGuard } from './humanConversationGuard.js';

export async function applyResponsePostProcessing({
  aiResponse,
  previousAssistant,
  buildMessages,
  userMessage,
  history,
  constructId,
  constructDisplayName,
  regenClient,
  regenModel,
  fallbackText,
  recitalRewriter,
  identityGuard,
  cutoffRewriter,
  evidencePreview = {},
  greetingTurnContext = null,
}) {
  let currentText = aiResponse;

  const recitalResult = recitalRewriter
    ? await recitalRewriter(currentText)
    : { text: currentText, detected: false, rewritten: false };
  currentText = recitalResult.text;

  const heartbeatResult = await runPersonaHeartbeat(currentText, previousAssistant, {
    buildMessages,
    message: userMessage,
    history,
    constructId,
    constructDisplayName,
    regenClient,
    regenModel,
    fallbackText,
  });
  currentText = heartbeatResult.text;

  const identityResult = identityGuard
    ? await identityGuard(currentText)
    : {
        response: currentText,
        identity_drift_detected: false,
        identity_rewrite_applied: false,
        identity_fallback_applied: false,
      };
  currentText = identityResult.response;

  const cutoffResult = cutoffRewriter
    ? await cutoffRewriter(currentText)
    : { text: currentText, detected: false, rewritten: false };
  currentText = cutoffResult.text;

  currentText = applyHumanConversationGuard(currentText, {
    userMessage,
    constructId,
    constructDisplayName,
    greetingTurnContext,
  });

  const identityCoherence = evaluateIdentityCoherence({
    userMessage,
    aiResponse: currentText,
    constructId,
    constructDisplayName,
    evidencePreview,
    greetingTurnContext,
  });

  return {
    aiResponse: currentText,
    recitalDetected: recitalResult.detected === true,
    recitalRewriteApplied: recitalResult.rewritten === true,
    personaDriftDetected: heartbeatResult.drift === true,
    personaRegenApplied: heartbeatResult.regenerated === true,
    repeatDetected: heartbeatResult.repeat === true,
    identityDriftDetected: identityResult.identity_drift_detected === true,
    identityRewriteApplied: identityResult.identity_rewrite_applied === true,
    identityFallbackApplied: identityResult.identity_fallback_applied === true,
    cutoffViolationDetected: cutoffResult.detected === true,
    cutoffRewriteApplied: cutoffResult.rewritten === true,
    identityCoherence,
  };
}
