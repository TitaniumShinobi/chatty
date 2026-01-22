/**
 * Lin Chat Route - Uses OpenRouter for cloud-based LLM
 * This replaces the local Ollama dependency for Lin's creative seat
 */

import express from 'express';
import OpenAI from 'openai';

const router = express.Router();

// Initialize OpenRouter client using Replit AI Integrations
const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
});

// Model mapping for seats
const SEAT_MODELS = {
  creative: 'mistralai/mistral-7b-instruct',
  coding: 'deepseek/deepseek-coder-33b-instruct', 
  smalltalk: 'microsoft/phi-3-mini-128k-instruct'
};

/**
 * POST /api/lin/generate
 * Generate a response using OpenRouter
 */
router.post('/generate', async (req, res) => {
  try {
    const { prompt, seat = 'creative', systemPrompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const model = SEAT_MODELS[seat] || SEAT_MODELS.creative;
    
    console.log(`🎭 [Lin Chat] Generating response using ${model} (${seat} seat)`);

    const messages = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const completion = await openrouter.chat.completions.create({
      model,
      messages,
      max_tokens: 2048,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || '';
    
    console.log(`✅ [Lin Chat] Response generated (${response.length} chars)`);
    
    res.json({ 
      response,
      model,
      seat
    });
  } catch (error) {
    console.error('❌ [Lin Chat] Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate response',
      details: error.message 
    });
  }
});

/**
 * GET /api/lin/health
 * Check if OpenRouter is available
 */
router.get('/health', async (req, res) => {
  try {
    // Simple health check - verify env vars are set
    const hasBaseURL = !!process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
    const hasApiKey = !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
    
    if (hasBaseURL && hasApiKey) {
      res.json({ 
        status: 'ok', 
        provider: 'openrouter',
        seats: Object.keys(SEAT_MODELS)
      });
    } else {
      res.status(503).json({ 
        status: 'unavailable',
        error: 'OpenRouter integration not configured'
      });
    }
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

export default router;
