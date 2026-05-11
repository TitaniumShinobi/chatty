import express from 'express';
import { assertNotLockedSync } from '../lib/runtimeLock.js';
import { canonicalizeConstructId } from '../lib/constructId.js';
import { handleConstructInference } from './vvault.js';

const router = express.Router();

router.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const check = assertNotLockedSync();
  if (!check.allowed) {
    return res.status(503).json({
      ok: false,
      error: 'VVAULT_RUNTIME_LOCKED',
      message: check.reason || 'VVAULT runtime is locked; writes are disabled.',
    });
  }
  next();
});

function normalizeConstructSuccess(payload, constructId) {
  const response =
    payload?.response ??
    payload?.content ??
    payload?.aiResponse?.content ??
    payload?.aiResponse?.message ??
    '';

  return {
    ok: true,
    constructId: payload?.construct_id || payload?.constructId || constructId,
    response,
    provider_used: payload?.provider_used || payload?.source || null,
    model: payload?.model || null,
    tool_trace: payload?.tool_trace,
    deferred: payload?.deferred === true,
  };
}

function normalizeConstructFailure(payload, constructId, fallbackError) {
  return {
    ok: false,
    constructId,
    code: payload?.code || payload?.errorCode || null,
    error: payload?.error || payload?.message || fallbackError || 'Construct inference failed',
    deferred: payload?.deferred === true,
    details: payload?.details,
  };
}

router.post('/:callsign', async (req, res) => {
  const callsign = req.params.callsign;
  const constructId = canonicalizeConstructId(callsign) || callsign;

  if (!constructId) {
    return res.status(400).json({ ok: false, error: 'Invalid construct callsign' });
  }

  req.body = {
    ...(req.body || {}),
    constructId,
    __canonicalConstructId: constructId,
  };

  let statusCode = 200;
  let capturedPayload;

  const proxyRes = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      capturedPayload = body;
      return this;
    },
  };

  try {
    await handleConstructInference(req, proxyRes);
  } catch (error) {
    return res.status(500).json(normalizeConstructFailure(null, constructId, error.message));
  }

  const indicatesFailure =
    statusCode >= 400 ||
    capturedPayload?.ok === false ||
    capturedPayload?.success === false;

  if (indicatesFailure) {
    const failureStatus = statusCode >= 400 ? statusCode : 503;
    return res.status(failureStatus).json(normalizeConstructFailure(capturedPayload, constructId));
  }

  return res.status(200).json(normalizeConstructSuccess(capturedPayload || {}, constructId));
});

export default router;
