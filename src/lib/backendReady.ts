/**
 * Backend Readiness Checker
 * 
 * Ensures the backend is ready before making API calls to prevent
 * ECONNREFUSED errors during startup.
 */

const MAX_RETRIES = 10;
const INITIAL_DELAY = 200; // Start with 200ms
const MAX_DELAY = 2000; // Max 2 seconds between retries
const BACKEND_TIMEOUT = 5000; // 5 second timeout for health check
const STARTUP_DELAY = 1000; // Wait 1 second before first health check (give backend time to start)

/**
 * Check if backend is ready by hitting /health endpoint
 * Silently handles connection errors (expected during startup)
 */
async function checkBackendHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT);
    
    const response = await fetch('/api/health', {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    // Connection refused, timeout, or other network error
    // These are expected during startup, so we silently return false
    // The error is already handled by Vite proxy logging, no need to log again here
    return false;
  }
}

/**
 * Wait for backend to be ready with exponential backoff
 * 
 * @param maxRetries Maximum number of retry attempts
 * @param onRetry Optional callback when retrying
 * @returns Promise that resolves when backend is ready, or rejects after max retries
 */
export async function waitForBackendReady(
  maxRetries: number = MAX_RETRIES,
  onRetry?: (attempt: number, delay: number) => void
): Promise<void> {
  // Give backend time to start before first health check
  // This reduces ECONNREFUSED errors in Vite proxy logs
  await new Promise(resolve => setTimeout(resolve, STARTUP_DELAY));
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const isReady = await checkBackendHealth();
    
    if (isReady) {
      if (attempt > 0) {
        console.log(`✅ [BackendReady] Backend ready after ${attempt} retry attempts`);
      }
      return;
    }
    
    // Calculate exponential backoff delay
    const delay = Math.min(INITIAL_DELAY * Math.pow(2, attempt), MAX_DELAY);
    
    if (onRetry) {
      onRetry(attempt + 1, delay);
    } else if (attempt < 3) {
      // Only log first few attempts to reduce noise
      console.log(`⏳ [BackendReady] Backend not ready, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
    }
    
    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  throw new Error(`Backend not ready after ${maxRetries} attempts`);
}

/**
 * Retry a fetch request with exponential backoff
 * 
 * @param url Request URL
 * @param options Fetch options
 * @param maxRetries Maximum retry attempts
 * @returns Promise with response
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        credentials: options.credentials || 'include',
      });
      
      // If successful, return immediately
      if (response.ok || response.status < 500) {
        return response;
      }
      
      // For 5xx errors, retry
      if (response.status >= 500 && attempt < maxRetries - 1) {
        const delay = INITIAL_DELAY * Math.pow(2, attempt);
        console.log(`⚠️ Server error ${response.status}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a connection error
      const isConnectionError = 
        error instanceof TypeError && 
        (error.message.includes('Failed to fetch') || 
         error.message.includes('ECONNREFUSED') ||
         error.message.includes('NetworkError'));
      
      if (isConnectionError && attempt < maxRetries - 1) {
        const delay = INITIAL_DELAY * Math.pow(2, attempt);
        console.log(`⚠️ Connection error, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not a connection error or out of retries, throw
      throw error;
    }
  }
  
  throw lastError || new Error('Fetch failed after retries');
}

