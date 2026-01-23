/**
 * Lin Chat Route - Multi-provider LLM routing
 * 
 * Supports both OpenRouter (cloud) and Ollama (self-hosted) models.
 * Model strings should be prefixed with their provider:
 *   - openrouter:provider/model-name -> Routes to OpenRouter API
 *   - ollama:model:size -> Routes to Ollama server (if configured)
 * 
 * @see docs/MODEL_PROVIDERS.md for setup instructions
 */

import express from 'express';
import OpenAI from 'openai';

const router = express.Router();

// Initialize OpenRouter client using Replit AI Integrations
const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
});

// Default models for Lin's seats (OpenRouter versions)
const DEFAULT_SEAT_MODELS = {
  creative: 'openrouter:google/gemini-2.0-flash-exp:free',
  coding: 'openrouter:deepseek/deepseek-chat', 
  smalltalk: 'openrouter:meta-llama/llama-3.3-70b-instruct:free'
};

/**
 * Parse model string to extract provider and model name
 * @param {string} modelString - e.g., 'openrouter:mistralai/mistral-7b-instruct' or 'ollama:phi3:latest'
 * @returns {{ provider: string, model: string }}
 */
function parseModelString(modelString) {
  if (!modelString) {
    return { provider: 'openrouter', model: 'mistralai/mistral-7b-instruct' };
  }
  
  if (modelString.startsWith('openrouter:')) {
    return { provider: 'openrouter', model: modelString.substring(11) };
  }
  
  if (modelString.startsWith('ollama:')) {
    return { provider: 'ollama', model: modelString.substring(7) };
  }
  
  // Legacy format - assume it's an OpenRouter model if it contains '/'
  if (modelString.includes('/')) {
    return { provider: 'openrouter', model: modelString };
  }
  
  // Otherwise assume Ollama (backwards compatibility)
  return { provider: 'ollama', model: modelString };
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(model, messages, options = {}) {
  const completion = await openrouter.chat.completions.create({
    model,
    messages,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature || 0.7,
  });
  
  return completion.choices[0]?.message?.content || '';
}

/**
 * Call Ollama API
 * NOTE: Requires OLLAMA_HOST environment variable to be set
 */
async function callOllama(model, messages, options = {}) {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  
  // Convert messages to Ollama format (simple prompt)
  const prompt = messages.map(m => {
    if (m.role === 'system') return `System: ${m.content}`;
    if (m.role === 'user') return `User: ${m.content}`;
    if (m.role === 'assistant') return `Assistant: ${m.content}`;
    return m.content;
  }).join('\n\n');
  
  const response = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 2048,
      }
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama error: ${error}`);
  }
  
  const data = await response.json();
  return data.response || '';
}

/**
 * POST /api/lin/generate
 * Generate a response using the appropriate provider
 */
router.post('/generate', async (req, res) => {
  try {
    const { prompt, seat = 'creative', systemPrompt, model: requestedModel } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Determine which model to use
    const modelString = requestedModel || DEFAULT_SEAT_MODELS[seat] || DEFAULT_SEAT_MODELS.creative;
    const { provider, model } = parseModelString(modelString);
    
    console.log(`🎭 [Lin Chat] Generating response using ${provider}:${model} (${seat} seat)`);

    // Build messages array
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    let response;
    
    if (provider === 'openrouter') {
      response = await callOpenRouter(model, messages);
    } else if (provider === 'ollama') {
      // Check if Ollama is configured
      if (!process.env.OLLAMA_HOST) {
        return res.status(503).json({
          error: 'Ollama not configured',
          details: 'Set OLLAMA_HOST environment variable to use Ollama models. See docs/MODEL_PROVIDERS.md for setup instructions.'
        });
      }
      response = await callOllama(model, messages);
    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }
    
    console.log(`✅ [Lin Chat] Response generated via ${provider} (${response.length} chars)`);
    
    res.json({ 
      response,
      model: `${provider}:${model}`,
      provider,
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
 * Check provider availability
 */
router.get('/health', async (req, res) => {
  try {
    const providers = {
      openrouter: {
        available: !!(process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY),
        configured: true
      },
      ollama: {
        available: !!process.env.OLLAMA_HOST,
        configured: !!process.env.OLLAMA_HOST,
        host: process.env.OLLAMA_HOST || null
      }
    };
    
    const anyAvailable = providers.openrouter.available || providers.ollama.available;
    
    res.json({ 
      status: anyAvailable ? 'ok' : 'unavailable',
      providers,
      defaultSeats: DEFAULT_SEAT_MODELS,
      documentation: 'See docs/MODEL_PROVIDERS.md for setup instructions'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

/**
 * GET /api/lin/models
 * List available models from configured providers
 */
router.get('/models', async (req, res) => {
  try {
    const models = {
      openrouter: [
        'openrouter:meta-llama/llama-3.1-8b-instruct',
        'openrouter:meta-llama/llama-3.1-70b-instruct',
        'openrouter:mistralai/mistral-7b-instruct',
        'openrouter:deepseek/deepseek-coder-33b-instruct',
        'openrouter:microsoft/phi-3-mini-128k-instruct',
      ],
      ollama: process.env.OLLAMA_HOST ? [
        'ollama:phi3:latest',
        'ollama:mistral:7b',
        'ollama:llama3:8b',
        'ollama:deepseek-coder:6.7b',
      ] : []
    };
    
    res.json({
      models,
      defaultSeats: DEFAULT_SEAT_MODELS,
      note: 'Ollama models require OLLAMA_HOST to be configured. See docs/MODEL_PROVIDERS.md'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
