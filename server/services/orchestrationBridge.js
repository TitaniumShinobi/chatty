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
export async function routeViaOrchestration(agentId, message, context = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {return new Promise((resolve, reject) => {
    // Validate inputs
    if (!agentId || typeof agentId !== 'string') {
      reject(new Error('agentId must be a non-empty string'));
      return;
    }
    
    if (!message || typeof message !== 'string') {
      reject(new Error('message must be a non-empty string'));
      return;
    }// Spawn Python process
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
      stdout += data.toString();});
    
    // Collect stderr
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();});
    
    // Set timeout
    const timeout = setTimeout(() => {
      pythonProcess.kill('SIGTERM');
      reject(new Error(`Orchestration call timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      clearTimeout(timeout);if (code !== 0) {
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
        const result = JSON.parse(stdout.trim());resolve(result);
      } catch (e) {reject(new Error(`Failed to parse orchestration response: ${e.message}. Output: ${stdout}`));
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

