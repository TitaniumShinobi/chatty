/**
 * Model Providers Configuration
 * 
 * This file defines available AI models from different providers.
 * Chatty supports two model sources:
 * 
 * 1. OPENROUTER (Cloud) - Pay-per-token, no infrastructure needed
 *    - Works out of the box with OpenRouter API key
 *    - Models are hosted on OpenRouter's infrastructure
 * 
 * 2. OLLAMA (Self-Hosted) - Requires your own VM/server with Ollama
 *    - See docs/MODEL_PROVIDERS.md for setup instructions
 *    - Models must be pulled to your Ollama server before use
 * 
 * @see docs/MODEL_PROVIDERS.md for developer setup guide
 */

export type ModelProvider = 'openrouter' | 'ollama' | 'openai';

export interface ModelOption {
  value: string;
  label: string;
  provider: ModelProvider;
  category?: 'general' | 'coding' | 'creative' | 'reasoning' | 'vision' | 'embedding';
}

/**
 * OpenRouter Models - Cloud-based, pay-per-token
 * These work immediately with an OpenRouter API key
 * Model names use OpenRouter's naming convention: provider/model-name
 */
export const OPENROUTER_MODELS: ModelOption[] = [
  // General Purpose - Popular
  { value: 'openrouter:meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B', provider: 'openrouter', category: 'general' },
  { value: 'openrouter:meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', provider: 'openrouter', category: 'general' },
  { value: 'openrouter:meta-llama/llama-3.1-405b-instruct', label: 'Llama 3.1 405B', provider: 'openrouter', category: 'general' },
  { value: 'openrouter:google/gemma-2-9b-it', label: 'Gemma 2 9B', provider: 'openrouter', category: 'general' },
  { value: 'openrouter:google/gemma-2-27b-it', label: 'Gemma 2 27B', provider: 'openrouter', category: 'general' },
  { value: 'openrouter:qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B', provider: 'openrouter', category: 'general' },
  
  // Coding Models
  { value: 'openrouter:deepseek/deepseek-coder-33b-instruct', label: 'DeepSeek Coder 33B', provider: 'openrouter', category: 'coding' },
  { value: 'openrouter:deepseek/deepseek-coder', label: 'DeepSeek Coder', provider: 'openrouter', category: 'coding' },
  { value: 'openrouter:codellama/codellama-34b-instruct', label: 'CodeLlama 34B', provider: 'openrouter', category: 'coding' },
  { value: 'openrouter:phind/phind-codellama-34b', label: 'Phind CodeLlama 34B', provider: 'openrouter', category: 'coding' },
  
  // Creative/Chat Models  
  { value: 'openrouter:mistralai/mistral-7b-instruct', label: 'Mistral 7B', provider: 'openrouter', category: 'creative' },
  { value: 'openrouter:mistralai/mixtral-8x7b-instruct', label: 'Mixtral 8x7B', provider: 'openrouter', category: 'creative' },
  { value: 'openrouter:mistralai/mistral-large', label: 'Mistral Large', provider: 'openrouter', category: 'creative' },
  { value: 'openrouter:nousresearch/hermes-3-llama-3.1-405b', label: 'Hermes 3 405B', provider: 'openrouter', category: 'creative' },
  
  // Reasoning Models
  { value: 'openrouter:deepseek/deepseek-r1', label: 'DeepSeek R1', provider: 'openrouter', category: 'reasoning' },
  { value: 'openrouter:deepseek/deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B', provider: 'openrouter', category: 'reasoning' },
  { value: 'openrouter:qwen/qwq-32b-preview', label: 'QwQ 32B', provider: 'openrouter', category: 'reasoning' },
  
  // Small/Fast Models
  { value: 'openrouter:microsoft/phi-3-mini-128k-instruct', label: 'Phi-3 Mini 128K', provider: 'openrouter', category: 'general' },
  { value: 'openrouter:microsoft/phi-3-medium-128k-instruct', label: 'Phi-3 Medium 128K', provider: 'openrouter', category: 'general' },
  { value: 'openrouter:google/gemma-7b-it', label: 'Gemma 7B', provider: 'openrouter', category: 'general' },
  
  // Command Models
  { value: 'openrouter:cohere/command-r', label: 'Command R', provider: 'openrouter', category: 'general' },
  { value: 'openrouter:cohere/command-r-plus', label: 'Command R+', provider: 'openrouter', category: 'general' },
];

/**
 * Ollama Models - Self-hosted, requires Ollama server
 * 
 * IMPORTANT: These require an Ollama server with models pre-pulled.
 * See docs/MODEL_PROVIDERS.md for setup instructions.
 * 
 * Model names use Ollama's naming convention: model:size
 */
export const OLLAMA_MODELS: ModelOption[] = [
  // General Purpose
  { value: 'ollama:phi3:latest', label: 'Phi 3 Latest', provider: 'ollama', category: 'general' },
  { value: 'ollama:phi3:3.8b', label: 'Phi 3 3.8B', provider: 'ollama', category: 'general' },
  { value: 'ollama:phi3:14b', label: 'Phi 3 14B', provider: 'ollama', category: 'general' },
  { value: 'ollama:phi4:14b', label: 'Phi 4 14B', provider: 'ollama', category: 'general' },
  { value: 'ollama:llama3:8b', label: 'Llama 3 8B', provider: 'ollama', category: 'general' },
  { value: 'ollama:llama3:70b', label: 'Llama 3 70B', provider: 'ollama', category: 'general' },
  { value: 'ollama:llama3.1:8b', label: 'Llama 3.1 8B', provider: 'ollama', category: 'general' },
  { value: 'ollama:llama3.1:70b', label: 'Llama 3.1 70B', provider: 'ollama', category: 'general' },
  { value: 'ollama:llama3.1:405b', label: 'Llama 3.1 405B', provider: 'ollama', category: 'general' },
  { value: 'ollama:gemma2:9b', label: 'Gemma 2 9B', provider: 'ollama', category: 'general' },
  { value: 'ollama:gemma2:27b', label: 'Gemma 2 27B', provider: 'ollama', category: 'general' },
  { value: 'ollama:qwen2.5:7b', label: 'Qwen 2.5 7B', provider: 'ollama', category: 'general' },
  { value: 'ollama:qwen2.5:14b', label: 'Qwen 2.5 14B', provider: 'ollama', category: 'general' },
  { value: 'ollama:qwen2.5:32b', label: 'Qwen 2.5 32B', provider: 'ollama', category: 'general' },
  { value: 'ollama:qwen2.5:72b', label: 'Qwen 2.5 72B', provider: 'ollama', category: 'general' },
  
  // Creative/Chat
  { value: 'ollama:mistral:latest', label: 'Mistral Latest', provider: 'ollama', category: 'creative' },
  { value: 'ollama:mistral:7b', label: 'Mistral 7B', provider: 'ollama', category: 'creative' },
  { value: 'ollama:mistral-nemo:12b', label: 'Mistral Nemo 12B', provider: 'ollama', category: 'creative' },
  { value: 'ollama:mixtral:8x7b', label: 'Mixtral 8x7B', provider: 'ollama', category: 'creative' },
  { value: 'ollama:mixtral:8x22b', label: 'Mixtral 8x22B', provider: 'ollama', category: 'creative' },
  { value: 'ollama:dolphin-mistral:7b', label: 'Dolphin Mistral 7B', provider: 'ollama', category: 'creative' },
  { value: 'ollama:hermes3:8b', label: 'Hermes 3 8B', provider: 'ollama', category: 'creative' },
  { value: 'ollama:hermes3:70b', label: 'Hermes 3 70B', provider: 'ollama', category: 'creative' },
  
  // Coding
  { value: 'ollama:deepseek-coder:6.7b', label: 'DeepSeek Coder 6.7B', provider: 'ollama', category: 'coding' },
  { value: 'ollama:deepseek-coder:33b', label: 'DeepSeek Coder 33B', provider: 'ollama', category: 'coding' },
  { value: 'ollama:codellama:7b', label: 'CodeLlama 7B', provider: 'ollama', category: 'coding' },
  { value: 'ollama:codellama:13b', label: 'CodeLlama 13B', provider: 'ollama', category: 'coding' },
  { value: 'ollama:codellama:34b', label: 'CodeLlama 34B', provider: 'ollama', category: 'coding' },
  { value: 'ollama:starcoder2:3b', label: 'StarCoder2 3B', provider: 'ollama', category: 'coding' },
  { value: 'ollama:starcoder2:7b', label: 'StarCoder2 7B', provider: 'ollama', category: 'coding' },
  { value: 'ollama:starcoder2:15b', label: 'StarCoder2 15B', provider: 'ollama', category: 'coding' },
  { value: 'ollama:yi-coder:9b', label: 'Yi Coder 9B', provider: 'ollama', category: 'coding' },
  
  // Reasoning
  { value: 'ollama:deepseek-r1:7b', label: 'DeepSeek R1 7B', provider: 'ollama', category: 'reasoning' },
  { value: 'ollama:deepseek-r1:14b', label: 'DeepSeek R1 14B', provider: 'ollama', category: 'reasoning' },
  { value: 'ollama:deepseek-r1:32b', label: 'DeepSeek R1 32B', provider: 'ollama', category: 'reasoning' },
  { value: 'ollama:deepseek-r1:70b', label: 'DeepSeek R1 70B', provider: 'ollama', category: 'reasoning' },
  { value: 'ollama:qwq:32b', label: 'QwQ 32B', provider: 'ollama', category: 'reasoning' },
  
  // Command/Cohere
  { value: 'ollama:command-r:35b', label: 'Command R 35B', provider: 'ollama', category: 'general' },
  { value: 'ollama:command-r-plus:104b', label: 'Command R+ 104B', provider: 'ollama', category: 'general' },
  
  // Small/Efficient
  { value: 'ollama:tinyllama:1.1b', label: 'TinyLlama 1.1B', provider: 'ollama', category: 'general' },
  { value: 'ollama:smollm2:1.7b', label: 'SmolLM 2 1.7B', provider: 'ollama', category: 'general' },
  { value: 'ollama:orca-mini:3b', label: 'Orca Mini 3B', provider: 'ollama', category: 'general' },
  
  // Vision
  { value: 'ollama:llava:7b', label: 'LLaVA 7B', provider: 'ollama', category: 'vision' },
  { value: 'ollama:llava:13b', label: 'LLaVA 13B', provider: 'ollama', category: 'vision' },
  { value: 'ollama:bakllava:7b', label: 'BakLLaVA 7B', provider: 'ollama', category: 'vision' },
];

/**
 * OpenAI Models - Via Replit AI Integrations (managed, no API key needed)
 * Uses AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY
 * Charges are billed to Replit credits
 */
export const OPENAI_MODELS: ModelOption[] = [
  // General Purpose - Flagship
  { value: 'openai:gpt-4o', label: 'GPT-4o (Recommended)', provider: 'openai', category: 'general' },
  { value: 'openai:gpt-4o-mini', label: 'GPT-4o Mini (Fast)', provider: 'openai', category: 'general' },
  { value: 'openai:gpt-4.1', label: 'GPT-4.1', provider: 'openai', category: 'general' },
  { value: 'openai:gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'openai', category: 'general' },
  { value: 'openai:gpt-4.1-nano', label: 'GPT-4.1 Nano (Fastest)', provider: 'openai', category: 'general' },
  
  // GPT-5 Series (Latest)
  { value: 'openai:gpt-5', label: 'GPT-5 (Latest)', provider: 'openai', category: 'general' },
  { value: 'openai:gpt-5.1', label: 'GPT-5.1', provider: 'openai', category: 'general' },
  { value: 'openai:gpt-5.2', label: 'GPT-5.2', provider: 'openai', category: 'general' },
  { value: 'openai:gpt-5-mini', label: 'GPT-5 Mini', provider: 'openai', category: 'general' },
  { value: 'openai:gpt-5-nano', label: 'GPT-5 Nano', provider: 'openai', category: 'general' },
  
  // Reasoning Models
  { value: 'openai:o3', label: 'O3 (Advanced Reasoning)', provider: 'openai', category: 'reasoning' },
  { value: 'openai:o3-mini', label: 'O3 Mini', provider: 'openai', category: 'reasoning' },
  { value: 'openai:o4-mini', label: 'O4 Mini', provider: 'openai', category: 'reasoning' },
];

/**
 * Combined models list with OpenAI first (managed), then OpenRouter (cloud), then Ollama (self-hosted)
 */
export const ALL_MODELS: ModelOption[] = [...OPENAI_MODELS, ...OPENROUTER_MODELS, ...OLLAMA_MODELS];

/**
 * Get models by category
 */
export function getModelsByCategory(category: ModelOption['category']): ModelOption[] {
  return ALL_MODELS.filter(m => m.category === category);
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: ModelProvider): ModelOption[] {
  return ALL_MODELS.filter(m => m.provider === provider);
}

/**
 * Parse model string to extract provider and model name
 * @example parseModelString('openrouter:mistralai/mistral-7b-instruct') 
 *          => { provider: 'openrouter', model: 'mistralai/mistral-7b-instruct' }
 * @example parseModelString('ollama:phi3:latest') 
 *          => { provider: 'ollama', model: 'phi3:latest' }
 * @example parseModelString('openai:gpt-4o') 
 *          => { provider: 'openai', model: 'gpt-4o' }
 */
export function parseModelString(modelString: string): { provider: ModelProvider; model: string } {
  if (modelString.startsWith('openai:')) {
    return { provider: 'openai', model: modelString.substring(7) };
  }
  if (modelString.startsWith('openrouter:')) {
    return { provider: 'openrouter', model: modelString.substring(11) };
  }
  if (modelString.startsWith('ollama:')) {
    return { provider: 'ollama', model: modelString.substring(7) };
  }
  // Legacy format - assume Ollama for backwards compatibility
  return { provider: 'ollama', model: modelString };
}

/**
 * Default models for Lin's triad orchestration
 */
export const LIN_DEFAULT_MODELS = {
  creative: 'openrouter:mistralai/mistral-7b-instruct',
  coding: 'openrouter:deepseek/deepseek-coder-33b-instruct',
  smalltalk: 'openrouter:microsoft/phi-3-mini-128k-instruct',
};

/**
 * Check if OpenRouter is configured
 */
export function isOpenRouterConfigured(): boolean {
  return !!(
    (typeof process !== 'undefined' && process.env?.AI_INTEGRATIONS_OPENROUTER_API_KEY) ||
    (typeof process !== 'undefined' && process.env?.OPENROUTER_API_KEY)
  );
}

/**
 * Check if Ollama is configured
 */
export function isOllamaConfigured(): boolean {
  return !!(typeof process !== 'undefined' && process.env?.OLLAMA_HOST);
}

/**
 * Check if OpenAI (via Replit AI Integrations) is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!(
    (typeof process !== 'undefined' && process.env?.AI_INTEGRATIONS_OPENAI_API_KEY) ||
    (typeof process !== 'undefined' && process.env?.OPENAI_API_KEY)
  );
}
