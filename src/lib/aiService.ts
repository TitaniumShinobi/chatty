// AI Service integration for memory and personalization
import { PersonalizationSettings, DataControlSettings } from '../types/settings';
import type { AssistantPacket, UIContextSnapshot } from '../types';
import { ConversationAI } from './conversationAI';
import { PersonaBrain } from '../engine/memory/PersonaBrain.js';
import { MemoryStore } from '../engine/memory/MemoryStore.js';
import { OptimizedSynthProcessor } from '../engine/optimizedSynth';
import { runSeat } from './browserSeatRunner';
import type { SynthMemoryContext } from '../engine/orchestration/types';
import { getRuntimeAwareness } from './runtimeAwareness';
import { identityEnforcement, messageAttributionService, identityAwarePromptBuilder } from '../core/identity';
import { CharacterContextBuilder } from '../engine/character/CharacterContextBuilder';
import { CharacterResponseFilter } from '../engine/character/CharacterResponseFilter';
import type { CharacterContext } from '../engine/character/types';

export interface MemoryConfig {
  enableVVAULT: boolean;
  allowMemory: boolean;
  personalization: PersonalizationSettings;
  dataControls: DataControlSettings;
  userId: string;
}

export interface MemoryResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Get memory configuration for the current user
 * This will integrate with VVAULT in the future
 */
export const getMemoryConfig = async (userId: string): Promise<MemoryConfig> => {
  try {
    // For now, return a stub configuration
    // In the future, this will fetch from VVAULT
    const stubConfig: MemoryConfig = {
      enableVVAULT: false,
      allowMemory: false,
      personalization: {
        enableCustomization: false,
        allowMemory: false,
        nickname: '',
        occupation: '',
        tags: [],
        aboutYou: ''
      },
      dataControls: {
        dataStorage: 'local',
        enableVVAULTMemory: false,
        memoryRetentionDays: 30,
        autoBackup: false,
        dataExport: false
      },
      userId
    };

    // TODO: Replace with actual VVAULT integration
    // const response = await fetch(`/api/vvault/memory-config/${userId}`);
    // const data = await response.json();
    // return data;

    return stubConfig;
    } catch (error) {
    console.error('Failed to get memory config:', error);
    throw new Error('Failed to load memory configuration');
  }
};

/**
 * Save personalization settings to memory system
 * This will integrate with VVAULT in the future
 */
export const savePersonalizationToMemory = async (
  userId: string, 
  personalization: PersonalizationSettings
): Promise<MemoryResponse> => {
  try {
    // For now, just log the data
    // In the future, this will save to VVAULT
    console.log('Saving personalization to memory:', { userId, personalization });

    // TODO: Replace with actual VVAULT integration
    // const response = await fetch('/api/vvault/personalization', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ userId, personalization })
    // });
    // const data = await response.json();
    // return data;

    return { success: true, data: { saved: true } };
  } catch (error) {
    console.error('Failed to save personalization:', error);
    return { success: false, error: 'Failed to save personalization settings' };
  }
};

/**
 * Get user's memory preferences and learned patterns
 * This will integrate with VVAULT LTM/STM in the future
 */
export const getMemoryPreferences = async (userId: string): Promise<MemoryResponse> => {
  try {
    // For now, return stub data
    // In the future, this will fetch from VVAULT LTM/STM
    const stubPreferences = {
      communicationStyle: 'friendly',
      preferredTopics: ['technology', 'programming'],
      interactionPatterns: {
        responseLength: 'detailed',
        formality: 'casual',
        technicalLevel: 'intermediate'
      },
      learnedBehaviors: {
        frequentlyUsedCommands: ['help', 'explain', 'code'],
        preferredResponseFormat: 'structured',
        timeOfDayPreferences: 'morning'
      }
    };

    // TODO: Replace with actual VVAULT integration
    // const response = await fetch(`/api/vvault/preferences/${userId}`);
    // const data = await response.json();
    // return data;

    return { success: true, data: stubPreferences };
            } catch (error) {
    console.error('Failed to get memory preferences:', error);
    return { success: false, error: 'Failed to load memory preferences' };
  }
};

/**
 * Update memory system with new interaction data
 * This will integrate with VVAULT learning system in the future
 */
export const updateMemoryWithInteraction = async (
  userId: string,
  interaction: {
    type: 'conversation' | 'command' | 'preference';
    content: string;
    metadata?: Record<string, any>;
  }
): Promise<MemoryResponse> => {
  try {
    // For now, just log the interaction
    // In the future, this will update VVAULT learning system
    console.log('Updating memory with interaction:', { userId, interaction });

    // TODO: Replace with actual VVAULT integration
    // const response = await fetch('/api/vvault/interaction', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ userId, interaction })
    // });
    // const data = await response.json();
    // return data;

    return { success: true, data: { updated: true } };
  } catch (error) {
    console.error('Failed to update memory:', error);
    return { success: false, error: 'Failed to update memory system' };
  }
};

/**
 * Check if VVAULT memory system is available
 * This will check VVAULT service status in the future
 */
export const isVVAULTAvailable = async (): Promise<boolean> => {
  try {
    // For now, return false (VVAULT not yet integrated)
    // In the future, this will check VVAULT service status
    // const response = await fetch('/api/vvault/status');
    // const data = await response.json();
    // return data.available;

    return false; // VVAULT not yet available
  } catch (error) {
    console.error('Failed to check VVAULT availability:', error);
        return false;
  }
};

/**
 * Initialize VVAULT memory system for user
 * This will set up VVAULT integration in the future
 */
export const initializeVVAULTMemory = async (userId: string): Promise<MemoryResponse> => {
  try {
    // For now, return success (stub)
    // In the future, this will initialize VVAULT for the user
    console.log('Initializing VVAULT memory for user:', userId);

    // TODO: Replace with actual VVAULT integration
    // const response = await fetch('/api/vvault/initialize', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ userId })
    // });
    // const data = await response.json();
    // return data;

    return { success: true, data: { initialized: true } };
    } catch (error) {
    console.error('Failed to initialize VVAULT memory:', error);
    return { success: false, error: 'Failed to initialize VVAULT memory system' };
  }
};

type ProcessHooks = {
  onPartialUpdate?: (content: string) => void;
  onFinalUpdate?: (packets: AssistantPacket[]) => void;
};

export class AIService {
  private static instance: AIService;
  private synthMode = true;
  private conversationAI = new ConversationAI();
  private brain = new PersonaBrain(new MemoryStore());
  private synthProcessor: OptimizedSynthProcessor;
  private linProcessor: OptimizedSynthProcessor;
  private history = new Map<string, { text: string; timestamp: string }[]>();
  private activeRuntimeId = 'synth';
  private activeRuntimeMode: 'synth' | 'lin' = 'synth';
  private characterBuilder = new CharacterContextBuilder();
  private characterResponseFilter = new CharacterResponseFilter();
  private readonly linTone = 'Voice: ruthless, blunt, hostile; no apologies, no corporate framing, no hedging. No analogies. Lead with the flaw. Never say “as an AI”. Max two punches.';

  private buildLinPrompt(
    userMessage: string,
    history: { text: string; timestamp: string }[],
    memoryContext: SynthMemoryContext
  ): string {
    const historyText = history
      .map((h) => `${h.timestamp}: ${h.text}`)
      .join('\n');
    const awarenessNotes = memoryContext.notes?.join('\n') || '';

    return `${this.linTone}

${awarenessNotes ? `Context notes:\n${awarenessNotes}\n\n` : ''}${
      historyText ? `History:\n${historyText}\n\n` : ''
    }User: ${userMessage}

Answer:`;
  }

  private constructor() {
    this.synthProcessor = new OptimizedSynthProcessor(this.brain, {
      enableLinMode: false,
    });
    this.linProcessor = new OptimizedSynthProcessor(this.brain, {
      enableLinMode: true,
    });
  }

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  setSynthMode(enabled: boolean) {
    this.synthMode = enabled;
    this.activeRuntimeMode = enabled ? 'synth' : 'lin';
    if (this.activeRuntimeId === 'synth' || this.activeRuntimeId === 'lin') {
      this.activeRuntimeId = enabled ? 'synth' : 'lin';
    }
  }

  getSynthMode(): boolean {
    return this.activeRuntimeMode !== 'lin';
  }

  setRuntime(runtimeId: string, mode: 'synth' | 'lin' = 'synth') {
    this.activeRuntimeId = runtimeId || (mode === 'lin' ? 'lin' : 'synth');
    this.activeRuntimeMode = mode;
    this.synthMode = mode !== 'lin';
  }

  async processMessage(
    text: string,
    files: File[] = [],
    hooks?: ProcessHooks,
    uiContext?: UIContextSnapshot,
    constructId?: string | null,
    threadId?: string | null
  ): Promise<AssistantPacket[]> {
    const trimmed = text.trim();
    const runtimeId = this.activeRuntimeId || (this.synthMode ? 'synth' : 'lin');
    const conversationId = threadId ?? runtimeId;
    const processor =
      this.activeRuntimeMode === 'lin' ? null : this.synthProcessor;

    if (!trimmed) {
      const packet: AssistantPacket = {
        op: 'answer.v1',
        payload: { content: "Hello! I'm here and fully awake. How can I help you today?" },
      };
      hooks?.onFinalUpdate?.([packet]);
      return [packet];
    }

    const history = this.history.get(conversationId) ?? [];
    const awareness = await getRuntimeAwareness({ runtimeId }).catch(() => null);
    const fileNotes = files.length
      ? [`User attached ${files.length} file${files.length === 1 ? '' : 's'} (${files
          .map((file) => file.name)
          .slice(0, 3)
          .join(', ')})`]
      : [];
    const uiNotes = uiContext?.route
      ? [`Active route: ${uiContext.route}`]
      : [];
    const moodNotes = awareness?.mood?.baseline
      ? [`Ambient mood baseline: ${awareness.mood.baseline}`]
      : [];

    const memoryContext: SynthMemoryContext = {
      constructId: constructId ?? `runtime:${runtimeId}`,
      threadId: conversationId,
      stmWindow: [],
      ltmEntries: [],
      summaries: [],
      persona: awareness?.identity?.email
        ? { email: awareness.identity.email, name: awareness.identity.name }
        : undefined,
      notes: [...fileNotes, ...uiNotes, ...moodNotes],
      awareness: awareness ?? undefined,
    };
    const targetConstructId = constructId || (this.activeRuntimeMode === 'lin' ? 'lin' : null);
    let characterContext: CharacterContext | null = null;
    if (targetConstructId && this.activeRuntimeMode === 'lin') {
      characterContext = await this.loadCharacterContext(targetConstructId);
      if (characterContext) {
        memoryContext.characterContext = characterContext;
      }
    }

    if (hooks?.onPartialUpdate) {
      hooks.onPartialUpdate('generating…');
    }

    try {
      // Validate construct identity before processing
      const targetConstructId = constructId || `runtime:${runtimeId}`;
      if (constructId) {
        const identityCheck = await identityEnforcement.validateConstructIdentity(
          constructId,
          { message: trimmed }
        );
        
        if (!identityCheck.isValid && identityCheck.violations.some(v => v.severity === 'critical')) {
          console.error('[AIService] Critical identity violations detected:', identityCheck.violations);
        }
      }

      let response: string;

      if (this.activeRuntimeMode === 'lin') {
        // Pure Lin path: bypass Synth helper seats; call seat directly
        const prompt = this.buildLinPrompt(trimmed, history, memoryContext);
        response = await runSeat({
          seat: 'smalltalk',
          prompt,
        });
      } else {
        const result = await (processor as OptimizedSynthProcessor).processMessage(
          trimmed,
          history,
          conversationId,
          { memoryContext }
        );
        response = result.response;
      }

      // Validate and sanitize response for identity compliance
      let sanitizedResponse = response.trim();
      if (characterContext) {
        const filterResult = this.characterResponseFilter.enforceCharacterVoice(
          sanitizedResponse,
          characterContext
        );
        sanitizedResponse = filterResult.content;
        if (filterResult.violations.length) {
          console.warn('[AIService] Character consistency violations detected:', filterResult.violations);
        }
      }
      if (constructId) {
        const validation = await messageAttributionService.validateBeforeSend(
          sanitizedResponse,
          constructId
        );
        
        if (!validation.isValid) {
          console.warn('[AIService] Identity violations in response:', validation.violations);
          sanitizedResponse = validation.sanitizedContent;
        }
      }

      const packets: AssistantPacket[] = [
        { op: 'answer.v1', payload: { content: sanitizedResponse } },
      ];

      this.appendHistory(conversationId, trimmed, sanitizedResponse);
      hooks?.onFinalUpdate?.(packets);
      return packets;
    } catch (error) {
      console.error('[AIService] Primary runtime failed, falling back to ConversationAI:', error);
      const fallback = await this.conversationAI.processMessage(trimmed, files, uiContext);
      const packets = Array.isArray(fallback) ? fallback : [fallback as AssistantPacket];
      this.appendHistory(conversationId, trimmed, this.extractPacketText(packets));
      hooks?.onFinalUpdate?.(packets as AssistantPacket[]);
      return packets as AssistantPacket[];
    }
  }

  /**
   * Initialize history from thread messages
   * Call this when opening a thread to load existing conversation history
   */
  initializeHistoryFromThread(conversationId: string, messages: Array<{ role: string; text?: string; content?: string; timestamp?: string | number }>) {
    if (!messages || messages.length === 0) {
      return;
    }
    
    const history: Array<{ text: string; timestamp: string }> = [];
    
    // Convert thread messages to history format
    for (const msg of messages) {
      const content = msg.text || msg.content || '';
      if (!content.trim()) continue;
      
      const timestamp = msg.timestamp 
        ? (typeof msg.timestamp === 'number' ? new Date(msg.timestamp).toISOString() : msg.timestamp)
        : new Date().toISOString();
      
      history.push({ text: content, timestamp });
    }
    
    // Store history (keep last 40 messages to match appendHistory behavior)
    this.history.set(conversationId, history.slice(-40));
    console.log(`📚 [AIService] Initialized history for ${conversationId}: ${history.length} messages`);
  }

  private appendHistory(conversationId: string, user: string, assistant: string) {
    const history = this.history.get(conversationId) ?? [];
    const now = new Date().toISOString();
    history.push({ text: user, timestamp: now });
    history.push({ text: assistant, timestamp: new Date().toISOString() });
    this.history.set(conversationId, history.slice(-40));
  }

  private async loadCharacterContext(constructId: string): Promise<CharacterContext | null> {
    try {
      const normalized = constructId.replace(/^runtime:/, '');
      return await this.characterBuilder.getCharacterContext({
        constructId: normalized,
        runtimeMode: this.activeRuntimeMode
      });
    } catch (error) {
      console.warn('[AIService] Failed to load character context:', error);
      return null;
    }
  }

  private extractPacketText(packets: AssistantPacket[] | AssistantPacket): string {
    const arr = Array.isArray(packets) ? packets : [packets];
    const answerPacket = arr.find((pkt) => pkt.op === 'answer.v1') as
      | { op: 'answer.v1'; payload: { content: string } }
      | undefined;
    if (answerPacket?.payload?.content) {
      return answerPacket.payload.content;
    }
    return arr
      .map((pkt) => (pkt as any)?.payload?.content || JSON.stringify(pkt.payload ?? {}))
      .join('\n');
  }
}
