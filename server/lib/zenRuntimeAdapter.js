import { getVvaultBridgeConfig } from './vvaultBridgeConfig.js';

const ZEN_CONSTRUCT_ID = 'zen-001';
const env = (globalThis && globalThis.process && globalThis.process.env) ? globalThis.process.env : {};
const DEFAULT_RUNTIME = Object.freeze({
  provider: env.ZEN_RUNTIME_PROVIDER || 'ollama',
  model: env.ZEN_RUNTIME_MODEL || 'zen-sim',
});

function resolveRuntimeSelection(preferred = null) {
  const provider = preferred?.provider || DEFAULT_RUNTIME.provider;
  const model = preferred?.model || DEFAULT_RUNTIME.model;
  return { provider, model };
}

export async function routeLLM({
  constructId = ZEN_CONSTRUCT_ID,
  message,
  userEmail,
  runtime = null,
  capsuleContext = null,
  memoryContext = null,
}) {
  const selected = resolveRuntimeSelection(runtime);
  const { vvaultApiBaseUrl, serviceToken } = getVvaultBridgeConfig();

  if (!vvaultApiBaseUrl) {
    throw new Error('VVAULT API not configured for zen runtime relay');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (serviceToken) headers['X-Chatty-Key'] = serviceToken;
  if (userEmail) headers['X-Chatty-User'] = userEmail;

  const payload = {
    constructId,
    message,
    runtime: selected,
    metadata: {
      relay: 'zenRuntimeAdapter',
      capsuleContextPresent: Boolean(capsuleContext),
      memoryContextPresent: Boolean(memoryContext),
    },
  };

  const upstream = await fetch(`${vvaultApiBaseUrl.replace(/\/$/, '')}/api/chatty/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (upstream.status === 202) {
    const data = await upstream.json().catch(() => ({ deferred: true }));
    return {
      ok: true,
      deferred: true,
      runtime: selected,
      response: data.response || '',
      raw: data,
    };
  }

  if (!upstream.ok) {
    const details = await upstream.text().catch(() => `Runtime relay failed (${upstream.status})`);
    throw new Error(details || `Runtime relay failed (${upstream.status})`);
  }

  const data = await upstream.json();
  return {
    ok: true,
    deferred: false,
    runtime: selected,
    response: data.response || '',
    raw: data,
  };
}

export { DEFAULT_RUNTIME, ZEN_CONSTRUCT_ID };
