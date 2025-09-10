import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';

const router = express.Router();

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    res.json(req.user.getPublicProfile());
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', [
  body('name').optional().trim().isLength({ min: 2, max: 50 }),
  body('avatar').optional().isURL()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, avatar } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 
        ...(name && { name }),
        ...(avatar && { avatar })
      },
      { new: true }
    );

    res.json(user.getPublicProfile());
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Update user settings
router.put('/settings', [
  body('theme').optional().isIn(['dark', 'light']),
  body('autoSave').optional().isBoolean(),
  body('maxHistory').optional().isInt({ min: 10, max: 1000 }),
  body('notifications.email').optional().isBoolean(),
  body('notifications.push').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { theme, autoSave, maxHistory, notifications } = req.body;

    const updateData = {};
    if (theme) updateData['settings.theme'] = theme;
    if (autoSave !== undefined) updateData['settings.autoSave'] = autoSave;
    if (maxHistory) updateData['settings.maxHistory'] = maxHistory;
    if (notifications?.email !== undefined) updateData['settings.notifications.email'] = notifications.email;
    if (notifications?.push !== undefined) updateData['settings.notifications.push'] = notifications.push;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    );

    res.json(user.getPublicProfile());
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get user usage statistics
router.get('/usage', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('usage');
    res.json(user.usage);
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ error: 'Failed to fetch usage statistics' });
  }
});

// Get user login history
router.get('/login-history', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('loginHistory');
    res.json(user.loginHistory);
  } catch (error) {
    console.error('Get login history error:', error);
    res.status(500).json({ error: 'Failed to fetch login history' });
  }
});

export default router;
