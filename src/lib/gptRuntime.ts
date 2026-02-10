// GPT Runtime Service - Integrates GPTs with AI Service
import { createGPTManager, type IGPTManager } from './gptManagerFactory.js';
import type { GPTConfig, GPTRuntime } from './gptManager.js';
import { AIService } from './aiService.js';
import { shouldUseBrowserStubs } from './browserStubs.js';
import { detectTone } from './toneDetector.js';
import { VVAULTRetrievalWrapper } from './vvaultRetrieval.js';
import { routePersona } from './personaRouter.js';
import { buildContextLayers } from './contextBuilder.js';
import { applyEmotionOverride, type Emotion } from './emotionOverride.js';
import { AutomaticRuntimeOrchestrator, RuntimeAssignment } from './automaticRuntimeOrchestrator.js';
import { RuntimeContextManager } from './runtimeContextManager.js';
import { DriftPrevention } from '../engine/character/DriftPrevention.js';
import { GreetingSynthesizer } from '../engine/character/GreetingSynthesizer.js';
import { getMemoryStore } from './MemoryStore.js';
import { getVVAULTTranscriptLoader } from './VVAULTTranscriptLoader.js';
import { checkMemoryPermission } from './memoryPermission.js';
import { getDriftGuard } from '../core/identity/DriftGuard.js';
import { getPromptAuditor } from '../core/identity/PromptAuditor.js';
import { getRoleScoreCalculator } from '../core/identity/RoleScoreCalculator.js';
import { getCapsuleLockService } from '../core/capsule/CapsuleLockService.js';
import { getMemoryWeightingService } from '../core/memory/MemoryWeightingService.js';
import { sessionActivityTracker } from './sessionActivityTracker.js';

export interface GPTMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  gptId?: string;
}

export interface GPTResponse {
  content: string;
  context: string;
  files: string[];
  actions: string[];
  model: string;
  timestamp: string;
}

export class GPTRuntimeService {
  private static instance: GPTRuntimeService;
  private gptManager: IGPTManager | null = null;
  private aiService: AIService;
  private activeGPTs: Map<string, GPTRuntime> = new Map();
  private messageHistory: Map<string, GPTMessage[]> = new Map(); // Keep for backwards compatibility
  private memoryStore = getMemoryStore();
  private transcriptLoader = getVVAULTTranscriptLoader();
  private vvaultRetrieval = new VVAULTRetrievalWrapper();
  private automaticRuntimeOrchestrator: AutomaticRuntimeOrchestrator;
  private runtimeContextManager: RuntimeContextManager;
  private isBrowserEnvironment: boolean;

  private constructor() {
    this.isBrowserEnvironment = shouldUseBrowserStubs();
    this.aiService = AIService.getInstance();
    this.automaticRuntimeOrchestrator = AutomaticRuntimeOrchestrator.getInstance();
    this.runtimeContextManager = RuntimeContextManager.getInstance();

    if (!this.isBrowserEnvironment) {
      this.initializeGPTManager();
    }
  }

  private async initializeGPTManager(): Promise<void> {
    if (!this.isBrowserEnvironment) {
      try {
        this.gptManager = await createGPTManager();
      } catch (error) {
        console.error('[GPTRuntimeService] Failed to initialize GPTManager:', error);
        this.gptManager = null;
      }
    }
  }

  static getInstance(): GPTRuntimeService {
    if (!GPTRuntimeService.instance) {
      GPTRuntimeService.instance = new GPTRuntimeService();
    }
    return GPTRuntimeService.instance;
  }

  // Load a GPT for conversation
  async loadGPT(gptId: string): Promise<GPTRuntime | null> {
    try {
      const runtime = await this.gptManager.loadGPTForRuntime(gptId);
      if (runtime) {
        this.activeGPTs.set(gptId, runtime);

        // Initialize message history if not exists
        if (!this.messageHistory.has(gptId)) {
          this.messageHistory.set(gptId, []);
        }

        // Lock capsule on session start
        try {
          const constructId = runtime.config.constructId || gptId.replace(/^gpt-/, '');
          const capsuleLockService = getCapsuleLockService();
          await capsuleLockService.lockCapsule(constructId);
          console.log(`✅ [GPTRuntime] Capsule locked for ${constructId}`);
        } catch (capsuleError) {
          console.warn(`⚠️ [GPTRuntime] Failed to lock capsule:`, capsuleError);
        }
      }
      return runtime;
    } catch (error) {
      console.error('Error loading GPT:', error);
      return null;
    }
  }

  // Automatically load optimal GPT for a thread
  async loadOptimalGPTForThread(
    threadId: string,
    userMessage: string,
    userId: string,
    conversationHistory?: GPTMessage[]
  ): Promise<GPTRuntime | null> {
    try {
      // Check if thread already has a runtime assignment
      let runtimeAssignment = this.runtimeContextManager.getActiveRuntime(threadId);

      if (!runtimeAssignment) {
        // Determine optimal runtime for this thread
        runtimeAssignment = await this.automaticRuntimeOrchestrator.determineOptimalRuntime({
          userMessage,
          conversationHistory,
          userId,
          threadId
        });

        // Assign runtime to thread
        await this.runtimeContextManager.assignRuntimeToThread(
          threadId,
          runtimeAssignment,
          userId
        );

        console.log(`[GPTRuntimeService] Auto-assigned runtime to thread ${threadId}: ${runtimeAssignment.constructId} (${Math.round(runtimeAssignment.confidence * 100)}%)`);
      }

      // Load the GPT if we have a gptId
      if (runtimeAssignment.gptId) {
        return await this.loadGPT(runtimeAssignment.gptId);
      }

      // Fallback: find GPT by construct ID
      const gpts = await this.gptManager.getAllGPTs();
      const matchingGPT = gpts.find(gpt =>
        gpt.callsign === runtimeAssignment.constructId ||
        gpt.id === runtimeAssignment.constructId
      );

      if (matchingGPT) {
        return await this.loadGPT(matchingGPT.id);
      }

      console.warn(`[GPTRuntimeService] No GPT found for runtime assignment: ${runtimeAssignment.constructId}`);
      return null;

    } catch (error) {
      console.error('[GPTRuntimeService] Error loading optimal GPT for thread:', error);
      return null;
    }
  }

  // Process message with automatic runtime management
  async processMessageWithAutoRuntime(
    threadId: string,
    userMessage: string,
    userId: string,
    conversationHistory?: GPTMessage[]
  ): Promise<GPTResponse> {
    try {
      // Check if runtime should be switched based on conversation evolution
      if (conversationHistory && conversationHistory.length > 0) {
        const switchAnalysis = await this.shouldSwitchRuntime(threadId, userMessage, conversationHistory);
        if (switchAnalysis.shouldSwitch && switchAnalysis.newAssignment) {
          console.log(`[GPTRuntimeService] Switching runtime for thread ${threadId}: ${switchAnalysis.reason}`);

          // Migrate to new runtime
          await this.runtimeContextManager.migrateRuntimeAssignment(
            threadId,
            switchAnalysis.newAssignment,
            switchAnalysis.reason
          );
        }
      }

      // Load optimal GPT for this thread
      const runtime = await this.loadOptimalGPTForThread(threadId, userMessage, userId, conversationHistory);

      if (!runtime) {
        throw new Error('Failed to load optimal runtime for thread');
      }

      // Process message with the loaded runtime
      const response = await this.processMessage(runtime.config.id, userMessage, userId);

      // Update runtime usage tracking
      this.runtimeContextManager.updateRuntimeUsage(threadId);

      return response;

    } catch (error) {
      console.error('[GPTRuntimeService] Error processing message with auto runtime:', error);
      throw error;
    }
  }

  // Check if runtime should be switched
  private async shouldSwitchRuntime(
    threadId: string,
    userMessage: string,
    conversationHistory: GPTMessage[]
  ): Promise<{ shouldSwitch: boolean; newAssignment?: RuntimeAssignment; reason?: string }> {
    const currentAssignment = this.runtimeContextManager.getActiveRuntime(threadId);

    if (!currentAssignment) {
      return { shouldSwitch: false };
    }

    // Analyze if conversation has evolved beyond current runtime capabilities
    const optimalAssignment = await this.automaticRuntimeOrchestrator.determineOptimalRuntime({
      userMessage,
      conversationHistory,
      threadId,
      existingConstructId: currentAssignment.constructId
    });

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
   * Inject test capsule directly (for testing without auth)
   */
  injectTestCapsule(gptId: string, capsuleData: any): void {
    const runtime = this.activeGPTs.get(gptId);
    if (!runtime) {
      console.warn(`[gptRuntime] Cannot inject capsule: GPT ${gptId} not loaded`);
      return;
    }

    runtime.config.testCapsule = { data: capsuleData };
    console.log(`🔒 [gptRuntime] Test capsule injected for ${gptId}: ${capsuleData.metadata?.instance_name}`);
  }

  // Process a message with a specific GPT
  async processMessage(
    gptId: string,
    userMessage: string,
    _userId: string = 'anonymous',
    identityFiles?: { prompt: string | null; conditioning: string | null }
  ): Promise<GPTResponse> {
    const runtime = this.activeGPTs.get(gptId);
    if (!runtime) {
      throw new Error('GPT not loaded for runtime');
    }

    // 🔒 EMERGENCY PERSONA LOCKDOWN: Check for signature responses FIRST
    const callsign = gptId.replace(/^gpt-/, '');

    const oneWordMode = this.detectOneWordCue(userMessage);

    // Initialize memory store
    await this.memoryStore.initialize();

    // Store user message in persistent memory (check permission first)
    const userId = runtime.config.userId || _userId || 'anonymous';
    
    // Update session activity
    const sessionId = `gpt-${gptId}`;
    sessionActivityTracker.updateActivity(sessionId, userId, gptId);
    
    // Check memory permission - will use localStorage fallback if settings not available
    const settings = typeof window !== 'undefined' ? (() => {
      try {
        const stored = localStorage.getItem('chatty_settings_v2');
        return stored ? JSON.parse(stored) : undefined;
      } catch {
        return undefined;
      }
    })() : undefined;
    
    if (checkMemoryPermission(settings, 'persistMessage')) {
      await this.memoryStore.persistMessage(userId, gptId, userMessage, 'user', undefined, settings);
    }

    // Get conversation history from persistent storage (check permission first)
    const persistentHistory = checkMemoryPermission(settings, 'retrieveHistory')
      ? await this.memoryStore.retrieveHistory(userId, gptId, 50, settings)
      : [];

    // Convert to GPTMessage format for backwards compatibility
    const history: GPTMessage[] = persistentHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp).toISOString(),
      gptId: msg.gptId
    }));

    // Also maintain volatile history for backwards compatibility
    const volatileHistory = this.messageHistory.get(gptId) || [];
    const userMsg: GPTMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      gptId
    };
    volatileHistory.push(userMsg);
    this.messageHistory.set(gptId, volatileHistory);

    try {
      // Get GPT context
      const context = await this.gptManager.getGPTContext(gptId);

      // Merge identity files into config if provided
      const configWithIdentity = identityFiles
        ? { ...runtime.config, identityFiles }
        : runtime.config;

      // Build system prompt (uses tone + VVAULT memories)
      const systemPrompt = await this.buildSystemPrompt(configWithIdentity, context, history, oneWordMode, userMessage, gptId);

      // Process with AI service using the GPT's model
      let aiResponse = await this.processWithModel(runtime.config.modelId, systemPrompt, userMessage);

      // Enforce one-word response if cue detected
      if (oneWordMode) {
        aiResponse = this.forceOneWord(aiResponse);
      }

      // REMOVED: Generic PersonaLockdown for all GPTs - not needed in core infrastructure

      // Post-LLM drift detection/correction using blueprint (data-driven, no hardcoded strings)
      try {
        const callsign = gptId.replace(/^gpt-/, '');
        const constructId = runtime.config.constructId || 'gpt';
        const userId = runtime.config.userId || _userId || 'anonymous';
        const { IdentityMatcher } = await import('../engine/character/IdentityMatcher.js');
        const identityMatcher = new IdentityMatcher();
        const blueprint = await identityMatcher.loadPersonalityBlueprint(userId, constructId, callsign);

        if (blueprint) {
          const driftPrevention = new DriftPrevention('phi3:latest');
          const conversationContext = {
            userMessage,
            conversationHistory: history
              .filter(msg => msg.role === 'user' || msg.role === 'assistant')
              .map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }))
          };

          const drift = await driftPrevention.detectDrift(aiResponse, blueprint, conversationContext);
          if (drift.detected) {
            const corrected = await driftPrevention.correctDrift(aiResponse, drift, blueprint);
            if (corrected) {
              aiResponse = corrected;
            }
          }

          // Lightweight post-filter for short/greeting inputs: strip meta/apology/self-intro sentences, keep rest
          const isBrief = userMessage.trim().split(/\s+/).length <= 4 && userMessage.trim().length <= 32;
          const greetingSynth = new GreetingSynthesizer();
          const isGreeting = greetingSynth.isGreetingOrOpener(userMessage);
          if (isBrief || isGreeting) {
            const metaPatterns = [
              /\bas an ai\b/i,
              /\bi (am|was) (designed|programmed)\b/i,
              /\bi cannot\b/i,
              /\bi can't\b/i,
              /\bi am a tool\b/i,
              /\bi'm (just )?an ai\b/i,
              /\bi do not have (feelings|emotions|a body)\b/i,
              /\bapologize\b/i,
              /\bsorry\b/i,
              /\bethic/i,
              /\bhistory\b/i,
              /\bfor context\b/i
            ];
            const sentences = aiResponse.split(/(?<=[.!?])\s+/);
            const filtered = sentences.filter(s => !metaPatterns.some(p => p.test(s)));
            if (filtered.length > 0) {
              aiResponse = filtered.join(' ').trim();
            }
          }
        }
      } catch (driftError) {
        console.warn('[gptRuntime] Drift detection skipped:', driftError);
      }

      // Drift detection and correction
      try {
        const constructId = runtime.config.constructId || gptId.replace(/^gpt-/, '');
        const driftGuard = getDriftGuard();
        const driftAnalysis = await driftGuard.detectDrift(constructId, aiResponse);

        if (driftAnalysis.driftScore > driftGuard.getDriftThreshold()) {
          console.warn(`⚠️ [DriftGuard] Drift detected for ${constructId}: ${(driftAnalysis.driftScore * 100).toFixed(1)}%`);
          console.warn(`   Indicators: ${driftAnalysis.indicators.join(', ')}`);
          await driftGuard.reinjectPrompt(constructId);
        }
      } catch (driftError) {
        console.warn('[GPTRuntime] Drift detection error:', driftError);
      }

      // Prompt auditing (every 50 turns)
      try {
        const constructId = runtime.config.constructId || gptId.replace(/^gpt-/, '');
        const promptAuditor = getPromptAuditor();
        promptAuditor.recordResponse(constructId, aiResponse);
        const turnCount = await promptAuditor.incrementTurnCount(constructId);

        if (turnCount % 50 === 0) {
          const auditResult = await promptAuditor.auditConstruct(constructId);
          if (auditResult.fidelityScore < 0.85) {
            await promptAuditor.refreshPromptIfNeeded(constructId, auditResult.fidelityScore);
          }
        }
      } catch (auditError) {
        console.warn('[GPTRuntime] Prompt auditing error:', auditError);
      }

      // Dev mode role score logging
      if (process.env.NODE_ENV === 'development' || process.env.CHATTY_DEV_DIAGNOSTICS === 'true') {
        try {
          const constructId = runtime.config.constructId || gptId.replace(/^gpt-/, '');
          const roleScoreCalculator = getRoleScoreCalculator();
          const roleScore = roleScoreCalculator.calculateScore(constructId, aiResponse);

          console.log(`[${constructId}] Role Consistency: ${roleScore.score}%`);
          if (roleScore.markersFound.length > 0) {
            console.log(`  Markers: ${roleScore.markersFound.join(', ')}`);
          }
          console.log(`  Tone: ${roleScore.tone}, Posture: ${roleScore.posture}`);
          if (roleScore.violations.length > 0) {
            console.log(`  Violations: ${roleScore.violations.join(', ')}`);
          }
        } catch (roleScoreError) {
          console.warn('[GPTRuntime] Role score calculation error:', roleScoreError);
        }
      }

      // Store assistant response in persistent memory
      await this.memoryStore.persistMessage(userId, gptId, aiResponse, 'assistant');

      // Add assistant response to volatile history for backwards compatibility
      const assistantMsg: GPTMessage = {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
        gptId
      };
      volatileHistory.push(assistantMsg);
      this.messageHistory.set(gptId, volatileHistory);

      // Persist this turn into VVAULT for continuity
      await this.persistTurnToVvault(gptId, userMessage, aiResponse).catch(err => {
        console.warn('[gptRuntime] Failed to persist turn to VVAULT', err);
      });

      // Update context
      await this.gptManager.updateGPTContext(gptId, this.buildContextFromHistory(history));

      // Check for action triggers
      const triggeredActions = this.checkActionTriggers(runtime.config.actions, userMessage, aiResponse);

      // Execute triggered actions
      await this.executeTriggeredActions(triggeredActions, userMessage);

      return {
        content: aiResponse,
        context: context,
        files: runtime.config.files.map(f => f.originalName),
        actions: triggeredActions.map(a => a.name),
        model: runtime.config.modelId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error processing message with GPT:', error);
      throw error;
    }
  }

  private async buildSystemPrompt(
    config: GPTConfig & {
      personaLock?: { constructId: string; remaining: number };
      personaSystemPrompt?: string;
      userId?: string;
      constructId?: string;
      identityFiles?: { prompt: string | null; conditioning: string | null };
    },
    _context: string,
    _history: GPTMessage[],
    oneWordMode: boolean,
    incomingMessage: string,
    gptId: string
  ): Promise<string> {
    const devDiagnostics = process.env.CHATTY_DEV_DIAGNOSTICS === 'true';

    // Hard lock enforcement: if lock is active, require orchestrator system prompt and matching construct
    if (config.personaLock?.constructId) {
      const expectedConstruct = config.personaLock.constructId;
      const providedConstruct = config.constructId || gptId;
      if (providedConstruct !== expectedConstruct && !gptId.includes(expectedConstruct)) {
        throw new Error(`Lock violation: expected ${expectedConstruct}, got ${providedConstruct}`);
      }
      if (!config.personaSystemPrompt) {
        throw new Error(`Lock active for ${expectedConstruct} but no systemPrompt provided`);
      }
      return config.personaSystemPrompt;
    }

    // Generic personality-based prompt building for any GPT
    const tone = detectTone({ text: incomingMessage });
    const personaRoute = routePersona({
      intentTags: this.deriveIntentTags(incomingMessage),
      tone: tone?.tone,
      message: incomingMessage,
    });

    // Try multiple callsign variants to find memories
    const callsignVariants = [
      gptId, // e.g., "gpt-construct-001"
      gptId.replace(/^gpt-/, ''), // e.g., "construct-001"
    ].filter((v, i, arr) => arr.indexOf(v) === i); // Deduplicate

    let memories = { memories: [] };
    for (const variant of callsignVariants) {
      try {
        const result = await this.vvaultRetrieval.retrieveMemories({
          constructCallsign: variant,
          semanticQuery: 'personality continuity memory',
          toneHints: tone ? [tone.tone] : [],
          limit: 10,
        });
        if (result.memories && result.memories.length > 0) {
          memories = result;
          console.log(`✅ [gptRuntime] Found ${memories.memories.length} memories using callsign: ${variant}`);
          break;
        }
      } catch (variantError) {
        console.warn(`⚠️ [gptRuntime] Failed to query memories with callsign ${variant}:`, variantError);
        continue;
      }
    }

    if (memories.memories.length === 0) {
      console.warn(`⚠️ [gptRuntime] No memories found for any callsign variant: ${callsignVariants.join(', ')}`);
    }

    // Load capsule (hardlock into GPT) - check test capsule first
    let capsule = undefined;

    // Check for injected test capsule first
    if (config.testCapsule) {
      capsule = config.testCapsule;
      console.log(`🧪 [gptRuntime] Using injected test capsule for ${gptId}:`, capsule.data.metadata?.instance_name);
    } else {
      // Try API loading
      try {
        const response = await fetch(
          `/api/vvault/capsules/load?constructCallsign=${encodeURIComponent(gptId)}&testMode=true`,
          {
            credentials: 'include',
            headers: { 'x-test-bypass': 'true' }
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.ok && data.capsule) {
            // Wrap capsule data in object structure expected by buildPersonalityPrompt
            capsule = { data: data.capsule };
            console.log(`✅ [gptRuntime] Loaded capsule for ${gptId}`, {
              hasTraits: !!data.capsule.traits,
              hasPersonality: !!data.capsule.personality,
              hasMemory: !!data.capsule.memory
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️ [gptRuntime] Failed to load capsule:`, error);
      }
    }

    // Load transcript context for memory enhancement
    let transcriptContext = '';
    try {
      const callsign = gptId.replace(/^gpt-/, '');
      const userId = config.userId || 'anonymous';

      // Load transcript fragments
      await this.transcriptLoader.loadTranscriptFragments(callsign, userId);
      const relevantFragments = await this.transcriptLoader.getRelevantFragments(callsign, incomingMessage, 3);

      if (relevantFragments.length > 0) {
        transcriptContext = relevantFragments
          .map(f => `"${f.content}" (context: ${f.context})`)
          .join('\n');
        console.log(`📚 [gptRuntime] Found ${relevantFragments.length} relevant transcript fragments for ${callsign}`);
      }
    } catch (transcriptError) {
      console.warn('[gptRuntime] Failed to load transcript context:', transcriptError);
    }

    let blueprint = undefined;
    try {
      const { IdentityMatcher } = await import('../engine/character/IdentityMatcher.js');
      const identityMatcher = new IdentityMatcher();
      const constructId = config.constructId || 'gpt';
      const callsign = gptId.replace(/^gpt-/, ''); // Generic callsign extraction
      const userId = config.userId || 'anonymous';
      blueprint = await identityMatcher.loadPersonalityBlueprint(userId, constructId, callsign);
    } catch (error) {
      console.warn(`⚠️ [gptRuntime] Failed to load blueprint for ${gptId}:`, error);
    }

    // MANDATORY: Persona context validation - require capsule OR blueprint
    if (!capsule && !blueprint) {
      throw new Error(
        `[gptRuntime] Persona context required for ${gptId} but neither capsule nor blueprint found. ` +
        `Cannot generate response without full persona context. Upload transcripts to create capsule/blueprint.`
      );
    }

    // If capsule exists, it takes precedence (hardlock)
    if (capsule) {
      console.log(`🔒 [gptRuntime] Capsule hardlocked for ${gptId} - using capsule data`);
    } else if (blueprint) {
      // Validate blueprint has required fields
      if (!blueprint.constructId || !blueprint.callsign) {
        throw new Error(
          `[gptRuntime] Invalid blueprint for ${gptId}: missing constructId or callsign. Cannot proceed.`
        );
      }
    }

    // Use identity prompt if provided, otherwise fall back to config.instructions
    const promptTxt = config.identityFiles?.prompt || null;
    const selfContext = promptTxt
      ? promptTxt
      : (config.instructions || config.description || `You are ${gptId}.`);

    if (promptTxt) {
      console.log(`✅ [gptRuntime] Using identity prompt for ${gptId} (${promptTxt.length} chars)`);
    }

    const layeredContext = buildContextLayers({
      selfContext: selfContext,
      userContext: '',
      topicContext: _context,
    });

    const emotion = this.mapToneToEmotion(tone?.tone);
    const personaWithEmotion = applyEmotionOverride({
      emotion,
      baseInstructions: layeredContext.combined,
    });

    const crisisNote = personaRoute.crisis
      ? `\n\n=== CRISIS_HOOK ${personaRoute.crisis.code} ===\n${personaRoute.crisis.reason}\n`
      : '';

    if (devDiagnostics) {
      console.info(`[${gptId} Diagnostics]`, {
        persona: personaRoute.persona,
        intentTags: this.deriveIntentTags(incomingMessage),
        crisis: personaRoute.crisis?.code || 'none',
        tone: tone?.tone || 'neutral',
        memories: memories.memories.length,
        emotion,
      });
    }

    // Get workspace context (active file/buffer content - like Copilot reads code files)
    // TODO: Integrate with Cursor/editor API to get active file content
    // For now, this is optional - can be extended to read from editor API or file system
    let workspaceContext: string | undefined = undefined;
    try {
      // Future: Fetch from editor API endpoint or pass from UI
      // This infrastructure is ready for editor integration
      workspaceContext = undefined; // Placeholder for future editor integration
    } catch (error) {
      console.warn('⚠️ [gptRuntime] Could not get workspace context:', error);
    }

    const { buildPersonalityPrompt } = await import('./personalityPromptBuilder');
    return await buildPersonalityPrompt({
      personaManifest: personaWithEmotion.instructions + crisisNote,
      incomingMessage,
      tone,
      memories: memories.memories,
      callSign: gptId,
      includeLegalSection: false,
      maxMemorySnippets: 5,
      oneWordCue: oneWordMode,
      blueprint,
      capsule, // Pass capsule for hardlock injection
      workspaceContext, // Inject workspace context (active file/buffer - like Copilot)
      transcriptContext, // Pass transcript fragments for memory recall
    });
  }

  private deriveIntentTags(message: string): string[] {
    const m = message.toLowerCase();
    const tags: string[] = [];
    if (m.includes('why') || m.includes('how') || m.includes('explain')) tags.push('reflect');
    if (m.includes('angry') || m.includes('rage') || m.includes('escalate')) tags.push('escalate');
    if (m.includes('calm') || m.includes('deescalate') || m.includes('organize')) tags.push('deescalate');
    if (tags.length === 0) tags.push('default');
    return tags;
  }

  private mapToneToEmotion(tone?: string): Emotion {
    if (!tone) return 'neutral';
    if (tone === 'feral' || tone === 'urgent' || tone === 'sarcastic') return 'agitation';
    if (tone === 'protective') return 'calm';
    return 'neutral';
  }

  /**
   * Store the latest user/assistant exchange in VVAULT for downstream retrieval.
   * Works with any GPT construct using Lin infrastructure.
   * Includes brevity metadata for ultra-brief GPTs.
   */
  private async persistTurnToVvault(gptId: string, userMessage: string, assistantMessage: string): Promise<void> {
    if (!gptId.toLowerCase().includes('katana')) return;

    // Calculate brevity metrics
    const wordCount = assistantMessage.trim().split(/\s+/).filter(w => w.length > 0).length;
    const oneWordResponse = wordCount === 1;
    const brevityScore = this.calculateBrevityScore(assistantMessage, wordCount);
    const analyticalSharpness = this.calculateAnalyticalSharpness(assistantMessage);

    // Determine brevity tags
    const tags: string[] = [];
    if (oneWordResponse) {
      tags.push('brevity:one-word');
    }
    if (brevityScore >= 0.9) {
      tags.push('brevity:ultra-brief');
    } else if (brevityScore >= 0.7) {
      tags.push('brevity:brief');
    }

    const timestamp = new Date().toISOString();
    const payload = {
      constructCallsign: gptId,
      context: userMessage,
      response: assistantMessage,
      metadata: {
        timestamp,
        source: 'gptRuntime',
        memoryType: 'long-term',
        threadId: gptId,
        // Brevity metadata
        brevityScore,
        wordCount,
        oneWordResponse,
        analyticalSharpness,
        tags,
      },
    };

    const res = await fetch('/api/vvault/identity/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`VVAULT store failed: ${res.status} ${errText}`);
    }
  }

  /**
   * Calculate brevity score (0-1) based on response characteristics
   */
  private calculateBrevityScore(response: string, wordCount: number): number {
    // Base score from word count (fewer words = higher score)
    let score = Math.max(0, 1 - (wordCount - 1) / 20); // 1 word = 1.0, 21+ words = 0.0

    // Penalize filler words
    const fillerPatterns = [
      /\b(um|uh|er|ah|well|actually|basically|literally|obviously|clearly)\b/gi,
      /\b(as an AI|I'm an AI|I am an AI|I'm here to|I can help|let me)\b/gi,
      /\b(I think|I believe|I feel|in my opinion|from my perspective)\b/gi,
    ];

    let fillerCount = 0;
    fillerPatterns.forEach(pattern => {
      const matches = response.match(pattern);
      if (matches) fillerCount += matches.length;
    });

    score -= fillerCount * 0.1;

    // Penalize preambles (sentences before the main point)
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 2) {
      score -= 0.1; // Multiple sentences suggest verbosity
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate analytical sharpness score (0-1) based on response characteristics
   */
  private calculateAnalyticalSharpness(response: string): number {
    let score = 0.5; // Base score

    // Reward flaw-leading language
    const flawPatterns = [
      /\b(problem|issue|flaw|weakness|failure|mistake|error|wrong)\b/gi,
      /\b(cost|consequence|impact|result|outcome)\b/gi,
      /\b(admit|own|take responsibility|accountable)\b/gi,
    ];

    let flawMatches = 0;
    flawPatterns.forEach(pattern => {
      const matches = response.match(pattern);
      if (matches) flawMatches += matches.length;
    });

    score += Math.min(0.3, flawMatches * 0.05);

    // Penalize therapy-lite language
    const therapyPatterns = [
      /\b(I understand|I hear you|that must be|it's okay|you're valid)\b/gi,
      /\b(you're not alone|it's normal|everyone feels|don't worry)\b/gi,
    ];

    let therapyMatches = 0;
    therapyPatterns.forEach(pattern => {
      const matches = response.match(pattern);
      if (matches) therapyMatches += matches.length;
    });

    score -= therapyMatches * 0.2;

    // Penalize inspiration porn
    const inspirationPatterns = [
      /\b(you've got this|you can do it|believe in yourself|never give up)\b/gi,
      /\b(inspirational|motivational|uplifting|encouraging)\b/gi,
    ];

    let inspirationMatches = 0;
    inspirationPatterns.forEach(pattern => {
      const matches = response.match(pattern);
      if (matches) inspirationMatches += matches.length;
    });

    score -= inspirationMatches * 0.15;

    return Math.max(0, Math.min(1, score));
  }

  private async processWithModel(modelId: string, systemPrompt: string, userMessage: string): Promise<string> {
    // Note: AI service model setting would need to be implemented
    // this.aiService.setModel(modelId);

    // Create a combined prompt
    const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`;

    // Process with AI service
    const response = await this.aiService.processMessage(fullPrompt);

    // Extract content from response
    if (Array.isArray(response)) {
      // Handle packet-based response
      const contentPackets = response.filter(packet => packet.op === 'answer.v1');
      if (contentPackets.length > 0) {
        return contentPackets[0].payload?.content || 'I apologize, but I encountered an error processing your request.';
      }
    } else if (typeof response === 'string') {
      return response;
    }

    return 'I apologize, but I encountered an error processing your request.';
  }

  private detectOneWordCue(userMessage: string): boolean {
    const trimmed = userMessage.trim();

    // Explicit cues
    const explicitCues = [
      /^verdict:/i,
      /^diagnosis:/i,
      /one[-\s]?word verdict/i,
      /\b(one[-\s]?word)\b/i
    ];
    if (explicitCues.some(re => re.test(trimmed))) {
      return true;
    }

    // Natural brevity detection: very short messages (1-2 words) suggest brevity preference
    // Examples: "yo", "what", "why", "how", "yes", "no", "ok", "sure"
    const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
    const isVeryBrief = wordCount <= 2 && trimmed.length <= 20;
    const isSingleWord = wordCount === 1;

    // For brief user messages, one-word responses may be appropriate
    // This is handled by the ultra-brevity layer in the prompt, not enforced here
    // We only enforce strict one-word mode for explicit cues

    return false; // Only enforce strict one-word for explicit cues; brevity layer handles natural brevity
  }

  private forceOneWord(response: string): string {
    const match = response.trim().match(/^[\p{L}\p{N}'-]+/u);
    if (match && match[0]) return match[0];
    const first = response.trim().split(/\s+/)[0];
    return first || '';
  }

  private buildContextFromHistory(history: GPTMessage[]): string {
    return history.slice(-5).map(msg =>
      `${msg.role}: ${msg.content}`
    ).join('\n');
  }

  private checkActionTriggers(actions: any[], userMessage: string, aiResponse: string): any[] {
    const triggeredActions: any[] = [];

    for (const action of actions) {
      if (!action.isActive) continue;

      // Simple keyword-based triggering
      const triggerKeywords = action.name.toLowerCase().split(' ');
      const messageText = (userMessage + ' ' + aiResponse).toLowerCase();

      const hasTrigger = triggerKeywords.some((keyword: string) =>
        messageText.includes(keyword) && keyword.length > 3
      );

      if (hasTrigger) {
        triggeredActions.push(action);
      }
    }

    return triggeredActions;
  }

  private async executeTriggeredActions(actions: any[], userMessage: string): Promise<any[]> {
    const results: any[] = [];

    for (const action of actions) {
      try {
        const result = await this.gptManager.executeAction(action.id, {
          userMessage,
          timestamp: new Date().toISOString()
        });
        results.push({ action: action.name, result, success: true });
      } catch (error: any) {
        console.error(`Error executing action ${action.name}:`, error);
        results.push({ action: action.name, error: error.message, success: false });
      }
    }

    return results;
  }

  // Get conversation history for a GPT
  getHistory(gptId: string): GPTMessage[] {
    return this.messageHistory.get(gptId) || [];
  }

  // Clear conversation history for a GPT
  clearHistory(gptId: string): void {
    this.messageHistory.set(gptId, []);
    this.gptManager.updateGPTContext(gptId, '');
  }

  // Get active GPTs
  getActiveGPTs(): string[] {
    return Array.from(this.activeGPTs.keys());
  }

  // Unload a GPT
  unloadGPT(gptId: string): void {
    this.activeGPTs.delete(gptId);
    this.messageHistory.delete(gptId);
  }

  // Get GPT runtime info
  getGPTInfo(gptId: string): { config: GPTConfig; historyLength: number; lastUsed: string } | null {
    const runtime = this.activeGPTs.get(gptId);
    if (!runtime) return null;

    return {
      config: runtime.config,
      historyLength: this.messageHistory.get(gptId)?.length || 0,
      lastUsed: runtime.lastUsed
    };
  }
}
