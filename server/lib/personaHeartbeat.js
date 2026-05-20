/**
 * Persona heartbeat: drift detection, repetition detection, single regeneration.
 * Used by vvault message route so only corrected output is persisted.
 */

export const HEARTBEAT_FORBIDDEN = [
  /as an ai/i,
  /i am a model/i,
  /trained by/i,
  /according to the document/i,
  /according to (the )?context/i,
  /openai policy/i,
  /mistral ai/i,
];

export function isRepeatResponse(currentText, prevText) {
  if (!currentText || !prevText) return false;
  const a = currentText.trim();
  const b = prevText.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const tailA = a.slice(-180);
  const tailB = b.slice(-180);
  const minLen = Math.min(tailA.length, tailB.length);
  if (minLen < 30) return false;
  let match = 0;
  for (let i = 0; i < minLen; i++) {
    if (tailA[i] === tailB[i]) match++;
  }
  const similarity = match / minLen;
  return similarity >= 0.7;
}

const DEFAULT_FALLBACK_TEXT = "I'm here. Ask me again and I'll answer directly.";

/**
 * Run persona heartbeat: detect drift (forbidden phrases) and repeat (vs previous assistant).
 * If either triggers and regenClient is provided, one regeneration with corrective prompt; else fallback text.
 * @param {string} aiText - Current assistant reply (after recital rewrite if any).
 * @param {string|null} previousAssistant - Previous assistant message content.
 * @param {object} options
 * @param {function(string, Array): Array} options.buildMessages - (userContent, history) => messages[]
 * @param {string} options.message - Current user message.
 * @param {Array} options.history - Conversation history messages.
 * @param {object|null} options.regenClient - OpenAI-compatible client with chat.completions.create.
 * @param {string} options.regenModel - Model for regeneration.
 * @param {string} [options.fallbackText] - Text when no client or regen fails.
 * @param {string} [options.correctivePrompt] - System prompt for regen.
 * @returns {Promise<{ text: string, drift: boolean, repeat: boolean, regenerated: boolean }>}
 */
export async function runPersonaHeartbeat(aiText, previousAssistant, options) {
  const {
    buildMessages,
    message,
    history,
    constructId,
    constructDisplayName,
    regenClient,
    regenModel,
    fallbackText = DEFAULT_FALLBACK_TEXT,
    correctivePrompt,
  } = options;

  const drift = HEARTBEAT_FORBIDDEN.some((p) => p.test(aiText || ""));
  const repeat = isRepeatResponse(aiText, previousAssistant);
  if (!drift && !repeat) return { text: aiText, drift, repeat, regenerated: false };

  if (!regenClient) {
    return {
      text: drift || repeat ? fallbackText : aiText,
      drift,
      repeat,
      regenerated: false,
    };
  }

  const activeConstruct = constructDisplayName || constructId || 'the current construct';
  const resolvedCorrectivePrompt =
    correctivePrompt ||
    `Stay fully in ${activeConstruct}'s first-person voice. No AI, model, system, or policy references. Vary phrasing and avoid repeating the last line.`;
  const heartbeatMessages = buildMessages(message, history);
  heartbeatMessages.unshift({ role: "system", content: resolvedCorrectivePrompt });

  try {
    const regen = await regenClient.chat.completions.create({
      model: regenModel,
      messages: heartbeatMessages,
      max_tokens: 400,
    });
    const newText = regen.choices[0]?.message?.content || fallbackText;
    return { text: newText, drift, repeat, regenerated: true };
  } catch {
    return { text: fallbackText, drift, repeat, regenerated: false };
  }
}
