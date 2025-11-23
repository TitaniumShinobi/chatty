// Browser-compatible seat runner for web interface
// This version uses fetch instead of Node.js modules

export type Seat = 'smalltalk' | 'coding' | 'creative' | string;

type SeatInfo = { tag: string; role?: string } | string;
interface SeatConfig {
  [seat: string]: SeatInfo;
}

// Default configuration for browser environment
const DEFAULT_CONFIG: SeatConfig = {
  smalltalk: { tag: 'phi3:latest', role: 'general chat and synthesis' },
  coding: { tag: 'deepseek-coder:latest', role: 'technical and code reasoning' },
  creative: { tag: 'mistral:latest', role: 'creative language and storytelling' }
};

let cachedConfig: SeatConfig | undefined;

async function loadSeatConfig(): Promise<SeatConfig> {
  if (cachedConfig) return cachedConfig;
  
  try {
    // Try to fetch models.json from the public directory
    const response = await fetch('/models.json');
    if (response.ok) {
      const config = await response.json() as SeatConfig;
      cachedConfig = config;
      return config;
    }
  } catch (error) {
    console.warn('Failed to load models.json, using defaults:', error);
  }
  
  // Fallback to default configuration
  cachedConfig = DEFAULT_CONFIG;
  return DEFAULT_CONFIG;
}

function envOverrideForSeat(seat: Seat): string | undefined {
  // In browser, we can use Vite's environment variables
  // e.g., VITE_OLLAMA_MODEL_CODING overrides coding seat
  const key = `VITE_OLLAMA_MODEL_${seat.toUpperCase()}`;
  return import.meta.env[key];
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
  if (!info) return 'phi3:latest';
  return typeof info === 'string' ? info : info.tag;
}

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
  timeout?: number; // Timeout in milliseconds (default: 30000)
  retries?: number; // Max retries (default: 2)
}

export async function runSeat(opts: GenerateOptions): Promise<string> {
  const timeout = opts.timeout ?? 30000; // 30 second default timeout
  const maxRetries = opts.retries ?? 2; // 2 retries max
  
  // Use Vite proxy for Ollama to avoid CORS issues
  const baseURL = '/ollama';
  const model = await resolveModel(opts.seat, opts.modelOverride);

  let lastError: Error | null = null;

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Quick availability check via /api/tags (only on first attempt)
      if (attempt === 0) {
        const tagsURL = `${baseURL}/api/tags`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s for availability check
          
          const tagsResponse = await fetch(tagsURL, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (tagsResponse.ok) {
            const tagsJson = await tagsResponse.json();
            if (Array.isArray(tagsJson.models)) {
              const found = tagsJson.models.some((m: any) => m.name?.startsWith(model.split(":")[0]));
              if (!found) throw new Error(`ModelNotAvailable:${model}`);
            }
          }
        } catch (error: any) {
          // Don't fail on availability check errors, but log them
          if (error.name === 'AbortError') {
            console.warn(`Model availability check timeout for ${model}`);
          } else if (error.message?.includes('ModelNotAvailable')) {
            throw error; // Re-throw model not available errors
          } else {
            console.warn('Model availability check failed, proceeding anyway:', error);
          }
        }
      }

      const url = `${baseURL}/api/generate`;
      const body = JSON.stringify({ model, prompt: opts.prompt, stream: false });

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        return data.response ?? '';
      } catch (error: any) {
        clearTimeout(timeoutId);
        
        // Handle abort/timeout
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
      }
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on certain errors
      if (error.message?.includes('ModelNotAvailable') || 
          error.message?.includes('timeout') ||
          attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff for retries (1s, 2s delays)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(`Retrying ${opts.seat} seat (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // If we get here, all retries failed
  throw new Error(`Seat ${opts.seat} failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
}

export { loadSeatConfig };
