/**
 * Orchestration Bridge Service
 * 
 * Bridges Node.js/TypeScript codebase to Python orchestration framework.
 * Spawns Python subprocesses to call agent_squad_manager.py for message routing.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to orchestration CLI
const ORCHESTRATION_CLI_PATH = join(__dirname, '../../orchestration/cli.py');

// Default timeout for orchestration calls (5 seconds)
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Route a message through the orchestration framework.
 * 
 * @param {string} agentId - The agent ID ('zen' or 'lin')
 * @param {string} message - The message content
 * @param {object} context - Additional context (user_id, thread_id, etc.)
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns {Promise<object>} Orchestration response with agent_id, response, status
 */
export async function routeViaOrchestration(agentId, message, context = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/orchestrationBridge.js:31',message:'routeViaOrchestration: entry',data:{agentId,messageLength:message.length,contextKeys:Object.keys(context).length,timeoutMs},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'R'})}).catch(()=>{});
  // #endregion
  return new Promise((resolve, reject) => {
    // Validate inputs
    if (!agentId || typeof agentId !== 'string') {
      reject(new Error('agentId must be a non-empty string'));
      return;
    }
    
    if (!message || typeof message !== 'string') {
      reject(new Error('message must be a non-empty string'));
      return;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/orchestrationBridge.js:45',message:'routeViaOrchestration: spawning Python process',data:{agentId,cliPath:ORCHESTRATION_CLI_PATH},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'S'})}).catch(()=>{});
    // #endregion
    
    // Spawn Python process
    const pythonProcess = spawn('python3', [
      '-m', 'orchestration.cli',
      agentId,
      message
    ], {
      cwd: join(__dirname, '../..'), // Run from chatty root
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    // Collect stdout
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/orchestrationBridge.js:58',message:'routeViaOrchestration: stdout data received',data:{agentId,dataLength:data.length,stdoutLength:stdout.length},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'T'})}).catch(()=>{});
      // #endregion
    });
    
    // Collect stderr
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/orchestrationBridge.js:63',message:'routeViaOrchestration: stderr data received',data:{agentId,dataLength:data.length},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'U'})}).catch(()=>{});
      // #endregion
    });
    
    // Set timeout
    const timeout = setTimeout(() => {
      pythonProcess.kill('SIGTERM');
      reject(new Error(`Orchestration call timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/orchestrationBridge.js:74',message:'routeViaOrchestration: Python process closed',data:{agentId,exitCode:code,stdoutLength:stdout.length,stderrLength:stderr.length},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'V'})}).catch(()=>{});
      // #endregion
      
      if (code !== 0) {
        // Try to parse error from stderr
        let errorMessage = `Python process exited with code ${code}`;
        try {
          const errorObj = JSON.parse(stderr);
          errorMessage = errorObj.error || errorMessage;
        } catch (e) {
          // If stderr isn't JSON, use it as-is
          if (stderr.trim()) {
            errorMessage = stderr.trim();
          }
        }
        
        reject(new Error(errorMessage));
        return;
      }
      
      // Parse response
      try {
        const result = JSON.parse(stdout.trim());
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/orchestrationBridge.js:95',message:'routeViaOrchestration: parsing result',data:{agentId,status:result.status,agent_id:result.agent_id},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'W'})}).catch(()=>{});
        // #endregion
        resolve(result);
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services/orchestrationBridge.js:99',message:'routeViaOrchestration: parse error',data:{agentId,error:e.message,stdoutPreview:stdout.substring(0,100)},timestamp:Date.now(),sessionId:'orchestration-test',runId:'test-run-1',hypothesisId:'X'})}).catch(()=>{});
        // #endregion
        reject(new Error(`Failed to parse orchestration response: ${e.message}. Output: ${stdout}`));
      }
    });
    
    // Handle process errors
    pythonProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });
    
    // Send context as JSON via stdin
    if (Object.keys(context).length > 0) {
      const contextJson = JSON.stringify(context);
      pythonProcess.stdin.write(contextJson);
      pythonProcess.stdin.end();
    } else {
      pythonProcess.stdin.end();
    }
  });
}

/**
 * Check if orchestration is enabled.
 * 
 * @returns {boolean} True if orchestration should be used
 */
export function isOrchestrationEnabled() {
  return process.env.ENABLE_ORCHESTRATION === 'true' || 
         process.env.ENABLE_ORCHESTRATION === '1';
}

/**
 * Route message with fallback to direct routing.
 * 
 * @param {string} agentId - The agent ID
 * @param {string} message - The message content
 * @param {object} context - Additional context
 * @param {Function} fallbackHandler - Function to call if orchestration fails
 * @returns {Promise<object>} Response from orchestration or fallback
 */
export async function routeMessageWithFallback(agentId, message, context = {}, fallbackHandler = null) {
  // Check if orchestration is enabled
  if (!isOrchestrationEnabled()) {
    if (fallbackHandler) {
      return await fallbackHandler(agentId, message, context);
    }
    throw new Error('Orchestration disabled and no fallback handler provided');
  }
  
  try {
    return await routeViaOrchestration(agentId, message, context);
  } catch (error) {
    console.warn(`[OrchestrationBridge] Orchestration failed: ${error.message}. Falling back to direct routing.`);
    
    if (fallbackHandler) {
      return await fallbackHandler(agentId, message, context);
    }
    
    // If no fallback, return error response
    return {
      agent_id: agentId,
      response: `Orchestration failed: ${error.message}`,
      status: 'error',
      error: error.message
    };
  }
}

