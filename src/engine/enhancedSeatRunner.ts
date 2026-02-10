// enhancedSeatRunner.ts - Enhanced seat runner with timeout, retry, and performance optimizations

// Guard for browser bundles
const isBrowser = typeof window !== 'undefined';
const envVars = (!isBrowser && typeof process !== 'undefined' && process.env) ? process.env : undefined;

// Import Node.js modules as ES modules (only used in Node.js, browser uses browserSeatRunner)
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import * as https from 'node:https';

export type Seat = 'smalltalk' | 'coding' | 'creative' | string;

type SeatInfo = { tag: string; role?: string } | string;
interface SeatConfig {
  [seat: string]: SeatInfo;
}

interface GenerateOptions {
  seat: Seat;
  prompt: string;
  modelOverride?: string;
  host?: string;
  port?: number;
  timeout?: number;
  retries?: number;
  enableStreaming?: boolean;
}

interface SeatMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  retries: number;
  success: boolean;
  error?: string;
  responseLength: number;
}

let cachedConfig: SeatConfig | undefined;

function loadSeatConfig(): SeatConfig {
  if (cachedConfig) return cachedConfig;
  if (isBrowser) {
    cachedConfig = {
      smalltalk: 'phi3:latest',
      coding: 'deepseek-coder-v2',
      creative: 'mistral:instruct',
    };
    return cachedConfig;
  }

  // Use imported ES modules (fs and path are imported at top level)

  const cfgPath = path.resolve(process.cwd(), 'models.json');
  try {
    const raw = fs.readFileSync(cfgPath, 'utf-8');
    cachedConfig = JSON.parse(raw);
  } catch (_) {
    cachedConfig = {
      smalltalk: 'phi3:latest',
      coding: 'deepseek-coder-v2',
      creative: 'mistral:instruct',
    };
  }
  return cachedConfig;
}

function envOverrideForSeat(seat: Seat): string | undefined {
  const key = `OLLAMA_MODEL_${seat.toUpperCase()}`;
  return envVars ? envVars[key] : undefined;
}

function resolveModel(seat: Seat, modelOverride?: string): string {
  if (modelOverride) return modelOverride;
  
  const envOverride = envOverrideForSeat(seat);
  if (envOverride) return envOverride;
  
  const cfg = loadSeatConfig();
  const info = cfg[seat];
  return typeof info === 'string' ? info : info?.tag ?? 'phi3:latest';
}

export function getSeatRole(seat: Seat): string | undefined {
  const cfg = loadSeatConfig();
  const info = cfg[seat];
  return typeof info === 'string' ? undefined : info?.role;
}

/**
 * Enhanced seat runner with timeout, retry, and performance optimizations
 */
export async function runSeatEnhanced(opts: GenerateOptions): Promise<{ response: string; metrics: SeatMetrics }> {
  const metrics: SeatMetrics = {
    startTime: Date.now(),
    endTime: 0,
    duration: 0,
    retries: 0,
    success: false,
    responseLength: 0
  };

  const host = (opts.host ?? envVars?.OLLAMA_HOST ?? 'http://localhost').replace(/\/$/, '');
  const port = (opts.port ?? Number(envVars?.OLLAMA_PORT)) || 11434;
  const model = resolveModel(opts.seat, opts.modelOverride);
  const timeout = opts.timeout ?? 30000; // 30 second default timeout
  const maxRetries = opts.retries ?? 2;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      metrics.retries = attempt;
      
      // Quick model availability check (only on first attempt)
      if (attempt === 0) {
        await checkModelAvailability(host, port, model);
      }

      const response = await makeRequest(host, port, model, opts.prompt, timeout, opts.enableStreaming);
      
      metrics.endTime = Date.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      metrics.success = true;
      metrics.responseLength = response.length;
      
      return { response, metrics };

    } catch (error: any) {
      lastError = error;
      
      // Don't retry on certain errors
      if (error.message.includes('ModelNotAvailable') || 
          error.message.includes('timeout') ||
          attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff for retries
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  metrics.endTime = Date.now();
  metrics.duration = metrics.endTime - metrics.startTime;
  metrics.error = lastError?.message;
  
  throw new Error(`Seat ${opts.seat} failed after ${metrics.retries} retries: ${lastError?.message}`);
}

/**
 * Check if model is available
 */
async function checkModelAvailability(host: string, port: number, model: string): Promise<void> {
  const tagsURL = `${host}:${port}/api/tags`;
  
  try {
    const tagsJson = await fetchJSON(tagsURL, 5000); // 5 second timeout for check
    if (Array.isArray(tagsJson.models)) {
      const found = tagsJson.models.some((m: any) => m.name?.startsWith(model.split(":")[0]));
      if (!found) {
        throw new Error(`ModelNotAvailable:${model}`);
      }
    }
  } catch (error) {
    // If check fails, we proceed anyway - generation might still work
    console.warn(`Model availability check failed for ${model}:`, error);
  }
}

/**
 * Make HTTP request to Ollama with timeout
 */
async function makeRequest(
  host: string, 
  port: number, 
  model: string, 
  prompt: string, 
  timeout: number,
  enableStreaming = false
): Promise<string> {
  const url = `${host}:${port}/api/generate`;
  const body = JSON.stringify({ 
    model, 
    prompt, 
    stream: enableStreaming,
    options: {
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2000
    }
  });

  if (isBrowser) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama error ${res.status}: ${text}`);
      }
      const parsed = await res.json();
      return parsed.response ?? '';
    } catch (err: any) {
      clearTimeout(timer);
      throw err;
    }
  }

  const { protocol } = new URL(url);
  // http and https are imported at top level

  return new Promise<string>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    const requester = protocol === 'https:' ? https.request : http.request;
    const req = requester(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: timeout
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        clearTimeout(timeoutId);
        
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Ollama error ${res.statusCode}: ${data}`));
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response ?? '');
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err}`));
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
      reject(new Error(`Request timeout after ${timeout}ms`));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Fetch JSON with timeout
 */
async function fetchJSON(urlStr: string, timeout = 10000): Promise<any> {
  if (isBrowser) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(urlStr, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Fetch timeout or failure ${res.status}`);
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // http and https are imported at top level

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Fetch timeout after ${timeout}ms`));
    }, timeout);

    const { protocol, hostname, port, pathname } = new URL(urlStr);
    const requester = protocol === 'https:' ? https.request : http.request;
    
    const req = requester({
      hostname,
      port,
      path: pathname,
      method: 'GET',
      timeout
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        clearTimeout(timeoutId);
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err}`));
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
 * Batch process multiple seats with optimized scheduling
 */
export async function runSeatsBatch(
  seats: Array<{ seat: Seat; prompt: string; modelOverride?: string }>,
  options: {
    maxConcurrency?: number;
    timeout?: number;
    retries?: number;
  } = {}
): Promise<Array<{ seat: Seat; response: string; metrics: SeatMetrics }>> {
  const { maxConcurrency = 3, timeout = 30000, retries = 2 } = options;
  
  const results: Array<{ seat: Seat; response: string; metrics: SeatMetrics }> = [];
  const errors: Array<{ seat: Seat; error: Error }> = [];
  
  // Process seats in batches to avoid overwhelming the system
  for (let i = 0; i < seats.length; i += maxConcurrency) {
    const batch = seats.slice(i, i + maxConcurrency);
    
    const batchPromises = batch.map(async (seatConfig) => {
      try {
        const { response, metrics } = await runSeatEnhanced({
          ...seatConfig,
          timeout,
          retries
        });
        return { seat: seatConfig.seat, response, metrics };
      } catch (error: any) {
        return { seat: seatConfig.seat, error };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    for (const result of batchResults) {
      if ('error' in result) {
        errors.push({ seat: result.seat, error: result.error });
        // Provide fallback response
        results.push({
          seat: result.seat,
          response: `[${result.seat} expert temporarily unavailable]`,
          metrics: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 0,
            retries: retries,
            success: false,
            error: result.error.message,
            responseLength: 0
          }
        });
      } else {
        results.push(result);
      }
    }
    
    // Small delay between batches to prevent overwhelming
    if (i + maxConcurrency < seats.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Get performance statistics for seat processing
 */
export function getSeatPerformanceStats(results: Array<{ seat: Seat; metrics: SeatMetrics }>): {
  totalDuration: number;
  averageDuration: number;
  successRate: number;
  totalRetries: number;
  slowestSeat: Seat | null;
  fastestSeat: Seat | null;
} {
  if (results.length === 0) {
    return {
      totalDuration: 0,
      averageDuration: 0,
      successRate: 0,
      totalRetries: 0,
      slowestSeat: null,
      fastestSeat: null
    };
  }
  
  const totalDuration = results.reduce((sum, r) => sum + r.metrics.duration, 0);
  const averageDuration = totalDuration / results.length;
  const successCount = results.filter(r => r.metrics.success).length;
  const successRate = successCount / results.length;
  const totalRetries = results.reduce((sum, r) => sum + r.metrics.retries, 0);
  
  const sortedByDuration = results.sort((a, b) => a.metrics.duration - b.metrics.duration);
  const slowestSeat = sortedByDuration[sortedByDuration.length - 1]?.seat || null;
  const fastestSeat = sortedByDuration[0]?.seat || null;
  
  return {
    totalDuration,
    averageDuration,
    successRate,
    totalRetries,
    slowestSeat,
    fastestSeat
  };
}
