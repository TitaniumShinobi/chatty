// Browser-compatible helper seat runner for web interface.
// Construct-quality conversation must use /api/vvault/message, not this helper.
import { fetchWithDevAuthRetry } from '../auth';
import { LIN_DEFAULT_MODELS } from '../config/linModelDefaults';

export type Seat = 'smalltalk' | 'coding' | 'creative' | string;

type SeatInfo = { tag: string; role?: string } | string;
interface SeatConfig {
  [seat: string]: SeatInfo;
}

// Default configuration for browser environment
const DEFAULT_CONFIG: SeatConfig = {
  smalltalk: { tag: LIN_DEFAULT_MODELS.smalltalk, role: 'general chat and synthesis' },
  coding: { tag: LIN_DEFAULT_MODELS.coding, role: 'technical and code reasoning' },
  creative: { tag: LIN_DEFAULT_MODELS.creative, role: 'creative language and storytelling' }
};

let cachedConfig: SeatConfig | undefined;

function normalizeSeatInfo(seat: string, info: SeatInfo | undefined): SeatInfo {
  const fallback = DEFAULT_CONFIG[seat] || DEFAULT_CONFIG.smalltalk;
  const fallbackTag = typeof fallback === 'string' ? fallback : fallback.tag;
  const fallbackRole = typeof fallback === 'string' ? undefined : fallback.role;
  const rawTag = typeof info === 'string' ? info : info?.tag;
  const role = typeof info === 'string' ? fallbackRole : info?.role || fallbackRole;
  const tag = rawTag
    ? rawTag.includes(':')
      ? rawTag
      : `ollama:${rawTag}`
    : fallbackTag;

  return role ? { tag, role } : tag;
}

function normalizeSeatConfig(config: SeatConfig): SeatConfig {
  return {
    ...config,
    smalltalk: normalizeSeatInfo('smalltalk', config.smalltalk),
    coding: normalizeSeatInfo('coding', config.coding),
    creative: normalizeSeatInfo('creative', config.creative),
  };
}

async function loadSeatConfig(): Promise<SeatConfig> {
  if (cachedConfig) return cachedConfig;
  
  try {
    const response = await fetch('/models.json');
    if (response.ok) {
      const config = await response.json() as SeatConfig;
      cachedConfig = normalizeSeatConfig(config);
      return cachedConfig;
    }
  } catch (error) {
    console.warn('Failed to load models.json, using defaults:', error);
  }
  
  cachedConfig = DEFAULT_CONFIG;
  return DEFAULT_CONFIG;
}

async function seatInfo(seat: Seat): Promise<SeatInfo | undefined> {
  const cfg = await loadSeatConfig();
  return cfg[seat];
}

export async function getSeatRole(seat: Seat): Promise<string | undefined> {
  const info = await seatInfo(seat);
  return typeof info === 'string' ? undefined : info?.role;
}

interface GenerateOptions {
  seat: Seat;
  prompt: string;
  modelOverride?: string;
  systemPrompt?: string;
  timeout?: number;
  retries?: number;
  constructId?: string;  // For memory injection from transcripts
}

export async function runSeat(opts: GenerateOptions): Promise<string> {
  const timeout = opts.timeout ?? 120000; // Default 120s - safety net for slow path when anchors don't exist yet
  const maxRetries = opts.retries ?? 2;
  
  let lastError: Error | null = null;
  
  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const configuredSeat = await seatInfo(opts.seat);
      const seatModel = typeof configuredSeat === 'string' ? configuredSeat : configuredSeat?.tag;

      // First check if the Lin helper API is available
      if (attempt === 0) {
        try {
          const healthResponse = await fetchWithDevAuthRetry('/api/lin/health', {
            method: 'GET',
          }, {
            logLabel: '/api/lin/health',
          });
          
          if (!healthResponse.ok) {
            console.warn('[SeatRunner] Lin helper API health check failed, will still try...');
          }
        } catch (error) {
          console.warn('[SeatRunner] Lin helper API health check error:', error);
        }
      }
      
      // Call the server-side Lin chat endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetchWithDevAuthRetry('/api/lin/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: opts.prompt,
            seat: opts.seat,
            systemPrompt: opts.systemPrompt,
            model: opts.modelOverride || seatModel,
            constructId: opts.constructId
          }),
          signal: controller.signal,
        }, {
          logLabel: '/api/lin/generate',
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `Lin helper API error ${response.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorJson.details || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        if (!data.response) {
          throw new Error('Empty response from Lin helper API');
        }
        
        return data.response;
      } catch (error: any) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms. The API may be taking too long to respond.`);
        }
        
        if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
          throw new Error(`Cannot connect to Lin helper API service. Please check your connection.`);
        }
        
        throw error;
      }
    } catch (error: any) {
      lastError = error;
      
      if (error.message?.includes('timeout') || attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff for retries
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(`Retrying ${opts.seat} seat (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Seat ${opts.seat} failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
}

export { loadSeatConfig };
