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
import { GPTManager } from '../lib/gptManager.js';
import { loadIdentityFiles } from '../lib/identityLoader.js';

const router = express.Router();
const gptManager = GPTManager.getInstance();

// Initialize OpenRouter client using Replit AI Integrations
const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
});

const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct';

const DEFAULT_SEAT_MODELS = {
  creative: `openrouter:google/gemini-2.0-flash-exp:free`,
  coding: `openrouter:deepseek/deepseek-chat`, 
  smalltalk: `openrouter:${DEFAULT_OPENROUTER_MODEL}`
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
 * Uses hierarchical path structure to prioritize recent and relevant memories
 * 
 * @param {string} constructId - Construct callsign (e.g., 'katana-001', 'nova-001')
 * @param {string} userEmail - User's email for Supabase lookup (required for security)
 * @param {Object} options - Optional configuration
 * @param {number} options.maxFiles - Maximum files to load (default: 25)
 * @param {number} options.maxMemories - Maximum memory snippets to inject (default: 50)
 * @param {string} options.platform - Filter to specific platform (e.g., 'chatgpt')
 * @param {string} options.year - Filter to specific year
 * @param {string} options.month - Filter to specific month
 * @returns {Promise<string>} Formatted memory context
 */
async function loadTranscriptMemories(constructId, userEmail, options = {}) {
  // Increased defaults for constructs with 300+ transcripts
  const maxFiles = options.maxFiles || 50;
  const maxMemories = options.maxMemories || 100;
  
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
    
    // Build query for transcripts
    // Use construct_id column for reliable matching, fall back to filename pattern
    let query = supabase
      .from('vault_files')
      .select('filename, content, metadata')
      .eq('user_id', user.id)
      .eq('file_type', 'transcript')
      .or(`construct_id.eq.${constructId},filename.ilike.%${constructId}%`);
    
    // Apply optional filters using metadata fields (more reliable than path parsing)
    // Note: Supabase JSONB filtering with ->> operator for metadata fields
    if (options.platform) {
      // Filter by metadata.source or filename pattern (for backwards compatibility)
      query = query.or(`metadata->>source.eq.${options.platform},filename.ilike.%/${options.platform}/%`);
    }
    if (options.year) {
      query = query.or(`metadata->>year.eq.${options.year},filename.ilike.%/${options.year}/%`);
    }
    if (options.month) {
      query = query.or(`metadata->>month.eq.${options.month},filename.ilike.%/${options.month}/%`);
    }
    
    // Order by creation date (most recent first) with higher limit
    const { data: files, error } = await query
      .order('created_at', { ascending: false })
      .limit(maxFiles);
    
    if (error || !files || files.length === 0) {
      console.log(`📚 [LinChat Memory] No transcripts found for ${constructId}`);
      return '';
    }
    
    // Group files by platform/year/month for context
    const groupedFiles = {};
    for (const file of files) {
      const source = file.metadata?.source || 'unknown';
      const year = file.metadata?.year || '';
      const month = file.metadata?.month || '';
      const key = `${source}${year ? `/${year}` : ''}${month ? `/${month}` : ''}`;
      if (!groupedFiles[key]) groupedFiles[key] = [];
      groupedFiles[key].push(file);
    }
    
    console.log(`📚 [LinChat Memory] Loading ${files.length} transcripts from ${Object.keys(groupedFiles).length} sources for ${constructId}`);
    
    // Extract conversation snippets from transcripts
    const memories = [];
    const memoryBySource = {};
    
    for (const file of files) {
      if (!file.content) continue;
      
      const source = file.metadata?.source || 'unknown';
      const year = file.metadata?.year || '';
      const month = file.metadata?.month || '';
      const contextLabel = `[${source}${year ? ` ${year}` : ''}${month ? ` ${month}` : ''}]`;
      
      // Parse markdown transcript
      const lines = file.content.split('\n');
      let currentExchange = [];
      
      for (const line of lines) {
        // Match patterns like "**User:**" or "Devon:" or "Katana:" or "[timestamp] Speaker:"
        const speakerMatch = line.match(/^\[?[^\]]*\]?\s*\*?\*?([^:*\[\]]+)\*?\*?:\s*(.*)$/);
        if (speakerMatch) {
          const speaker = speakerMatch[1].trim();
          const content = speakerMatch[2].trim();
          if (content && content.length > 5) {
            currentExchange.push(`${speaker}: ${content}`);
            // Keep recent exchanges (rolling window)
            if (currentExchange.length > 8) {
              currentExchange.shift();
            }
          }
        }
      }
      
      if (currentExchange.length > 0) {
        // Take last 3 exchanges from each file with source context
        const fileMemories = currentExchange.slice(-3).map(m => `${contextLabel} ${m}`);
        memories.push(...fileMemories);
        
        // Also track by source for structured output
        if (!memoryBySource[source]) memoryBySource[source] = [];
        memoryBySource[source].push(...currentExchange.slice(-3));
      }
    }
    
    if (memories.length === 0) {
      return '';
    }
    
    // Build structured memory context with source organization
    let memoryContext = `## MEMORY - Previous Conversations\n`;
    memoryContext += `You have these memories from past conversations with this user across ${Object.keys(memoryBySource).length} platform(s):\n\n`;
    
    // Take the most recent memories up to the limit
    memoryContext += memories.slice(0, maxMemories).join('\n');
    
    memoryContext += `\n\nUse these memories to maintain continuity and reference past discussions when relevant.`;
    
    console.log(`✅ [LinChat Memory] Injected ${Math.min(memories.length, maxMemories)} memory snippets from ${files.length} files`);
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
 *   - memoryOptions: Optional configuration for memory retrieval
 *     - maxFiles: Maximum transcript files to load (default: 50)
 *     - maxMemories: Maximum memory snippets to inject (default: 100)
 *     - platform: Filter to specific platform (e.g., 'chatgpt')
 *     - year: Filter to specific year (e.g., '2025')
 *     - month: Filter to specific month (e.g., 'December')
 *   - User email is taken from authenticated session (req.user.email)
 */
router.post('/generate', async (req, res) => {
  try {
    const { 
      prompt, 
      seat = 'creative', 
      systemPrompt, 
      model: requestedModel,
      constructId,
      memoryOptions = {}
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
      const optionsStr = Object.keys(memoryOptions).length > 0 ? ` with options: ${JSON.stringify(memoryOptions)}` : '';
      console.log(`🧠 [Lin Chat] Memory injection enabled for construct: ${constructId} (user: ${userEmail})${optionsStr}`);
    }

    // Load GPT identity (instructions) if constructId provided
    let identityPrompt = '';
    if (constructId) {
      // First try to load from GPT database (custom GPTs like Katana)
      const gpt = await gptManager.getGPTByCallsign(constructId);
      if (gpt && gpt.instructions) {
        identityPrompt = `# Identity: ${gpt.name}\n\nYou are ${gpt.name}. ${gpt.description || ''}\n\n${gpt.instructions}`;
        console.log(`🎭 [LinChat] Loaded identity from GPT database: ${gpt.name} (${constructId})`);
      } else {
        // Fallback to identity files (for system constructs like Zen, Lin)
        try {
          const userId = req.user?.id || req.user?.sub || 'anonymous';
          const identityFiles = await loadIdentityFiles(userId, constructId, false);
          if (identityFiles?.prompt) {
            identityPrompt = identityFiles.prompt;
            if (identityFiles.conditioning) {
              identityPrompt += `\n\n${identityFiles.conditioning}`;
            }
            console.log(`🎭 [LinChat] Loaded identity from files for: ${constructId}`);
          }
        } catch (err) {
          console.warn(`⚠️ [LinChat] Could not load identity files for ${constructId}:`, err.message);
        }
      }
    }

    // Load transcript memories if constructId provided and user authenticated
    let memoryContext = '';
    if (constructId && userEmail) {
      memoryContext = await loadTranscriptMemories(constructId, userEmail, memoryOptions);
    }

    // Build enhanced system prompt: identity + passed systemPrompt + memories
    let enhancedSystemPrompt = '';
    if (identityPrompt) {
      enhancedSystemPrompt = identityPrompt;
    }
    if (systemPrompt) {
      enhancedSystemPrompt = enhancedSystemPrompt ? `${enhancedSystemPrompt}\n\n${systemPrompt}` : systemPrompt;
    }
    if (memoryContext) {
      enhancedSystemPrompt = enhancedSystemPrompt ? `${enhancedSystemPrompt}\n\n${memoryContext}` : memoryContext;
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
