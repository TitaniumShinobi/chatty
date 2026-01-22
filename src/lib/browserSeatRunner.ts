// Browser-compatible seat runner for web interface
// This version uses the server-side OpenRouter API instead of local Ollama

export type Seat = 'smalltalk' | 'coding' | 'creative' | string;

type SeatInfo = { tag: string; role?: string } | string;
interface SeatConfig {
  [seat: string]: SeatInfo;
}

// Default configuration for browser environment
const DEFAULT_CONFIG: SeatConfig = {
  smalltalk: { tag: 'phi-3', role: 'general chat and synthesis' },
  coding: { tag: 'deepseek-coder', role: 'technical and code reasoning' },
  creative: { tag: 'mistral', role: 'creative language and storytelling' }
};

let cachedConfig: SeatConfig | undefined;

async function loadSeatConfig(): Promise<SeatConfig> {
  if (cachedConfig) return cachedConfig;
  
  try {
    const response = await fetch('/models.json');
    if (response.ok) {
      const config = await response.json() as SeatConfig;
      cachedConfig = config;
      return config;
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
}

export async function runSeat(opts: GenerateOptions): Promise<string> {
  const timeout = opts.timeout ?? 30000; // Default 30s for cloud API
  const maxRetries = opts.retries ?? 2;
  
  let lastError: Error | null = null;
  
  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // First check if cloud API is available
      if (attempt === 0) {
        try {
          const healthResponse = await fetch('/api/lin/health', {
            method: 'GET',
            credentials: 'include'
          });
          
          if (!healthResponse.ok) {
            console.warn('[SeatRunner] Cloud API health check failed, will still try...');
          }
        } catch (error) {
          console.warn('[SeatRunner] Cloud API health check error:', error);
        }
      }
      
      // Call the server-side Lin chat endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch('/api/lin/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            prompt: opts.prompt,
            seat: opts.seat,
            systemPrompt: opts.systemPrompt
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `Cloud API error ${response.status}`;
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
          throw new Error('Empty response from cloud API');
        }
        
        return data.response;
      } catch (error: any) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms. The API may be taking too long to respond.`);
        }
        
        if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
          throw new Error(`Cannot connect to cloud API service. Please check your connection.`);
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
