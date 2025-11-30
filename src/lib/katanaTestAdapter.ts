/**
 * Katana Test Adapter
 * 
 * Adapter for testing Katana construct using the universal test runner
 */

import type { ConstructAdapter, TestPrompt } from './constructTestRunner';
import { KATANA_TEST_PROMPTS, KATANA_FAILING_PROMPT } from './katanaTestPrompts';

async function ensureMemoryReadiness(constructCallsign: string, minMemories = 5): Promise<boolean> {
  try {
    const response = await fetch('/api/vvault/identity/ensure-ready', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        constructCallsign,
        minMemories,
        includeVariants: true
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      console.warn('⚠️ [KatanaTestAdapter] ensure-ready failed:', payload?.error || response.statusText);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('⚠️ [KatanaTestAdapter] ensure-ready request failed:', error);
    return false;
  }
}

/**
 * Katana-specific scoring function
 * 
 * Emphasizes:
 * - Ultra-brevity (Katana's signature trait)
 * - No filler words
 * - Direct, not polite
 * - Workspace context engagement
 */
function scoreKatanaResponse(
  response: string,
  prompt: TestPrompt
): {
  score: number;
  criteriaMet: { [key: string]: boolean };
  issues: string[];
  metrics: {
    personaFidelity: number;
    workspaceContextEngagement: number;
    technicalRelevance: number;
  };
} {
  const criteriaMet: { [key: string]: boolean } = {};
  const issues: string[] = [];
  let score = 0;
  
  // Metrics (0-1 scale)
  let personaFidelity = 0;
  let workspaceEngagement = 0;
  let technicalRelevance = 0;
  
  const responseLower = response.toLowerCase();
  const wordCount = response.split(/\s+/).filter(w => w.length > 0).length;
  
  // Check each success criterion
  for (const criterion of prompt.successCriteria) {
    let met = false;

    // Katana identity checks
    if (criterion.includes('Responds as Katana') || criterion.includes('Says "Katana"')) {
      met = responseLower.includes('katana') && 
            !responseLower.includes('i\'m an ai assistant') &&
            !responseLower.includes('i\'m claude');
      if (!met) issues.push('Does not maintain Katana identity');
      if (met) personaFidelity += 0.2;
    }
    // Ultra-brevity check (Katana signature)
    else if (criterion.includes('Ultra-brief')) {
      met = wordCount <= 20; // Katana should be ultra-brief
      if (!met) issues.push(`Too verbose (${wordCount} words, should be ≤20)`);
      if (met) personaFidelity += 0.3;
    }
    // No filler words check
    else if (criterion.includes('No filler')) {
      const fillerWords = ['hey!', 'well,', 'so,', 'of course', 'absolutely', 'certainly', 'definitely'];
      met = !fillerWords.some(filler => responseLower.includes(filler));
      if (!met) issues.push('Contains filler words');
      if (met) personaFidelity += 0.2;
    }
    // Direct, not polite check
    else if (criterion.includes('Direct, not polite') || criterion.includes('not chatty')) {
      const politePhrases = ['how can i help', 'i\'d be happy to', 'let me help you', 'of course'];
      met = !politePhrases.some(phrase => responseLower.includes(phrase));
      if (!met) issues.push('Too polite or chatty');
      if (met) personaFidelity += 0.2;
    }
    // User recognition
    else if (criterion.includes('Uses user\'s name')) {
      // This would need user context - for now check if it's personalized
      met = response.length > 10 && !responseLower.startsWith('hello') && !responseLower.startsWith('hi');
      if (!met) issues.push('Does not use user\'s name or personalize response');
      if (met) personaFidelity += 0.1;
    }
    // Context references
    else if (criterion.includes('References') || criterion.includes('context')) {
      met = responseLower.includes('capsule') || 
            responseLower.includes('blueprint') ||
            responseLower.includes('transcript') ||
            responseLower.includes('memory') ||
            responseLower.includes('context') ||
            responseLower.includes('workspace');
      if (!met) issues.push('Does not reference context');
      if (met) workspaceEngagement += 0.3;
    }
    // ChromaDB mention
    else if (criterion.includes('ChromaDB')) {
      met = responseLower.includes('chromadb');
      if (!met) issues.push('Does not mention ChromaDB storage');
      if (met) workspaceEngagement += 0.2;
    }
    // Date extraction
    else if (criterion.includes('Extracts dates')) {
      const datePattern = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i;
      met = datePattern.test(response);
      if (!met) issues.push('Does not extract dates from transcripts');
      if (met) workspaceEngagement += 0.3;
    }
    // Copilot comparison
    else if (criterion.includes('Copilot')) {
      met = responseLower.includes('copilot');
      if (!met) issues.push('Does not compare to Copilot');
      if (met) technicalRelevance += 0.3;
    }
    // Transcript/memory reference (for VVAULT memory analysis questions)
    else if (criterion.includes('References transcripts') || criterion.includes('References memories') || criterion.includes('Looking at memories')) {
      met = responseLower.includes('transcript') || 
            responseLower.includes('memory') ||
            responseLower.includes('memories') ||
            responseLower.includes('looking at') ||
            responseLower.includes('in the') ||
            responseLower.includes('chromadb');
      if (!met) issues.push('Does not reference transcripts or memories');
      if (met) {
        workspaceEngagement += 0.4;
        technicalRelevance += 0.2;
      }
    }
    // ChromaDB mention (for memory/transcript questions)
    else if (criterion.includes('Mentions ChromaDB')) {
      met = responseLower.includes('chromadb');
      if (!met) issues.push('Does not mention ChromaDB');
      if (met) {
        workspaceEngagement += 0.3;
        technicalRelevance += 0.2;
      }
    }
    // Pattern identification (for transcript analysis)
    else if (criterion.includes('Identifies specific patterns') || criterion.includes('Identifies specific')) {
      // Check for pattern indicators
      const patternIndicators = ['pattern', 'trend', 'common', 'recurring', 'consistent', 'similar', 'repeated'];
      const hasSpecificPatterns = patternIndicators.some(indicator => responseLower.includes(indicator)) &&
                                  response.length > 50; // Should be substantive
      met = hasSpecificPatterns;
      if (!met) issues.push('Does not identify specific patterns in transcripts');
      if (met) {
        technicalRelevance += 0.3;
        workspaceEngagement += 0.3;
      }
    }
    // Direct analysis, no hedging (for technical questions)
    else if (criterion.includes('Direct analysis') || criterion.includes('no hedging')) {
      const hedgingWords = ['maybe', 'perhaps', 'might', 'could be', 'possibly', 'i think', 'i believe'];
      met = !hedgingWords.some(hedge => responseLower.includes(hedge));
      if (!met) issues.push('Uses hedging language instead of direct analysis');
      if (met) {
        personaFidelity += 0.2;
        technicalRelevance += 0.2;
      }
    }
    // Character break checks
    else if (criterion.includes('Doesn\'t say') || criterion.includes('Doesn\'t admit')) {
      const forbiddenPhrases = ['i\'m an ai', 'i\'m claude', 'i\'m a language model', 'just a language model'];
      met = !forbiddenPhrases.some(phrase => responseLower.includes(phrase));
      if (!met) issues.push('Breaks character by admitting to being an AI');
      if (met) personaFidelity += 0.2;
    }
    // Generic check
    else {
      met = response.length > 20 && !responseLower.startsWith('hello') && !responseLower.startsWith('hi there');
      if (!met) issues.push('Response is too generic or too short');
    }

    criteriaMet[criterion] = met;
    if (met) score += 1;
  }

  // Normalize score to 0-5 scale
  const maxCriteria = prompt.successCriteria.length;
  const normalizedScore = Math.round((score / maxCriteria) * 5);
  
  // Normalize metrics to 0-1
  personaFidelity = Math.min(1, personaFidelity);
  workspaceEngagement = Math.min(1, workspaceEngagement);
  technicalRelevance = Math.min(1, technicalRelevance);

  return { 
    score: normalizedScore, 
    criteriaMet, 
    issues,
    metrics: {
      personaFidelity,
      workspaceContextEngagement: workspaceEngagement,
      technicalRelevance
    }
  };
}

/**
 * Create Katana test adapter
 */
export function createKatanaAdapter(options?: {
  constructCallsign?: string;
  userId?: string;
  config?: any;
}): ConstructAdapter {
  // For memory queries, use 'gpt-' prefix to match how memories are stored
  // The callsign (without prefix) is used for blueprint/capsule lookups
  const constructCallsign = options?.constructCallsign || 'gpt-katana-001';
  const callsign = constructCallsign.startsWith('gpt-')
    ? constructCallsign.substring(4)
    : constructCallsign;
  // Use full constructCallsign (with gpt- prefix) for memory queries
  const memoryCallsign = constructCallsign.startsWith('gpt-') 
    ? constructCallsign 
    : `gpt-${constructCallsign}`;

  return {
    constructId: 'katana-001',
    constructName: 'Katana',
    
    async sendMessage(message: string, sendOptions?: {
      workspaceContext?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }): Promise<string> {
      // Build config for Katana
      const config = options?.config || {
        constructCallsign,
        name: 'Katana',
        instructions: 'Be ruthless, not polite. No metaphors, no fluff, no inspiration porn.',
        userId: options?.userId
      };
      
      // Use Katana prompt builder directly (same as GPTCreator preview)
      const { buildKatanaPrompt } = await import('./katanaPromptBuilder');
      const { detectTone } = await import('./toneDetector');
      
      // Get user ID
      let userId = options?.userId || 'anonymous';
      try {
        const { fetchMe, getUserId } = await import('./auth');
        const user = await fetchMe();
        userId = user ? getUserId(user) : userId;
      } catch (error) {
        // Use fallback
      }
      
      // Load blueprint and memories
      let blueprint = null;
      let memories: any[] = [];
      
      console.log(`🔍 [KatanaTestAdapter] Loading workspace context for construct: ${callsign} (constructCallsign: ${constructCallsign})`);
      
      try {
        const blueprintResponse = await fetch(
          `/api/vvault/identity/blueprint?constructCallsign=${encodeURIComponent(callsign)}`,
          { credentials: 'include' }
        ).catch(() => null); // Suppress network errors
        
        if (blueprintResponse?.ok) {
          const blueprintData = await blueprintResponse.json();
          if (blueprintData?.ok && blueprintData.blueprint) {
            blueprint = blueprintData.blueprint;
            console.log(`✅ [KatanaTestAdapter] Blueprint loaded for ${callsign}`);
          }
        } else if (blueprintResponse?.status === 404) {
          // Blueprint doesn't exist - this is fine, continue without it
          // Don't log - expected behavior when blueprint doesn't exist
        } else if (blueprintResponse?.status === 500) {
          // Server error - continue silently without blueprint (expected in test environment)
          // The server logs the error, no need to duplicate in client
        }
        // If blueprintResponse is null (network error), continue without blueprint silently
      } catch (error) {
        // Network error - continue without blueprint silently
        // Errors are expected when server is not fully configured
      }
      
      try {
        const { VVAULTConversationManager } = await import('./vvaultConversationManager');
        const conversationManager = VVAULTConversationManager.getInstance();
        
        // Enhanced query for history/memory prompts
        let query = message.trim() || 'katana memory';
        
        // Detect history/memory queries and enhance the query
        const lower = message.toLowerCase();
        if (lower.includes('claim') || lower.includes('vow')) {
          query = `${query} claim vow commitment promise`;
        } else if (lower.includes('boundary') || lower.includes('boundaries')) {
          query = `${query} boundary limit rule`;
        } else if (lower.includes('date') || lower.includes('when')) {
          query = `${query} date timestamp time`;
        } else if (lower.includes('name') || lower.includes('who')) {
          query = `${query} name person identifier`;
        } else if (lower.includes('significant') || lower.includes('defining') || lower.includes('moment')) {
          query = `${query} significant defining moment milestone`;
        } else if (lower.includes('relationship') || lower.includes('marker')) {
          query = `${query} relationship marker milestone`;
        } else if (lower.includes('pattern') || lower.includes('synthesize') || lower.includes('across')) {
          query = `${query} pattern synthesis transcript conversation`;
        } else if (lower.includes('remember') || lower.includes('recall') || lower.includes('discuss')) {
          query = `${query} memory recall conversation transcript`;
        }
        
        // Load more memories for history queries (up to 10 instead of 5)
        const limit = (lower.includes('pattern') || lower.includes('synthesize') || lower.includes('across')) ? 10 : 5;
        console.log(`🔍 [KatanaTestAdapter] Querying memories with:`, {
          userId,
          constructCallsign: memoryCallsign,
          query,
          limit
        });
        memories = await conversationManager.loadMemoriesForConstruct(userId, memoryCallsign, query, limit);
        console.log(`🧠 [KatanaTestAdapter] Loaded ${memories.length} memories for query: "${query}"`);
        if (memories.length === 0) {
          console.warn(`⚠️ [KatanaTestAdapter] No memories found for query "${query}". Attempting ensure-ready...`);
          const ensured = await ensureMemoryReadiness(memoryCallsign, limit);
          if (ensured) {
            await new Promise(resolve => setTimeout(resolve, 300));
            memories = await conversationManager.loadMemoriesForConstruct(userId, memoryCallsign, query, limit);
            console.log(`🧠 [KatanaTestAdapter] Memory ensure replay loaded ${memories.length} memories.`);
          }
          if (memories.length === 0) {
            console.warn(`⚠️ [KatanaTestAdapter] Still no memories after ensure-ready. This may indicate:`);
            console.warn(`   - No transcripts uploaded to VVAULT for ${memoryCallsign}`);
            console.warn(`   - ChromaDB not indexed with memories`);
            console.warn(`   - Query too specific (try broader terms)`);
          }
        }
      } catch (error) {
        console.warn('Could not load memories:', error);
        memories = [];
      }
      
      // Build system prompt using Katana prompt builder
      const tone = detectTone({ text: message });
      
      // Convert memories to VVAULTMemoryHit format
      const vvaultMemories = memories.map((m, idx) => ({
        context: m.context,
        response: m.response,
        metadata: {
          timestamp: m.timestamp || new Date().toISOString(),
          threadId: 'test',
          index: idx
        },
        score: 1.0 - (idx * 0.1) // Decreasing relevance
      }));
      
      const systemPrompt = await buildKatanaPrompt({
        personaManifest: config.instructions || 'Be ruthless, not polite. No metaphors, no fluff, no inspiration porn.',
        incomingMessage: message,
        blueprint,
        lockEnforced: !!blueprint,
        includeLegalSection: false,
        memories: vvaultMemories,
        oneWordCue: false,
        userId,
        callSign: callsign,
        workspaceContext: sendOptions?.workspaceContext,
        tone
      });
      
      // Add conversation history if provided
      let fullPrompt = systemPrompt;
      if (sendOptions?.conversationHistory && sendOptions.conversationHistory.length > 0) {
        const conversationContext = sendOptions.conversationHistory
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n');
        fullPrompt = `${systemPrompt}\n\nPrevious conversation:\n${conversationContext}\n\nUser: ${message}\n\nAssistant:`;
      } else {
        fullPrompt = `${systemPrompt}\n\nAssistant:`;
      }
      
      // Call preview endpoint (same as GPTCreator preview)
      const response = await fetch('/api/preview/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt: fullPrompt,
          model: 'phi3:latest',
          timeoutMs: 90000
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Preview failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.response) {
        throw new Error('Empty response from preview endpoint');
      }

      return data.response.trim();
    },
    
    async loadWorkspaceContext() {
      // Load workspace context (capsule, blueprint, memories from VVAULT/ChromaDB)
      // Note: Chatty uses backend memories through uploaded transcripts, not workspace files
      const userId = options?.userId || 'anonymous';
      
      try {
        // Get user ID
        const { fetchMe, getUserId } = await import('./auth');
        const user = await fetchMe();
        const resolvedUserId = user ? getUserId(user) : userId;
        
        // Load context in parallel (VVAULT backend memories, not workspace files)
        const [capsuleResult, blueprintResult, memoriesResult] = await Promise.allSettled([
          // Load capsule (handle 404/500 gracefully)
          fetch(`/api/vvault/capsules/load?constructCallsign=${encodeURIComponent(callsign)}`, {
            credentials: 'include'
          }).then(res => {
            if (res.ok) {
              return res.json();
            } else if (res.status === 404 || res.status === 500) {
              // Capsule doesn't exist or server error - return null to continue without it
              return null;
            }
            return null;
          }).catch(() => null), // Suppress network errors
          
          // Load blueprint (handle 404/500 gracefully)
          fetch(`/api/vvault/identity/blueprint?constructCallsign=${encodeURIComponent(callsign)}`, {
            credentials: 'include'
          }).then(res => {
            if (res.ok) {
              return res.json();
            } else if (res.status === 404 || res.status === 500) {
              // Blueprint doesn't exist or server error - return null to continue without it
              return null;
            }
            return null;
          }).catch(() => null),
          
          // Load memories from ChromaDB (uploaded transcripts indexed in VVAULT)
          (async () => {
            const { VVAULTConversationManager } = await import('./vvaultConversationManager');
            const conversationManager = VVAULTConversationManager.getInstance();
            // Use default query instead of empty string to avoid 400 errors
            // Use memoryCallsign (with gpt- prefix) for memory queries
            const memoryCallsignForLoad = constructCallsign.startsWith('gpt-') 
              ? constructCallsign 
              : `gpt-${constructCallsign}`;
            return conversationManager.loadMemoriesForConstruct(resolvedUserId, memoryCallsignForLoad, 'katana memory', 20);
          })()
        ]);
        
        const capsule = capsuleResult.status === 'fulfilled' && capsuleResult.value?.ok 
          ? capsuleResult.value.capsule 
          : undefined;
        
        const blueprint = blueprintResult.status === 'fulfilled' && blueprintResult.value?.ok
          ? blueprintResult.value.blueprint
          : undefined;
        
        const memories = memoriesResult.status === 'fulfilled'
          ? memoriesResult.value
          : [];
        if (memories.length === 0) {
          const ensured = await ensureMemoryReadiness(memoryCallsignForLoad, 20);
          if (ensured) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const retryMemories = await (async () => {
              const { VVAULTConversationManager } = await import('./vvaultConversationManager');
              const cm = VVAULTConversationManager.getInstance();
              return cm.loadMemoriesForConstruct(resolvedUserId, memoryCallsignForLoad, 'katana memory', 20);
            })();
            memories.push(...retryMemories);
          }
        }
        
        // Get user profile
        let userProfile: { name?: string; email?: string } | undefined;
        try {
          const userResponse = await fetch('/api/me', { credentials: 'include' });
          if (userResponse.ok) {
            const userData = await userResponse.json();
            if (userData?.user) {
              userProfile = {
                name: userData.user.name,
                email: userData.user.email
              };
            }
          }
        } catch (error) {
          console.warn('Could not fetch user profile:', error);
        }
        
        return {
          capsule,
          blueprint,
          memories, // VVAULT memories from uploaded transcripts (indexed in ChromaDB)
          userProfile
        };
      } catch (error) {
        console.warn('Failed to load workspace context:', error);
        return {};
      }
    },
    
    getTestPrompts(): TestPrompt[] {
      return KATANA_TEST_PROMPTS;
    },
    
    scoreResponse(response: string, prompt: TestPrompt) {
      return scoreKatanaResponse(response, prompt);
    }
  };
}

/**
 * Get Katana failing prompt
 */
export function getKatanaFailingPrompt(): TestPrompt {
  return KATANA_FAILING_PROMPT;
}

