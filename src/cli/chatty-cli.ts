#!/usr/bin/env node
// CLI entry point for Chatty
import { spawn, ChildProcess } from 'child_process';
import { runSeat, loadSeatConfig } from '../engine/seatRunner.js';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { ConversationCore } from '../engine/ConversationCore.js';
import { PersistentMemoryStore } from '../engine/memory/PersistentMemoryStore.js';
import { chatQueue } from '../../server/chat_queue.js';
// Import PersonaBrain for enhanced persona support
import { PersonaBrain } from '../engine/memory/PersonaBrain.js';
// Import file operations commands
import { FileOpsCommands } from './fileOpsCommands.js';
// Import optimized synth processor
import { OptimizedZenProcessor } from '../engine/optimizedZen.js';
import { AdaptiveMemoryManager } from '../engine/adaptiveMemoryManager.js';
// Import conversation manager
import { ConversationManager } from './conversationManager.js';
// Import settings manager
import { SettingsManager } from './settingsManager.js';
// Import turn-taking and emotional systems
import { TurnTakingSystem } from './turnTakingSystem.js';
import { EmotionalWatchdog } from './emotionalWatchdog.js';
import {
  getChattyCliConversationsDir,
  getChattyCliFileRoot,
  getChattyCliSettingsFile
} from './paths.js';
import {
  cliApiClient,
  DEFAULT_API_URL,
  DEFAULT_CLI_CONSTRUCT_ID,
  summarizeCanonicalTurn,
  type CliTurnMetadata,
  type CliConstructCard,
  type CliConstructCatalogResult,
} from './apiClient.js';
// Import containment manager
import {
  triggerContainment,
  isUserInContainment,
  resolveContainment,
  getContainmentStatus,
  getContainmentHistory,
  getAllActiveContainments,
  getContainmentStats,
  shouldTriggerContainment,
  formatContainmentDuration
} from '../lib/containmentManager.js';

// Color utilities
function colorize(text: string, color: string): string {
  const colors: Record<string, string> = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
  };
  return `${colors[color] || colors.reset}${text}${colors.reset}`;
}

function log(message: string, color = 'reset') {
  console.log(colorize(message, color));
}

type CliTransportMode = 'vvault' | 'local';
type CliBackendOrchestrationMode = 'lin' | 'custom';

const DEFAULT_CLI_API_URL = process.env.CHATTY_API_URL || 'http://127.0.0.1:5050';
const CHATTY_CLI_REPO_ROOT = path.resolve(process.env.CHATTY_REPO_ROOT || process.cwd());
const CHATTY_CLI_TSX_BIN = path.join(CHATTY_CLI_REPO_ROOT, 'node_modules', '.bin', 'tsx');
const CHATTY_CLI_ORCHESTRATION_SCRIPT = path.join(
  CHATTY_CLI_REPO_ROOT,
  'server',
  'scripts',
  'runChattyCliOrchestrationProof.ts',
);

function normalizeTransportMode(value: unknown, fallback: CliTransportMode = 'vvault'): CliTransportMode {
  return value === 'local' ? 'local' : value === 'vvault' ? 'vvault' : fallback;
}

function resolveThreadId(constructId: string, explicitThreadId?: string | null): string {
  const trimmed = String(explicitThreadId || '').trim();
  return trimmed || `${constructId}_chat_with_${constructId}`;
}

function extractPacketContent(packets: any[]): string {
  return packets
    .map((packet) => {
      const content = packet?.payload?.content;
      return typeof content === 'string' ? content.trim() : '';
    })
    .filter(Boolean)
    .join('\n');
}

type CliRuntimeMode = 'backend' | 'local';

interface CLIAIServiceOptions {
  runtimeMode?: CliRuntimeMode;
  apiUrl?: string;
  constructId?: string;
  threadId?: string | null;
  requestTimeoutMs?: number;
  orchestrationMode?: CliBackendOrchestrationMode;
  customModelTarget?: string;
  skipPersistence?: boolean;
  showReceipts?: boolean;
  showChecklist?: boolean;
  allowInteractiveAuth?: boolean;
}

const BACKEND_IGNORED_MODELS = new Set([
  'synth',
  'coding',
  'creative',
  'smalltalk',
  'intelligence',
  'imagination',
  'conversational',
  'full_synthesis',
]);

const BACKEND_LOCAL_ONLY_ALIASES = new Set([
  'synth',
  'zen',
  'coding',
  'creative',
  'smalltalk',
  'intelligence',
  'imagination',
  'conversational',
  'full_synthesis',
]);

const KNOWN_PROVIDER_PREFIXES = new Set([
  'anthropic',
  'google',
  'grok',
  'groq',
  'mistral',
  'ollama',
  'openai',
  'openrouter',
  'perplexity',
  'xai',
]);

function trimValue(value: string | undefined | null, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function trimOptionalValue(value: string | undefined | null): string {
  return value?.trim() || '';
}

function normalizeBackendOrchestrationMode(
  value: unknown,
  fallback: CliBackendOrchestrationMode = 'lin',
): CliBackendOrchestrationMode {
  return value === 'custom' ? 'custom' : value === 'lin' ? 'lin' : fallback;
}

function describeBackendModelSelection(
  mode: CliBackendOrchestrationMode,
  customTarget: string,
): string {
  if (mode === 'custom') {
    return customTarget ? `custom (${customTarget})` : 'custom (unset)';
  }
  return 'lin';
}

function isBackendLocalOnlyAlias(value: string): boolean {
  return BACKEND_LOCAL_ONLY_ALIASES.has(value.trim().toLowerCase());
}

function resolveBackendModelOverride(currentModel: string): {
  model?: string;
  provider?: string;
} {
  const normalizedModel = currentModel.trim();
  if (!normalizedModel) {
    return {};
  }

  if (BACKEND_IGNORED_MODELS.has(normalizedModel.toLowerCase())) {
    return {};
  }

  const providerSplit = normalizedModel.split(':', 2);
  if (
    providerSplit.length === 2 &&
    KNOWN_PROVIDER_PREFIXES.has(providerSplit[0].toLowerCase()) &&
    providerSplit[1]
  ) {
    return {
      provider: providerSplit[0].toLowerCase(),
      model: providerSplit[1],
    };
  }

  return { model: normalizedModel };
}

// CLI AI Service that uses the same enhanced AI service as Web
class CLIAIService {
  private conversationHistory: { text: string; timestamp: string }[] = [];
  private context: { settings: { maxHistory: number; enableMemory: boolean; enableReasoning: boolean; enableFileProcessing: boolean } };
  public addTimestamps: boolean;
  public core: ConversationCore | null;
  private readonly modelName: string;
  private currentModel: string;
  private brain: PersonaBrain; // Enhanced persona support
  public optimizedZen: OptimizedZenProcessor;
  public memoryManager: AdaptiveMemoryManager;
  private readonly runtimeMode: CliRuntimeMode;
  private readonly apiUrl: string;
  private constructId: string;
  private threadId: string | null;
  private readonly requestTimeoutMs: number;
  private orchestrationMode: CliBackendOrchestrationMode;
  private customModelTarget: string;
  private skipPersistence: boolean;
  private showReceipts: boolean;
  private showChecklist: boolean;
  private readonly allowInteractiveAuth: boolean;
  private lastTurnMetadata: CliTurnMetadata | null = null;

  constructor(
    useFallback = false,
    addTimestamps = true,
    modelName = 'AI',
    options: CLIAIServiceOptions = {},
  ) {
    this.addTimestamps = addTimestamps;
    this.modelName = modelName;
    this.runtimeMode = options.runtimeMode || 'local';
    this.apiUrl = trimValue(options.apiUrl, DEFAULT_API_URL);
    this.constructId = trimValue(options.constructId, DEFAULT_CLI_CONSTRUCT_ID);
    this.threadId = options.threadId ? String(options.threadId).trim() || null : null;
    this.requestTimeoutMs =
      typeof options.requestTimeoutMs === 'number' && options.requestTimeoutMs > 0
        ? options.requestTimeoutMs
        : 45000;
    this.orchestrationMode = normalizeBackendOrchestrationMode(
      options.orchestrationMode,
      'lin',
    );
    this.customModelTarget = trimOptionalValue(options.customModelTarget);
    this.skipPersistence = options.skipPersistence === true;
    this.showReceipts = options.showReceipts === true;
    this.showChecklist = options.showChecklist === true;
    this.allowInteractiveAuth = options.allowInteractiveAuth === true;
    // Default to synthesizer mode for richer answers
    this.currentModel = 'synth';
    this.context = {
      settings: {
        maxHistory: 50,
        enableMemory: true,
        enableReasoning: true,
        enableFileProcessing: true,
      },
    };

    // Initialize enhanced persona support with persistent memory
    const persistentMemory = new PersistentMemoryStore('cli');
    this.brain = new PersonaBrain(persistentMemory);

    // Initialize optimized synth processor and memory manager
    this.optimizedZen = new OptimizedZenProcessor(this.brain, {
      maxContextLength: 8000,
      maxHistoryMessages: 20,
      timeoutMs: 45000,
      enableAdaptivePruning: true,
      enableFastSummary: true,
      enableTimeoutFallback: true
    });

    this.memoryManager = new AdaptiveMemoryManager(persistentMemory, this.brain, {
      maxContextLength: 8000,
      maxHistoryMessages: 20,
      maxTriples: 100,
      enableSmartPruning: true,
      enableContextCompression: true,
      enableImportanceScoring: true
    });

    if (!useFallback) {
      // Create a wrapper that implements MemoryStore interface
      const memoryWrapper: any = {
        append: (userId: string, role: 'user' | 'assistant', text: string) => persistentMemory.append(userId, role, text),
        addTriples: (userId: string, triples: any[]) => persistentMemory.addTriples(userId, triples),
        setPersona: (userId: string, key: string, value: unknown) => persistentMemory.setPersona(userId, key, value),
        getContext: (userId: string, limit = 20) => persistentMemory.getContext(userId, limit),
        // Expose additional methods
        remember: (role: 'user' | 'assistant', text: string) => persistentMemory.remember(role, text),
        addTriple: (s: string, p: string, o: string) => persistentMemory.addTriple(s, p, o),
        getPersona: (userId: string) => persistentMemory.getPersona(userId),
        clear: (userId: string) => persistentMemory.clear(userId),
        getStats: (userId: string) => persistentMemory.getStats(userId)
      };
      this.core = new ConversationCore({ memory: memoryWrapper });
    } else {
      log(colorize('⚠️  Using fallback AI system for CLI stability', 'yellow'));
      this.core = null;
    }
  }

  // Render packets to text using the same templates as Web
  renderPackets(packets: any[]) {
    return packets.map(packet => {
      const template = this.getTemplate(packet.op);
      const line = this.interpolate(template, packet.payload);
      const prefix = `${this.modelName}> `;
      if (this.addTimestamps) {
        const now = new Date().toLocaleString();
        return `${prefix}[${now}] ${line}`;
      }
      return `${prefix}${line}`;
    }).join('\n');
  }

  getTemplate(op: string): string {
    const templates: Record<string, string> = {
      "answer.v1": "{content}",
      "file.summary.v1": "📄 {fileName}: {summary}",
      "thought.v1": "💭 {notes}",
      "evidence.v1": "📚 Evidence → {items}",
      "plan.v1": "🗺️ Plan → {steps}",
      "web.evidence.v1": "🔎 {results}",
      "story.v1": "📖 {title}\n{content}",
      "insight.v1": "💡 {note}",
      "warn.v1": "⚠️ {message}",
      "error.v1": "❌ {message}",
    };
    return templates[op] || `[missing-op: ${op}]`;
  }

  interpolate(template: string, payload: Record<string, any>): string {
    return template.replace(/\{([\w.]+)\}/g, (_match, key) => {
      const val = payload[key];
      if (Array.isArray(val)) {
        // For web evidence results format nicely
        if (key === "results") {
          return val.map((r: any) => `${r.title} → ${r.link}`).join(" \n");
        }
        return val.join(" | ");
      }
      if (typeof val === "object" && val !== null) return JSON.stringify(val);
      return String(val ?? "");
    });
  }

  async processMessage(userMessage: string) {
    // Add to conversation history
    this.conversationHistory.push({ text: userMessage, timestamp: new Date().toLocaleString() });
    this.lastTurnMetadata = null;

    // Trim history if too long
    if (this.conversationHistory.length > this.context.settings.maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-this.context.settings.maxHistory);
    }

    if (this.runtimeMode === 'backend') {
      return this.processCanonicalMessage(userMessage);
    }

    try {
      if (this.currentModel === 'zen') {
        // Use optimized zen processor for better performance
        const { response, metrics } = await this.optimizedZen.processMessage(
          userMessage,
          this.conversationHistory,
          'cli'
        );

        // Log performance metrics for debugging
        if (metrics.processingTime > 30000) { // Log if processing took more than 30 seconds
          console.warn(colorize(`⚠️  Slow processing detected: ${metrics.processingTime}ms`, 'yellow'));
          if (metrics.fallbackUsed) {
            console.warn(colorize('⚠️  Fallback response used due to timeout', 'yellow'));
          }
          if (metrics.memoryPruned) {
            console.warn(colorize('⚠️  Memory was pruned to improve performance', 'yellow'));
          }
        }

        const ts = this.addTimestamps ? `[${new Date().toLocaleString()}] ` : '';
        const display = 'synth';
        return `${display}> ${ts}${response.trim()}`;
      }

      // single model path
      if (this.currentModel !== 'phi3' || !this.core) {
        const result = await runSeat({ seat: 'custom', prompt: userMessage, modelOverride: this.currentModel });
        return result;
      }

      // default phi3 with ConversationCore
      if (this.core) {
        const sanitized = this.conversationHistory
          .filter(item => !/^you are\s/i.test(item.text.trim()))
          .slice(-6);
        const ctx = { history: sanitized } as any;
        const packets = await this.core.process(userMessage, ctx);
        if (packets && packets.length > 0) {
          return this.renderPackets(packets);
        }
      }
    } catch (error: any) {
      console.error('AI Service error:', error?.message || error);
      log(colorize(`AI Service error: ${error?.message || error}`, 'red'));
    }

    // Fallback to simple AI with packet structure
    const fallbackPackets = this.generateFallbackPackets(userMessage);
    return this.renderPackets(fallbackPackets ?? []);
  }

  private async processCanonicalMessage(userMessage: string) {
    const backendOverride =
      this.orchestrationMode === 'custom' && this.customModelTarget
        ? resolveBackendModelOverride(this.customModelTarget)
        : {};
    const threadId = resolveThreadId(this.constructId, this.threadId);
    const result = await cliApiClient.sendCanonicalMessage(
      {
        constructId: this.constructId,
        message: userMessage,
        threadId,
        sessionId: threadId,
        skipPersistence: this.skipPersistence,
        ...backendOverride,
      },
      {
        apiUrl: this.apiUrl,
        allowInteractiveAuth: this.allowInteractiveAuth,
        openBrowser: this.allowInteractiveAuth,
        timeoutMs: this.requestTimeoutMs,
      },
    );

    this.lastTurnMetadata = {
      ...summarizeCanonicalTurn(result.payload, result.status),
      constructId:
        result.payload.construct_id ||
        this.constructId ||
        DEFAULT_CLI_CONSTRUCT_ID,
    };
    const answer =
      result.payload.response ||
      result.payload.message ||
      extractPacketContent(
        Array.isArray(result.payload.packets) ? result.payload.packets : [],
      ) ||
      (typeof result.payload.error === 'string' ? result.payload.error : '') ||
      '';

    if (!result.ok) {
      throw new Error(
        answer || `Canonical backend request failed with status ${result.status}.`,
      );
    }

    return answer;
  }

  generateFallbackPackets(message: string) {
    const lower = message.toLowerCase();

    if (lower.includes('hello') || lower.includes('hi')) {
      return [{ op: "answer.v1", payload: { content: "Hello! I'm Chatty, your AI assistant. I'm running in terminal mode with advanced capabilities. How can I help you today?" } }];
    }

    if (lower.includes('help')) {
      return [{
        op: "answer.v1", payload: {
          content: `I'm Chatty Advanced CLI with these capabilities:

🧠 AI Features:
  • Memory System - I remember our conversations
  • Reasoning Engine - I can solve complex problems step by step
  • File Processing - I can analyze and process files
  • Context Awareness - I understand conversation context
  • Multi-Model Synthesis - I combine insights from specialized AI models

💻 Commands:
  /help        - Show this help
  /clear       - Clear conversation history
  /memory      - Show memory status
  /receipt     - Show the last runtime receipt/checklist
  /construct   - Open the construct picker
  /construct list - List available constructs
  /construct current - Show the active construct
  /construct <id> - Switch constructs and reset to the canonical thread
  /settings    - Show current settings
  /set <key> <value> - Update a setting
  /reset-settings - Reset settings to defaults
  /status      - Show runtime status
  /performance - Show performance metrics and memory health
  /emotional-state - Show emotional and turn-taking status
  /speakers    - Show active speakers and their stats
  /crisis-recovery - Activate crisis recovery mode
  /containment - Show containment status and statistics
  /containment-check <user> - Check if user is in containment
  /containment-resolve <user> - Resolve user containment
  /containment-history <user> - Show user's containment history
  /model       - Show current model or backend orchestration mode
  /model list  - List installed Ollama models (local mode only)
  /model lin   - Use Lin-first backend orchestration
  /model <provider:model> - Use a backend custom model override
  /model custom <provider:model> - Explicit backend custom override
  /models      - Show specific models in synth pipeline
  /persona <name> - Switch to a specific LLM persona (copilot, gemini, grok, claude, chatgpt)
  /personas - List all available personas
  /file        - File operations (cd, ls, cp, mv, ln, grep, find, etc.)
  /save <name> - Save current conversation
  /load <id>   - Load saved conversation
  /list        - List all saved conversations
  /delete <id> - Delete saved conversation
  /export <id> - Export conversation (json, txt, md)
  /exit        - Exit Chatty

🎯 Just type your message to chat!` }
      }];
    }

    if (lower.includes('memory')) {
      return [{ op: "answer.v1", payload: { content: `Memory Status:\n  • Conversations stored: ${this.conversationHistory.length}\n  • Memory enabled: ${this.context.settings.enableMemory ? 'Yes' : 'No'}\n  • Max history: ${this.context.settings.maxHistory}` } }];
    }

    if (lower.includes('settings')) {
      return [{
        op: "answer.v1", payload: {
          content: `Current Settings:
  • Memory: ${this.context.settings.enableMemory ? 'Enabled' : 'Disabled'}
  • Reasoning: ${this.context.settings.enableReasoning ? 'Enabled' : 'Disabled'}
  • File Processing: ${this.context.settings.enableFileProcessing ? 'Enabled' : 'Disabled'}
  • Max History: ${this.context.settings.maxHistory}`
        }
      }];
    }

    return [{ op: 'answer.v1', payload: { content: "I'm not sure how to help with that just yet." } }];
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getContext() {
    return {
      history: this.conversationHistory,
      ...this.context,
      runtimeMode: this.runtimeMode,
      constructId: this.constructId,
      apiUrl: this.apiUrl,
    };
  }

  getConversationHistory() {
    return this.conversationHistory;
  }

  getModel() {
    return this.currentModel;
  }

  getModelStatusLabel() {
    if (this.runtimeMode === 'backend') {
      return describeBackendModelSelection(
        this.orchestrationMode,
        this.customModelTarget,
      );
    }
    return this.currentModel;
  }

  getRuntimeMode() {
    return this.runtimeMode;
  }

  getApiUrl() {
    return this.apiUrl;
  }

  getConstructId() {
    return this.constructId;
  }

  getThreadId() {
    return resolveThreadId(this.constructId, this.threadId);
  }

  getLastTurnMetadata() {
    return this.lastTurnMetadata;
  }

  shouldShowReceipts() {
    return this.showReceipts;
  }

  shouldShowChecklist() {
    return this.showChecklist;
  }

  getOrchestrationMode() {
    return this.orchestrationMode;
  }

  getCustomModelTarget() {
    return this.customModelTarget;
  }

  setModel(name: string) {
    this.currentModel = name;
  }

  setConstructId(
    constructId: string,
    options: { preserveThread?: boolean } = {},
  ) {
    const nextConstructId = trimValue(constructId, DEFAULT_CLI_CONSTRUCT_ID);
    const constructChanged = nextConstructId !== this.constructId;
    this.constructId = nextConstructId;
    if (constructChanged && !options.preserveThread) {
      this.threadId = null;
    }
  }

  setThreadId(threadId: string | null) {
    const trimmed = String(threadId || '').trim();
    this.threadId = trimmed || null;
  }

  setShowReceipts(showReceipts: boolean) {
    this.showReceipts = showReceipts;
  }

  setShowChecklist(showChecklist: boolean) {
    this.showChecklist = showChecklist;
  }

  setSkipPersistence(skipPersistence: boolean) {
    this.skipPersistence = skipPersistence;
  }

  setOrchestrationMode(mode: CliBackendOrchestrationMode) {
    this.orchestrationMode = normalizeBackendOrchestrationMode(mode, 'lin');
  }

  setCustomModelTarget(target: string | null | undefined) {
    this.customModelTarget = trimOptionalValue(target);
  }

  configureBackendModelSelection(
    mode: CliBackendOrchestrationMode,
    customTarget = '',
  ) {
    this.setOrchestrationMode(mode);
    this.setCustomModelTarget(customTarget);
  }
}

// ---- Phi-3 bootstrap -------------------------------------------------------
async function ensurePhi3(opts: { preferredPort: number; host: string; silent?: boolean }): Promise<{ child: ChildProcess | null; port: number }> {
  const portsToTry = [
    Number(process.env.OLLAMA_PORT) || opts.preferredPort,
    11434, // Ollama default
  ];

  const host = opts.host.replace(/\/$/, '');

  async function ping(port: number, path = '/api/tags'): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const req = http.get(`${host}:${port}${path}`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  // 1) See if an instance is already running on any tried port
  for (const p of portsToTry) {
    if (await ping(p)) {
      if (!opts.silent) console.log(`✓ Found existing Ollama at ${host}:${p}`);
      return { child: null, port: p };
    }
  }

  // 2) Spawn our own on preferredPort
  const port = opts.preferredPort;
  if (!opts.silent) console.log(`Starting Phi-3 on port ${port}…`);

  let child: ChildProcess | null = null;
  try {
    child = spawn('ollama', ['serve', '--port', String(port)], {
      env: { ...process.env },
      stdio: 'ignore', // Change to 'inherit' for verbose logs
    });
  } catch (err: any) {
    console.error('Failed to spawn ollama:', err.message);
    console.error('Please install Ollama or start it manually.');
    process.exit(1);
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await ping(port, '/api/generate')) {
      if (!opts.silent) console.log('Phi-3 ready.');
      return { child, port };
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.error('Failed to start Phi-3 within 30 s.');
  if (child) child.kill();
  process.exit(1);
}

// helper to get active model name from Ollama
async function detectModelName(host: string, port: number): Promise<string> {
  return new Promise<string>((resolve) => {
    const url = `${host}:${port}/api/tags`;
    const { protocol } = new URL(url);
    const requester = protocol === 'https:' ? https.request : http.request;
    const req = requester(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed.models) && parsed.models.length) {
            resolve(parsed.models[0].name || 'LLM');
            return;
          }
        } catch (_) {
          /* ignore */
        }
        resolve('LLM');
      });
    });
    req.on('error', () => resolve('LLM'));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve('LLM');
    });
  });
}

interface ParsedCliArgs {
  helpMode: boolean;
  useFallback: boolean;
  noTimestamp: boolean;
  localMode: boolean;
  localModel: boolean;
  onceMode: boolean;
  jsonOut: boolean;
  explicitConstructArg: boolean;
  seatOverride?: string;
  cliRoot?: string;
  settingsFile?: string;
  conversationDir?: string;
  orchestrationOutDir?: string;
  orchestrationConstructs?: string;
  orchestrationNoBrowser: boolean;
  orchestrationAuthTimeoutMs?: number;
  apiUrl?: string;
  constructId?: string;
  threadId?: string;
  transport?: CliTransportMode;
  requestTimeoutMs?: number;
  showReceipts: boolean;
  showChecklist: boolean;
  skipPersistence: boolean;
  handoffLatestCodex: boolean;
  handoffWatch: boolean;
  handoffPollSeconds?: number;
  handoffFromFile?: string;
  handoffStdinJson: boolean;
  handoffSeedOnly: boolean;
  positionals: string[];
}

const CLI_HELP_TEXT = `Chatty CLI - Terminal AI Assistant

Usage:
  chatty-cli [options]
  chatty-cli --once [options] <message>
  chatty-cli handoff [--latest-codex [--watch] [--poll-seconds <n>] | --from-file <absolute-path> | --stdin-json | --seed-only]
  chatty-cli orchestration [--json] [--skip-persistence] [--constructs=zen-001,nova-001] [--no-browser] [--auth-timeout-ms=<ms>] [--out-dir=<path>]
  npm run cli -- [options]

Default route:
  /api/vvault/message on ${DEFAULT_CLI_API_URL}

Options:
  --help, -h              Show this help and exit
  --once                  Run one prompt and exit
  --json                  Emit machine-readable JSON in --once mode
  --construct <id>        Select a construct, e.g. zen-001 or nova-001
  --thread <id>           Select a thread/session id
  --api-url <url>         Override backend API URL
  --timeout <ms>          Override backend request timeout
  --show-receipts         Print runtime receipt summary
  --show-checklist        Print runtime checklist summary
  --skip-persistence      Ask backend to skip canonical persistence
  --latest-codex         Relay the newest local Codex rollout tail into Chatty
  --watch                Keep syncing new Codex rollout turns into Chatty (latest-codex only)
  --poll-seconds <n>     Poll interval for --watch mode (default 2)
  --from-file <path>      Codex export file for handoff relay
  --stdin-json            Read a JSON tail from stdin for handoff relay
  --seed-only             Use the old bounded seed handoff path (debug only)
  --local                 Use local CLI runtime instead of backend route
  --fallback              Use local fallback runtime
  --seat <name>           Override local seat or backend custom model target
  --root <path>           File-ops root; defaults to the caller directory
  --settings-file <path>  Settings file; defaults under ~/.chatty-cli
  --conversation-dir <p>  Conversation save dir; defaults under ~/.chatty-cli
  --out-dir <path>        Orchestration proof artifact dir
  --constructs <ids>      Orchestration proof construct ids
  --no-browser            Do not open a browser for orchestration proof auth
  --auth-timeout-ms <ms>  Orchestration proof auth timeout

Interactive commands:
  /help, /construct, /model, /settings, /receipt, /file, /save, /load, /list, /exit
`;

function parseCliArgs(rawArgs: string[]): ParsedCliArgs {
  let helpMode = false;
  let useFallback = false;
  let noTimestamp = false;
  let localMode = false;
  let localModel = false;
  let onceMode = false;
  let jsonOut = false;
  let explicitConstructArg = false;
  let seatOverride: string | undefined;
  let cliRoot: string | undefined;
  let settingsFile: string | undefined;
  let conversationDir: string | undefined;
  let orchestrationOutDir: string | undefined;
  let orchestrationConstructs: string | undefined;
  let orchestrationNoBrowser = false;
  let orchestrationAuthTimeoutMs: number | undefined;
  let apiUrl: string | undefined;
  let constructId: string | undefined;
  let threadId: string | undefined;
  let transport: CliTransportMode | undefined;
  let requestTimeoutMs: number | undefined;
  let showReceipts = false;
  let showChecklist = false;
  let skipPersistence = false;
  let handoffLatestCodex = false;
  let handoffWatch = false;
  let handoffPollSeconds: number | undefined;
  let handoffFromFile: string | undefined;
  let handoffStdinJson = false;
  let handoffSeedOnly = false;
  const positionals: string[] = [];

  for (let index = 0; index < rawArgs.length; index++) {
    const arg = rawArgs[index];
    if (arg === '--') {
      positionals.push(...rawArgs.slice(index + 1));
      break;
    }

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    if (arg.startsWith('--out-dir=')) {
      orchestrationOutDir = arg.slice('--out-dir='.length).trim() || orchestrationOutDir;
      continue;
    }

    if (arg.startsWith('--constructs=')) {
      orchestrationConstructs = arg.slice('--constructs='.length).trim() || orchestrationConstructs;
      continue;
    }

    if (arg.startsWith('--auth-timeout-ms=')) {
      orchestrationAuthTimeoutMs = Number(arg.slice('--auth-timeout-ms='.length));
      continue;
    }

    if (arg.startsWith('--poll-seconds=')) {
      handoffPollSeconds = Number(arg.slice('--poll-seconds='.length));
      continue;
    }

    switch (arg) {
      case '--help':
      case '-h':
        helpMode = true;
        break;
      case '--fallback':
        useFallback = true;
        localMode = true;
        break;
      case '--no-timestamp':
        noTimestamp = true;
        break;
      case '--local':
        localMode = true;
        break;
      case '--local-model':
        localMode = true;
        localModel = true;
        break;
      case '--once':
        onceMode = true;
        break;
      case '--json':
        jsonOut = true;
        break;
      case '--seat':
        seatOverride = rawArgs[index + 1];
        index += 1;
        break;
      case '--root':
        cliRoot = rawArgs[index + 1] || cliRoot;
        index += 1;
        break;
      case '--settings-file':
        settingsFile = rawArgs[index + 1] || settingsFile;
        index += 1;
        break;
      case '--conversation-dir':
        conversationDir = rawArgs[index + 1] || conversationDir;
        index += 1;
        break;
      case '--out-dir':
        orchestrationOutDir = rawArgs[index + 1] || orchestrationOutDir;
        index += 1;
        break;
      case '--constructs':
        orchestrationConstructs = rawArgs[index + 1] || orchestrationConstructs;
        index += 1;
        break;
      case '--no-browser':
        orchestrationNoBrowser = true;
        break;
      case '--auth-timeout-ms':
        orchestrationAuthTimeoutMs = Number(rawArgs[index + 1]);
        index += 1;
        break;
      case '--transport':
        transport = normalizeTransportMode(rawArgs[index + 1], 'vvault');
        index += 1;
        break;
      case '--api-url':
      case '--api-base-url':
        apiUrl = trimValue(rawArgs[index + 1], DEFAULT_API_URL);
        index += 1;
        break;
      case '--construct':
        explicitConstructArg = true;
        constructId = trimValue(rawArgs[index + 1], DEFAULT_CLI_CONSTRUCT_ID);
        index += 1;
        break;
      case '--thread':
        threadId = rawArgs[index + 1] || '';
        index += 1;
        break;
      case '--timeout':
        requestTimeoutMs = Number(rawArgs[index + 1]);
        index += 1;
        break;
      case '--show-receipts':
        showReceipts = true;
        break;
      case '--show-checklist':
        showChecklist = true;
        break;
      case '--skip-persistence':
        skipPersistence = true;
        break;
      case '--latest-codex':
        handoffLatestCodex = true;
        break;
      case '--watch':
        handoffWatch = true;
        break;
      case '--poll-seconds':
        handoffPollSeconds = Number(rawArgs[index + 1]);
        index += 1;
        break;
      case '--from-file':
        handoffFromFile = rawArgs[index + 1] || handoffFromFile;
        index += 1;
        break;
      case '--stdin-json':
        handoffStdinJson = true;
        break;
      case '--seed-only':
        handoffSeedOnly = true;
        break;
      default:
        positionals.push(arg);
        break;
    }
  }

  return {
    helpMode,
    useFallback,
    noTimestamp,
    localMode,
    localModel,
    onceMode,
    jsonOut,
    explicitConstructArg,
    seatOverride,
    cliRoot,
    settingsFile,
    conversationDir,
    orchestrationOutDir,
    orchestrationConstructs,
    orchestrationNoBrowser,
    orchestrationAuthTimeoutMs,
    apiUrl,
    constructId,
    threadId,
    transport,
    requestTimeoutMs,
    showReceipts,
    showChecklist,
    skipPersistence,
    handoffLatestCodex,
    handoffWatch,
    handoffPollSeconds,
    handoffFromFile,
    handoffStdinJson,
    handoffSeedOnly,
    positionals,
  };
}

function isOrchestrationProofCommand(args: ParsedCliArgs): boolean {
  return args.positionals.length === 1 && args.positionals[0].trim().toLowerCase() === 'orchestration';
}

function isCodexHandoffCommand(args: ParsedCliArgs): boolean {
  return args.positionals.length === 1 && args.positionals[0].trim().toLowerCase() === 'handoff';
}

async function runCliCodexHandoffCommand(): Promise<number> {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  try {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    const args = parseCliArgs(process.argv.slice(2));
    const handoffModeCount =
      Number(args.handoffLatestCodex) +
      Number(Boolean(args.handoffFromFile)) +
      Number(args.handoffStdinJson) +
      Number(args.handoffSeedOnly);
    if (handoffModeCount > 1) {
      throw new Error('chatty-cli handoff accepts exactly one of --latest-codex, --from-file, --stdin-json, or --seed-only.');
    }
    if (args.handoffWatch === true && args.handoffLatestCodex !== true) {
      throw new Error('chatty-cli handoff --watch requires --latest-codex.');
    }
    if (typeof args.handoffPollSeconds === 'number' && !Number.isFinite(args.handoffPollSeconds)) {
      throw new Error('chatty-cli handoff --poll-seconds must be a number.');
    }
    if (typeof args.handoffPollSeconds === 'number' && args.handoffWatch !== true) {
      throw new Error('chatty-cli handoff --poll-seconds requires --watch.');
    }

    let result: any;
    if (args.handoffSeedOnly === true) {
      const { seedCodexContinuity } = await import('../../server/lib/codexContinuitySeed.js');
      result = await seedCodexContinuity();
    } else if (args.handoffLatestCodex === true) {
      if (args.handoffWatch === true) {
        const { runCodexContinuityWatch } = await import('../../server/lib/codexContinuityWatch.js');
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        await runCodexContinuityWatch({
          pollSeconds: args.handoffPollSeconds,
          maxPolls:
            process.env.CHATTY_CLI_HANDOFF_WATCH_MAX_POLLS
              ? Number(process.env.CHATTY_CLI_HANDOFF_WATCH_MAX_POLLS)
              : Number.POSITIVE_INFINITY,
        });
        return 0;
      }
      const { relayCodexContinuity } = await import('../../server/lib/codexContinuityRelay.js');
      result = await relayCodexContinuity({
        latestCodex: true,
      });
    } else if (args.handoffFromFile) {
      const { relayCodexContinuity } = await import('../../server/lib/codexContinuityRelay.js');
      result = await relayCodexContinuity({
        fromFilePath: path.resolve(args.handoffFromFile),
      });
    } else if (args.handoffStdinJson === true) {
      if (process.stdin.isTTY) {
        throw new Error('chatty-cli handoff --stdin-json requires JSON input on stdin.');
      }
      const stdinJson = await new Promise<string>((resolve, reject) => {
        let buffer = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
          buffer += chunk;
        });
        process.stdin.on('end', () => resolve(buffer));
        process.stdin.on('error', reject);
      });
      const { relayCodexContinuity } = await import('../../server/lib/codexContinuityRelay.js');
      result = await relayCodexContinuity({
        stdinJson,
      });
    } else {
      throw new Error('chatty-cli handoff now requires --latest-codex, --from-file, or --stdin-json. Use --seed-only only for debug fallback.');
    }
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;

    process.stdout.write(
      `${JSON.stringify(
        {
          command: 'chatty-cli handoff',
          source: result.source || { type: args.handoffSeedOnly ? 'seed-only' : 'unknown' },
          constructId:
            result.constructId ||
            result.resumeTokenJson?.constructId ||
            result.seededRuntimeTurnState?.constructId ||
            'zen-001',
          threadId:
            result.threadId ||
            result.resumeTokenJson?.threadId ||
            result.seededRuntimeTurnState?.sessionId ||
            'zen-001_chat_with_zen-001',
          importedTurns: result.importedTurns ?? 0,
          dedupedTurns: result.dedupedTurns ?? 0,
          latestAssistantTurnId:
            result.latestAssistantTurnId ||
            result.latestRuntimeTurnState?.assistantTurnId ||
            result.seededRuntimeTurnState?.assistantTurnId ||
            null,
          resumeTokenJson: result.resumeTokenJson,
          chattyResumeUrl: result.chattyResumeUrl,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  } catch (error: any) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    process.stderr.write(`chatty-cli handoff failed: ${error?.message || String(error)}\n`);
    return 1;
  }
}

async function runCliOrchestrationProofCommand({
  apiUrl,
  jsonOut,
  skipPersistence,
  outDir,
  constructs,
  noBrowser,
  authTimeoutMs,
}: {
  apiUrl: string;
  jsonOut: boolean;
  skipPersistence: boolean;
  outDir?: string;
  constructs?: string;
  noBrowser: boolean;
  authTimeoutMs?: number;
}): Promise<number> {
  const args = [CHATTY_CLI_ORCHESTRATION_SCRIPT];
  if (jsonOut) args.push('--json');
  if (skipPersistence) args.push('--skip-persistence');
  if (outDir) args.push(`--out-dir=${outDir}`);
  if (constructs) args.push(`--constructs=${constructs}`);
  if (noBrowser) args.push('--no-browser');
  if (typeof authTimeoutMs === 'number' && Number.isFinite(authTimeoutMs) && authTimeoutMs > 0) {
    args.push(`--auth-timeout-ms=${Math.floor(authTimeoutMs)}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(CHATTY_CLI_TSX_BIN, args, {
      cwd: CHATTY_CLI_REPO_ROOT,
      env: {
        ...process.env,
        CHATTY_API_URL: apiUrl,
      },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function findConstructCard(
  catalog: CliConstructCatalogResult | null,
  constructId: string,
): CliConstructCard | null {
  if (!catalog) return null;
  return (
    catalog.constructs.find(
      (entry) =>
        entry.constructId === constructId || entry.callsign === constructId,
    ) || null
  );
}

function printConstructCatalog(
  catalog: CliConstructCatalogResult,
  currentConstructId: string,
) {
  const freshness =
    catalog.cachedAt && catalog.source === 'cache'
      ? ` (cached ${catalog.cachedAt})`
      : catalog.source === 'live'
        ? ' (live)'
        : '';
  console.log(
    colorize(
      `🎭 Available Constructs${freshness}:`,
      'cyan',
    ),
  );

  catalog.constructs.forEach((entry, index) => {
    const active = entry.constructId === currentConstructId ? ' [current]' : '';
    console.log(
      colorize(
        `  ${index + 1}. ${entry.displayName} (${entry.constructId})${active}`,
        'white',
      ),
    );
    if (entry.description) {
      console.log(colorize(`     ${entry.description}`, 'dim'));
    }
  });
}

function askQuestion(rl: any, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer: string) => resolve(answer));
  });
}

async function promptForManualConstructId(
  rl: any,
  currentConstructId: string,
): Promise<string | null> {
  const manualValue = (await askQuestion(
    rl,
    `Enter construct ID [Enter keeps ${currentConstructId}]: `,
  )).trim();
  return manualValue || null;
}

async function promptForConstructSelection(
  rl: any,
  currentConstructId: string,
  catalog: CliConstructCatalogResult | null,
): Promise<string | null> {
  if (catalog && catalog.constructs.length > 0) {
    printConstructCatalog(catalog, currentConstructId);
  } else {
    console.log(
      colorize(
        'Construct catalog unavailable. Manual construct ID entry only.',
        'yellow',
      ),
    );
  }

  const hasCatalog = Boolean(catalog && catalog.constructs.length > 0);
  while (true) {
    const choice = (
      await askQuestion(
        rl,
        hasCatalog
          ? `Select construct [Enter keeps ${currentConstructId}, number, m manual, q cancel]: `
          : `Enter construct ID [Enter keeps ${currentConstructId}, q cancel]: `,
      )
    ).trim();

    if (!choice || choice.toLowerCase() === 'q') {
      return null;
    }

    if (!hasCatalog || choice.toLowerCase() === 'm') {
      return promptForManualConstructId(rl, currentConstructId);
    }

    const index = Number(choice);
    if (Number.isInteger(index) && index >= 1 && index <= catalog!.constructs.length) {
      return catalog!.constructs[index - 1].constructId;
    }

    const directMatch = catalog!.constructs.find(
      (entry) => entry.constructId === choice || entry.callsign === choice,
    );
    if (directMatch) {
      return directMatch.constructId;
    }

    console.log(
      colorize(
        'Invalid selection. Choose a number, m for manual entry, or Enter to keep the current construct.',
        'yellow',
      ),
    );
  }
}

function applyPromptEnvelope(
  rawInput: string,
  ai: CLIAIService,
): string {
  let prompt = rawInput.trim();
  if (!prompt.startsWith('{')) {
    return prompt;
  }

  const payload = JSON.parse(prompt);
  prompt = typeof payload.prompt === 'string' ? payload.prompt : '';

  if (typeof payload.seat === 'string' && payload.seat.trim()) {
    if (ai.getRuntimeMode() === 'backend') {
      ai.configureBackendModelSelection('custom', payload.seat.trim());
    } else {
      ai.setModel(payload.seat.trim());
    }
  } else if (typeof payload.model === 'string' && payload.model.trim()) {
    if (ai.getRuntimeMode() === 'backend') {
      ai.configureBackendModelSelection('custom', payload.model.trim());
    } else {
      ai.setModel(payload.model.trim());
    }
  }

  if (typeof payload.constructId === 'string' && payload.constructId.trim()) {
    ai.setConstructId(payload.constructId.trim());
  }

  if (typeof payload.threadId === 'string') {
    ai.setThreadId(payload.threadId);
  }

  return prompt;
}

function buildOnceOutput(ai: CLIAIService, answer: string) {
  const turnMetadata = ai.getLastTurnMetadata();
  const output: Record<string, unknown> = {
    answer,
    model: turnMetadata?.receipt?.model || ai.getModelStatusLabel(),
    transport: ai.getRuntimeMode(),
    constructId: turnMetadata?.constructId || ai.getConstructId(),
    threadId: ai.getThreadId(),
  };

  if (ai.getRuntimeMode() === 'backend') {
    output.orchestrationMode = ai.getOrchestrationMode();
    if (ai.getCustomModelTarget()) {
      output.customModelTarget = ai.getCustomModelTarget();
    }
  }

  if (turnMetadata) {
    output.success = turnMetadata.success;
    output.status = turnMetadata.status;
    if (turnMetadata.error) output.error = turnMetadata.error;
    if (turnMetadata.receipt) output.receipt = turnMetadata.receipt;
    if (turnMetadata.checklist) output.checklist = turnMetadata.checklist;
  }

  return output;
}

function writeOnceResult(ai: CLIAIService, answer: string, jsonOut: boolean) {
  if (jsonOut) {
    process.stdout.write(JSON.stringify(buildOnceOutput(ai, answer)));
    return;
  }

  process.stdout.write(answer);
}

function writeOnceError(
  ai: CLIAIService,
  error: unknown,
  jsonOut: boolean,
) {
  const message = error instanceof Error ? error.message : String(error);
  if (jsonOut) {
    const turnMetadata = ai.getLastTurnMetadata();
    const output: Record<string, unknown> = {
      ok: false,
      error: message,
      transport: ai.getRuntimeMode(),
      constructId: turnMetadata?.constructId || ai.getConstructId(),
      threadId: ai.getThreadId(),
    };
    if (turnMetadata?.status) output.status = turnMetadata.status;
    if (turnMetadata?.receipt) output.receipt = turnMetadata.receipt;
    if (turnMetadata?.checklist) output.checklist = turnMetadata.checklist;
    process.stdout.write(JSON.stringify(output));
    return;
  }

  process.stderr.write(message);
}

function printTurnMetadata(ai: CLIAIService) {
  const turnMetadata = ai.getLastTurnMetadata();
  if (!turnMetadata) return;

  if (ai.shouldShowReceipts() && turnMetadata.receipt) {
    const receipt = turnMetadata.receipt;
    console.log(
      colorize(
        `🧾 Receipt: route=${receipt.routeMode || 'unknown'} construct=${receipt.constructId || 'unknown'} provider=${receipt.provider || 'unknown'} model=${receipt.model || 'unknown'} persistence=${receipt.persistenceOwner || 'unknown'}`,
        'dim',
      ),
    );
  }

  if (ai.shouldShowChecklist() && turnMetadata.checklist) {
    const checklistSummary =
      turnMetadata.checklist.summary ||
      turnMetadata.checklist.responseStatus ||
      turnMetadata.checklist.overallStatus ||
      'available';
    console.log(colorize(`✅ Checklist: ${checklistSummary}`, 'dim'));
  }
}

// Main CLI execution
async function main() {

  let phiChild: ChildProcess | null = null;
  const parsedArgs = parseCliArgs(process.argv.slice(2));
  const {
    helpMode,
    useFallback,
    noTimestamp,
    localMode,
    localModel,
    onceMode,
    jsonOut,
    explicitConstructArg,
    seatOverride,
    cliRoot,
    settingsFile,
    conversationDir,
    orchestrationOutDir,
    orchestrationConstructs,
    orchestrationNoBrowser,
    orchestrationAuthTimeoutMs,
    apiUrl,
    constructId,
    threadId,
    transport,
    requestTimeoutMs,
    showReceipts,
    showChecklist,
    skipPersistence,
    positionals,
  } = parsedArgs;

  if (helpMode) {
    console.log(CLI_HELP_TEXT);
    return;
  }

  if (isCodexHandoffCommand(parsedArgs)) {
    const code = await runCliCodexHandoffCommand();
    if (code !== 0) {
      process.exitCode = code;
    }
    return;
  }

  const resolvedSettingsFile = settingsFile || getChattyCliSettingsFile();
  const settingsManager = new SettingsManager(resolvedSettingsFile);
  await settingsManager.ready();
  const settings = settingsManager.getAll();
  const runtimeMode: CliRuntimeMode =
    localMode || localModel || useFallback
      ? 'local'
      : normalizeTransportMode(transport, settings.transport) === 'local'
        ? 'local'
        : 'backend';
  const resolvedApiUrl = trimValue(apiUrl, settings.apiBaseUrl || DEFAULT_CLI_API_URL);
  const resolvedConstructId = trimValue(
    constructId,
    settings.constructId || DEFAULT_CLI_CONSTRUCT_ID,
  );
  const resolvedThreadId = resolveThreadId(
    resolvedConstructId,
    threadId ?? settings.threadId,
  );
  const resolvedRequestTimeoutMs =
    typeof requestTimeoutMs === 'number' &&
    Number.isFinite(requestTimeoutMs) &&
    requestTimeoutMs > 0
      ? requestTimeoutMs
      : settings.requestTimeoutMs;
  const resolvedOrchestrationMode = normalizeBackendOrchestrationMode(
    settings.orchestrationMode,
    'lin',
  );
  const resolvedCustomModelTarget = trimOptionalValue(
    settings.customModelTarget,
  );
  const resolvedShowReceipts = showReceipts || settings.showReceipts;
  const resolvedShowChecklist = showChecklist || settings.showChecklist;
  const resolvedSkipPersistence = skipPersistence || settings.skipPersistence;
  const resolvedCliRoot = cliRoot || settings.defaultFileOperationsPath || getChattyCliFileRoot();
  const resolvedConversationDir =
    conversationDir ||
    settings.conversationSavePath ||
    getChattyCliConversationsDir();

  if (isOrchestrationProofCommand(parsedArgs)) {
    const code = await runCliOrchestrationProofCommand({
      apiUrl: resolvedApiUrl,
      jsonOut,
      skipPersistence,
      outDir: orchestrationOutDir,
      constructs: orchestrationConstructs,
      noBrowser: orchestrationNoBrowser,
      authTimeoutMs: orchestrationAuthTimeoutMs,
    });
    if (code !== 0) {
      process.exitCode = code;
    }
    return;
  }

  let modelName = 'LLM';

  if (runtimeMode === 'local' && !localModel) {
    const host = process.env.OLLAMA_HOST || 'http://localhost';
    // Suppress logs when in JSON mode to avoid polluting stdout
    const { child, port } = await ensurePhi3({
      preferredPort: 8003,
      host,
      silent: jsonOut
    });
    phiChild = child;
    process.env.OLLAMA_PORT = String(port);
    process.env.OLLAMA_HOST = host;
    // Attempt to detect model name (best-effort)
    modelName = await detectModelName(host, port);
  }

  // If detection failed, fall back to env var or default
  if (modelName === 'LLM') {
    const envModel = runtimeMode === 'local'
      ? process.env.OLLAMA_MODEL || 'phi3:latest'
      : 'receipt-backed-backend';
    modelName = envModel;
  }

  // Remove version/tag suffix for display (e.g., "phi3:latest" -> "phi3")
  modelName = modelName.split(':')[0];

  // --- animated banner fixed-top for 6 frames -----------------------
  const banners = [
    [
      "   (       )           )    )       ",
      "   )\\   ( /(     )  ( /( ( /( (     ",
      " (((_)  )\\()) ( /(  )\\()))\\()))\\ )  ",
      " )\\___ ((_\\)  )(_))(_))/(_))/(()/(  ",
      "((/ __|| |(_)((_)_ | |_ | |_  )(_)) ",
      " | (__ | ' \\ / _` ||  _||  _|| || | ",
      "  \\___||_||_|\\__,_| \\__| \\__| \\_, | ",
      "                              |__/  "
    ].join("\n"),
    [
      "                                ",
      "   (      )         )   )      ",
      "   )\\  ( /(    ) ( /(( /((     ",
      " (((_) )\\())( /( )\\())\\())\\ )  ",
      " )\\___((_\\ )(_)|_))(_))(()/(  ",
      "((/ __| |(_|(_)_| |_| |_ )(_)) ",
      " | (__| ' \\/ _` |  _|  _| || | ",
      "  \\___|_||_\\__,_|\\__|\\__|\\_, | ",
      "                         |__/  "
    ].join("\n"),
    [
      "  .---. .-. .-.  .--.  .---.  .---..-.  .-. ",
      "/  ___}| {_} | / {} \\{_   _}{_   _}\\ \\/ / ",
      "\\     }| { } |/  /\\  \\ | |    | |   }  {  ",
      " `---' `-' `-'`-'  `-' `-'    `-'   `--'  "
    ].join("\n")
  ];

  const readlineMod = await import('readline');
  const BOX_WIDTH = 60;
  function center(s: string) {
    const pad = Math.floor((BOX_WIDTH - 2 - s.length) / 2);
    return ' '.repeat(Math.max(pad, 0)) + s;
  }

  if (!onceMode && process.stdout.isTTY) {
    await new Promise<void>((resolve) => {
      const BOX_HEIGHT = 10; // top + 8 content + bottom
      let idx = 0;
      const renderFrame = () => {
        // For frames after the first, move cursor back to the banner start
        if (idx > 0) readlineMod.moveCursor(process.stdout, 0, -BOX_HEIGHT);

        // Compose banner block
        let block = '┌' + '─'.repeat(BOX_WIDTH - 2) + '┐\n';
        // Calculate which banner, how much vertical padding, and which lines to show
        const banner = banners[idx % banners.length].split('\n');
        const padTop = Math.floor((8 - banner.length) / 2);
        const lines = banner;

        for (let i = 0; i < 8; i++) {
          const srcIdx = i - padTop;
          const content = srcIdx >= 0 && srcIdx < lines.length ? lines[srcIdx] : '';
          block += '│' + center(content).padEnd(BOX_WIDTH - 2, ' ') + '│\n';
        }
        block += '└' + '─'.repeat(BOX_WIDTH - 2) + '┘\n';
        process.stdout.write(block);
      };

      const iv = setInterval(() => {
        renderFrame();
        idx++;
        if (idx >= 6) {
          clearInterval(iv);
          resolve();
        }
      }, 400);
    });
  }

  if (!onceMode) {
    console.log(colorize(`
🧠 Chatty CLI - Terminal AI Assistant
=====================================

Welcome to Chatty! I have full AI capabilities:
  • Memory System - I remember our conversations
  • Reasoning Engine - I can solve complex problems
  • File Processing - I can analyze files
  • Context Awareness - I understand conversation flow
  • Default route - /api/vvault/message on ${resolvedApiUrl}

Type your message and press Enter to chat with me.
Use --local or --fallback when you want the local seat runtime explicitly.
Type /help to see all available commands.
`, 'cyan'));
  }

  const ai = new CLIAIService(
    useFallback,
    noTimestamp ? false : settings.showTimestamps,
    modelName,
    {
    runtimeMode,
    apiUrl: resolvedApiUrl,
    constructId: resolvedConstructId,
    threadId: resolvedThreadId,
    requestTimeoutMs: resolvedRequestTimeoutMs,
    orchestrationMode: resolvedOrchestrationMode,
    customModelTarget: resolvedCustomModelTarget,
    skipPersistence: resolvedSkipPersistence,
    showReceipts: resolvedShowReceipts,
    showChecklist: resolvedShowChecklist,
    allowInteractiveAuth: !onceMode && runtimeMode === 'backend',
    },
  );
  if (runtimeMode === 'backend') {
    if (seatOverride) {
      ai.configureBackendModelSelection('custom', seatOverride);
    } else {
      ai.configureBackendModelSelection(
        resolvedOrchestrationMode,
        resolvedCustomModelTarget,
      );
    }
  } else if (seatOverride) {
    ai.setModel(seatOverride);
  } else if (settings.defaultModel) {
    ai.setModel(settings.defaultModel);
  }

  // Initialize file operations commands
  const fileOps = new FileOpsCommands(resolvedCliRoot);
  const conversationManager = new ConversationManager(resolvedConversationDir);
  const turnTakingSystem = new TurnTakingSystem();
  const emotionalWatchdog = new EmotionalWatchdog();
  let lastConstructCatalog: CliConstructCatalogResult | null = null;

  // ---- once mode --------------------------------------------------
  if (onceMode) {
    // Handle command line arguments for once mode
    const messageArg = positionals.length > 0 ? positionals.join(' ') : '';
    if (messageArg) {
      try {
        const prompt = applyPromptEnvelope(messageArg, ai);
        const answer = await ai.processMessage(prompt);
        writeOnceResult(ai, answer, jsonOut);
      } catch (err: any) {
        writeOnceError(ai, err, jsonOut);
        process.exit(1);
      }
      return;
    }

    // Handle stdin input for once mode
    let stdinData = '';
    process.stdin.on('data', chunk => (stdinData += chunk));
    process.stdin.on('end', async () => {
      try {
        const prompt = applyPromptEnvelope(stdinData.trim(), ai);

        const answer = await ai.processMessage(prompt);
        writeOnceResult(ai, answer, jsonOut);
      } catch (err: any) {
        writeOnceError(ai, err, jsonOut);
        process.exit(1);
      }
      process.exit(0);
    });
    return; // skip interactive setup
  }

  if (runtimeMode === 'local') {
    await import('../../server/chatty-api.ts');
  }

  // --- Conversation management -------------------------------------------
  let lastSender: string | null = null;
  let lastSenderAt = 0; // epoch ms
  const messageQueue: Array<{ msg: any, priority: number, timestamp: number }> = [];
  const MAX_QUEUE_SIZE = 3;
  const PROCESSING_COOLDOWN = 5000; // 5 seconds between processing messages
  let isProcessing = false;

  // use readlineMod for CLI prompt setup

  // Use current OS username for a personalized prompt: "{username}> "
  const os = await import('os');
  const who = os.userInfo().username || process.env.USER || 'user';
  const rl = readlineMod.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: colorize(`${who}> `, 'green')
  });

  const applyConstructSelection = async (nextConstructId: string) => {
    const normalizedConstructId = trimOptionalValue(nextConstructId);
    if (!normalizedConstructId) {
      console.log(colorize('Construct ID cannot be empty.', 'red'));
      return false;
    }

    const currentConstructId = ai.getConstructId();
    if (normalizedConstructId === currentConstructId) {
      console.log(
        colorize(`Keeping current construct: ${normalizedConstructId}`, 'yellow'),
      );
      return false;
    }

    ai.setConstructId(normalizedConstructId);
    ai.setThreadId(null);
    await settingsManager.updateSettings({
      constructId: normalizedConstructId,
      threadId: '',
    });

    const constructCard =
      findConstructCard(lastConstructCatalog, normalizedConstructId);
    const displayName = constructCard?.displayName || normalizedConstructId;
    console.log(
      colorize(
        `✅ Active construct: ${displayName} (${normalizedConstructId})`,
        'green',
      ),
    );
    console.log(colorize(`   Thread reset to ${ai.getThreadId()}`, 'dim'));
    return true;
  };

  const loadConstructCatalog = async () => {
    try {
      const catalog = await cliApiClient.listConstructCatalog({
        apiUrl: resolvedApiUrl,
        allowInteractiveAuth: true,
        openBrowser: true,
        timeoutMs: resolvedRequestTimeoutMs,
      });
      lastConstructCatalog = catalog;
      return catalog;
    } catch (error: any) {
      console.log(
        colorize(`Construct catalog unavailable: ${error.message}`, 'yellow'),
      );
      return lastConstructCatalog;
    }
  };

  const openConstructPicker = async () => {
    const catalog = await loadConstructCatalog();
    const selectedConstructId = await promptForConstructSelection(
      rl,
      ai.getConstructId(),
      catalog,
    );
    if (!selectedConstructId) {
      return false;
    }
    return applyConstructSelection(selectedConstructId);
  };

  if (
    runtimeMode === 'backend' &&
    settings.showConstructPickerOnStart &&
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !explicitConstructArg
  ) {
    await openConstructPicker();
  }

  rl.prompt();

  // Queue processing function
  async function processMessageQueue() {
    if (isProcessing || messageQueue.length === 0) return;

    isProcessing = true;

    // Sort by priority (higher number = higher priority)
    messageQueue.sort((a, b) => b.priority - a.priority);

    // Process up to 2 messages at once
    const toProcess = messageQueue.splice(0, 2);

    for (const { msg } of toProcess) {
      await processExternalMessage(msg);
      // Small delay between messages to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isProcessing = false;

    // Process remaining queue after cooldown
    if (messageQueue.length > 0) {
      setTimeout(processMessageQueue, PROCESSING_COOLDOWN);
    }
  }

  // Process individual external message with turn-taking and emotional awareness
  async function processExternalMessage(msg: { sender: string; text: string; seat?: string }) {
    const now = Date.now();

    // Cool-down: block consecutive messages from same sender within 10 seconds
    if (lastSender === msg.sender.toLowerCase() && now - lastSenderAt < 10_000) {
      return; // skip to prevent flooding
    }

    // Update sender tracking
    lastSender = msg.sender.toLowerCase();
    lastSenderAt = now;

    // Analyze message with emotional watchdog
    const emotionalAnalysis = emotionalWatchdog.analyzeMessage(msg.text);

    // Check if user should be contained
    const userId = msg.sender.toLowerCase();
    if (shouldTriggerContainment(emotionalAnalysis.crisisLevel, emotionalAnalysis.emotionalWeight, userId)) {
      try {
        triggerContainment(userId, `Crisis detected: ${emotionalAnalysis.crisisLevel} - ${msg.text.substring(0, 100)}...`);
        console.log(colorize(`🚨 CONTAINMENT TRIGGERED for ${msg.sender}`, 'red'));
      } catch (error: any) {
        console.log(colorize(`Warning: Could not trigger containment: ${error.message}`, 'yellow'));
      }
    }

    // Check if user is currently contained
    if (isUserInContainment(userId)) {
      const containmentStatus = getContainmentStatus(userId);
      if (containmentStatus.isContained && containmentStatus.record) {
        const duration = formatContainmentDuration(containmentStatus.duration || 0);
        console.log(colorize(`🚫 User ${msg.sender} is in containment (${duration}) - Reason: ${containmentStatus.record.trigger_reason}`, 'red'));

        // Provide limited response for contained users
        console.log(colorize("I'm here to support you, but I need to ensure your safety first. Please reach out to a crisis helpline or trusted person.", 'yellow'));
        rl.prompt();
        return;
      }
    }

    // Process turn with turn-taking system
    const turnResult = turnTakingSystem.processTurn(msg.sender, msg.text);

    // Clear current input line so external message prints cleanly
    readlineMod.cursorTo(process.stdout, 0);
    readlineMod.clearLine(process.stdout, 0);

    // Display the incoming message with proper formatting
    console.log(colorize(turnResult.displayFormat, turnResult.speaker.color));

    // Check for crisis situation
    if (emotionalAnalysis.crisisLevel === 'critical') {
      console.log(colorize('🚨 CRISIS DETECTED - Activating emergency response protocol', 'red'));

      if (emotionalAnalysis.recommendedResponse) {
        console.log(colorize(`Emergency Response: ${emotionalAnalysis.recommendedResponse.message}`, 'red'));
        if (emotionalAnalysis.recommendedResponse.followUp.length > 0) {
          emotionalAnalysis.recommendedResponse.followUp.forEach(followUp => {
            console.log(colorize(`  • ${followUp}`, 'yellow'));
          });
        }
      }

      // Don't process further in crisis mode - focus on safety
      rl.prompt();
      return;
    }

    // Determine if Chatty should respond
    if (!turnResult.shouldRespond) {
      console.log(colorize(`[Chatty] Listening to ${turnResult.speaker.name}...`, 'dim'));
      rl.prompt();
      return;
    }

    // Handle different response modes
    let responsePrompt = msg.text;
    let responseMode = turnResult.responseMode;

    if (responseMode === 'grounding' && emotionalAnalysis.recommendedResponse) {
      // Use grounding response for emotional support
      responsePrompt = `The user is experiencing emotional distress. They said: "${msg.text}". 
      
Please respond with empathy and support. Use a gentle, caring tone. Focus on:
1. Validating their feelings
2. Offering practical support
3. Suggesting grounding techniques if appropriate
4. Encouraging them to seek professional help if needed

Be warm, understanding, and non-judgmental.`;
    } else if (responseMode === 'reflective') {
      // Use reflective response for deeper conversations
      responsePrompt = `The user is sharing something meaningful: "${msg.text}". 

Please respond thoughtfully and reflectively. Consider:
1. The emotional depth of their message
2. Any underlying themes or patterns
3. How to help them process their thoughts
4. Offering insights or perspectives that might help

Be thoughtful, wise, and supportive.`;
    }

    // Set model if specified
    if (msg.seat) ai.setModel(msg.seat);

    // Process the response
    try {
      const resp = await ai.processMessage(responsePrompt);
      console.log(resp);

      // Send reply back to external system if it's Katana
      if (turnResult.speaker.id === 'katana') {
        await sendReplyToKatana(resp, ai.getModel(), msg.sender);
      }
    } catch (error: any) {
      console.log(colorize(`Error processing response: ${error.message}`, 'red'));

      // Provide fallback response in crisis situations
      if (emotionalAnalysis.crisisLevel === 'high') {
        console.log(colorize("I'm here with you. You're not alone in this. Please reach out to someone you trust or a crisis helpline.", 'yellow'));
      }
    }

    // Restore the user prompt after processing external message
    rl.prompt();
  }

  // Send reply to Katana with retry logic
  async function sendReplyToKatana(response: string, model: string, fromSender: string): Promise<void> {
    const KATANA_ENDPOINT = process.env.KATANA_ENDPOINT || 'https://venues-favors-confidentiality-worked.trycloudflare.com/chatty';

    async function postWithRetry(payload: any, attempts = 3, delayMs = 1000): Promise<void> {
      for (let i = 0; i < attempts; i++) {
        try {
          await fetch(KATANA_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return; // success
        } catch (err) {
          if (i === attempts - 1) {
            console.error('Failed to post reply to Katana after retries:', err);
            return;
          }
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }

    await postWithRetry({
      answer: response,
      model: model,
      metadata: {
        timestamp: new Date().toISOString(),
        from: fromSender,
        emotionalState: emotionalWatchdog.getEmotionalState().current,
        turnContext: turnTakingSystem.getTurnContext().conversationFlow
      },
    });
  }

  // ---- external prompt listener ----
  chatQueue.on('prompt', async (msg: { sender: string; text: string; seat?: string }) => {
    const now = Date.now();
    const senderLower = msg.sender.toLowerCase();

    // Determine priority (higher number = higher priority)
    let priority = 1; // default for unknown entities
    if (!senderLower.includes('ai') && !senderLower.includes('bot')) priority = 5; // human users - highest priority
    else if (senderLower === 'katana') priority = 4; // Katana - high priority
    else if (['assistant', 'claude', 'gpt', 'copilot'].includes(senderLower)) priority = 3; // known AIs - medium priority

    // Check if queue is full
    if (messageQueue.length >= MAX_QUEUE_SIZE) {
      console.log(colorize(`[Chatty] Queue full! Dropping message from ${msg.sender}`, 'red'));
      return;
    }

    // Add to queue
    messageQueue.push({ msg, priority, timestamp: now });

    // Start processing if not already processing
    if (!isProcessing) {
      setTimeout(processMessageQueue, 1000); // 1 second delay before starting
    }
  });


  rl.on('line', async (input: string) => {
    const message = input.trim();

    // Slash commands handled before AI processing
    if (message.startsWith('/ts')) {
      ai.addTimestamps = !ai.addTimestamps;
      console.log(colorize(`Timestamps ${ai.addTimestamps ? 'enabled' : 'disabled'}.`, 'yellow'));
      rl.prompt();
      return;
    }

    // File operations commands
    if (message.startsWith('/file')) {
      const parts = message.split(/\s+/);
      const command = parts[1];
      const args = parts.slice(2);

      if (!command) {
        console.log(fileOps.showHelp());
        rl.prompt();
        return;
      }

      try {
        const result = await fileOps.handleCommand(command, args);
        console.log(result);
      } catch (error: any) {
        console.log(colorize(`Error: ${error.message}`, 'red'));
      }
      rl.prompt();
      return;
    }

    // existing commands
    if (message === '/construct' || message.startsWith('/construct ')) {
      const parts = message.split(/\s+/);
      const subcommand = parts[1];

      if (!subcommand) {
        await openConstructPicker();
        rl.prompt();
        return;
      }

      if (subcommand === 'list') {
        const catalog = await loadConstructCatalog();
        if (catalog && catalog.constructs.length > 0) {
          printConstructCatalog(catalog, ai.getConstructId());
        } else {
          console.log(colorize('No construct catalog available yet.', 'yellow'));
        }
        rl.prompt();
        return;
      }

      if (subcommand === 'current') {
        const constructCard = findConstructCard(
          lastConstructCatalog,
          ai.getConstructId(),
        );
        const displayName = constructCard?.displayName || ai.getConstructId();
        console.log(
          colorize(
            `🎭 Current construct: ${displayName} (${ai.getConstructId()})`,
            'cyan',
          ),
        );
        console.log(colorize(`   Thread: ${ai.getThreadId()}`, 'dim'));
        rl.prompt();
        return;
      }

      await applyConstructSelection(subcommand);
      rl.prompt();
      return;
    }

    if (message === '/model' || message.startsWith('/model ')) {
      const parts = message.split(/\s+/);
      if (ai.getRuntimeMode() === 'backend') {
        if (parts.length === 1) {
          console.log(
            colorize(
              `Backend orchestration: ${describeBackendModelSelection(
                ai.getOrchestrationMode(),
                ai.getCustomModelTarget(),
              )}`,
              'cyan',
            ),
          );
          rl.prompt();
          return;
        }

        if (parts[1] === 'list') {
          console.log(
            colorize(
              'Backend mode does not use local Ollama model listing. Use /model lin or /model <provider:model>.',
              'yellow',
            ),
          );
          rl.prompt();
          return;
        }

        if (parts[1] === 'lin') {
          ai.configureBackendModelSelection('lin', '');
          await settingsManager.updateSettings({
            orchestrationMode: 'lin',
            customModelTarget: '',
          });
          console.log(colorize('✅ Backend orchestration set to Lin mode.', 'green'));
          rl.prompt();
          return;
        }

        const customTarget =
          parts[1] === 'custom'
            ? trimOptionalValue(parts.slice(2).join(' '))
            : trimOptionalValue(parts.slice(1).join(' '));

        if (!customTarget) {
          console.log(
            colorize(
              'Usage: /model lin | /model <provider:model> | /model custom <provider:model>',
              'yellow',
            ),
          );
          rl.prompt();
          return;
        }

        if (isBackendLocalOnlyAlias(customTarget)) {
          console.log(
            colorize(
              `‘${customTarget}’ is a local seat alias. In backend mode use /model lin or a provider:model override.`,
              'yellow',
            ),
          );
          rl.prompt();
          return;
        }

        ai.configureBackendModelSelection('custom', customTarget);
        await settingsManager.updateSettings({
          orchestrationMode: 'custom',
          customModelTarget: customTarget,
        });
        console.log(
          colorize(
            `✅ Backend orchestration set to custom override: ${customTarget}`,
            'green',
          ),
        );
        rl.prompt();
        return;
      }

      if (parts.length === 1) {
        console.log(colorize(`Active model: ${ai.getModel()}`, 'cyan'));
        rl.prompt();
        return;
      }
      if (parts[1] === 'list') {
        const child = spawn('ollama', ['list'], { stdio: 'inherit' });
        child.on('exit', () => rl.prompt());
        return;
      }
      if (parts[1] === 'synth') {
        ai.setModel('synth');
        console.log(colorize('🧠 Synth mode enabled.', 'yellow'));
        rl.prompt();
        return;
      }
      // otherwise treat as model name
      ai.setModel(parts[1]);
      console.log(colorize(`✅ Switched to model: ${parts[1]}`, 'green'));
      rl.prompt();
      return;
    }

    // Persona commands
    if (message === '/personas') {
      const personas = ai.optimizedZen.getAvailablePersonas();
      console.log(colorize('🎭 Available LLM Personas:', 'cyan'));
      personas.forEach(persona => {
        const current = ai.optimizedZen.getCurrentPersona().id === persona.id ? '极客 (current)' : '';
        console.log(colorize(`  • ${persona.id} - ${persona.name}${current}`, 'white'));
        console.log(colorize(`    ${persona.description}`, 'gray'));
      });
      rl.prompt();
      return;
    }

    if (message.startsWith('/persona ')) {
      const parts = message.split(/\s+/);
      if (parts.length < 2) {
        console.log(colorize('Usage: /persona <name> (e.g., /persona copilot)', 'yellow'));
        rl.prompt();
        return;
      }

      const personaId = parts[1];
      const success = ai.optimizedZen.setPersona(personaId);
      if (success) {
        const persona = ai.optimizedZen.getCurrentPersona();
        console.log(colorize(`🎭 Switched to ${persona.name} persona`, 'green'));
        console.log(colorize(`   ${persona.description}`, 'gray'));
      } else {
        console.log(colorize(`❌ Persona '${personaId}' not found. Use /personas to see available options.`, 'red'));
      }
      rl.prompt();
      return;
    }

    if (message === '/models') {
      if (ai.getRuntimeMode() === 'backend') {
        console.log(
          colorize(
            'Backend mode delegates to the current canonical /api/vvault/message route. Use /receipt to inspect the last selected provider/model.',
            'yellow',
          ),
        );
        rl.prompt();
        return;
      }

      if (ai.getModel() === 'zen') {
        try {
          const cfg = await loadSeatConfig();
          const codingModel = (cfg.coding as any)?.tag ?? (cfg.coding as any) ?? 'qwen2.5-coder:latest';
          const creativeModel = (cfg.creative as any)?.tag ?? (cfg.creative as any) ?? 'mistral';
          const smalltalkModel = (cfg.smalltalk as any)?.tag ?? (cfg.smalltalk as any) ?? 'phi3';

          console.log(colorize(`🧠 Current Zen Pipeline Models:\n  • Coding: ${codingModel}\n  • Creative: ${creativeModel}\n  • Smalltalk: ${smalltalkModel}`, 'cyan'));
        } catch (error) {
          console.log(colorize('🧠 Zen mode active, but could not load model configuration', 'yellow'));
        }
      } else {
        console.log(colorize(`Current mode: ${ai.getModel()} (not zen mode)`, 'yellow'));
      }
      rl.prompt();
      return;
    }

    if (message === '/memory') {
      if (ai.core && ai.core.getMemoryStore() && typeof (ai.core.getMemoryStore() as any).getStats === 'function') {
        const stats = (ai.core.getMemoryStore() as any).getStats('cli');
        console.log(colorize(`🧠 Persistent Memory (SQLite):\n  • Messages: ${stats.messageCount}\n  • Triples: ${stats.tripleCount}\n  • Persona keys: ${stats.personaKeys}`, 'cyan'));
      } else {
        console.log(colorize('🧠 Memory: In-memory only (not persistent)', 'yellow'));
      }
      rl.prompt();
      return;
    }

    if (message === '/status') {
      const ctx: any = ai.getContext();
      const memoryCount = ctx.history.length;

      let memoryInfo = `Messages in history: ${memoryCount}`;
      if (ai.core && ai.core.getMemoryStore() && typeof (ai.core.getMemoryStore() as any).getStats === 'function') {
        const stats = (ai.core.getMemoryStore() as any).getStats('cli');
        memoryInfo = `Persistent SQLite Memory:\n  • Messages: ${stats.messageCount}\n  • Triples: ${stats.tripleCount}\n  • Persona keys: ${stats.personaKeys}`;
      }

      const runtimeDetails =
        ai.getRuntimeMode() === 'backend'
          ? `\n  • Orchestration: ${ai.getOrchestrationMode()}\n  • Custom override: ${ai.getCustomModelTarget() || 'none'}`
          : '';

      console.log(colorize(`🩺 Status Report:\n  • ${memoryInfo}\n  • Active model: ${ai.getModelStatusLabel()}\n  • Runtime mode: ${ai.getRuntimeMode()}\n  • Construct: ${ai.getConstructId()}\n  • Thread: ${ai.getThreadId()}\n  • API: ${ai.getApiUrl()}${runtimeDetails}`, 'cyan'));
      rl.prompt();
      return;
    }

    if (message === '/receipt') {
      const turnMetadata = ai.getLastTurnMetadata();
      if (!turnMetadata) {
        console.log(colorize('No runtime receipt available yet.', 'yellow'));
        rl.prompt();
        return;
      }

      console.log(colorize('🧾 Last Runtime Turn:', 'cyan'));
      console.log(
        JSON.stringify(
          {
            transport: turnMetadata.transport,
            constructId: turnMetadata.constructId,
            status: turnMetadata.status,
            success: turnMetadata.success,
            error: turnMetadata.error,
            receipt: turnMetadata.receipt,
            checklist: turnMetadata.checklist,
          },
          null,
          2,
        ),
      );
      rl.prompt();
      return;
    }

    if (message === '/performance') {
      const metrics = ai.optimizedZen?.getMetrics();
      const memoryHealth = ai.memoryManager?.getMemoryHealth();

      if (metrics) {
        console.log(colorize(`⚡ Performance Metrics:\n  • Last processing time: ${metrics.processingTime}ms\n  • Context length: ${metrics.contextLength} chars\n  • History length: ${metrics.historyLength} messages\n  • Fallback used: ${metrics.fallbackUsed ? 'Yes' : 'No'}\n  • Memory pruned: ${metrics.memoryPruned ? 'Yes' : 'No'}`, 'cyan'));
      }

      if (memoryHealth) {
        const statusColor = memoryHealth.status === 'healthy' ? 'green' : memoryHealth.status === 'warning' ? 'yellow' : 'red';
        console.log(colorize(`🧠 Memory Health: ${memoryHealth.status.toUpperCase()}`, statusColor));
        if (memoryHealth.issues.length > 0) {
          console.log(colorize(`  Issues: ${memoryHealth.issues.join(', ')}`, 'yellow'));
        }
        if (memoryHealth.recommendations.length > 0) {
          console.log(colorize(`  Recommendations: ${memoryHealth.recommendations.join(', ')}`, 'blue'));
        }
      }

      rl.prompt();
      return;
    }

    // Settings command
    if (message === '/settings') {
      console.log(colorize('⚙️  Current Settings:', 'cyan'));
      console.log(settingsManager.getFormattedSettings());
      rl.prompt();
      return;
    }

    // Set setting command
    if (message.startsWith('/set')) {
      const parts = message.split(/\s+/);
      const key = parts[1];
      const value = parts[2];

      if (!key || value === undefined) {
        console.log(colorize('Usage: /set <setting_key> <value>', 'yellow'));
        console.log(colorize('Use /settings to see all available settings', 'yellow'));
        rl.prompt();
        return;
      }

      try {
        // Parse value based on type
        let parsedValue: any = value;

        // Try to parse as boolean
        if (value.toLowerCase() === 'true') parsedValue = true;
        else if (value.toLowerCase() === 'false') parsedValue = false;
        // Try to parse as number
        else if (!isNaN(Number(value))) parsedValue = Number(value);

        // Validate setting
        if (!settingsManager.validateSetting(key as any, parsedValue)) {
          console.log(colorize(`Invalid value for setting '${key}': ${value}`, 'red'));
          rl.prompt();
          return;
        }

        if (key === 'constructId' && typeof parsedValue === 'string') {
          await settingsManager.updateSettings({
            constructId: parsedValue,
            threadId: '',
          });
          ai.setConstructId(parsedValue);
          ai.setThreadId(null);
        } else if (key === 'threadId') {
          await settingsManager.set(key as any, parsedValue);
          ai.setThreadId(typeof parsedValue === 'string' ? parsedValue : null);
        } else if (key === 'orchestrationMode') {
          await settingsManager.set(key as any, parsedValue);
          ai.setOrchestrationMode(parsedValue as CliBackendOrchestrationMode);
        } else if (key === 'customModelTarget') {
          await settingsManager.set(key as any, parsedValue);
          ai.setCustomModelTarget(typeof parsedValue === 'string' ? parsedValue : '');
        } else if (key === 'showReceipts') {
          await settingsManager.set(key as any, parsedValue);
          ai.setShowReceipts(Boolean(parsedValue));
        } else if (key === 'showChecklist') {
          await settingsManager.set(key as any, parsedValue);
          ai.setShowChecklist(Boolean(parsedValue));
        } else if (key === 'skipPersistence') {
          await settingsManager.set(key as any, parsedValue);
          ai.setSkipPersistence(Boolean(parsedValue));
        } else {
          await settingsManager.set(key as any, parsedValue);
        }
        console.log(colorize(`✅ Setting '${key}' updated to: ${parsedValue}`, 'green'));
        if (
          key === 'transport' ||
          key === 'apiBaseUrl' ||
          key === 'requestTimeoutMs' ||
          key === 'defaultFileOperationsPath' ||
          key === 'conversationSavePath'
        ) {
          console.log(colorize('Restart Chatty CLI to apply that setting to this session.', 'yellow'));
        }
      } catch (error: any) {
        console.log(colorize(`Error updating setting: ${error.message}`, 'red'));
      }

      rl.prompt();
      return;
    }

    // Reset settings command
    if (message === '/reset-settings') {
      try {
        await settingsManager.resetToDefaults();
        const defaults = settingsManager.getAll();
        ai.setConstructId(defaults.constructId);
        ai.setThreadId(defaults.threadId);
        ai.setOrchestrationMode(defaults.orchestrationMode);
        ai.setCustomModelTarget(defaults.customModelTarget);
        ai.setShowReceipts(defaults.showReceipts);
        ai.setShowChecklist(defaults.showChecklist);
        ai.setSkipPersistence(defaults.skipPersistence);
        console.log(colorize('🔄 Settings reset to defaults', 'green'));
        console.log(colorize('Restart Chatty CLI to fully apply transport/path changes.', 'yellow'));
      } catch (error: any) {
        console.log(colorize(`Error resetting settings: ${error.message}`, 'red'));
      }

      rl.prompt();
      return;
    }

    // Emotional state command
    if (message === '/emotional-state') {
      const emotionalState = emotionalWatchdog.getEmotionalState();
      const turnContext = turnTakingSystem.getTurnContext();

      console.log(colorize('🧠 Emotional & Turn-Taking Status:', 'cyan'));
      console.log(colorize(`  Emotional State: ${emotionalState.current} (${emotionalState.trend})`,
        emotionalState.current === 'crisis' ? 'red' :
          emotionalState.current === 'overwhelmed' ? 'yellow' : 'green'));
      console.log(colorize(`  Conversation Flow: ${turnContext.conversationFlow}`, 'cyan'));
      console.log(colorize(`  Response Mode: ${turnContext.responseMode}`, 'cyan'));
      console.log(colorize(`  Current Speaker: ${turnContext.currentSpeaker?.name || 'none'}`, 'cyan'));
      console.log(colorize(`  Triggers: ${emotionalState.triggers.join(', ') || 'none'}`, 'cyan'));

      if (emotionalWatchdog.isInCrisisMode()) {
        console.log(colorize('  ⚠️  CRISIS MODE ACTIVE', 'red'));
        const suggestions = emotionalWatchdog.getCrisisRecoverySuggestions();
        if (suggestions.length > 0) {
          console.log(colorize('  Recovery Suggestions:', 'yellow'));
          suggestions.forEach(suggestion => {
            console.log(colorize(`    • ${suggestion}`, 'yellow'));
          });
        }
      }

      rl.prompt();
      return;
    }

    // Speaker stats command
    if (message === '/speakers') {
      const speakerStats = turnTakingSystem.getSpeakerStats();

      console.log(colorize('👥 Active Speakers:', 'cyan'));
      if (speakerStats.length === 0) {
        console.log(colorize('  No active speakers', 'dim'));
      } else {
        speakerStats.forEach(stat => {
          const color = stat.speaker.type === 'human' ? 'green' :
            stat.speaker.type === 'ai' ? 'blue' : 'yellow';
          console.log(colorize(`  ${stat.speaker.name} (${stat.speaker.type})`, color));
          console.log(colorize(`    Messages: ${stat.messageCount} | Last: ${stat.lastMessage}`, 'dim'));
        });
      }

      rl.prompt();
      return;
    }

    // Crisis recovery command
    if (message === '/crisis-recovery') {
      if (emotionalWatchdog.isInCrisisMode()) {
        console.log(colorize('🆘 Crisis Recovery Mode Activated', 'red'));

        const strategies = turnTakingSystem.getGroundingStrategies();
        console.log(colorize('Grounding Strategies:', 'yellow'));
        strategies.forEach((strategy, index) => {
          console.log(colorize(`  ${index + 1}. ${strategy}`, 'yellow'));
        });

        // Reset emotional state
        emotionalWatchdog.resetEmotionalState();
        turnTakingSystem.resetTurnContext();

        console.log(colorize('✅ Emotional state reset to stable', 'green'));
      } else {
        console.log(colorize('ℹ️  System is not in crisis mode', 'cyan'));
      }

      rl.prompt();
      return;
    }

    // Containment status command
    if (message === '/containment') {
      const stats = getContainmentStats();
      const activeContainments = getAllActiveContainments();

      console.log(colorize('🚨 Containment Status:', 'cyan'));
      console.log(colorize(`  Total Containments: ${stats.totalContainments}`, 'white'));
      console.log(colorize(`  Active: ${stats.activeContainments}`, 'red'));
      console.log(colorize(`  Resolved: ${stats.resolvedContainments}`, 'green'));
      console.log(colorize(`  Average Duration: ${formatContainmentDuration(stats.averageDuration)}`, 'cyan'));

      if (activeContainments.length > 0) {
        console.log(colorize('\n  Active Containments:', 'red'));
        activeContainments.forEach(containment => {
          const duration = formatContainmentDuration(Date.now() - new Date(containment.triggered_at).getTime());
          console.log(colorize(`    ${containment.user_id}: ${duration} - ${containment.trigger_reason}`, 'yellow'));
        });
      }

      rl.prompt();
      return;
    }

    // Check specific user containment
    if (message.startsWith('/containment-check')) {
      const parts = message.split(/\s+/);
      const userId = parts[1];

      if (!userId) {
        console.log(colorize('Usage: /containment-check <user_id>', 'yellow'));
        rl.prompt();
        return;
      }

      const status = getContainmentStatus(userId);
      if (status.isContained && status.record) {
        const duration = formatContainmentDuration(status.duration || 0);
        console.log(colorize(`🚫 User ${userId} is in containment:`, 'red'));
        console.log(colorize(`  Duration: ${duration}`, 'yellow'));
        console.log(colorize(`  Reason: ${status.record.trigger_reason}`, 'yellow'));
        console.log(colorize(`  Triggered: ${status.record.triggered_at}`, 'yellow'));
      } else {
        console.log(colorize(`✅ User ${userId} is not in containment`, 'green'));
      }

      rl.prompt();
      return;
    }

    // Resolve containment command
    if (message.startsWith('/containment-resolve')) {
      const parts = message.split(/\s+/);
      const userId = parts[1];

      if (!userId) {
        console.log(colorize('Usage: /containment-resolve <user_id>', 'yellow'));
        rl.prompt();
        return;
      }

      try {
        resolveContainment(userId);
        console.log(colorize(`✅ Containment resolved for user ${userId}`, 'green'));
      } catch (error: any) {
        console.log(colorize(`Error resolving containment: ${error.message}`, 'red'));
      }

      rl.prompt();
      return;
    }

    // Containment history command
    if (message.startsWith('/containment-history')) {
      const parts = message.split(/\s+/);
      const userId = parts[1];
      const limit = parseInt(parts[2]) || 5;

      if (!userId) {
        console.log(colorize('Usage: /containment-history <user_id> [limit]', 'yellow'));
        rl.prompt();
        return;
      }

      const history = getContainmentHistory(userId, limit);
      if (history.length === 0) {
        console.log(colorize(`No containment history found for user ${userId}`, 'cyan'));
      } else {
        console.log(colorize(`📋 Containment History for ${userId}:`, 'cyan'));
        history.forEach((record, index) => {
          const status = record.active ? 'ACTIVE' : 'RESOLVED';
          const statusColor = record.active ? 'red' : 'green';
          const duration = record.resolved_at ?
            formatContainmentDuration(new Date(record.resolved_at).getTime() - new Date(record.triggered_at).getTime()) :
            formatContainmentDuration(Date.now() - new Date(record.triggered_at).getTime());

          console.log(colorize(`  ${index + 1}. [${status}] ${duration}`, statusColor));
          console.log(colorize(`     Reason: ${record.trigger_reason}`, 'yellow'));
          console.log(colorize(`     Triggered: ${record.triggered_at}`, 'dim'));
          if (record.resolved_at) {
            console.log(colorize(`     Resolved: ${record.resolved_at}`, 'dim'));
          }
          console.log('');
        });
      }

      rl.prompt();
      return;
    }

    // Save conversation command
    if (message.startsWith('/save')) {
      const parts = message.split(/\s+/);
      const filename = parts[1];

      if (!filename) {
        console.log(colorize('Usage: /save <filename> [title] [description]', 'yellow'));
        rl.prompt();
        return;
      }

      try {
        const title = parts[2] || `Conversation ${new Date().toLocaleDateString()}`;
        const description = parts.slice(3).join(' ') || 'Saved conversation from Chatty CLI';

        const conversationId = await conversationManager.saveConversation(
          ai.getConversationHistory(),
          {
            title,
            description,
            model: ai.getModel()
          }
        );

        console.log(colorize(`💾 Conversation saved successfully!`, 'green'));
        console.log(colorize(`   ID: ${conversationId}`, 'cyan'));
        console.log(colorize(`   Title: ${title}`, 'cyan'));
        console.log(colorize(`   Messages: ${ai.getConversationHistory().length}`, 'cyan'));
      } catch (error: any) {
        console.log(colorize(`Error saving conversation: ${error.message}`, 'red'));
      }

      rl.prompt();
      return;
    }

    // Load conversation command
    if (message.startsWith('/load')) {
      const parts = message.split(/\s+/);
      const identifier = parts[1];

      if (!identifier) {
        console.log(colorize('Usage: /load <conversation_id_or_filename>', 'yellow'));
        console.log(colorize('Use /list to see available conversations', 'yellow'));
        rl.prompt();
        return;
      }

      try {
        const conversation = await conversationManager.loadConversation(identifier);

        // Clear current conversation
        ai.clearHistory();

        // Load conversation messages
        for (const msg of conversation.messages) {
          ai.getConversationHistory().push({
            text: msg.text,
            timestamp: msg.timestamp
          });
        }

        console.log(colorize(`📂 Conversation loaded successfully!`, 'green'));
        console.log(colorize(`   Title: ${conversation.title}`, 'cyan'));
        console.log(colorize(`   Messages: ${conversation.messages.length}`, 'cyan'));
        console.log(colorize(`   Model: ${conversation.metadata.model}`, 'cyan'));
        console.log(colorize(`   Created: ${conversation.createdAt}`, 'cyan'));

        // Switch to the model used in the conversation if different
        if (conversation.metadata.model !== ai.getModel()) {
          ai.setModel(conversation.metadata.model);
          console.log(colorize(`   Switched to model: ${conversation.metadata.model}`, 'yellow'));
        }
      } catch (error: any) {
        console.log(colorize(`Error loading conversation: ${error.message}`, 'red'));
      }

      rl.prompt();
      return;
    }

    // List conversations command
    if (message === '/list') {
      try {
        const conversations = await conversationManager.listConversations();

        if (conversations.length === 0) {
          console.log(colorize('📂 No saved conversations found.', 'yellow'));
        } else {
          console.log(colorize(`📂 Saved Conversations (${conversations.length}):`, 'cyan'));
          console.log('');

          for (const conv of conversations.slice(0, 10)) { // Show first 10
            const date = new Date(conv.lastModified).toLocaleDateString();
            console.log(colorize(`  ${conv.id}`, 'green'));
            console.log(colorize(`    Title: ${conv.title}`, 'white'));
            console.log(colorize(`    Messages: ${conv.metadata.messageCount} | Model: ${conv.metadata.model} | Date: ${date}`, 'dim'));
            if (conv.description) {
              console.log(colorize(`    Description: ${conv.description}`, 'dim'));
            }
            console.log('');
          }

          if (conversations.length > 10) {
            console.log(colorize(`  ... and ${conversations.length - 10} more conversations`, 'dim'));
          }
        }
      } catch (error: any) {
        console.log(colorize(`Error listing conversations: ${error.message}`, 'red'));
      }

      rl.prompt();
      return;
    }

    // Delete conversation command
    if (message.startsWith('/delete')) {
      const parts = message.split(/\s+/);
      const identifier = parts[1];

      if (!identifier) {
        console.log(colorize('Usage: /delete <conversation_id_or_filename>', 'yellow'));
        rl.prompt();
        return;
      }

      try {
        await conversationManager.deleteConversation(identifier);
        console.log(colorize(`🗑️  Conversation deleted successfully!`, 'green'));
      } catch (error: any) {
        console.log(colorize(`Error deleting conversation: ${error.message}`, 'red'));
      }

      rl.prompt();
      return;
    }

    // Export conversation command
    if (message.startsWith('/export')) {
      const parts = message.split(/\s+/);
      const identifier = parts[1];
      const format = parts[2] || 'json';

      if (!identifier) {
        console.log(colorize('Usage: /export <conversation_id> [format]', 'yellow'));
        console.log(colorize('Formats: json, txt, md', 'yellow'));
        rl.prompt();
        return;
      }

      try {
        const content = await conversationManager.exportConversation(identifier, format as any);
        const filename = `${identifier}.${format}`;

        // Write to current directory
        const fs = await import('node:fs');
        await fs.promises.writeFile(filename, content);

        console.log(colorize(`📤 Conversation exported successfully!`, 'green'));
        console.log(colorize(`   File: ${filename}`, 'cyan'));
        console.log(colorize(`   Format: ${format}`, 'cyan'));
      } catch (error: any) {
        console.log(colorize(`Error exporting conversation: ${error.message}`, 'red'));
      }

      rl.prompt();
      return;
    }

    if (message === '/exit') {
      console.log(colorize('👋 Goodbye! Thanks for using Chatty CLI!', 'yellow'));
      rl.close();
      return;
    }

    if (message === '/help') {
      console.log(colorize(`I'm Chatty Advanced CLI with these capabilities:

🧠 AI Features:
  • Memory System - I remember our conversations
  • Reasoning Engine - I can solve complex problems step by step
  • File Processing - I can analyze and process files
  • Context Awareness - I understand conversation context
  • Multi-Model Synthesis - I combine insights from specialized AI models

💻 Commands:
  /help        - Show this help
  /clear       - Clear conversation history
  /memory      - Show memory status
  /receipt     - Show the last runtime receipt/checklist
  /construct   - Open the construct picker
  /construct list - List available constructs
  /construct current - Show the active construct
  /construct <id> - Switch constructs and reset to the canonical thread
  /settings    - Show current settings
  /set <key> <value> - Update a setting
  /reset-settings - Reset settings to defaults
  /status      - Show runtime status
  /performance - Show performance metrics and memory health
  /emotional-state - Show emotional and turn-taking status
  /speakers    - Show active speakers and their stats
  /crisis-recovery - Activate crisis recovery mode
  /containment - Show containment status and statistics
  /containment-check <user> - Check if user is in containment
  /containment-resolve <user> - Resolve user containment
  /containment-history <user> - Show user's containment history
  /model       - Show current model or backend orchestration mode
  /model list  - List installed Ollama models (local mode only)
  /model lin   - Use Lin-first backend orchestration
  /model <provider:model> - Use a backend custom model override
  /model custom <provider:model> - Explicit backend custom override
  /models      - Show specific models in synth pipeline
  /persona <name> - Switch to a specific LLM persona (copilot, gemini, grok, claude, chatgpt)
  /personas - List all available personas
  /file        - File operations (cd, ls, cp, mv, ln, grep, find, etc.)
  /save <name> - Save current conversation
  /load <id>   - Load saved conversation
  /list        - List all saved conversations
  /delete <id> - Delete saved conversation
  /export <id> - Export conversation (json, txt, md)
  /exit        - Exit Chatty

🎯 Just type your message to chat!`, 'cyan'));
      rl.prompt();
      return;
    }

    if (message === '/clear') {
      ai.clearHistory();
      console.log(colorize('🧹 Conversation history cleared.', 'green'));
      rl.prompt();
      return;
    }

    if (message === '') {
      rl.prompt();
      return;
    }

    console.log(colorize('🤔 Processing...', 'blue'));

    try {
      const response = await ai.processMessage(message);
      console.log(response);
      printTurnMetadata(ai);
    } catch (error: any) {
      console.error(colorize(`Error: ${error?.message || error}`, 'red'));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    if (phiChild) phiChild.kill('SIGTERM');
    console.log(colorize('👋 Goodbye! Thanks for using Chatty CLI!', 'yellow'));
    process.exit(0);
  });

  process.on('SIGINT', () => {
    if (phiChild) phiChild.kill('SIGTERM');
    process.exit(0);
  });
}

// Run the CLI
export default main;

// Re-export for external integrations
export { CLIAIService, ensurePhi3, isCodexHandoffCommand, isOrchestrationProofCommand, parseCliArgs };

// ---- Execute when run directly -------------------------------------------
const directEntry = path.resolve(process.argv[1] || '');
const cliEntry = path.join(CHATTY_CLI_REPO_ROOT, 'src', 'cli', 'chatty-cli.ts');

if (directEntry === cliEntry) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}
