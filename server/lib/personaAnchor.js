export function injectPersonaAnchor(messages = [], options = {}) {
  if (!Array.isArray(messages)) return messages;
  const activeConstruct = options.constructDisplayName || options.constructId || 'the current construct';
  const anchor = {
    role: "system",
    content: `You are ${activeConstruct}.\nStay in that construct's first-person voice.\nDo not explain AI models, policies, or internal documents unless explicitly asked.`,
  };
  return [anchor, ...messages];
}
