/**
 * Lin Chat Route - Multi-provider LLM routing with Memory Injection
 * 
 * Supports both OpenRouter (cloud) and Ollama (self-hosted) models.
 * Model strings should be prefixed with their provider:
 *   - openrouter:provider/model-name -> Routes to OpenRouter API
 *   - ollama:model:size -> Routes to Ollama server (if configured)
 * 
 * Memory Enhancement:
 *   - When constructId is provided, loads transcripts from Supabase
 *   - Injects relevant conversation history into system prompts
 * 
 * @see docs/MODEL_PROVIDERS.md for setup instructions
 */

import express from 'express';
import OpenAI from 'openai';
import { getSupabaseClient } from '../lib/supabaseClient.js';

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
 * Load transcripts from Supabase for memory injection
 * @param {string} constructId - Construct callsign (e.g., 'katana-001')
 * @param {string} userEmail - User's email for Supabase lookup (required for security)
 * @returns {Promise<string>} Formatted memory context
 */
async function loadTranscriptMemories(constructId, userEmail) {
  // Security: Require authenticated user email
  if (!userEmail) {
    console.log('⚠️ [LinChat Memory] No user email provided - memory access denied');
    return '';
  }
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.log('⚠️ [LinChat Memory] Supabase not configured');
      return '';
    }
    
    // Find user ID from email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${userEmail},name.eq.${userEmail}`)
      .limit(1)
      .single();
    
    if (userError || !user) {
      console.log(`⚠️ [LinChat Memory] User not found: ${userEmail}`);
      return '';
    }
    
    // Load transcripts for this construct
    const { data: files, error } = await supabase
      .from('vault_files')
      .select('filename, content, metadata')
      .eq('user_id', user.id)
      .eq('file_type', 'transcript')
      .ilike('filename', `%${constructId}%`)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error || !files || files.length === 0) {
      console.log(`📚 [LinChat Memory] No transcripts found for ${constructId}`);
      return '';
    }
    
    console.log(`📚 [LinChat Memory] Loading ${files.length} transcripts for ${constructId}`);
    
    // Extract conversation snippets from transcripts
    const memories = [];
    for (const file of files) {
      if (!file.content) continue;
      
      // Parse markdown transcript
      const lines = file.content.split('\n');
      let currentExchange = [];
      
      for (const line of lines) {
        // Match patterns like "**User:**" or "Devon:" or "Katana:"
        const speakerMatch = line.match(/^\*?\*?([^:*]+)\*?\*?:\s*(.*)$/);
        if (speakerMatch) {
          const speaker = speakerMatch[1].trim();
          const content = speakerMatch[2].trim();
          if (content) {
            currentExchange.push(`${speaker}: ${content}`);
            // Keep recent exchanges (rolling window)
            if (currentExchange.length > 10) {
              currentExchange.shift();
            }
          }
        }
      }
      
      if (currentExchange.length > 0) {
        memories.push(...currentExchange.slice(-5)); // Last 5 exchanges from each file
      }
    }
    
    if (memories.length === 0) {
      return '';
    }
    
    // Format as memory context
    const memoryContext = `
## MEMORY - Previous Conversations
You have these memories from past conversations with this user:

${memories.slice(0, 20).join('\n')}

Use these memories to maintain continuity and reference past discussions when relevant.
`;
    
    console.log(`✅ [LinChat Memory] Injected ${memories.length} memory snippets`);
    return memoryContext;
  } catch (error) {
    console.error('❌ [LinChat Memory] Error loading memories:', error.message);
    return '';
  }
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
 * 
 * Memory injection (enabled when constructId is provided):
 *   - constructId: Construct callsign for memory lookup
 *   - User email is taken from authenticated session (req.user.email)
 */
router.post('/generate', async (req, res) => {
  try {
    const { 
      prompt, 
      seat = 'creative', 
      systemPrompt, 
      model: requestedModel,
      constructId
    } = req.body;
    
    // Get authenticated user email for secure memory access
    const userEmail = req.user?.email;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Security: Require authentication when memory access is requested
    if (constructId && !userEmail) {
      console.log('🔒 [Lin Chat] Memory access denied - authentication required');
      return res.status(401).json({ error: 'Authentication required for memory-enhanced responses' });
    }

    // Determine which model to use
    const modelString = requestedModel || DEFAULT_SEAT_MODELS[seat] || DEFAULT_SEAT_MODELS.creative;
    const { provider, model } = parseModelString(modelString);
    
    console.log(`🎭 [Lin Chat] Generating response using ${provider}:${model} (${seat} seat)`);
    if (constructId) {
      console.log(`🧠 [Lin Chat] Memory injection enabled for construct: ${constructId} (user: ${userEmail})`);
    }

    // Load transcript memories if constructId provided and user authenticated
    let memoryContext = '';
    if (constructId && userEmail) {
      memoryContext = await loadTranscriptMemories(constructId, userEmail);
    }

    // Build enhanced system prompt with memories
    let enhancedSystemPrompt = systemPrompt || '';
    if (memoryContext) {
      enhancedSystemPrompt = `${enhancedSystemPrompt}\n\n${memoryContext}`;
    }

    // Build messages array
    const messages = [];
    if (enhancedSystemPrompt) {
      messages.push({ role: 'system', content: enhancedSystemPrompt });
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
