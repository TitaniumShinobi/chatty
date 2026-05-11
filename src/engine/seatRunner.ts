// Keep this module browser-safe: require Node libs only when not running in the browser.
import { LIN_DEFAULT_MODELS } from '../config/linModelDefaults';

const isBrowser = typeof window !== 'undefined';
const envVars = (!isBrowser && typeof process !== 'undefined' && process.env) ? process.env : undefined;

/**
 * Configuration constants for seat runner.
 * Centralized for maintainability and easy adjustment.
 */

/** Default Ollama API port */
const DEFAULT_OLLAMA_PORT = 11434;

/** Default request timeout in milliseconds */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Default fetch timeout in milliseconds */
const DEFAULT_FETCH_TIMEOUT_MS = 10000;

/** Maximum concurrent HTTP connections per agent */
const DEFAULT_MAX_CONCURRENT_CONNECTIONS = 5;

/** Delay between batches in milliseconds */
const BATCH_DELAY_MS = 100;

/** Default connection timeout in milliseconds */
const DEFAULT_CONNECTION_TIMEOUT_MS = 60000;

/** OpenRouter model mappings for seats when Ollama is unavailable */
const OPENROUTER_SEAT_MODELS: Record<string, string> = {
  smalltalk: 'meta-llama/llama-3.3-70b-instruct:free',
  creative: 'google/gemma-3-27b-it:free',
  coding: 'deepseek/deepseek-chat'
};

/**
 * Check if OpenRouter is configured and available
 */
function isOpenRouterAvailable(): boolean {
  return !!(envVars?.AI_INTEGRATIONS_OPENROUTER_API_KEY || envVars?.OPENROUTER_API_KEY);
}

/**
 * Call OpenRouter API as fallback when Ollama isn't available
 */
async function callOpenRouter(seat: string, prompt: string): Promise<string> {
  const apiKey = envVars?.AI_INTEGRATIONS_OPENROUTER_API_KEY || envVars?.OPENROUTER_API_KEY;
  const baseURL = envVars?.AI_INTEGRATIONS_OPENROUTER_BASE_URL || envVars?.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }
  
  const model = OPENROUTER_SEAT_MODELS[seat] || OPENROUTER_SEAT_MODELS.smalltalk;
  console.log(`🌐 [SeatRunner] Using OpenRouter fallback - model: ${model}, seat: ${seat}`);
  
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  console.log(`✅ [SeatRunner] OpenRouter response received (${content.length} chars)`);
  return content;
}

// Lazy-loaded Node.js modules (only loaded when actually needed in Node.js)
let nodeModules: {
  fs?: typeof import('node:fs');
  path?: typeof import('node:path');
  http?: typeof import('node:http');
  https?: typeof import('node:https');
  HttpAgent?: typeof import('node:http').Agent;
  HttpsAgent?: typeof import('node:https').Agent;
} = {};

// Lazy-loaded HTTP agents with connection pooling
let httpAgent: any = undefined;
let httpsAgent: any = undefined;

/**
 * Lazy-load Node.js modules only when needed (Node.js environment only)
 */
async function loadNodeModules() {
  console.log(`🔍 [SeatRunner] loadNodeModules called - isBrowser: ${isBrowser}`);if (isBrowser) {
    console.error('❌ [SeatRunner] Cannot load Node.js modules in browser');
    throw new Error('Cannot load Node.js modules in browser');
  }
  
  if (nodeModules.fs) {
    console.log(`✅ [SeatRunner] Node modules already loaded, returning cached`);
    return nodeModules; // Already loaded
  }

  try {
    console.log(`🔄 [SeatRunner] Loading Node.js modules dynamically...`);
    // Dynamic imports to avoid Vite analyzing them at build time
    nodeModules.fs = await import('node:fs');
    console.log(`✅ [SeatRunner] Loaded node:fs`);
    nodeModules.path = await import('node:path');
    console.log(`✅ [SeatRunner] Loaded node:path`);
    nodeModules.http = await import('node:http');
    console.log(`✅ [SeatRunner] Loaded node:http`);
    nodeModules.https = await import('node:https');
    console.log(`✅ [SeatRunner] Loaded node:https`);
    nodeModules.HttpAgent = nodeModules.http.Agent;
    nodeModules.HttpsAgent = nodeModules.https.Agent;
    console.log(`✅ [SeatRunner] All Node.js modules loaded successfully`);} catch (importError: any) {
    console.error(`❌ [SeatRunner] Failed to load Node.js modules:`, {
      message: importError?.message,
      name: importError?.name,
      stack: importError?.stack,
      code: importError?.code
    });throw importError;
  }

  // Initialize agents lazily
  if (!httpAgent && nodeModules.HttpAgent) {
    httpAgent = new nodeModules.HttpAgent({
      keepAlive: true,
      maxSockets: DEFAULT_MAX_CONCURRENT_CONNECTIONS,
      maxFreeSockets: 2,
      timeout: DEFAULT_CONNECTION_TIMEOUT_MS,
    });
  }

  if (!httpsAgent && nodeModules.HttpsAgent) {
    httpsAgent = new nodeModules.HttpsAgent({
      keepAlive: true,
      maxSockets: DEFAULT_MAX_CONCURRENT_CONNECTIONS,
      maxFreeSockets: 2,
      timeout: DEFAULT_CONNECTION_TIMEOUT_MS,
    });
  }

  return nodeModules;
}

export type Seat = 'smalltalk' | 'coding' | 'creative' | string;

type SeatInfo = { tag: string; role?: string } | string;
interface SeatConfig {
  [seat: string]: SeatInfo;
}

const DEFAULT_SEAT_CONFIG: SeatConfig = {
  smalltalk: LIN_DEFAULT_MODELS.smalltalk,
  coding: LIN_DEFAULT_MODELS.coding,
  creative: LIN_DEFAULT_MODELS.creative,
};

let cachedConfig: SeatConfig | undefined;

function defaultModelForSeat(seat: Seat): string {
  const info = DEFAULT_SEAT_CONFIG[seat] || DEFAULT_SEAT_CONFIG.smalltalk;
  return typeof info === 'string' ? info : info.tag;
}

function toOllamaModelTag(modelRef: string): string {
  return modelRef.startsWith('ollama:') ? modelRef.slice('ollama:'.length) : modelRef;
}

/**
 * Loads seat configuration from models.json file asynchronously.
 * Caches result after first load to avoid repeated file I/O.
 * 
 * @returns Promise resolving to SeatConfig object
 * 
 * @example
 * ```typescript
 * const config = await loadSeatConfig();
 * const codingModel = config.coding;
 * ```
 */
async function loadSeatConfig(): Promise<SeatConfig> {
  console.log(`📋 [SeatRunner] loadSeatConfig called (isBrowser: ${isBrowser}, cached: ${!!cachedConfig})`);
  if (cachedConfig) {
    console.log(`✅ [SeatRunner] Using cached config`);
    return cachedConfig;
  }
  if (isBrowser) {
    // In the browser we don't have filesystem access; use defaults.
    console.log(`🌐 [SeatRunner] Browser environment - using default config`);
    cachedConfig = DEFAULT_SEAT_CONFIG;
    return cachedConfig;
  }

  const nodeMods = await loadNodeModules();
  const cfgPath = nodeMods.path!.resolve(process.cwd(), 'models.json');
  console.log(`🔍 [SeatRunner] Loading config from: ${cfgPath}`);
  try {
    // ✅ NON-BLOCKING: Uses event loop efficiently
    const raw = await nodeMods.fs!.promises.readFile(cfgPath, 'utf-8');
    cachedConfig = JSON.parse(raw);
    console.log(`✅ [SeatRunner] Config loaded from models.json`);
  } catch (err: any) {
    console.log(`⚠️ [SeatRunner] Could not load models.json (${err.message}), using defaults`);
    // defaults if missing
    cachedConfig = DEFAULT_SEAT_CONFIG;
  }

  // Safety check
  if (!cachedConfig) {
    cachedConfig = DEFAULT_SEAT_CONFIG;
  }

  return cachedConfig;
}

function envOverrideForSeat(seat: Seat): string | undefined {
  // e.g., OLLAMA_MODEL_CODING overrides coding seat
  const key = `OLLAMA_MODEL_${seat.toUpperCase()}`;
  return envVars?.[key];
}

async function seatInfo(seat: Seat): Promise<SeatInfo | undefined> {
  const cfg = await loadSeatConfig();
  return cfg[seat];
}

async function resolveModel(seat: Seat, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const envSeat = envOverrideForSeat(seat);
  if (envSeat) return envSeat;
  const info = await seatInfo(seat);
  if (!info) return defaultModelForSeat('smalltalk');
  return typeof info === 'string' ? info : info.tag;
}

/**
 * Retrieves the role description for a given seat.
 * 
 * @param seat - The seat type to get role for
 * @returns Role string if defined, undefined otherwise
 */
export async function getSeatRole(seat: Seat): Promise<string | undefined> {
  const info = await seatInfo(seat);
  return typeof info === 'string' ? undefined : info?.role;
}

interface GenerateOptions {
  seat: Seat;
  prompt: string;
  modelOverride?: string;
  host?: string; // http://localhost
  port?: number; // 11434
  timeout?: number; // ✅ ADD TIMEOUT OPTION
}

/**
 * Executes a single AI model seat (coding, creative, or smalltalk) via Ollama API.
 * 
 * Handles HTTP communication with Ollama, manages timeouts, and provides error
 * handling for multi-model orchestration scenarios. Uses connection pooling for
 * efficient request reuse.
 * 
 * @param opts - Configuration options for seat execution
 * @param opts.seat - The seat type ('coding' | 'creative' | 'smalltalk')
 * @param opts.prompt - The prompt to send to the model
 * @param opts.modelOverride - Optional model override (defaults to seat config)
 * @param opts.host - Ollama host (defaults to env or 'http://localhost')
 * @param opts.port - Ollama port (defaults to env or DEFAULT_OLLAMA_PORT)
 * @param opts.timeout - Request timeout in ms (defaults to DEFAULT_REQUEST_TIMEOUT_MS)
 * 
 * @returns Promise resolving to the model's response string
 * 
 * @throws {Error} If request fails, times out, or model is unavailable
 * 
 * @example
 * ```typescript
 * const response = await runSeat({
 *   seat: 'coding',
 *   prompt: 'Write a binary search function',
 *   timeout: 10000
 * });
 * ```
 * 
 * @performance
 * - Uses connection pooling for efficient HTTP reuse
 * - Non-blocking async/await pattern
 * - Timeout protection prevents resource leaks
 */
export async function runSeat(opts: GenerateOptions): Promise<string> {
  console.log(`🚀 [SeatRunner] runSeat called - seat: ${opts.seat}, modelOverride: ${opts.modelOverride || 'none'}, isBrowser: ${isBrowser}`);

  // Browser builds should never try to hit a local Ollama host directly.
  // Delegate to the browser seat runner which uses same-origin `/api/...`.
  if (isBrowser) {
    const mod = await import("../lib/browserSeatRunner");
    return mod.runSeat({
      seat: opts.seat,
      prompt: opts.prompt,
      modelOverride: opts.modelOverride,
      timeout: opts.timeout,
    });
  }
  
  // Check if we should use OpenRouter directly (no Ollama configured)
  const ollamaHost = opts.host ?? envVars?.OLLAMA_HOST;
  if (!ollamaHost && isOpenRouterAvailable()) {
    console.log(`🌐 [SeatRunner] No Ollama configured, using OpenRouter directly for ${opts.seat}`);
    try {
      return await callOpenRouter(opts.seat, opts.prompt);
    } catch (openRouterErr: any) {
      console.error(`❌ [SeatRunner] OpenRouter failed:`, openRouterErr.message);
      throw openRouterErr;
    }
  }
  
  if (!ollamaHost) {
    throw new Error(
      "Ollama host not configured. Set OLLAMA_HOST (or pass opts.host), or configure OpenRouter for Node execution.",
    );
  }

  const host = ollamaHost.replace(/\/$/, '');
  const port = (opts.port ?? Number(envVars?.OLLAMA_PORT)) || DEFAULT_OLLAMA_PORT;
  const model = toOllamaModelTag(await resolveModel(opts.seat, opts.modelOverride));
  const timeout = opts.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS;
  console.log(`🔧 [SeatRunner] Resolved - host: ${host}, port: ${port}, model: ${model}, timeout: ${timeout}ms, isBrowser: ${isBrowser}`);// quick availability check via /api/tags
  // Ensure host includes protocol for URL parsing, but don't add port if already present
  const baseUrl = host.startsWith('http') ? host : `http://${host}`;
  // Check if baseUrl already has a port
  const urlHasPort = /:\d+/.test(baseUrl.split('/')[2] || '');
  const tagsURL = urlHasPort ? `${baseUrl}/api/tags` : `${baseUrl}:${port}/api/tags`;try {
    const tagsJson = await fetchJSON(tagsURL, DEFAULT_FETCH_TIMEOUT_MS);
    if (Array.isArray(tagsJson.models)) {
      // const found = tagsJson.models.some((m: any) => m.name?.startsWith(model.split(":")[0]));
      // if (!found) throw new Error(`ModelNotAvailable:${model}`); // Strict check disabled
    }
  } catch (_) {
    // if check fails we proceed; generation may still work
  }

  // Reuse baseUrl from above for the main API call
  const url = urlHasPort ? `${baseUrl}/api/generate` : `${baseUrl}:${port}/api/generate`;
  const body = JSON.stringify({ model, prompt: opts.prompt, stream: false });if (isBrowser) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
        signal: controller.signal
    });
      clearTimeout(timeoutId);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error ${res.status}: ${text}`);
    }
    const parsed = await res.json();
    return parsed.response ?? '';
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // Node.js: Use URL object and proper http.request options format
  const nodeMods = await loadNodeModules();
  const urlObj = new URL(url);
  console.log(`🌐 [SeatRunner] Making HTTP request to ${urlObj.hostname}:${urlObj.port || DEFAULT_OLLAMA_PORT}${urlObj.pathname}`);return new Promise<string>((resolve, reject) => {
    // Use port from URL, or default to 11434 for Ollama (not 80)
    const requestPort = urlObj.port || DEFAULT_OLLAMA_PORT;
    console.log(`📤 [SeatRunner] Creating HTTP request - hostname: ${urlObj.hostname}, port: ${requestPort}, path: ${urlObj.pathname}`);const requester = urlObj.protocol === 'https:' ? nodeMods.https!.request : nodeMods.http!.request;

    const timeoutId = setTimeout(() => {
      req.destroy(); // Abort request
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    const req = requester(
      {
        agent: urlObj.protocol === 'https:' ? httpsAgent : httpAgent, // ✅ REUSE CONNECTIONS
        hostname: urlObj.hostname,
        port: requestPort,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        clearTimeout(timeoutId); // ✅ CLEAR ON SUCCESS
        console.log(`📥 [SeatRunner] Response received - status: ${res.statusCode}`);let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            const errorMsg = `Ollama error ${res.statusCode}: ${data}`;
            console.error(`❌ [SeatRunner] ${errorMsg}`);
            reject(new Error(errorMsg));
            return;
          }
          try {
            const parsed = JSON.parse(data);
            console.log(`✅ [SeatRunner] Response parsed successfully (response length: ${parsed.response?.length || 0} chars)`);resolve(parsed.response ?? '');
          } catch (err: any) {console.error(`❌ [SeatRunner] JSON parse error: ${err.message}. Raw data: ${data.substring(0, 100)}...`);
            reject(err);
          }
        });
      }
    );
    req.on('error', (err: any) => {
      clearTimeout(timeoutId); // ✅ CLEAR ON ERROR
      console.error(`❌ [SeatRunner] Network request failed for ${opts.seat}:`, {
        message: err.message,
        code: err.code,
        name: err.name,
        stack: err.stack,
        seat: opts.seat,
        model: model,
        url: url,
        hostname: urlObj.hostname,
        port: requestPort
      });
      reject(err);
    });

    req.on('timeout', () => {
      clearTimeout(timeoutId);
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Batch process multiple seats with controlled concurrency.
 * Processes seats in batches to prevent overwhelming the Ollama server.
 * 
 * @param seats - Array of seat configurations to process
 * @param options - Batch processing options
 * @param options.maxConcurrency - Maximum concurrent requests (default: 3)
 * @param options.timeout - Request timeout in ms (default: 30000)
 * @param options.retries - Number of retries on failure (default: 0)
 * 
 * @returns Promise resolving to array of results with error handling
 * 
 * @example
 * ```typescript
 * const results = await runSeatsBatch([
 *   { seat: 'coding', prompt: 'Write binary search' },
 *   { seat: 'creative', prompt: 'Write a poem' },
 *   { seat: 'smalltalk', prompt: 'Greet the user' }
 * ], { maxConcurrency: 2 });
 * ```
 */
export async function runSeatsBatch(
  seats: Array<{ seat: Seat; prompt: string; modelOverride?: string }>,
  options: {
    maxConcurrency?: number;
    timeout?: number;
    retries?: number;
  } = {}
): Promise<Array<{ seat: Seat; response: string; error?: Error }>> {
  const {
    maxConcurrency = DEFAULT_MAX_CONCURRENT_CONNECTIONS,
    timeout = DEFAULT_REQUEST_TIMEOUT_MS,
    retries = 0
  } = options;

  const results: Array<{ seat: Seat; response: string; error?: Error }> = [];

  // Process seats in batches to respect concurrency limits
  for (let i = 0; i < seats.length; i += maxConcurrency) {
    const batch = seats.slice(i, i + maxConcurrency);

    const batchPromises = batch.map(async (seatConfig) => {
      let lastError: Error | undefined;

      // Retry logic
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const response = await runSeat({
            ...seatConfig,
            timeout
          });
          return { seat: seatConfig.seat, response };
        } catch (error: any) {
          lastError = error;
          if (attempt < retries) {
            // Exponential backoff
            await new Promise(resolve =>
              setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 5000))
            );
          }
        }
      }

      // All retries failed
      return {
        seat: seatConfig.seat,
        response: `[${seatConfig.seat} expert temporarily unavailable]`,
        error: lastError
      };
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches to prevent overwhelming
    if (i + maxConcurrency < seats.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

// simple helper using native http/https
async function fetchJSON(urlStr: string, timeout: number = DEFAULT_FETCH_TIMEOUT_MS): Promise<any> {
  console.log(`🔍 [SeatRunner] fetchJSON called - URL: ${urlStr}, timeout: ${timeout}ms`);
  if (isBrowser) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(urlStr, { signal: controller.signal });
      clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`Request failed ${res.status}`);
      const result = await res.json();
      console.log(`✅ [SeatRunner] fetchJSON succeeded (browser)`);
      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      console.error(`❌ [SeatRunner] fetchJSON failed (browser):`, err);
      throw err;
    }
  }

  // Load Node.js modules lazily
  const nodeMods = await loadNodeModules();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      req.destroy();
      reject(new Error(`Fetch timeout after ${timeout}ms`));
    }, timeout);

    const { protocol, hostname, port, pathname } = new URL(urlStr);
    const requester = protocol === 'https:' ? nodeMods.https!.request : nodeMods.http!.request;
    const req = requester({
      agent: protocol === 'https:' ? httpsAgent : httpAgent, // ✅ REUSE CONNECTIONS
      hostname,
      port,
      path: pathname,
      method: 'GET',
    }, (res) => {
      clearTimeout(timeoutId);
      console.log(`📥 [SeatRunner] fetchJSON response received - status: ${res.statusCode}`);
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log(`✅ [SeatRunner] fetchJSON parsed successfully`);
          resolve(parsed);
        } catch (err) {
          console.error(`❌ [SeatRunner] fetchJSON parse error:`, err);
          reject(err);
        }
      });
    });

    req.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    req.on('timeout', () => {
      clearTimeout(timeoutId);
      req.destroy();
      reject(new Error(`Fetch timeout after ${timeout}ms`));
    });

    req.end();
  });
}

/**
 * Cleanup function for graceful shutdown.
 * Destroys HTTP agents and clears cached configuration.
 * Should be called during application shutdown to prevent resource leaks.
 * 
 * @example
 * ```typescript
 * process.on('SIGTERM', () => {
 *   cleanupSeatRunner();
 *   process.exit(0);
 * });
 * ```
 */
export function cleanupSeatRunner(): void {
  if (!isBrowser && httpAgent && httpsAgent) {
    httpAgent.destroy();
    httpsAgent.destroy();
  }
  cachedConfig = undefined;
}

// Register cleanup handlers for graceful shutdown
if (!isBrowser && typeof process !== 'undefined') {
  process.on('SIGTERM', cleanupSeatRunner);
  process.on('SIGINT', cleanupSeatRunner);
  process.on('exit', cleanupSeatRunner);
}

export { loadSeatConfig };
