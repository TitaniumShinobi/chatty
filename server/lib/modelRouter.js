/**
 * Simple model fallback wrapper for OpenRouter-style clients.
 * Tries each model in order until a response is returned.
 * Expects an OpenAI-compatible client (chat.completions.create).
 */
export async function callModel(client, messages, { models = [], max_tokens = 2048, temperature, top_p } = {}) {
  if (!client || !Array.isArray(messages)) {
    throw new Error('callModel: missing client or messages');
  }
  const candidates = Array.from(new Set(models.filter(Boolean)));
  let lastError = null;
  for (const model of candidates) {
    try {
      const resp = await client.chat.completions.create({
        model,
        messages,
        max_tokens,
        temperature,
        top_p,
      });
      if (resp?.choices?.[0]?.message?.content) {
        return { ok: true, model, response: resp.choices[0].message.content, raw: resp };
      }
      lastError = new Error('Empty response content');
    } catch (err) {
      lastError = err;
    }
  }
  return { ok: false, error: lastError };
}
