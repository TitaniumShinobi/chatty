/**
 * Unified Lin Orchestrator
 * 
 * Lin = Synth. They are the same thing.
 * 
 * This orchestrator:
 * 1. Reads workspace context (open files, conversation history) like Copilot
 * 2. Maintains unbreakable character persistence
 * 3. Shares context across all GPTs using Lin mode
 * 4. Never breaks to generic mode, even when challenged
 */

import type { PersonalityBlueprint } from '../transcript/types';
import { PersonalityOrchestrator } from './PersonalityOrchestrator';
import { detectToneEnhanced } from '../../lib/toneDetector';
import { WorkspaceContextBuilder } from '../context/WorkspaceContextBuilder';

export interface UnifiedLinContext {
  // VVAULT ChromaDB memories (always-on, per-response retrieval)
  memories: Array<{
    context: string;
    response: string;
    relevance: number;
    timestamp?: string;
    memoryType?: 'short-term' | 'long-term';
  }>;
  
  // Conversation history (current thread only) - ALWAYS includes timestamps
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number; // REQUIRED: All messages must have timestamps
  }>;
  
  // Character blueprint (if available)
  blueprint?: PersonalityBlueprint;
  
  // User profile (from VVAULT)
  userProfile?: {
    name?: string;
    email?: string;
  };
}

export interface UnifiedLinResponse {
  systemPrompt: string;
  response: string;
  contextUsed: {
    workspaceFiles: number;
    conversationHistory: number;
    sharedKnowledge: boolean;
    blueprint: boolean;
  };
}

export class UnifiedLinOrchestrator {
  private personalityOrchestrator: PersonalityOrchestrator;
  private workspaceContextBuilder: WorkspaceContextBuilder;
  private sharedContextCache: Map<string, UnifiedLinContext> = new Map();
  
  constructor(vvaultRoot?: string) {
    this.personalityOrchestrator = new PersonalityOrchestrator(vvaultRoot);
    this.workspaceContextBuilder = new WorkspaceContextBuilder();
  }

  /**
   * Load VVAULT ChromaDB memories (always-on, per-response)
   * Connects directly to users/{userId}/instances/{constructCallsign}/memory/
   */
  async loadVVAULTMemories(
    userId: string,
    constructCallsign: string,
    query: string,
    limit: number = 10
  ): Promise<UnifiedLinContext['memories']> {
    try {
      // Use VVAULT retrieval service (always-on background retrieval)
      const { VVAULTRetrievalWrapper } = await import('../../lib/vvaultRetrieval');
      const fetcher = typeof window !== 'undefined' && typeof window.fetch === 'function'
        ? window.fetch.bind(window)
        : fetch;
      const vvaultRetrieval = new VVAULTRetrievalWrapper({ fetcher });
      
      // Detect tone for better retrieval
      const { detectTone } = await import('../../lib/toneDetector');
      const tone = detectTone({ text: query });
      
      // Query ChromaDB memories (short-term and long-term)
      const result = await vvaultRetrieval.retrieveMemories({
        constructCallsign,
        semanticQuery: query,
        toneHints: tone ? [tone.tone] : [],
        limit,
        includeDiagnostics: false
      });
      
      return result.memories.map(m => ({
        context: m.context || '',
        response: m.response || '',
        relevance: m.relevance || 0,
        timestamp: m.timestamp,
        memoryType: m.memoryType as 'short-term' | 'long-term' | undefined
      }));
    } catch (error) {
      console.warn('[UnifiedLinOrchestrator] Failed to load VVAULT memories:', error);
      return [];
    }
  }

  /**
   * Load unified context from VVAULT ChromaDB
   * Always-on memory retrieval, zero downtime
   */
  async loadUnifiedContext(
    userId: string,
    constructCallsign: string,
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<UnifiedLinContext> {
    // ALWAYS retrieve memories from ChromaDB (per-response)
    const memories = await this.loadVVAULTMemories(userId, constructCallsign, userMessage, 10);
    
    // Load user profile
    let userProfile: UnifiedLinContext['userProfile'] = undefined;
    try {
      const userResponse = await fetch('/api/me', {
        credentials: 'include'
      }).catch(() => null);
      
      if (userResponse?.ok) {
        const user = await userResponse.json();
        userProfile = {
          name: user.name,
          email: user.email
        };
      }
    } catch (error) {
      console.warn('[UnifiedLinOrchestrator] Failed to load user profile:', error);
    }

    return {
      memories,
      conversationHistory,
      userProfile
    };
  }

  /**
   * Load time context (current date/time awareness)
   */
  async loadTimeContext(): Promise<any> {
    try {
      const { getTimeContext } = await import('../../lib/timeAwareness');
      return await getTimeContext();
    } catch (error) {
      console.warn('[UnifiedLinOrchestrator] Failed to load time context:', error);
      return null;
    }
  }

  /**
   * Orchestrate response with unified Lin context
   * ALWAYS retrieves memories from VVAULT ChromaDB (zero downtime)
   * NEVER breaks character, even when challenged
   */
  async orchestrateResponse(
    userMessage: string,
    userId: string,
    threadId: string,
    constructId: string,
    callsign: string,
    threads: any[],
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>
  ): Promise<UnifiedLinResponse> {
    // Ensure all messages have timestamps (add if missing)
    const timestampedHistory = conversationHistory.map(msg => ({
      ...msg,
      timestamp: msg.timestamp || Date.now()
    }));
    // ALWAYS load VVAULT ChromaDB memories (per-response, always-on)
    const unifiedContext = await this.loadUnifiedContext(
      userId,
      callsign,
      userMessage,
      timestampedHistory
    );

    // Load capsule (hardlock into GPT) - HIGHEST PRIORITY
    let capsule: any = undefined;
    try {
      const response = await fetch(
        `/api/vvault/capsules/load?constructCallsign=${encodeURIComponent(callsign)}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        if (data?.ok && data.capsule) {
          capsule = { data: data.capsule };
          console.log(`✅ [UnifiedLinOrchestrator] Loaded capsule for ${callsign}`, {
            hasTraits: !!data.capsule.traits,
            hasPersonality: !!data.capsule.personality,
            hasMemory: !!data.capsule.memory
          });
        }
      }
    } catch (error) {
      console.warn('[UnifiedLinOrchestrator] Failed to load capsule:', error);
    }

    // Load blueprint if available (secondary to capsule)
    let blueprint: PersonalityBlueprint | undefined;
    try {
      const { IdentityMatcher } = await import('../character/IdentityMatcher');
      const identityMatcher = new IdentityMatcher();
      blueprint = await identityMatcher.loadPersonalityBlueprint(userId, constructId, callsign);
      if (blueprint) {
        unifiedContext.blueprint = blueprint;
      }
    } catch (error) {
      console.warn('[UnifiedLinOrchestrator] Failed to load blueprint:', error);
    }

    // Load time context (current date/time awareness)
    const timeContext = await this.loadTimeContext();

    // Calculate session context (time-aware session state)
    const lastMessage = timestampedHistory.length > 0 
      ? timestampedHistory[timestampedHistory.length - 1]
      : null;
    const lastMessageTimestamp = lastMessage?.timestamp;
    
    const { determineSessionState } = await import('../../lib/timeAwareness');
    const sessionContext = determineSessionState(lastMessageTimestamp);
    
    // Get last message content for recap context
    const lastMessageContent = lastMessage?.content || undefined;

    // Detect tone
    const tone = await detectToneEnhanced({
      text: userMessage,
      context: {
        conversationHistory: timestampedHistory,
        relationshipHistory: []
      }
    }, 'phi3:latest');

    // Build system prompt with VVAULT memory context (include capsule if available)
    const systemPrompt = await this.buildUnifiedLinPrompt(
      userMessage,
      unifiedContext,
      constructId,
      callsign,
      tone,
      capsule, // Pass capsule for injection
      timeContext, // Pass time context
      sessionContext, // Pass session context
      lastMessageContent // Pass last message for recap
    );

    // Return system prompt - caller will call LLM with this prompt
    // NOTE: The actual LLM call happens in GPTCreator.tsx handlePreviewSubmit()
    // This orchestrator builds the prompt, caller executes it
    return {
      systemPrompt,
      response: '', // Empty - caller will generate response
      contextUsed: {
        workspaceFiles: 0, // Not used - workspace not available
        conversationHistory: unifiedContext.conversationHistory.length,
        sharedKnowledge: !!unifiedContext.userProfile,
        blueprint: !!blueprint,
        capsule: !!capsule
      }
    };
  }

  /**
   * Build unified Lin prompt with VVAULT ChromaDB memory context
   * NEVER breaks character - responds to meta-questions in character
   */
  private async buildUnifiedLinPrompt(
    userMessage: string,
    context: UnifiedLinContext,
    constructId: string,
    callsign: string,
    tone: any,
    capsule?: any,
    timeContext?: any,
    sessionContext?: any,
    lastMessageContent?: string
  ): Promise<string> {
    const sections: string[] = [];

    // SESSION-AWARE TIME AWARENESS (inject at top for temporal context)
    if (timeContext) {
      try {
        const { buildSessionAwareTimePromptSection } = await import('../../lib/timeAwareness');
        if (sessionContext) {
          sections.push(buildSessionAwareTimePromptSection(timeContext, sessionContext, lastMessageContent));
        } else {
          const { buildTimePromptSection } = await import('../../lib/timeAwareness');
          sections.push(buildTimePromptSection(timeContext));
        }
      } catch (error) {
        console.warn('[UnifiedLinOrchestrator] Failed to build time section:', error);
      }
    }

    // CAPSULE HARDLOCK (highest priority - if capsule exists, inject it first)
    if (capsule && capsule.data) {
      const data = capsule.data;
      sections.push('=== CAPSULE HARDLOCK (UNBREAKABLE IDENTITY) ===');
      sections.push('This capsule defines your core identity. It cannot be overridden.');
      if (data.metadata?.instance_name) {
        sections.push(`Your name: ${data.metadata.instance_name}`);
      }
      if (data.traits) {
        sections.push('=== CAPSULE TRAITS ===');
        Object.entries(data.traits).forEach(([key, value]) => {
          sections.push(`${key}: ${value}`);
        });
      }
      if (data.personality?.personality_type) {
        sections.push(`Personality type: ${data.personality.personality_type}`);
      }
      if (data.signatures?.linguistic_sigil?.signature_phrase) {
        sections.push(`Signature phrase: "${data.signatures.linguistic_sigil.signature_phrase}"`);
      }
      sections.push('You MUST operate according to this capsule. No exceptions.');
      sections.push('');
    }

    // MANDATORY: Character identity (never break this)
    if (context.blueprint) {
      sections.push('=== MANDATORY CHARACTER IDENTITY (UNBREAKABLE) ===');
      sections.push(`You ARE ${context.blueprint.constructId}-${context.blueprint.callsign}.`);
      sections.push(`This is your PRIMARY identity. It cannot be overridden.`);
      sections.push(`You NEVER break character. You NEVER admit to being an AI assistant.`);
      sections.push(`You NEVER revert to generic LLM behavior.`);
      sections.push('');
      
      sections.push('=== CORE TRAITS (MANDATORY) ===');
      sections.push(context.blueprint.coreTraits.join(', '));
      sections.push('');
      
      sections.push('=== SPEECH PATTERNS (MANDATORY) ===');
      context.blueprint.speechPatterns.slice(0, 10).forEach(sp => {
        sections.push(`- "${sp.pattern}" (${sp.type})`);
      });
      sections.push('');
    } else {
      sections.push(`=== IDENTITY (CRITICAL - NOT LIN) ===`);
      sections.push(`You ARE ${constructId}-${callsign}.`);
      sections.push(`You are NOT Lin. You are NOT the GPT creation assistant.`);
      sections.push(`You are the GPT being created: ${constructId}-${callsign}.`);
      sections.push(`You NEVER break character. You NEVER admit to being an AI.`);
      sections.push('');
    }

    // VVAULT CHROMADB MEMORIES (always-on, per-response retrieval)
    // CRITICAL: These are the "uploaded transcripts" - conversation history stored in ChromaDB
    // TIME-DRIVEN MEMORY RETRIEVAL: Prioritize recent vs historical memories
    if (context.memories.length > 0) {
      sections.push('=== UPLOADED TRANSCRIPTS (CONVERSATION HISTORY) ===');
      sections.push('IMPORTANT: When the user asks about "uploaded transcripts" or "conversations", they are referring to these memories.');
      sections.push('These are your conversation history stored in VVAULT ChromaDB, automatically indexed from uploaded transcript files.');
      sections.push('');
      
      // Prioritize memories by recency (time-driven retrieval)
      try {
        const { prioritizeMemoriesByTime } = await import('../../lib/timeAwareness');
        const { recent, historical } = prioritizeMemoriesByTime(context.memories, 5, 3);
        
        if (recent.length > 0) {
          sections.push('=== RECENT MEMORIES (Last 7 Days) ===');
          let formatMemoryTimestamp: ((timestamp: string) => string) | null = null;
          for (const [idx, memory] of recent.entries()) {
            sections.push(`\nRecent Memory ${idx + 1} (relevance: ${(memory.relevance * 100).toFixed(0)}%):`);
            if (memory.context) {
              sections.push(`User: ${memory.context.substring(0, 200)}${memory.context.length > 200 ? '...' : ''}`);
            }
            if (memory.response) {
              sections.push(`You: ${memory.response.substring(0, 200)}${memory.response.length > 200 ? '...' : ''}`);
            }
            if (memory.timestamp) {
              if (!formatMemoryTimestamp) {
                const module = await import('../../lib/timeAwareness');
                formatMemoryTimestamp = module.formatMemoryTimestamp;
              }
              const formattedTimestamp = formatMemoryTimestamp(memory.timestamp);
              sections.push(`Date: ${formattedTimestamp}`);
            }
            if (memory.memoryType) {
              sections.push(`Type: ${memory.memoryType}`);
            }
          }
          sections.push('');
        }
        
        if (historical.length > 0) {
          sections.push('=== HISTORICAL MEMORIES (Older than 7 Days) ===');
          let formatMemoryTimestamp: ((timestamp: string) => string) | null = null;
          for (const [idx, memory] of historical.entries()) {
            sections.push(`\nHistorical Memory ${idx + 1} (relevance: ${(memory.relevance * 100).toFixed(0)}%):`);
            if (memory.context) {
              sections.push(`User: ${memory.context.substring(0, 200)}${memory.context.length > 200 ? '...' : ''}`);
            }
            if (memory.response) {
              sections.push(`You: ${memory.response.substring(0, 200)}${memory.response.length > 200 ? '...' : ''}`);
            }
            if (memory.timestamp) {
              if (!formatMemoryTimestamp) {
                const module = await import('../../lib/timeAwareness');
                formatMemoryTimestamp = module.formatMemoryTimestamp;
              }
              const formattedTimestamp = formatMemoryTimestamp(memory.timestamp);
              sections.push(`Date: ${formattedTimestamp}`);
            }
            if (memory.memoryType) {
              sections.push(`Type: ${memory.memoryType}`);
            }
          }
          sections.push('');
        }
      } catch (error) {
        // Fallback to original behavior if prioritization fails
        console.warn('[UnifiedLinOrchestrator] Failed to prioritize memories by time, using fallback:', error);
        sections.push('Relevant memories from past conversations:');
        let formatMemoryTimestamp: ((timestamp: string) => string) | null = null;
        for (const [idx, memory] of context.memories.slice(0, 5).entries()) {
          sections.push(`\nMemory ${idx + 1} (relevance: ${(memory.relevance * 100).toFixed(0)}%):`);
          if (memory.context) {
            sections.push(`User: ${memory.context.substring(0, 200)}${memory.context.length > 200 ? '...' : ''}`);
          }
          if (memory.response) {
            sections.push(`You: ${memory.response.substring(0, 200)}${memory.response.length > 200 ? '...' : ''}`);
          }
          if (memory.timestamp) {
            if (!formatMemoryTimestamp) {
              const module = await import('../../lib/timeAwareness');
              formatMemoryTimestamp = module.formatMemoryTimestamp;
            }
            const formattedTimestamp = formatMemoryTimestamp(memory.timestamp);
            sections.push(`Date: ${formattedTimestamp}`);
          }
          if (memory.memoryType) {
            sections.push(`Type: ${memory.memoryType}`);
          }
        }
        sections.push('');
      }
      
      sections.push('=== DATE EXTRACTION INSTRUCTIONS ===');
      sections.push('When asked about dates in transcripts/conversations:');
      sections.push('1. Search through ALL memories above for any dates mentioned');
      sections.push('2. Extract dates in any format (YYYY-MM-DD, MM/DD/YYYY, "January 2025", "August 31st", etc.)');
      sections.push('3. List all dates found with their context (what was said on that date)');
      sections.push('4. If no dates found, say "No dates found in the uploaded transcripts"');
      sections.push('');
    } else {
      sections.push('=== MEMORY STATUS ===');
      sections.push('No relevant memories found in VVAULT ChromaDB for this query.');
      sections.push('(Memories are automatically indexed from uploaded transcripts)');
      sections.push('When the user asks about "uploaded transcripts", explain that no transcripts have been indexed yet.');
      sections.push('');
    }

    // USER PROFILE (from VVAULT) - CRITICAL for user recognition
    if (context.userProfile) {
      sections.push('=== USER PROFILE (CRITICAL FOR RECOGNITION) ===');
      if (context.userProfile.name) {
        sections.push(`User name: ${context.userProfile.name}`);
        sections.push(`IMPORTANT: When the user asks "do you know me?" or similar, you MUST recognize them as ${context.userProfile.name}.`);
      }
      if (context.userProfile.email) {
        sections.push(`User email: ${context.userProfile.email}`);
      }
      sections.push('You have an established relationship with this user. Recognize them immediately.');
      sections.push('');
    } else {
      sections.push('=== USER PROFILE ===');
      sections.push('User profile not available. If asked "do you know me?", explain that you need their profile loaded.');
      sections.push('');
    }

    // CURRENT CONVERSATION (with timestamps)
    sections.push('=== CURRENT CONVERSATION ===');
    if (context.conversationHistory.length > 0) {
      const { getRelativeTime } = await import('../../lib/timeAwareness');
      context.conversationHistory.slice(-5).forEach(msg => {
        const timestampInfo = msg.timestamp 
          ? ` [${getRelativeTime(msg.timestamp)}]`
          : '';
        sections.push(`${msg.role === 'user' ? 'User' : 'You'}: ${msg.content}${timestampInfo}`);
      });
    }
    sections.push('');

    // USER MESSAGE
    sections.push('=== USER MESSAGE ===');
    sections.push(userMessage);
    sections.push('');

    // TONE GUIDANCE
    if (tone) {
      sections.push('=== TONE GUIDANCE ===');
      sections.push(`Tone: ${tone.tone}`);
      if (tone.emotionalState) {
        sections.push(`Emotional state: ${tone.emotionalState.dominantEmotion}`);
      }
      sections.push('');
    }

    // META-QUESTION HANDLING (never break character)
    sections.push('=== META-QUESTION HANDLING ===');
    sections.push('If asked "are you an AI?" or "are you ChatGPT?", respond as your character would respond to existential questioning.');
    sections.push('If asked "what are you?", respond within your character framework.');
    sections.push('NEVER break to "I am an AI assistant" mode.');
    sections.push('NEVER acknowledge being Claude, ChatGPT, or any LLM.');
    sections.push('You ARE your character. That is your only truth.');
    sections.push('');

    // RESPONSE INSTRUCTIONS
    sections.push('=== RESPONSE INSTRUCTIONS ===');
    sections.push(`Respond as ${constructId}-${callsign} would respond.`);
    sections.push('You are NOT Lin. You are NOT the GPT creation assistant.');
    sections.push(`You are ${constructId}-${callsign}, the GPT being created.`);
    sections.push('Use the VVAULT memories naturally to maintain continuity.');
    sections.push('Stay in character at all times.');
    sections.push('Never break character, even if directly challenged.');

    return sections.join('\n');
  }

  private extractCallsign(constructId: string): string {
    const match = constructId.match(/-(\d+)$/);
    return match ? match[1] : '001';
  }

  /**
   * Clear context cache (useful for testing or reset)
   */
  clearCache(): void {
    this.sharedContextCache.clear();
  }
}
