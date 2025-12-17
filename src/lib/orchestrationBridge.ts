/**
 * TypeScript Orchestration Bridge
 * 
 * Provides type-safe interface to the Python orchestration framework
 * via the Node.js bridge service.
 */

export interface OrchestrationResponse {
  agent_id: string;
  response: string;
  status: 'success' | 'placeholder' | 'pending' | 'error';
  error?: string;
}

export interface OrchestrationContext {
  user_id?: string;
  thread_id?: string;
  construct_id?: string;
  [key: string]: any;
}

/**
 * Check if orchestration is enabled via environment variable.
 */
export function isOrchestrationEnabled(): boolean {
  // Check both browser and server-side environment
  if (typeof window !== 'undefined') {
    // Browser-side: check localStorage or config
    return localStorage.getItem('ENABLE_ORCHESTRATION') === 'true';
  }
  
  // Server-side: check process.env (will be handled by Node.js bridge)
  return false; // Default to false, actual check happens in Node.js bridge
}

/**
 * Route a message through the orchestration framework.
 * 
 * @param agentId - The agent ID ('zen' or 'lin')
 * @param message - The message content
 * @param context - Additional context (user_id, thread_id, etc.)
 * @returns Promise resolving to orchestration response
 */
export async function routeMessage(
  agentId: string,
  message: string,
  context: OrchestrationContext = {}
): Promise<OrchestrationResponse> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestrationBridge.ts:44',message:'routeMessage: entry',data:{agentId,messageLength:message.length,hasContext:Object.keys(context).length>0},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  try {
    // Call the Node.js bridge service via API endpoint
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestrationBridge.ts:51',message:'routeMessage: calling API endpoint',data:{agentId,url:'/api/orchestration/route'},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    const response = await fetch('/api/orchestration/route', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        agent_id: agentId,
        message: message,
        context: context,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestrationBridge.ts:69',message:'routeMessage: API response received',data:{agentId,status:result.status,ok:response.ok},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    return result as OrchestrationResponse;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestrationBridge.ts:72',message:'routeMessage: API error',data:{agentId,error:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'I'})}).catch(()=>{});
    // #endregion
    // Return error response instead of throwing
    return {
      agent_id: agentId,
      response: `Orchestration failed: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Route message with fallback to direct routing.
 * 
 * @param agentId - The agent ID
 * @param message - The message content
 * @param context - Additional context
 * @param fallbackHandler - Function to call if orchestration fails or is disabled
 * @returns Promise resolving to orchestration response or fallback result
 */
export async function routeMessageWithFallback(
  agentId: string,
  message: string,
  context: OrchestrationContext = {},
  fallbackHandler?: (agentId: string, message: string, context: OrchestrationContext) => Promise<any>
): Promise<OrchestrationResponse | any> {
  // #region agent log
  const enabled = isOrchestrationEnabled();
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestrationBridge.ts:91',message:'routeMessageWithFallback: entry',data:{agentId,enabled,hasFallback:!!fallbackHandler},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'J'})}).catch(()=>{});
  // #endregion
  // Check if orchestration is enabled
  if (!enabled) {
    if (fallbackHandler) {
      return await fallbackHandler(agentId, message, context);
    }
    return {
      agent_id: agentId,
      response: 'Orchestration disabled and no fallback handler provided',
      status: 'error',
    };
  }

  try {
    const result = await routeMessage(agentId, message, context);
    
    // If orchestration returned an error status, try fallback
    if (result.status === 'error' && fallbackHandler) {
      console.warn(`[OrchestrationBridge] Orchestration returned error status, using fallback`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestrationBridge.ts:113',message:'routeMessageWithFallback: using fallback due to error',data:{agentId,status:result.status},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'K'})}).catch(()=>{});
      // #endregion
      return await fallbackHandler(agentId, message, context);
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orchestrationBridge.ts:118',message:'routeMessageWithFallback: returning orchestration result',data:{agentId,status:result.status},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'L'})}).catch(()=>{});
    // #endregion
    return result;
  } catch (error) {
    console.warn(`[OrchestrationBridge] Orchestration failed: ${error}. Using fallback.`);
    
    if (fallbackHandler) {
      return await fallbackHandler(agentId, message, context);
    }
    
    return {
      agent_id: agentId,
      response: `Orchestration failed: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

