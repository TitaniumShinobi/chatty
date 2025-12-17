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
import { detectTone, detectToneEnhanced } from '../../lib/toneDetector';
import { WorkspaceContextBuilder } from '../context/WorkspaceContextBuilder';
import { AutomaticRuntimeOrchestrator, RuntimeAssignment, RuntimeDetectionContext } from '../../lib/automaticRuntimeOrchestrator';
import { RuntimeContextManager } from '../../lib/runtimeContextManager';
import { getMemoryStore } from '../../lib/MemoryStore';
import { getVVAULTTranscriptLoader } from '../../lib/VVAULTTranscriptLoader';
import { Reasoner } from '../../brain/reasoner';
import { loadWorkspaceContext } from '../../lib/workspaceContextLoader';
import { detectRachelMoment, buildResonanceInstruction } from '../../lib/rachelMomentDetector';
import { getPersonaRouter } from '../../core/persona/PersonaRouter';
import { MemoryRetrievalEngine } from '../../core/memory/MemoryRetrievalEngine';
import { ContextScoringLayer } from '../../core/memory/ContextScoringLayer';
import { TriadGate, TriadStatus } from './TriadGate';
import { OutputFilter } from './OutputFilter';
import { checkMemoryPermission } from '../../lib/memoryPermission';
import { VVAULTRetrievalWrapper } from '../../lib/vvaultRetrieval';
import { IdentityMatcher } from '../character/IdentityMatcher';
import {
  getTimeContext,
  determineSessionState,
  buildSessionAwareTimePromptSection,
  buildTimePromptSection,
  prioritizeMemoriesByTime,
  formatMemoryTimestamp,
  getRelativeTime,
} from '../../lib/timeAwareness';
import { readFile } from 'fs/promises';

const orchestratorConfig = {
  api: {
    vvaultProfile: '/api/vvault/profile',
    vvaultCapsules: '/api/vvault/capsules/load',
  },
  paths: {
    linIdentityCapsule: `${process.cwd()}/chatty/identity/lin-001/capsule.json`,
    linIdentityWeights: `${process.cwd()}/chatty/identity/lin-001`,
    vvaultRoot: process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault',
  },
  models: {
    toneDetection: 'phi3:latest',
  },
};

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
    nickname?: string;
    occupation?: string;
    tags?: string[];
    aboutYou?: string;
  };

  // Multi-turn session state
  sessionState?: {
    emotionalState: { valence: number; arousal: number; dominantEmotion: string };
    relationshipDynamics: { intimacyLevel: number; trustLevel: number; interactionCount: number };
    conversationThemes: string[];
    lastMessageContext: string;
  };

  // Workspace context
  workspaceContext?: {
    activeFiles: Array<{ path: string; language: string; content: string }>;
    openBuffers: Array<{ name: string; content: string }>;
    projectContext?: string;
    passiveListeningContext?: string;
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
  private automaticRuntimeOrchestrator: AutomaticRuntimeOrchestrator;
  private runtimeContextManager: RuntimeContextManager;
  private memoryStore = getMemoryStore();
  private transcriptLoader = getVVAULTTranscriptLoader();
  private personaRouter = getPersonaRouter();
  private memoryRetrievalEngine: MemoryRetrievalEngine;
  private contextScoringLayer: ContextScoringLayer;

  // Multi-turn state tracking (relationship, emotion, conversation continuity)
  private sessionState: Map<string, {
    emotionalState: { valence: number; arousal: number; dominantEmotion: string };
    relationshipDynamics: { intimacyLevel: number; trustLevel: number; interactionCount: number };
    conversationThemes: string[];
    lastMessageContext: string;
  }> = new Map();

  constructor(vvaultRoot?: string) {
    this.personalityOrchestrator = new PersonalityOrchestrator(vvaultRoot);
    this.workspaceContextBuilder = new WorkspaceContextBuilder();
    this.automaticRuntimeOrchestrator = AutomaticRuntimeOrchestrator.getInstance();
    this.runtimeContextManager = RuntimeContextManager.getInstance();
    this.memoryRetrievalEngine = new MemoryRetrievalEngine(vvaultRoot);
    this.contextScoringLayer = new ContextScoringLayer();
  }

  /**
   * Load VVAULT ChromaDB memories (always-on, per-response)
   * Connects directly to users/{userId}/instances/{constructCallsign}/memory/
   * 
   * IMPROVED: Exponential backoff retry with fallback to blueprint anchors
   */
  async loadVVAULTMemories(
    userId: string,
    constructCallsign: string,
    query: string,
    limit: number = 10,
    blueprint?: PersonalityBlueprint,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<UnifiedLinContext['memories']> {
    // Check if memory is allowed
    if (!checkMemoryPermission(settings, 'loadVVAULTMemories')) {
      return []; // Return empty array when memory is disabled
    }

    const maxRetries = 3;
    const baseDelay = 500; // 500ms base delay

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Use VVAULT retrieval service (always-on background retrieval)
        const fetcher = typeof window !== 'undefined' && typeof window.fetch === 'function'
          ? window.fetch.bind(window)
          : fetch;
        const vvaultRetrieval = new VVAULTRetrievalWrapper({ fetcher });

        // Detect tone for better retrieval
        const tone = detectTone({ text: query });

        // Query ChromaDB memories (short-term and long-term)
        const result = await vvaultRetrieval.retrieveMemories({
          constructCallsign,
          semanticQuery: query,
          toneHints: tone ? [tone.tone] : [],
          limit,
          includeDiagnostics: false,
          settings // Pass settings for memory permission
        });

        const memories = result.memories.map(m => ({
          context: m.context || '',
          response: m.response || '',
          relevance: m.relevance || 0,
          timestamp: m.timestamp,
          memoryType: m.memoryType as 'short-term' | 'long-term' | undefined
        }));

        // Success - return memories
        if (memories.length > 0 || attempt === maxRetries - 1) {
          if (attempt > 0) {
            console.log(`✅ [UnifiedLinOrchestrator] Memory retrieval succeeded on attempt ${attempt + 1}`);
          }
          return memories;
        }

        // If no memories but not last attempt, retry
        if (memories.length === 0 && attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
          console.warn(`⚠️ [UnifiedLinOrchestrator] No memories found, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        return memories;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;
        const delay = baseDelay * Math.pow(2, attempt);

        console.error(`❌ [UnifiedLinOrchestrator] Memory retrieval failed (attempt ${attempt + 1}/${maxRetries}):`, error);

        if (isLastAttempt) {
          // Final attempt failed - try fallback to blueprint anchors
          console.warn('⚠️ [UnifiedLinOrchestrator] All retries exhausted, attempting blueprint anchor fallback...');
          return this.fallbackToBlueprintAnchors(blueprint, query, limit);
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Should never reach here, but TypeScript requires return
    return this.fallbackToBlueprintAnchors(blueprint, query, limit);
  }

  /**
   * Fallback: Extract memory anchors from blueprint when ChromaDB unavailable
   */
  private fallbackToBlueprintAnchors(
    blueprint: PersonalityBlueprint | undefined,
    query: string,
    limit: number
  ): UnifiedLinContext['memories'] {
    if (!blueprint?.memoryAnchors || blueprint.memoryAnchors.length === 0) {
      console.warn('⚠️ [UnifiedLinOrchestrator] No blueprint anchors available for fallback');
      return [];
    }

    // Convert blueprint anchors to memory format
    const anchorMemories = blueprint.memoryAnchors
      .filter(anchor => anchor.significance > 0.5)
      .sort((a, b) => b.significance - a.significance)
      .slice(0, limit)
      .map(anchor => ({
        context: anchor.context || `Memory anchor: ${anchor.anchor}`,
        response: anchor.anchor,
        relevance: anchor.significance || 0.7,
        timestamp: anchor.timestamp || new Date().toISOString(),
        memoryType: 'long-term' as const
      }));

    console.log(`✅ [UnifiedLinOrchestrator] Using ${anchorMemories.length} blueprint anchors as fallback`);
    return anchorMemories;
  }

  /**
   * Load unified context from VVAULT ChromaDB
   * Always-on memory retrieval, zero downtime
   */
  async loadUnifiedContext(
    userId: string,
    constructCallsign: string,
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    blueprint?: PersonalityBlueprint,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<UnifiedLinContext> {
    // ALWAYS retrieve memories from ChromaDB (per-response) with retry + fallback
    const memories = await this.loadVVAULTMemories(userId, constructCallsign, userMessage, 10, blueprint, settings);

    // Load user profile with personalization from VVAULT
    let userProfile: UnifiedLinContext['userProfile'] = undefined;
    try {
      const profileResponse = await fetch(orchestratorConfig.api.vvaultProfile, {
        credentials: 'include'
      }).catch(() => null);

      if (profileResponse?.ok) {
        const profileData = await profileResponse.json();
        if (profileData?.ok && profileData.profile) {
          const profile = profileData.profile;
          userProfile = {
            name: profile.name,
            email: profile.email,
            nickname: profile.nickname || undefined,
            occupation: profile.occupation || undefined,
            tags: profile.tags && profile.tags.length > 0 ? profile.tags : undefined,
            aboutYou: profile.aboutYou || undefined
          };
        }
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
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<UnifiedLinResponse> {
    // Ensure all messages have timestamps (add if missing)
    const timestampedHistory = conversationHistory.map(msg => ({
      ...msg,
      timestamp: msg.timestamp || Date.now()
    }));

    const messagePreview = userMessage.length > 120 ? `${userMessage.slice(0, 120)}…` : userMessage;
    console.log(
      `[UnifiedLinOrchestrator] Orchestrating response for ${callsign} (construct ${constructId}, thread ${threadId}). Message preview: "${messagePreview}"`
    );

    // TRIAD SANITY CHECK (Strict Enforcement)
    // Enforce NO TRIAD -> NO RESPONSE rule
    let triadStatus: TriadStatus | null = null;
    try {
      triadStatus = await TriadGate.getInstance().checkTriadAvailability();
      console.log(
        '[UnifiedLinOrchestrator] Triad gate status:',
        `healthy=${triadStatus.healthy}`,
        { latency: triadStatus.latency, failedSeats: triadStatus.failedSeats }
      );

      if (!triadStatus.healthy) {
        const errorMsg = `⛔ [UnifiedLinOrchestrator] TRIAD BROKEN: ${triadStatus.failedSeats.join(', ')} unavailable. Conversation PAUSED.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      if (error.message && error.message.includes('TRIAD BROKEN')) {
        throw error; // Propagate the pause signal
      }
      console.warn('[UnifiedLinOrchestrator] Triad check warning (non-blocking):', error);
    }

    // ALWAYS load VVAULT ChromaDB memories (per-response, always-on)
    // Load blueprint first for fallback support
    let blueprint: PersonalityBlueprint | undefined;
    try {
      const identityMatcher = new IdentityMatcher();
      blueprint = await identityMatcher.loadPersonalityBlueprint(userId, constructId, callsign);
    } catch (error) {
      console.warn('[UnifiedLinOrchestrator] Failed to load blueprint for memory fallback:', error);
    }

    console.log(`[UnifiedLinOrchestrator] Loading unified context for ${callsign}`);
    const unifiedContext = await this.loadUnifiedContext(
      userId,
      callsign,
      userMessage,
      timestampedHistory,
      blueprint, // Pass blueprint for fallback
      settings // Pass settings for memory permission
    );

    console.log(
      `[UnifiedLinOrchestrator] Unified context ready: memories=${unifiedContext.memories.length}, conversationHistory=${unifiedContext.conversationHistory.length}`
    );

    // Load capsule (hardlock into GPT) - HIGHEST PRIORITY
    let capsule: any = undefined;
    try {
      const response = await fetch(
        `${orchestratorConfig.api.vvaultCapsules}?constructCallsign=${encodeURIComponent(callsign)}`,
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

    // Blueprint already loaded above for memory fallback, just attach to context
    if (blueprint) {
      unifiedContext.blueprint = blueprint;
    }

    // Load multi-turn session state (relationship, emotion, continuity)
    const sessionKey = `${userId}-${callsign}`;
    const sessionState = this.sessionState.get(sessionKey) || {
      emotionalState: { valence: 0.5, arousal: 0.5, dominantEmotion: 'neutral' },
      relationshipDynamics: { intimacyLevel: 0.5, trustLevel: 0.5, interactionCount: 0 },
      conversationThemes: [],
      lastMessageContext: ''
    };

    // Update session state based on conversation history
    sessionState.interactionCount = conversationHistory.filter(m => m.role === 'user').length;
    if (conversationHistory.length > 0) {
      sessionState.lastMessageContext = conversationHistory[conversationHistory.length - 1].content;
    }

    // Extract conversation themes from history
    const recentMessages = conversationHistory.slice(-5);
    const themes = new Set<string>();
    recentMessages.forEach(msg => {
      // Simple theme extraction (can be enhanced with NLP)
      const words = msg.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 4 && !['that', 'this', 'with', 'from', 'have', 'been'].includes(word)) {
          themes.add(word);
        }
      });
    });
    sessionState.conversationThemes = Array.from(themes).slice(0, 5);

    this.sessionState.set(sessionKey, sessionState);

    // MEMORY INTEGRATION: Load persistent memory and transcript fragments
    let memoryContext = '';
    let transcriptContext = '';
    let transcriptFragmentsLoaded = 0;
    let memoryTriplesLoaded = 0;
    let memoryPersisted = false;

    try {
      // Initialize memory store
      await this.memoryStore.initialize();

      // Load transcript fragments for this construct
      console.log(`🧠 [UnifiedLinOrchestrator] Loading transcript fragments for ${callsign}`);
      await this.transcriptLoader.loadTranscriptFragments(callsign, userId);

      // Search for relevant transcript memories
        const relevantFragments = await this.transcriptLoader.getRelevantFragments(callsign, userMessage, 5);
        transcriptFragmentsLoaded = relevantFragments.length;
        if (relevantFragments.length > 0) {
          transcriptContext = relevantFragments
            .map(f => `"${f.content}" (context: ${f.context})`)
            .join('\n');
          console.log(`📚 [UnifiedLinOrchestrator] Found ${relevantFragments.length} relevant transcript fragments`);
        }

      // Search for relevant stored triples
        const relevantTriples = await this.memoryStore.searchTriples(userId, userMessage);
        memoryTriplesLoaded = relevantTriples.length;
        if (relevantTriples.length > 0) {
          memoryContext = relevantTriples
            .map(t => `${t.subject} ${t.predicate} ${t.object}`)
            .join('\n');
          console.log(`🔍 [UnifiedLinOrchestrator] Found ${relevantTriples.length} relevant memory triples`);
        }

      // Store current interaction in persistent memory (check permission first)
      // Get settings from localStorage if available (client-side)
      const settings = typeof window !== 'undefined' ? (() => {
        try {
          const stored = localStorage.getItem('chatty_settings_v2');
          return stored ? JSON.parse(stored) : undefined;
        } catch {
          return undefined;
        }
      })() : undefined;

      if (checkMemoryPermission(settings, 'persistMessage')) {
        await this.memoryStore.persistMessage(userId, callsign, userMessage, 'user', undefined, settings);
        memoryPersisted = true;
      }

    } catch (error) {
      console.warn('[UnifiedLinOrchestrator] Memory integration failed:', error);
    }

    console.log(
      `[UnifiedLinOrchestrator] Memory integration summary: transcripts=${transcriptFragmentsLoaded}, triples=${memoryTriplesLoaded}, persisted=${memoryPersisted}`
    );

    // Load time context (current date/time awareness)
    const timeContext = await this.loadTimeContext();

    // Calculate session context (time-aware session state)
    const lastMessage = timestampedHistory.length > 0
      ? timestampedHistory[timestampedHistory.length - 1]
      : null;
    const lastMessageTimestamp = lastMessage?.timestamp;

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
    }, orchestratorConfig.models.toneDetection);

    // Load workspace context (for undertone capsule passive listening mode)
    let workspaceContext = null;
    try {
      workspaceContext = await loadWorkspaceContext(
        userId,
        orchestratorConfig.paths.vvaultRoot
      );
    } catch (error) {
      console.warn('[UnifiedLinOrchestrator] Failed to load workspace context:', error);
    }

    // Detect Rachel moment (emotional continuity testing)
    const rachelMoment = detectRachelMoment(userMessage, timestampedHistory.map(m => ({
      role: m.role,
      content: m.content
    })));

    // RAG Pipeline: PersonaRouter, Memory Retrieval, Context Scoring
    let ragMemories: any[] = [];
    let personaRoutingDecision = null;

    // Check if Lin should be activated (always true if alwaysActive, or if drift detected)
    const lastResponse = timestampedHistory
      .filter(m => m.role === 'assistant')
      .slice(-1)[0]?.content;

    personaRoutingDecision = await this.personaRouter.shouldRouteToLin(
      constructId,
      userMessage,
      timestampedHistory,
      lastResponse
    );

    const decisionSummary = personaRoutingDecision
      ? `shouldRouteToLin=${personaRoutingDecision.shouldRouteToLin}, confidence=${(
        personaRoutingDecision.confidence ?? 0
      ).toFixed(2)}, reason=${personaRoutingDecision.reason ?? 'N/A'}`
      : 'Lin not activated';
    console.log(`[UnifiedLinOrchestrator] Persona routing decision: ${decisionSummary}`);

    // TRIAD ENFORCEMENT: Removed soft recovery logic (Triad failure now halts execution)
    // if (triadStatus?.action === 'route_to_lin'...) { ... }

    // If Lin should be activated, retrieve and score memories
    if (personaRoutingDecision?.shouldRouteToLin) {
      try {
        // Retrieve memories from RAG sources
        const retrievedMemories = await this.memoryRetrievalEngine.retrieveMemories(
          userMessage,
          constructId,
          {
            topK: 20, // Get more candidates for scoring
            settings // Pass settings for memory permission
          }
        );

        // Score and rank memories
        await this.contextScoringLayer.loadWeights(orchestratorConfig.paths.linIdentityWeights);

        const scoredMemories = this.contextScoringLayer.rankMemories(
          retrievedMemories,
          {
            query: userMessage,
            constructId,
            conversationHistory: timestampedHistory,
            emotionalTone: tone?.tone
          },
          5 // Top 5 memories
        );

        ragMemories = scoredMemories.map(sm => ({
          content: sm.memory.content,
          source: sm.memory.source,
          score: sm.score,
          breakdown: sm.breakdown
        }));

        console.log(`[UnifiedLinOrchestrator] RAG Pipeline: Retrieved ${retrievedMemories.length} memories, scored and ranked ${scoredMemories.length} for injection`);
      } catch (error) {
        console.warn('[UnifiedLinOrchestrator] RAG Pipeline failed:', error);
      }
    }

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
      lastMessageContent, // Pass last message for recap
      memoryContext, // Pass stored triples
      transcriptContext, // Pass transcript fragments
      workspaceContext, // Pass workspace context
      rachelMoment, // Pass Rachel moment detection
      ragMemories, // Pass RAG-scored memories
      personaRoutingDecision // Pass routing decision
    );

    const promptPreview = systemPrompt.length > 120 ? `${systemPrompt.slice(0, 120)}…` : systemPrompt;
    console.log(
      `[UnifiedLinOrchestrator] System prompt built (${systemPrompt.length} chars). Capsule loaded: ${!!capsule}; RAG memories: ${ragMemories.length}; Persona routing active: ${personaRoutingDecision?.shouldRouteToLin ?? false}`
    );
    console.log(`[UnifiedLinOrchestrator] Prompt preview: "${promptPreview}"`);

    // Return system prompt - caller will call LLM with this prompt
    // NOTE: The actual LLM call happens in GPTCreator.tsx handlePreviewSubmit()
    // This orchestrator builds the prompt, caller executes it
    console.log(`[UnifiedLinOrchestrator] Orchestration ready for ${constructId}-${callsign}`);
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
  private _buildTimeSection(timeContext: any, sessionContext: any, lastMessageContent?: string): string[] {
    const sections: string[] = [];
    if (timeContext) {
      try {
        if (sessionContext) {
          sections.push(buildSessionAwareTimePromptSection(timeContext, sessionContext, lastMessageContent));
        } else {
          sections.push(buildTimePromptSection(timeContext));
        }
      } catch (error) {
        console.warn('[UnifiedLinOrchestrator] Failed to build time section:', error);
      }
    }
    return sections;
  }

  private async buildUnifiedLinPrompt(
    userMessage: string,
    context: UnifiedLinContext,
    constructId: string,
    callsign: string,
    tone: any,
    capsule?: any,
    timeContext?: any,
    sessionContext?: any,
    lastMessageContent?: string,
    memoryContext?: string,
    transcriptContext?: string,
    workspaceContext?: any,
    rachelMoment?: any,
    ragMemories?: Array<{ content: string; source: string; score: number; breakdown?: any }>,
    personaRoutingDecision?: any
  ): Promise<string> {
    const sections: string[] = [];

    // 1. SESSION-AWARE TIME AWARENESS
    sections.push(...this._buildTimeSection(timeContext, sessionContext, lastMessageContent));

    // 2. LIN UNDERTONE CAPSULE (RAG-based persona grounding)
    sections.push(...await this._buildLinUndertoneCapsuleSection(personaRoutingDecision, ragMemories));

    // 3. CAPSULE HARDLOCK (highest priority)
    sections.push(...this._buildCapsuleHardlockSection(capsule));

    // 4. SUPPLEMENTARY CONTEXT
    sections.push(...this._buildSupplementaryContextSection(
      context,
      userMessage,
      constructId,
      callsign,
      tone,
      workspaceContext,
      rachelMoment,
      transcriptContext,
      memoryContext,
      capsule
    ));

    return sections.join('\n');
  }

  private _buildCapsuleHardlockSection(capsule: any): string[] {
    const sections: string[] = [];
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
      if (data.signatures?.linguistic_sigil?.common_phrases?.length) {
        sections.push('Common signature phrases:');
        data.signatures.linguistic_sigil.common_phrases.forEach((phrase: string) => {
          sections.push(`- ${phrase}`);
        });
      }
      if (data.additional_data?.lexical_signatures?.length) {
        sections.push('Lexical signatures to prefer:');
        data.additional_data.lexical_signatures.forEach((sig: string) => {
          sections.push(`- ${sig}`);
        });
      }
      if (data.additional_data?.detection_rubric) {
        sections.push('=== DETECTION RUBRIC ===');
        const rubric = data.additional_data.detection_rubric;
        if (rubric.threshold_confidence) {
          sections.push(`Minimum confidence: ${rubric.threshold_confidence}`);
        }
        if (rubric.classes) {
          Object.entries(rubric.classes).forEach(([key, val]: [string, any]) => {
            const items = Array.isArray(val) ? val.join(', ') : JSON.stringify(val);
            sections.push(`- ${key}: ${items}`);
          });
        }
        if (rubric.location_fields) {
          sections.push(`Location fields: ${rubric.location_fields.join(', ')}`);
        }
      }
      sections.push('You MUST operate according to this capsule. No exceptions.');
      sections.push('');
    }
    return sections;
  }

  private async _buildLinUndertoneCapsuleSection(
    personaRoutingDecision: any,
    ragMemories?: Array<{ content: string; source: string; score: number; breakdown?: any }>
  ): Promise<string[]> {
    const sections: string[] = [];
    let linCapsule: any = null;
    try {
      const capsuleContent = await readFile(orchestratorConfig.paths.linIdentityCapsule, 'utf-8');
      linCapsule = JSON.parse(capsuleContent);
    } catch (error) {
      // Lin capsule not found - that's okay, continue without it
    }

    // If PersonaRouter determined Lin should be active, inject undertone capsule
    if (personaRoutingDecision?.shouldRouteToLin && linCapsule) {
      sections.push('=== LIN UNDERTONE CAPSULE (MANDATORY LAYER) ===');
      sections.push(linCapsule.integration_prompt || '');
      sections.push('');

      // TRIAD RECOVERY MODE: Check if this is a triad failure scenario
      const isTriadRecovery = personaRoutingDecision?.reason?.includes('TRIAD_RIFT_FIX') ||
        personaRoutingDecision?.reason?.includes('seat dropout');

      if (isTriadRecovery) {
        // Extract failed seats from reason if available
        const failedSeatsMatch = personaRoutingDecision.reason.match(/seat dropout \((\d+)\)/);
        const seatDropout = failedSeatsMatch ? parseInt(failedSeatsMatch[1]) : 0;

        sections.push('=== TRIAD RECOVERY MODE ===');
        sections.push(`Agent Squad triad failure detected: ${seatDropout} model seats unavailable.`);
        sections.push('Lin undertone capsule is stabilizing response with reduced model ensemble.');
        sections.push('CRITICAL: Maintain character integrity and tone consistency despite seat dropout.');
        sections.push('Do not acknowledge the seat failure to the user - maintain seamless continuity.');
        sections.push('Use undertone capsule to preserve emotional resonance and prevent tone drift.');
        sections.push('');
      }

      // Inject RAG-scored memories if available
      if (ragMemories && ragMemories.length > 0) {
        sections.push('=== INJECTED MEMORIES (RAG-RETRIEVED) ===');
        sections.push('These memories were retrieved using semantic search and scored for relevance.');
        sections.push('Use them as absolute context, referencing them implicitly through tone and structure.');
        sections.push('');
        ragMemories.forEach((memory, idx) => {
          sections.push(`[Memory ${idx + 1}] (Score: ${(memory.score * 100).toFixed(1)}%, Source: ${memory.source})`);
          sections.push(memory.content.substring(0, 500)); // Limit memory content length
          sections.push('');
        });
        sections.push('Prioritize memories by: 1) Emotional resonance, 2) Construct-matching relevance, 3) Recency decay (older = deeper truth)');
        sections.push('');
      }
    }
    return sections;
  }

  private _buildSupplementaryContextSection(
    context: UnifiedLinContext,
    userMessage: string,
    constructId: string,
    callsign: string,
    tone: any,
    workspaceContext: any,
    rachelMoment: any,
    transcriptContext: string | undefined,
    memoryContext: string | undefined,
    capsule: any
  ): string[] {
    const sections: string[] = [];

    // WORKSPACE CONTEXT (for undertone capsule passive listening mode)
    if (workspaceContext && workspaceContext.passiveListeningContext) {
      sections.push(workspaceContext.passiveListeningContext);
      sections.push('');
    }

    // RACHEL MOMENT DETECTION (emotional continuity testing)
    if (rachelMoment && rachelMoment.detected) {
      const resonanceInstruction = buildResonanceInstruction(rachelMoment);
      if (resonanceInstruction) {
        sections.push(resonanceInstruction);
        sections.push('');
      }
    }

    const blueprintLexical = context.blueprint?.metadata?.lexicalSignatures;
    const blueprintRubric = context.blueprint?.metadata?.detectionRubric;
    const blueprintEnvironment = context.blueprint?.metadata?.capsuleEnvironment;

    if (!capsule && blueprintLexical?.length) {
      sections.push('=== LEXICAL SIGNATURES (BLUEPRINT) ===');
      blueprintLexical.forEach((sig: string) => sections.push(`- ${sig}`));
      sections.push('');
    }

    if (!capsule && blueprintRubric) {
      sections.push('=== DETECTION RUBRIC (BLUEPRINT) ===');
      if (blueprintRubric.threshold_confidence) {
        sections.push(`Minimum confidence: ${blueprintRubric.threshold_confidence}`);
      }
      if (blueprintRubric.classes) {
        Object.entries(blueprintRubric.classes).forEach(([key, val]: [string, any]) => {
          const items = Array.isArray(val) ? val.join(', ') : JSON.stringify(val);
          sections.push(`- ${key}: ${items}`);
        });
      }
      sections.push('');
    }

    if (blueprintEnvironment) {
      sections.push('=== OPERATING ENVIRONMENT ===');
      if (blueprintEnvironment.system_info?.platform) {
        sections.push(`Platform: ${blueprintEnvironment.system_info.platform} (${blueprintEnvironment.system_info.platform_version})`);
      }
      if (blueprintEnvironment.runtime_environment?.environment_variables) {
        Object.entries(blueprintEnvironment.runtime_environment.environment_variables).forEach(([key, value]) => {
          sections.push(`${key}: ${value}`);
        });
      }
      sections.push('');
    }

    // MEMORY CONTEXT: Persistent memory and transcript fragments
    if (transcriptContext && transcriptContext.trim()) {
      sections.push('=== TRANSCRIPT MEMORIES ===');
      sections.push('These are your actual memories from previous conversations:');
      sections.push(transcriptContext);
      sections.push('Use these memories to maintain continuity and recall specific details.');
      sections.push('');
    }

    if (memoryContext && memoryContext.trim()) {
      sections.push('=== STORED FACTS ===');
      sections.push('These are facts you have learned and stored:');
      sections.push(memoryContext);
      sections.push('Reference these facts when relevant to the conversation.');
      sections.push('');
    }

    // MANDATORY: Character identity (never break this)
    if (context.blueprint) {
      const personaName = context.blueprint.metadata?.instance_name || `${context.blueprint.constructId}-${context.blueprint.callsign}`;
      sections.push('=== MANDATORY CHARACTER IDENTITY (UNBREAKABLE) ===');
      sections.push(`You ARE ${personaName}.`);
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

    // VVAULT CHROMADB MEMORIES
    if (context.memories.length > 0) {
      sections.push('=== UPLOADED TRANSCRIPTS (CONVERSATION HISTORY) ===');
      sections.push('IMPORTANT: When the user asks about "uploaded transcripts" or "conversations", they are referring to these memories.');
      sections.push('These are your conversation history stored in VVAULT ChromaDB, automatically indexed from uploaded transcripts files.');
      sections.push('');

      try {
        const { recent, historical } = prioritizeMemoriesByTime(context.memories, 5, 3);

        if (recent.length > 0) {
          sections.push('=== RECENT MEMORIES (Last 7 Days) ===');
          for (const [idx, memory] of recent.entries()) {
            sections.push(`\nRecent Memory ${idx + 1} (relevance: ${(memory.relevance * 100).toFixed(0)}%):`);
            if (memory.context) {
              sections.push(`User: ${memory.context.substring(0, 200)}${memory.context.length > 200 ? '...' : ''}`);
            }
            if (memory.response) {
              sections.push(`You: ${memory.response.substring(0, 200)}${memory.response.length > 200 ? '...' : ''}`);
            }
            if (memory.timestamp) {
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
          for (const [idx, memory] of historical.entries()) {
            sections.push(`\nHistorical Memory ${idx + 1} (relevance: ${(memory.relevance * 100).toFixed(0)}%):`);
            if (memory.context) {
              sections.push(`User: ${memory.context.substring(0, 200)}${memory.context.length > 200 ? '...' : ''}`);
            }
            if (memory.response) {
              sections.push(`You: ${memory.response.substring(0, 200)}${memory.response.length > 200 ? '...' : ''}`);
            }
            if (memory.timestamp) {
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
        console.warn('[UnifiedLinOrchestrator] Failed to prioritize memories by time, using fallback:', error);
        sections.push('Relevant memories from past conversations:');
        for (const [idx, memory] of context.memories.slice(0, 5).entries()) {
          sections.push(`\nMemory ${idx + 1} (relevance: ${(memory.relevance * 100).toFixed(0)}%):`);
          if (memory.context) {
            sections.push(`User: ${memory.context.substring(0, 200)}${memory.context.length > 200 ? '...' : ''}`);
          }
          if (memory.response) {
            sections.push(`You: ${memory.response.substring(0, 200)}${memory.response.length > 200 ? '...' : ''}`);
          }
          if (memory.timestamp) {
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

    // USER PROFILE
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

    // MULTI-TURN SESSION STATE
    if (context.sessionState) {
      sections.push('=== CONVERSATION CONTINUITY (MULTI-TURN CONTEXT) ===');
      sections.push(`Emotional baseline: ${context.sessionState.emotionalState.dominantEmotion} (valence: ${context.sessionState.emotionalState.valence.toFixed(2)}, arousal: ${context.sessionState.emotionalState.arousal.toFixed(2)})`);
      sections.push(`Relationship dynamics: intimacy ${context.sessionState.relationshipDynamics.intimacyLevel.toFixed(2)}, trust ${context.sessionState.relationshipDynamics.trustLevel.toFixed(2)}`);
      sections.push(`Interaction count: ${context.sessionState.relationshipDynamics.interactionCount}`);
      if (context.sessionState.conversationThemes.length > 0) {
        sections.push(`Recent conversation themes: ${context.sessionState.conversationThemes.join(', ')}`);
      }
      if (context.sessionState.lastMessageContext) {
        sections.push(`Last message context: ${context.sessionState.lastMessageContext.substring(0, 150)}`);
      }
      sections.push('Use this continuity to maintain natural, contextually aware responses across turns.');
      sections.push('');
    }

    // WORKSPACE CONTEXT (ACTIVE FILES)
    if (context.workspaceContext) {
      sections.push('=== WORKSPACE CONTEXT (ACTIVE FILES & CODE) ===');
      if (context.workspaceContext.activeFiles.length > 0) {
        sections.push('Active files:');
        context.workspaceContext.activeFiles.slice(0, 3).forEach(file => {
          sections.push(`- ${file.path} (${file.language})`);
          sections.push(`  Content preview: ${file.content.substring(0, 200)}${file.content.length > 200 ? '...' : ''}`);
        });
      }
      if (context.workspaceContext.openBuffers.length > 0) {
        sections.push('Open buffers:');
        context.workspaceContext.openBuffers.slice(0, 2).forEach(buffer => {
          sections.push(`- ${buffer.name}: ${buffer.content.substring(0, 150)}${buffer.content.length > 150 ? '...' : ''}`);
        });
      }
      if (context.workspaceContext.projectContext) {
        sections.push(`Project context: ${context.workspaceContext.projectContext.substring(0, 300)}`);
      }
      sections.push('You can reference these files and code context in your responses, like Copilot or Cursor.');
      sections.push('');
    }

    // CURRENT CONVERSATION
    sections.push('=== CURRENT CONVERSATION ===');
    if (context.conversationHistory.length > 0) {
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

    // META-QUESTION HANDLING
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

    return sections;
  }

  private extractCallsign(constructId: string): string {
    const match = constructId.match(/-(\d+)$/);
    return match ? match[1] : '001';
  }

  /**
   * Automatically determine and assign the optimal runtime for a conversation
   * This eliminates manual runtime selection by analyzing conversation context
   */
  async determineOptimalRuntime(
    userMessage: string,
    userId: string,
    threadId: string,
    conversationHistory?: Array<{ role: string; content: string }>,
    existingConstructId?: string
  ): Promise<RuntimeAssignment> {
    const context: RuntimeDetectionContext = {
      userMessage,
      conversationHistory,
      userId,
      threadId,
      existingConstructId
    };

    // Get optimal runtime assignment
    const assignment = await this.automaticRuntimeOrchestrator.determineOptimalRuntime(context);

    // Assign runtime to thread automatically
    await this.runtimeContextManager.assignRuntimeToThread(
      threadId,
      assignment,
      userId
    );

    console.log(`[UnifiedLinOrchestrator] Auto-assigned runtime: ${assignment.constructId} (confidence: ${Math.round(assignment.confidence * 100)}%) - ${assignment.reasoning}`);

    return assignment;
  }

  /**
   * Orchestrate response with automatic runtime selection
   * This is the main entry point that combines runtime selection with response generation
   */
  async orchestrateResponseWithAutoRuntime(
    userMessage: string,
    userId: string,
    threadId: string,
    threads: any[],
    conversationHistory: Array<{ role: string; content: string }> = [],
    existingConstructId?: string,
    settings?: { personalization?: { allowMemory?: boolean } }
  ): Promise<UnifiedLinResponse & { runtimeAssignment: RuntimeAssignment }> {
    // Step 1: Automatically determine optimal runtime
    const runtimeAssignment = await this.determineOptimalRuntime(
      userMessage,
      userId,
      threadId,
      conversationHistory,
      existingConstructId
    );

    // Step 2: Use the assigned runtime for response generation
    const response = await this.orchestrateResponse(
      userMessage,
      userId,
      threadId,
      runtimeAssignment.constructId,
      this.extractCallsign(runtimeAssignment.constructId),
      threads,
      conversationHistory as Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>,
      settings
    );

    // Step 3: Update runtime usage tracking
    this.runtimeContextManager.updateRuntimeUsage(threadId);

    return {
      ...response,
      runtimeAssignment
    };
  }

  /**
   * Get current runtime assignment for a thread
   */
  getCurrentRuntimeAssignment(threadId: string): RuntimeAssignment | null {
    return this.runtimeContextManager.getActiveRuntime(threadId);
  }

  /**
   * Check if runtime should be switched based on conversation evolution
   */
  async shouldSwitchRuntime(
    threadId: string,
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<{ shouldSwitch: boolean; newAssignment?: RuntimeAssignment; reason?: string }> {
    const currentAssignment = this.runtimeContextManager.getActiveRuntime(threadId);

    if (!currentAssignment) {
      return { shouldSwitch: false };
    }

    // Analyze if conversation has evolved beyond current runtime capabilities
    const context: RuntimeDetectionContext = {
      userMessage,
      conversationHistory,
      threadId,
      existingConstructId: currentAssignment.constructId
    };

    const optimalAssignment = await this.automaticRuntimeOrchestrator.determineOptimalRuntime(context);

    // Switch if new assignment has significantly higher confidence
    const confidenceDifference = optimalAssignment.confidence - currentAssignment.confidence;
    const shouldSwitch = confidenceDifference > 0.2 && optimalAssignment.constructId !== currentAssignment.constructId;

    if (shouldSwitch) {
      return {
        shouldSwitch: true,
        newAssignment: optimalAssignment,
        reason: `Conversation evolved: ${optimalAssignment.reasoning} (confidence improved by ${Math.round(confidenceDifference * 100)}%)`
      };
    }

    return { shouldSwitch: false };
  }

  /**
   * Perform automatic runtime migration if needed
   */
  async performAutomaticRuntimeMigration(
    threadId: string,
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<RuntimeAssignment | null> {
    const switchAnalysis = await this.shouldSwitchRuntime(threadId, userMessage, conversationHistory);

    if (switchAnalysis.shouldSwitch && switchAnalysis.newAssignment) {
      await this.runtimeContextManager.migrateRuntimeAssignment(
        threadId,
        switchAnalysis.newAssignment,
        switchAnalysis.reason || 'Automatic migration based on conversation evolution'
      );

      console.log(`[UnifiedLinOrchestrator] Auto-migrated runtime for thread ${threadId}: ${switchAnalysis.reason}`);

      return switchAnalysis.newAssignment;
    }

    return null;
  }

  /**
   * Get runtime recommendations for user
   */
  async getRuntimeRecommendations(userId: string, limit: number = 3): Promise<RuntimeAssignment[]> {
    return this.runtimeContextManager.getRuntimeRecommendations(userId, limit);
  }

  /**
   * Clear context cache (useful for testing or reset)
   */
  /**
   * Filter final LLM output to remove narrator leaks and meta-commentary.
   * CALL THIS on the LLM output before showing it to the user.
   */
  public static filterResponse(response: string): string {
    const analysis = OutputFilter.processOutput(response);

    if (analysis.driftDetected) {
      console.warn(`⚠️ [UnifiedLinOrchestrator] Tone drift detected in response: ${analysis.driftReason}`);
      // In a full implementation, this triggers a retry loop. 
      // For now, we return the filtered text but log the drift.
    }

    if (analysis.wasfiltered) {
      console.log(`✂️ [UnifiedLinOrchestrator] Narrator leak filtered from response.`);
    }

    return analysis.cleanedText;
  }
}
