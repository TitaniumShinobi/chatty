/**
 * /api/zen/*
 *
 * ROUTE CLASSIFICATION: NONCANONICAL (separate path)
 * These routes bypass the canonical /api/vvault/message runtime path.
 * They use zenPipelineService directly and emit stub runtime_receipt
 * and orchestration_checklist fields for observability parity.
 *
 * New consumers should target /api/vvault/message for the canonical runtime path.
 */

import express from 'express';
import { requireAuth } from '../auth/middleware/auth.js';
import {
  getZenThread,
  appendZenThreadMessage,
  runZenTurn,
  ensureZenControlLayer,
} from '../lib/zenPipelineService.js';
import { ZEN_CONSTRUCT_ID } from '../lib/zenRuntimeAdapter.js';
import {
  formatZenLiveSseEvent,
  getZenLiveTranscriptSnapshot,
  publishZenLiveTranscriptEvent,
  subscribeZenLiveTranscript,
  ZEN_LIVE_SESSION_ID,
} from '../lib/zenLiveTranscript.js';

const router = express.Router();

router.use(requireAuth);

router.get('/thread', async (req, res) => {
  try {
    const user = req.user || {};
    await ensureZenControlLayer(user);
    const payload = await getZenThread(user.email || null);
    return res.json({
      ok: true,
      constructId: ZEN_CONSTRUCT_ID,
      sessionId: `${ZEN_CONSTRUCT_ID}_chat_with_${ZEN_CONSTRUCT_ID}`,
      thread: payload,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to fetch zen thread' });
  }
});

router.get('/live', (req, res) => {
  const sessionId = String(req.query?.sessionId || ZEN_LIVE_SESSION_ID);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': zen live transcript connected\n\n');

  for (const event of getZenLiveTranscriptSnapshot(sessionId)) {
    res.write(formatZenLiveSseEvent(event));
  }

  const unsubscribe = subscribeZenLiveTranscript(sessionId, (event) => {
    res.write(formatZenLiveSseEvent(event));
  });
  const heartbeat = setInterval(() => {
    res.write(': zen live transcript heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.get('/live/snapshot', (req, res) => {
  const sessionId = String(req.query?.sessionId || ZEN_LIVE_SESSION_ID);
  const events = getZenLiveTranscriptSnapshot(sessionId);
  return res.json({
    ok: true,
    sessionId: events[0]?.sessionId || ZEN_LIVE_SESSION_ID,
    events,
  });
});

router.post('/live/event', (req, res) => {
  const result = publishZenLiveTranscriptEvent(req.body || {});
  if (!result.ok) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

router.post('/thread/append', async (req, res) => {
  try {
    const { role, content, timestamp, sourceProduct, turnId } = req.body || {};
    if (!role || !String(content || '').trim()) {
      return res.status(400).json({ ok: false, error: 'role and content are required' });
    }

    const user = req.user || {};
    const result = await appendZenThreadMessage({
      role,
      content,
      timestamp,
      userEmail: user.email || null,
      publishLiveEvent: true,
      sourceProduct: sourceProduct || 'chatty',
      turnId: turnId || null,
    });

    if (result.deferred) {
      return res.status(202).json({ ok: true, deferred: true, ...result.payload });
    }

    return res.json({ ok: true, deferred: false, ...result.payload });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to append zen message' });
  }
});

router.post('/send', async (req, res) => {
  try {
    const { message, runtime, fingerprint } = req.body || {};
    if (!String(message || '').trim()) {
      return res.status(400).json({ ok: false, error: 'message is required' });
    }

    const result = await runZenTurn({
      user: req.user || {},
      message: String(message),
      runtime: runtime || null,
      fingerprint: fingerprint || null,
    });

    if (!result.ok) {
      return res.status(409).json({ ...result, _noncanonical: true, _canonical_path: '/api/vvault/message' });
    }

    if (result.deferred) {
      return res.status(202).json({ ...result, _noncanonical: true, _canonical_path: '/api/vvault/message' });
    }

    return res.json({
      ...result,
      runtime_receipt: {
        created_at: new Date().toISOString(),
        route_mode: 'zen_send',
        construct_id: ZEN_CONSTRUCT_ID || 'zen-001',
        _noncanonical: true,
        _canonical_path: '/api/vvault/message',
        _disclaimer: 'Stub receipt. Canonical runtime: /api/vvault/message.',
      },
      orchestration_checklist: {
        responseStatus: result?.ok ? 'zen_routed' : 'zen_error',
        route: '/api/zen/send',
        _noncanonical: true,
        _canonical_path: '/api/vvault/message',
        _disclaimer: 'Stub checklist. Canonical runtime: /api/vvault/message.',
      },
      _noncanonical: true,
      _canonical_path: '/api/vvault/message',
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to run zen turn' });
  }
});

export default router;
