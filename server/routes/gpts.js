import express from 'express';
import { body, validationResult } from 'express-validator';
import GPT from '../models/GPT.js';
import User from '../models/User.js';

const router = express.Router();

// Get all GPTs for user
router.get('/', async (req, res) => {
  try {
    const gpts = await GPT.find({ userId: req.user._id })
      .sort({ createdAt: -1 });

    res.json(gpts.map(gpt => gpt.getFullData()));
  } catch (error) {
    console.error('Get GPTs error:', error);
    res.status(500).json({ error: 'Failed to fetch GPTs' });
  }
});

// Get single GPT
router.get('/:id', async (req, res) => {
  try {
    const gpt = await GPT.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!gpt) {
      return res.status(404).json({ error: 'GPT not found' });
    }

    res.json(gpt.getFullData());
  } catch (error) {
    console.error('Get GPT error:', error);
    res.status(500).json({ error: 'Failed to fetch GPT' });
  }
});

// Create new GPT
router.post('/', [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('description').trim().isLength({ min: 1, max: 500 }),
  body('instructions').trim().isLength({ min: 1 }),
  body('conversationStarters').optional().isArray(),
  body('capabilities').optional().isObject(),
  body('modelId').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      description,
      instructions,
      conversationStarters = [],
      capabilities = {
        webSearch: false,
        canvas: false,
        imageGeneration: false,
        codeInterpreter: true
      },
      modelId = 'chatty-core'
    } = req.body;

    const gpt = new GPT({
      userId: req.user._id,
      name,
      description,
      instructions,
      conversationStarters,
      capabilities,
      modelId
    });

    await gpt.save();

    // Update user usage stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 'usage.gptsCreated': 1 },
      $set: { 'usage.lastActivity': new Date() }
    });

    res.status(201).json(gpt.getFullData());
  } catch (error) {
    console.error('Create GPT error:', error);
    res.status(500).json({ error: 'Failed to create GPT' });
  }
});

// Update GPT
router.put('/:id', [
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ min: 1, max: 500 }),
  body('instructions').optional().trim().isLength({ min: 1 }),
  body('conversationStarters').optional().isArray(),
  body('capabilities').optional().isObject(),
  body('modelId').optional().isString(),
  body('isActive').optional().isBoolean(),
  body('isPublic').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const gpt = await GPT.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true }
    );

    if (!gpt) {
      return res.status(404).json({ error: 'GPT not found' });
    }

    res.json(gpt.getFullData());
  } catch (error) {
    console.error('Update GPT error:', error);
    res.status(500).json({ error: 'Failed to update GPT' });
  }
});

// Delete GPT
router.delete('/:id', async (req, res) => {
  try {
    const gpt = await GPT.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!gpt) {
      return res.status(404).json({ error: 'GPT not found' });
    }

    res.json({ message: 'GPT deleted successfully' });
  } catch (error) {
    console.error('Delete GPT error:', error);
    res.status(500).json({ error: 'Failed to delete GPT' });
  }
});

// Set active GPT
router.patch('/:id/activate', async (req, res) => {
  try {
    // Deactivate all other GPTs for this user
    await GPT.updateMany(
      { userId: req.user._id },
      { isActive: false }
    );

    // Activate the selected GPT
    const gpt = await GPT.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isActive: true },
      { new: true }
    );

    if (!gpt) {
      return res.status(404).json({ error: 'GPT not found' });
    }

    res.json(gpt.getFullData());
  } catch (error) {
    console.error('Activate GPT error:', error);
    res.status(500).json({ error: 'Failed to activate GPT' });
  }
});

export default router;
