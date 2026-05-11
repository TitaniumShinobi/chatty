import { buildEnrichedContext } from './memoryContextBuilder.js';
import { masterScriptsManager } from './masterScriptsBridge.js';
import { enforcementService } from '../services/identity/index.js';
import { getVvaultBridgeConfig } from './vvaultBridgeConfig.js';
import { routeLLM, ZEN_CONSTRUCT_ID } from './zenRuntimeAdapter.js';
import { publishZenLiveTranscriptEvent } from './zenLiveTranscript.js';

function vvaultHeaders(userEmail) {
  const { serviceToken } = getVvaultBridgeConfig();
  const headers = { 'Content-Type': 'application/json' };
  if (serviceToken) headers['X-Chatty-Key'] = serviceToken;
  if (userEmail) headers['X-Chatty-User'] = userEmail;
  return headers;
}

function vvaultUrl(pathname) {
  const { vvaultApiBaseUrl } = getVvaultBridgeConfig();
  if (!vvaultApiBaseUrl) throw new Error('VVAULT API not configured for zen pipeline');
  return `${vvaultApiBaseUrl.replace(/\/$/, '')}${pathname}`;
}

function buildZenLiveTurnId() {
  return `zen-live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function publishZenLiveEventSafe(event) {
  try {
    publishZenLiveTranscriptEvent(event);
  } catch (error) {
    console.warn('[ZenLiveTranscript] Failed to publish event:', error?.message || error);
  }
}

export async function ensureZenControlLayer(user) {
  const construct = masterScriptsManager.getConstruct(ZEN_CONSTRUCT_ID);
  if (construct) return { initialized: false, constructId: ZEN_CONSTRUCT_ID };

  const userId = user?.id || user?.sub || user?.email || 'anonymous';
  await masterScriptsManager.initializeConstruct(ZEN_CONSTRUCT_ID, String(userId));
  return { initialized: true, constructId: ZEN_CONSTRUCT_ID };
}

export async function getZenThread(userEmail) {
  const response = await fetch(vvaultUrl(`/api/chatty/transcript/${ZEN_CONSTRUCT_ID}`), {
    headers: vvaultHeaders(userEmail),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => 'Failed to fetch Zen thread');
    throw new Error(details || 'Failed to fetch Zen thread');
  }

  return await response.json();
}

export async function appendZenThreadMessage({
  role,
  content,
  timestamp,
  userEmail,
  publishLiveEvent = false,
  sourceProduct = 'chatty',
  turnId = null,
}) {
  const response = await fetch(vvaultUrl(`/api/chatty/transcript/${ZEN_CONSTRUCT_ID}/message`), {
    method: 'POST',
    headers: vvaultHeaders(userEmail),
    body: JSON.stringify({ role, content, timestamp: timestamp || new Date().toISOString() }),
  });

  if (response.status === 202) {
    return { ok: true, deferred: true, payload: await response.json().catch(() => ({ deferred: true })) };
  }

  if (!response.ok) {
    const details = await response.text().catch(() => 'Failed to append zen message');
    throw new Error(details || 'Failed to append zen message');
  }

  const payload = await response.json();
  if (publishLiveEvent) {
    publishZenLiveEventSafe({
      kind: role === 'assistant' ? 'assistant_done' : 'user_message',
      turnId: turnId || buildZenLiveTurnId(),
      sourceProduct,
      content,
      timestamp: timestamp || new Date().toISOString(),
    });
  }

  return { ok: true, deferred: false, payload };
}

export async function buildZenCapsuleAndMemoryContext({ user, message, threadId }) {
  const userId = user?.id || user?.sub || user?.email || null;
  const userEmail = user?.email || null;

  const enriched = await buildEnrichedContext({
    userId,
    constructId: ZEN_CONSTRUCT_ID,
    userMessage: message,
    user: { email: userEmail || userId || 'unknown' },
    threadId: threadId || `${ZEN_CONSTRUCT_ID}_chat_with_${ZEN_CONSTRUCT_ID}`,
  });

  return {
    capsuleContext: {
      loaded: Boolean(enriched?.capsuleLoaded),
      systemPromptLength: enriched?.systemPrompt?.length || 0,
    },
    memoryContext: {
      loaded: Boolean(enriched?.memoriesLoaded),
      diagnostics: enriched?.memoryDiagnostics || null,
    },
    enrichedSystemPrompt: enriched?.systemPrompt || '',
  };
}

export function enforceZenIdentity({ message, fingerprint = null }) {
  try {
    return enforcementService.validateIncomingMessage({
      constructId: ZEN_CONSTRUCT_ID,
      fingerprint,
      content: message,
    });
  } catch (error) {
    return {
      valid: false,
      reason: error?.message || 'identity_enforcement_error',
    };
  }
}

export async function runZenTurn({ user, message, runtime = null, fingerprint = null }) {
  const userEmail = user?.email || null;
  const turnId = buildZenLiveTurnId();
  const control = await ensureZenControlLayer(user);
  const identity = enforceZenIdentity({ message, fingerprint });

  const nonBlockingIdentityReasons = new Set(['validation_failed', 'unknown_construct']);
  if (identity && identity.valid === false && !nonBlockingIdentityReasons.has(identity.reason)) {
    return {
      ok: false,
      error: `Identity enforcement blocked message: ${identity.reason}`,
      identity,
      control,
    };
  }

  const context = await buildZenCapsuleAndMemoryContext({
    user,
    message,
    threadId: `${ZEN_CONSTRUCT_ID}_chat_with_${ZEN_CONSTRUCT_ID}`,
  });

  const userWrite = await appendZenThreadMessage({
    role: 'user',
    content: message,
    userEmail,
    publishLiveEvent: true,
    turnId,
    sourceProduct: 'chatty',
  });

  if (userWrite.deferred) {
    return {
      ok: true,
      deferred: true,
      control,
      identity,
      runtime: runtime || null,
      response: '',
    };
  }

  publishZenLiveEventSafe({
    kind: 'status',
    turnId,
    sourceProduct: 'chatty',
    status: 'routing_assistant_turn',
  });

  try {
    const runtimeResult = await routeLLM({
      constructId: ZEN_CONSTRUCT_ID,
      message,
      userEmail,
      runtime,
      capsuleContext: context.capsuleContext,
      memoryContext: context.memoryContext,
    });

    if (runtimeResult.deferred) {
      publishZenLiveEventSafe({
        kind: 'status',
        turnId,
        sourceProduct: 'chatty',
        status: 'assistant_deferred',
      });

      return {
        ok: true,
        deferred: true,
        response: runtimeResult.response || '',
        runtime: runtimeResult.runtime,
        control,
        identity,
        capsuleContext: context.capsuleContext,
        memoryContext: context.memoryContext,
      };
    }

    publishZenLiveEventSafe({
      kind: 'assistant_started',
      turnId,
      sourceProduct: 'chatty',
      status: 'responding',
    });

    if (runtimeResult.response) {
      publishZenLiveEventSafe({
        kind: 'assistant_token',
        turnId,
        sourceProduct: 'chatty',
        token: runtimeResult.response,
      });
    }

    if (runtimeResult.response) {
      await appendZenThreadMessage({
        role: 'assistant',
        content: runtimeResult.response,
        userEmail,
      });
    }

    publishZenLiveEventSafe({
      kind: 'assistant_done',
      turnId,
      sourceProduct: 'chatty',
      content: runtimeResult.response || '',
      status: 'complete',
    });

    return {
      ok: true,
      deferred: false,
      response: runtimeResult.response || '',
      runtime: runtimeResult.runtime,
      control,
      identity,
      capsuleContext: context.capsuleContext,
      memoryContext: context.memoryContext,
    };
  } catch (error) {
    publishZenLiveEventSafe({
      kind: 'assistant_error',
      turnId,
      sourceProduct: 'chatty',
      message: error?.message || 'Zen live assistant turn failed.',
      status: 'error',
    });
    throw error;
  }
}
