import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createInvite,
  acceptInvite,
  getFamilyForUser,
  getChildSettings,
  updateChildSettings,
  getReportsForChild,
  markReportReviewed,
  removeChildLink,
  revokeInvite,
  getAccountType,
  isAgeVerified18,
  setAgeVerification,
  setStepUpRequired,
  isStepUpRequired,
  clearStepUp,
} from '../lib/familyManager.js';

const router = express.Router();

function resolveUserId(user = {}) {
  return user.sub || user.id || user.uid || user.user_id || user._id;
}

router.use(requireAuth);

router.get('/status', async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    const email = req.user.email;
    const family = await getFamilyForUser(userId, email);
    res.json({ ok: true, ...family });
  } catch (error) {
    console.error('[Family] Status error:', error);
    res.status(500).json({ ok: false, error: 'Failed to load family status' });
  }
});

router.post('/invite', async (req, res) => {
  try {
    const parentUserId = resolveUserId(req.user);
    const parentEmail = req.user.email;
    const { childEmail, childName } = req.body;

    if (!childEmail || !childEmail.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Valid email required' });
    }

    if (childEmail === parentEmail) {
      return res.status(400).json({ ok: false, error: 'Cannot invite yourself' });
    }

    const result = await createInvite(parentUserId, parentEmail, childEmail, childName);
    res.json(result);
  } catch (error) {
    console.error('[Family] Invite error:', error);
    res.status(500).json({ ok: false, error: 'Failed to create invite' });
  }
});

router.post('/accept', async (req, res) => {
  try {
    const childUserId = resolveUserId(req.user);
    const childEmail = req.user.email;
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ ok: false, error: 'Invite code required' });
    }

    const result = await acceptInvite(childUserId, childEmail, inviteCode.toUpperCase());
    res.json(result);
  } catch (error) {
    console.error('[Family] Accept error:', error);
    res.status(500).json({ ok: false, error: 'Failed to accept invite' });
  }
});

router.get('/children', async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    const email = req.user.email;
    const family = await getFamilyForUser(userId, email);

    if (!family.isParent) {
      return res.status(403).json({ ok: false, error: 'Not a parent account' });
    }

    res.json({ ok: true, children: family.children, pendingInvites: family.pendingInvites });
  } catch (error) {
    console.error('[Family] Children error:', error);
    res.status(500).json({ ok: false, error: 'Failed to load children' });
  }
});

router.put('/child-settings/:childUserId', async (req, res) => {
  try {
    const parentUserId = resolveUserId(req.user);
    const { childUserId } = req.params;
    const updates = req.body;

    const result = await updateChildSettings(parentUserId, childUserId, updates);
    res.json(result);
  } catch (error) {
    console.error('[Family] Update settings error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update settings' });
  }
});

router.get('/reports/:childUserId', async (req, res) => {
  try {
    const parentUserId = resolveUserId(req.user);
    const { childUserId } = req.params;
    const { severity, since, includeReviewed, limit } = req.query;

    const result = await getReportsForChild(parentUserId, childUserId, {
      severity,
      since,
      includeReviewed: includeReviewed === 'true',
      limit: limit ? parseInt(limit) : 50,
    });

    res.json(result);
  } catch (error) {
    console.error('[Family] Reports error:', error);
    res.status(500).json({ ok: false, error: 'Failed to load reports' });
  }
});

router.post('/reports/:reportId/reviewed', async (req, res) => {
  try {
    const parentUserId = resolveUserId(req.user);
    const { reportId } = req.params;

    const result = await markReportReviewed(parentUserId, reportId);
    res.json(result);
  } catch (error) {
    console.error('[Family] Review report error:', error);
    res.status(500).json({ ok: false, error: 'Failed to mark report reviewed' });
  }
});

router.delete('/child/:childUserId', async (req, res) => {
  try {
    const parentUserId = resolveUserId(req.user);
    const { childUserId } = req.params;

    const result = await removeChildLink(parentUserId, childUserId);
    res.json(result);
  } catch (error) {
    console.error('[Family] Remove child error:', error);
    res.status(500).json({ ok: false, error: 'Failed to remove child link' });
  }
});

router.delete('/invite/:inviteId', async (req, res) => {
  try {
    const parentUserId = resolveUserId(req.user);
    const { inviteId } = req.params;

    const result = await revokeInvite(parentUserId, inviteId);
    res.json(result);
  } catch (error) {
    console.error('[Family] Revoke invite error:', error);
    res.status(500).json({ ok: false, error: 'Failed to revoke invite' });
  }
});

router.get('/account-type', async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    const accountType = await getAccountType(userId);
    res.json({ ok: true, accountType });
  } catch (error) {
    console.error('[Family] Account type error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get account type' });
  }
});

router.get('/age-verification', async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    const verified = await isAgeVerified18(userId);
    res.json({ ok: true, verified });
  } catch (error) {
    console.error('[Family] Age verification check error:', error);
    res.status(500).json({ ok: false, error: 'Failed to check age verification' });
  }
});

router.post('/age-verification', async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    const accountType = await getAccountType(userId);
    if (accountType === 'child') {
      return res.status(403).json({ ok: false, error: 'Child accounts cannot self-verify age.' });
    }
    const { confirmed } = req.body;
    if (confirmed !== true) {
      return res.status(400).json({ ok: false, error: 'You must confirm you are 18 or older.' });
    }
    await setAgeVerification(userId, true, 'self_declared');
    console.log(`[AgeVerification] User ${userId} self-declared 18+ verification`);
    res.json({ ok: true, verified: true, method: 'self_declared' });
  } catch (error) {
    console.error('[Family] Age verification error:', error);
    res.status(500).json({ ok: false, error: 'Failed to verify age' });
  }
});

router.get('/step-up', async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    const required = await isStepUpRequired(userId);
    res.json({ ok: true, required });
  } catch (error) {
    console.error('[Family] Step-up check error:', error);
    res.status(500).json({ ok: false, error: 'Failed to check step-up status' });
  }
});

router.post('/step-up/trigger', async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    await setStepUpRequired(userId, true);
    console.log(`[StepUp] Triggered step-up auth for ${userId}`);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Family] Step-up trigger error:', error);
    res.status(500).json({ ok: false, error: 'Failed to trigger step-up' });
  }
});

router.post('/step-up/clear', async (req, res) => {
  try {
    const userId = resolveUserId(req.user);
    const verified = await isAgeVerified18(userId);
    if (!verified) {
      return res.status(403).json({ ok: false, error: 'Age verification required before clearing step-up.' });
    }
    await clearStepUp(userId);
    console.log(`[StepUp] Cleared step-up for ${userId} (re-authenticated)`);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Family] Step-up clear error:', error);
    res.status(500).json({ ok: false, error: 'Failed to clear step-up' });
  }
});

export default router;
