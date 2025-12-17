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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browserSeatRunner.ts:76',message:'runSeat entry',data:{seat:opts.seat,modelOverride:opts.modelOverride,promptLength:opts.prompt.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  const timeout = opts.timeout ?? 15000; // Default 15s to avoid verbose stalls
  const maxRetries = opts.retries ?? 2; // 2 retries max
  
  // Use Vite proxy for Ollama to avoid CORS issues
  const baseURL = '/ollama';
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browserSeatRunner.ts:82',message:'Before resolveModel',data:{seat:opts.seat,modelOverride:opts.modelOverride},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  const model = await resolveModel(opts.seat, opts.modelOverride);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browserSeatRunner.ts:85',message:'After resolveModel',data:{resolvedModel:model},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  let lastError: Error | null = null;
  let ollamaAvailable = false;

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Quick availability check via /api/tags (only on first attempt)
      if (attempt === 0) {
        const tagsURL = `${baseURL}/api/tags`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s for availability check (increased from 5s)
          
          const tagsResponse = await fetch(tagsURL, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (tagsResponse.ok) {
            ollamaAvailable = true;
            const tagsJson = await tagsResponse.json();
            if (Array.isArray(tagsJson.models)) {
              const found = tagsJson.models.some((m: any) => m.name?.startsWith(model.split(":")[0]));
              if (!found) {
                const availableModels = tagsJson.models.map((m: any) => m.name).join(', ');
                throw new Error(`ModelNotAvailable:${model}. Available models: ${availableModels || 'none'}`);
              }
            }
          } else {
            throw new Error(`Ollama service unavailable (status ${tagsResponse.status}). Make sure Ollama is running on localhost:11434.`);
          }
        } catch (error: any) {
          // Handle availability check errors
          if (error.name === 'AbortError') {
            throw new Error(`Ollama service timeout. Make sure Ollama is running on localhost:11434 and accessible.`);
          } else if (error.message?.includes('ModelNotAvailable')) {
            throw error; // Re-throw model not available errors
          } else if (error.message?.includes('Ollama service unavailable')) {
            throw error; // Re-throw service unavailable errors
          } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
            throw new Error(`Cannot connect to Ollama service. Make sure Ollama is running on localhost:11434. Error: ${error.message}`);
          } else {
            console.warn('Model availability check failed, proceeding anyway:', error);
            // Don't fail completely, but note that Ollama might not be available
          }
        }
      }

      const url = `${baseURL}/api/generate`;
      const antiHedgePreamble = `Answer in one or two sentences. No hedging, no apologies, no \"as an AI\" disclaimers. If unknown, say \"No idea\" and stop.`;
      const body = JSON.stringify({ 
        model, 
        prompt: `${antiHedgePreamble}\n\n${opts.prompt}`, 
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 2000 // Limit response length
        }
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browserSeatRunner.ts:139',message:'Before generate API call',data:{url,model,bodyLength:body.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browserSeatRunner.ts:157',message:'After generate fetch',data:{ok:response.ok,status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browserSeatRunner.ts:168',message:'Generate API error response',data:{status:response.status,errorText:errorText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          let errorMessage = `Ollama error ${response.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browserSeatRunner.ts:180',message:'After generate JSON parse',data:{hasResponse:!!data.response,responseLength:data.response?.length || 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        if (!data.response) {
          throw new Error('Empty response from Ollama. The model may not be responding correctly.');
        }
        return data.response;
      } catch (error: any) {
        clearTimeout(timeoutId);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browserSeatRunner.ts:185',message:'Error in generate API call',data:{errorName:error.name,errorMessage:error.message,isAbortError:error.name === 'AbortError'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        // Handle abort/timeout with better error message
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms. The model may be taking too long to respond. Try a faster model or increase timeout.`);
        }
        
        // Handle network errors
        if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
          throw new Error(`Cannot connect to Ollama service. Make sure Ollama is running on localhost:11434.`);
        }
        
        throw error;
      }
    } catch (error: any) {
      lastError = error;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browserSeatRunner.ts:200',message:'Retry loop catch',data:{attempt,maxRetries,errorMessage:error.message,willRetry:!(error.message?.includes('ModelNotAvailable') || error.message?.includes('timeout') || attempt === maxRetries)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'browserSeatRunner.ts:211',message:'All retries failed',data:{seat:opts.seat,lastError:lastError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  throw new Error(`Seat ${opts.seat} failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
}

export { loadSeatConfig };
