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
}

export async function runSeat(opts: GenerateOptions): Promise<string> {
  // Use Vite proxy for Ollama to avoid CORS issues
  const baseURL = '/ollama';
  const model = await resolveModel(opts.seat, opts.modelOverride);
  const antiHedge = 'Respond in one or two sentences. No hedging, no apologies, no scope disclaimers, no “as an AI”. If uncertain, say “No idea” and stop.';

  // Quick availability check via /api/tags
  const tagsURL = `${baseURL}/api/tags`;
  try {
    const tagsResponse = await fetch(tagsURL);
    if (tagsResponse.ok) {
      const tagsJson = await tagsResponse.json();
      if (Array.isArray(tagsJson.models)) {
        const found = tagsJson.models.some((m: any) => m.name?.startsWith(model.split(":")[0]));
        if (!found) throw new Error(`ModelNotAvailable:${model}`);
      }
    }
  } catch (error) {
    console.warn('Model availability check failed, proceeding anyway:', error);
  }

  const url = `${baseURL}/api/generate`;
  const body = JSON.stringify({ model, prompt: `${antiHedge}\n\n${opts.prompt}`, stream: false });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.response ?? '';
  } catch (error) {
    throw new Error(`Failed to generate response: ${error}`);
  }
}

export { loadSeatConfig };
