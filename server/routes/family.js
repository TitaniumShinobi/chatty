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
} from '../lib/familyManager.js';

const router = express.Router();

router.use(requireAuth);

router.get('/status', async (req, res) => {
  try {
    const userId = req.user.user_id || req.user.sub;
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
    const parentUserId = req.user.user_id || req.user.sub;
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
    const childUserId = req.user.user_id || req.user.sub;
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
    const userId = req.user.user_id || req.user.sub;
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
    const parentUserId = req.user.user_id || req.user.sub;
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
    const parentUserId = req.user.user_id || req.user.sub;
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
    const parentUserId = req.user.user_id || req.user.sub;
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
    const parentUserId = req.user.user_id || req.user.sub;
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
    const parentUserId = req.user.user_id || req.user.sub;
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
    const userId = req.user.user_id || req.user.sub;
    const accountType = await getAccountType(userId);
    res.json({ ok: true, accountType });
  } catch (error) {
    console.error('[Family] Account type error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get account type' });
  }
});

export default router;
