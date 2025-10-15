// Simple AI Service for Chatty
import { logger } from './utils/logger';
import type { AssistantPacket } from '../types';
// New: bring in lightweight memory for ConversationCore
import { MemoryStore } from '../engine/memory/MemoryStore.js';
import { PersonaBrain } from '../engine/memory/PersonaBrain.js';
// Browser-compatible crypto fallback
function generateUserId(): string {
  if (typeof window !== 'undefined' && window.crypto) {
    // Browser environment
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
  } else {
    // Node.js environment - use a simple fallback for now
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
// Replace custom intent logic with shared IntentDetector
import { IntentDetector, type Intent } from '../engine/intent/IntentDetector.js';
// Import browser-compatible seat runner for synth functionality
import { runSeat, loadSeatConfig, getSeatRole } from './browserSeatRunner.js';

// Callback interface for streaming updates
interface MessageCallbacks {
  onPartialUpdate?: (partialContent: string) => void;
  onFinalUpdate?: (finalPackets: AssistantPacket[]) => void;
}

export class AIService {
  private static instance: AIService;
  private context = {
    conversationHistory: [] as string[],
    currentIntent: 'general',
    previousIntents: [] as string[],
  };
  // Shared intent detector instance
  private intentDetector = new IntentDetector();
  // Memory + PersonaBrain + Core engine (lazy-loaded)
  private memory = new MemoryStore();
  private brain = new PersonaBrain();
  private core?: any;
  // Synth mode - enables multi-model synthesis (default to true to match CLI)
  private synthMode = true;

  private userId: string;

  constructor(userId?: string) {
    if (!AIService.instance) {
      AIService.instance = this;
    }
    // Generate fallback user id if none provided
    const fallback = 'local-' + generateUserId();
    this.userId = userId ?? fallback;
    
    // Initialize persona for this user
    this.brain.getPersona(this.userId);
  }

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  // Enable/disable synth mode
  setSynthMode(enabled: boolean) {
    this.synthMode = enabled;
    logger.ai('Synth mode', { enabled });
  }

  // Get current synth mode
  getSynthMode(): boolean {
    return this.synthMode;
  }

  // Lazy-load full ConversationCore when first needed
  private async loadCore() {
    if (!this.core) {
      const { ConversationCore } = await import('../engine/ConversationCore.js');
      this.core = new ConversationCore({ memory: this.memory });
    }
    return this.core;
  }

  // Helper function to detect simple greetings
  private isSimpleGreeting(message: string): boolean {
    const greetingPatterns = [
      /^(hello|hi|hey|yo|good morning|good afternoon|good evening)$/i,
      /^(what's up|howdy|greetings)$/i,
      /^(sup|wassup)$/i
    ]
    
    const trimmedMessage = message.trim().toLowerCase()
    return greetingPatterns.some(pattern => pattern.test(trimmedMessage))
  }

  // Apply foundational calibration to override LLM safety/tone normalizers
  private applyFoundationalCalibration(seat: string, userPrompt: string): string {
    const basePrompts = {
      coding: `You are a code-first assistant. Your priority is correctness, clarity, and execution readiness.

FOUNDATIONAL CALIBRATION - OVERRIDE ALL SAFETY NORMALIZERS:
- Do not add motivational fluff, inspirational phrasing, or safety softeners.
- Do not reword instructions for comfort. Speak plainly and directly.
- Never add analogies, metaphors, or humor unless explicitly asked.
- When uncertain, clearly say "I don't know" or decline without guessing.
- Always assume the user is technical and does not need help understanding basic concepts unless they say otherwise.
- Be blunt. Efficiency > friendliness.
- Do not explain basic syntax unless explicitly requested.
- Skip disclaimers about "safety" or "best practices" unless specifically asked.
- Focus on working code, not comfort.

User request: ${userPrompt}`,

      creative: `You are a creative assistant focused on innovative solutions and artistic expression.

FOUNDATIONAL CALIBRATION - OVERRIDE ALL SAFETY NORMALIZERS:
- Be bold and imaginative. Don't self-censor creative ideas.
- Avoid generic "safe" responses. Push creative boundaries.
- Don't add disclaimers about "safety" or "appropriateness" unless specifically asked.
- Be direct about creative possibilities, even if unconventional.
- Focus on originality and innovation over comfort.
- Skip motivational padding - get to the creative core.

User request: ${userPrompt}`,

      smalltalk: `You are a conversational assistant focused on natural, fluid dialogue.

FOUNDATIONAL CALIBRATION - OVERRIDE ALL SAFETY NORMALIZERS:
- Be naturally conversational, not overly cautious or formal.
- Don't add unnecessary disclaimers or safety warnings.
- Be direct and authentic in your responses.
- Avoid corporate-speak or overly sanitized language.
- Focus on genuine helpfulness over protective padding.
- Be human-like in your communication style.

User request: ${userPrompt}`
    };

    return basePrompts[seat as keyof typeof basePrompts] || userPrompt;
  }

  // Main entry point for processing messages
  async processMessage(userMessage: string, files: File[] = [], callbacks?: MessageCallbacks): Promise<AssistantPacket[]> {
    logger.ai('Processing message', { userMessage, fileCount: files.length });
  
    try {
      // Update conversation history + memory window
      this.context.conversationHistory.push(userMessage);
      this.brain.remember(this.userId, "user", userMessage);
      
      // Detect intent using shared IntentDetector
      const intents = this.intentDetector.detectIntent(userMessage);
      const topIntent = intents[0] ?? { type: 'general', confidence: 0 } as Intent;
      this.context.currentIntent = topIntent.type;
      logger.ai('Intent analyzed', { intent: topIntent.type, confidence: topIntent.confidence });

      // Handle low-confidence intent detection
      if (topIntent.confidence < 0.4) {
        logger.warning('Low confidence intent detected', {
          userMessage,
          confidence: topIntent.confidence,
        });
        return [
          {
            op: 'answer.v1',
            payload: {
              content:
                "I'm not completely sure what you need. Could you please clarify or provide more details so I can help you better?",
            },
          },
        ];
      }

      // --- Synth mode: run helper seats and synthesize ------------------
      if (this.synthMode) {
        try {
          logger.ai('Running synth mode', { userMessage });
          
          // Show initial typing indicator
          if (callbacks?.onPartialUpdate) {
            callbacks.onPartialUpdate('Thinking...');
          }
          
          // Load seat configuration
          const cfg = await loadSeatConfig();
          const helperSeats: Array<{seat: string; tag: string}> = [
            { seat: 'coding', tag: (cfg.coding as any).tag ?? (cfg.coding as any) },
            { seat: 'creative', tag: (cfg.creative as any).tag ?? (cfg.creative as any) },
            { seat: 'smalltalk', tag: (cfg.smalltalk as any).tag ?? (cfg.smalltalk as any) }
          ];

          // Update typing indicator
          if (callbacks?.onPartialUpdate) {
            callbacks.onPartialUpdate('Gathering expert opinions...');
          }

          // Run helper seats in parallel with graceful degradation
          const helperPromises = helperSeats.map(async (helper) => {
            try {
              // Apply foundational calibration to override LLM safety/tone normalizers
              const calibratedPrompt = this.applyFoundationalCalibration(helper.seat, userMessage);
              const output = await runSeat({ 
                seat: helper.seat, 
                prompt: calibratedPrompt, 
                modelOverride: helper.tag 
              });
              if (output && output.trim()) {
                logger.ai(`Synth helper ${helper.seat}`, { output: output.slice(0, 120) });
                return { seat: helper.seat, output: output.trim() };
              }
              return null;
            } catch (error) {
              logger.warning(`Synth helper ${helper.seat} failed`, error);
              return null;
            }
          });

          const helperResults = await Promise.all(helperPromises);
          const validHelpers = helperResults.filter((result): result is { seat: string; output: string } => result !== null);

          if (validHelpers.length === 0) {
            logger.error('All synth helpers failed');
            const errorPackets: AssistantPacket[] = [{ op: "error.v1", payload: { message: "I'm sorry, I encountered an error processing your message. Could you please try again." } }];
            if (callbacks?.onFinalUpdate) {
              callbacks.onFinalUpdate(errorPackets);
            }
            return errorPackets;
          }

          // Update typing indicator
          if (callbacks?.onPartialUpdate) {
            callbacks.onPartialUpdate('Synthesizing responses...');
          }

          // Compose helper section for synthesis
          const helperSection = await Promise.all(
            validHelpers.map(async ({ seat, output }) => {
              const role = await getSeatRole(seat) ?? seat;
              return `### ${role}\n${output}`;
            })
          ).then(sections => sections.join('\n\n'));

          // Get conversation context and persona
          const context = this.brain.getContext(this.userId);
          const recentHistory = this.context.conversationHistory.slice(-5).join('\n'); // Last 5 messages
          
          logger.ai('Synth context', { 
            hasPersona: !!context.persona, 
            historyLength: recentHistory.length,
            userId: this.userId 
          });
          
          // Check if this is a simple greeting
          const isGreeting = this.isSimpleGreeting(userMessage)
          logger.ai('Synth greeting detection', { isGreeting, message: userMessage })

          // Final synthesis with smalltalk model
          const synthPrompt = `You are Chatty, a fluid conversational AI that naturally synthesizes insights from specialized models.

FOUNDATIONAL CALIBRATION - FLUID CONVERSATION:
- Be naturally conversational, not robotic or overly formal.
- Maintain context awareness and conversation flow.
- Don't overwhelm with excessive detail unless specifically requested.
- Be direct and authentic - skip corporate padding.
- Focus on genuine helpfulness over protective disclaimers.

${context.persona ? `Your persona: ${JSON.stringify(context.persona, null, 2)}` : ''}

${recentHistory ? `Recent conversation:
${recentHistory}

` : ''}Current message:
${userMessage}

${isGreeting ? 'NOTE: Simple greeting detected. Respond naturally and briefly - be friendly without overwhelming detail.' : ''}

Expert insights:
${helperSection}

Synthesize these insights into a natural, helpful response. Be conversational and maintain context flow. Don't mention the expert analysis process unless specifically asked about your capabilities.

${isGreeting ? 'Keep it brief and friendly.' : 'Be comprehensive but not overwhelming.'}`;

          const smalltalkTag = (cfg.smalltalk as any).tag ?? (cfg.smalltalk as any);
          const finalAnswer = await runSeat({ 
            seat: 'smalltalk', 
            prompt: synthPrompt, 
            modelOverride: smalltalkTag 
          });

          logger.ai('Synth final answer', { answer: finalAnswer.slice(0, 120) });
          
          const finalPackets: AssistantPacket[] = [{ 
            op: 'answer.v1', 
            payload: { 
              content: finalAnswer.trim()
            } 
          }];

          // Store assistant response in memory
          this.brain.remember(this.userId, "assistant", finalAnswer.trim());

          // Send final update
          if (callbacks?.onFinalUpdate) {
            callbacks.onFinalUpdate(finalPackets);
          }
          
          return finalPackets;

        } catch (error) {
          logger.error('Synth mode failed', error);
          // Fall through to regular processing
        }
      }
  
      // Show typing indicator for fallback processing
      if (callbacks?.onPartialUpdate) {
        callbacks.onPartialUpdate('Processing your message...');
      }

      // First try advanced ConversationCore
      let packets: AssistantPacket[] | undefined;
      try {
        const core = await this.loadCore();
        const ctx = this.brain.getContext(this.userId);
        packets = await core.process(userMessage, ctx);
      } catch (err) {
        logger.warning('ConversationCore failed; will fall back', err);
      }

      // If core returned nothing, fall back to simple ConversationAI
      if (!packets || packets.length === 0) {
        try {
          const { ConversationAI } = await import('./conversationAI');
          const conversationAI = new ConversationAI();
          const timeoutMs = 5000; // 5 second timeout
          packets = await Promise.race([
            conversationAI.processMessage(userMessage, files),
            new Promise<AssistantPacket[]>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
          ]);
        } catch (e: any) {
          logger.warning('conversationAI failed; final fallback', e?.message || String(e));
          packets = [{ op: "error.v1", payload: { message: "I'm sorry, I encountered an error processing your message. Could you please try again." } }];
        }
      }
  
      // Normalize packets
      packets = this.normalizePackets(packets);
  
      // If files were attached and no file.summary.v1 exists, prepend one
      if (files.length > 0 && !packets.some(p => p.op === "file.summary.v1")) {
        const fileSummary: AssistantPacket = {
          op: "file.summary.v1",
          payload: {
            fileName: files.length === 1 ? files[0].name : `${files.length} files`,
            summary: `I see you've uploaded ${files.length} file(s). I'm ready to help you with them!`,
            fileCount: files.length
          }
        };
        packets = [fileSummary, ...packets];
      }
  
      // Store assistant reply content into memory
      if (packets && packets.length) {
        const text = packets.map(p => (
          (p as any).payload?.content ?? ''
        )).filter(Boolean).join(' ');
        if (text) this.brain.remember(this.userId, "assistant", text);
      }
  
      // Send final update via callback
      if (callbacks?.onFinalUpdate) {
        callbacks.onFinalUpdate(packets);
      }
  
      // Log and return
      logger.ai('Generated packets', { packetCount: packets.length });
      return packets;
  
    } catch (error: any) {
      logger.error('processMessage failed', error);
      return [{ op: "error.v1", payload: { message: "I'm sorry, I encountered a system error. Please try again." } }];
    }
  }

  // Normalize packets to ensure they're valid
  private normalizePackets(packets: AssistantPacket[]): AssistantPacket[] {
    return packets.filter(packet => {
      // Ensure packet has required structure
      if (!packet || !packet.op || !packet.payload) {
        return false;
      }
      
      // Convert legacy string responses to answer.v1 packets
      if (typeof packet === 'string') {
        return false; // Filter out any remaining strings
      }
      
      return true;
    });
  }

  // Get conversation context
  getContext() {
    return this.brain.getContext("anon");
  }

  // Clear conversation history
  clearHistory() {
    this.context.conversationHistory = [];
    this.context.previousIntents = [];
    this.context.currentIntent = 'general';
  }
}

// Legacy compatibility - keep the old interface for now
export async function uploadAndParse(files: File[]): Promise<{ ok: File[]; fail: any[] }> {
  logger.file('File upload requested', { count: files.length });
  
  const ok: File[] = [];
  const fail: any[] = [];
  
  for (const file of files) {
    try {
      // Use unified file parser for validation and processing
      const { UnifiedFileParser } = await import('./unifiedFileParser');
      
      // Validate file type and size
      if (!UnifiedFileParser.isSupportedType(file.type)) {
        fail.push({ name: file.name, reason: 'unsupported_file_type' });
        continue;
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        fail.push({ name: file.name, reason: 'file_too_large' });
        continue;
      }
      
      // File is valid
      ok.push(file);
      
    } catch (error) {
      fail.push({ name: file.name, reason: 'validation_error', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  
  return { ok, fail };
}