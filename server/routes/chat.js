import express from 'express';
import { getChatService } from '../services/chatService.js';

const router = express.Router();
const chatService = getChatService();

/**
 * @route GET /api/app/personas
 * @desc Get all available AI personas
 * @access Public
 */
router.get('/personas', async (req, res) => {
    try {
        const personas = await chatService.getPersonas();
        res.json(personas);
    } catch (error) {
        console.error('Error fetching personas:', error);
        res.status(500).json({ error: 'Failed to fetch personas' });
    }
});

export default router;