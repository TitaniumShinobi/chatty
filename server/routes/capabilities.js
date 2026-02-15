import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveUserId } from '../lib/resolveUserId.js';
import { resolveCapabilities, formatCapabilityContext } from '../lib/capabilityManifest.js';
import { setMirrorSession, clearMirrorSession } from '../lib/mirrorSessionTracker.js';

const router = express.Router();
router.use(requireAuth);

router.get('/:constructId/:threadId', async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    if (!userId) return res.status(401).json({ ok: false, error: 'Unable to identify user.' });
    const { constructId, threadId } = req.params;
    const manifest = await resolveCapabilities(constructId, threadId, userId);
    res.json({ ok: true, manifest });
  } catch (error) {
    console.error('[Capabilities] Error resolving:', error);
    res.status(500).json({ ok: false, error: 'Failed to resolve capabilities' });
  }
});

router.post('/mirror/state', async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    if (!userId) return res.status(401).json({ ok: false, error: 'Unable to identify user.' });
    const { constructId, threadId, active, permission, source } = req.body;
    if (!constructId || !threadId) {
      return res.status(400).json({ ok: false, error: 'Missing constructId or threadId' });
    }
    if (active) {
      setMirrorSession(constructId, threadId, { active: true, permission, source, userId });
    } else {
      clearMirrorSession(constructId, threadId, userId);
    }
    console.log(`[Mirror] Session ${active ? 'started' : 'stopped'} for ${constructId}:${threadId} by ${userId} (${permission || 'n/a'})`);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Mirror] State update error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update mirror state' });
  }
});

export default router;
