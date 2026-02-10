#!/usr/bin/env node
// CLI entry point for Chatty
import { spawn, ChildProcess } from 'child_process';
import { runSeat, loadSeatConfig } from '../engine/seatRunner.js';
import http from 'node:http';
import https from 'node:https';
import { ConversationCore } from '../engine/ConversationCore.js';
import { PersistentMemoryStore } from '../engine/memory/PersistentMemoryStore.js';
import { chatQueue } from '../../server/chat_queue.js';
import '../../server/chatty-api.ts';
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

  constructor(useFallback = false, addTimestamps = true, modelName = 'AI') {
    this.addTimestamps = addTimestamps;
    this.modelName = modelName;
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

    // Trim history if too long
    if (this.conversationHistory.length > this.context.settings.maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-this.context.settings.maxHistory);
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
  /model       - Show current model (or Synthesizer)
  /model list  - List installed Ollama models
  /model <tag> - Switch to single-model mode (e.g., deepseek)
  /model synth - Enable multi-model blending mode
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
    return { history: this.conversationHistory, ...this.context };
  }

  getConversationHistory() {
    return this.conversationHistory;
  }

  getModel() {
    return this.currentModel;
  }

  setModel(name: string) {
    this.currentModel = name;
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

// Main CLI execution
async function main() {

  let phiChild: ChildProcess | null = null;
  const args = process.argv.slice(2);
  const useFallback = args.includes('--fallback');
  const noTimestamp = args.includes('--no-timestamp');
  const localModel = args.includes('--local-model');
  const onceMode = args.includes('--once');
  const jsonOut = args.includes('--json');
  const seatArgIndex = args.indexOf('--seat');
  const seatOverride = seatArgIndex !== -1 ? args[seatArgIndex + 1] : undefined;
  let modelName = 'LLM';

  if (!localModel) {
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
    const envModel = process.env.OLLAMA_MODEL || 'phi3:latest';
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

  if (!onceMode) {
    console.log(colorize(`
🧠 Chatty CLI - Terminal AI Assistant
=====================================

Welcome to Chatty! I have full AI capabilities:
  • Memory System - I remember our conversations
  • Reasoning Engine - I can solve complex problems
  • File Processing - I can analyze files
  • Context Awareness - I understand conversation flow

Type your message and press Enter to chat with me.
Type /help to see all available commands.
`, 'cyan'));
  }

  const ai = new CLIAIService(useFallback, !noTimestamp, modelName);
  if (seatOverride) ai.setModel(seatOverride);

  // Initialize file operations commands
  const fileOps = new FileOpsCommands();
  const conversationManager = new ConversationManager();
  const settingsManager = new SettingsManager();
  const turnTakingSystem = new TurnTakingSystem();
  const emotionalWatchdog = new EmotionalWatchdog();

  // ---- once mode --------------------------------------------------
  if (onceMode) {
    // Handle command line arguments for once mode
    const messageArg = args.find(arg => !arg.startsWith('--'));
    if (messageArg) {
      try {
        let prompt = messageArg;
        if (prompt.startsWith('{')) {
          const obj = JSON.parse(prompt);
          prompt = obj.prompt ?? '';
          if (obj.seat) ai.setModel(obj.seat);
        }


        const answer = await ai.processMessage(prompt);
        const out = jsonOut ? { answer, model: ai.getModel() } : answer;
        process.stdout.write(JSON.stringify(out));
      } catch (err: any) {
        process.stderr.write(String(err));
        process.exit(1);
      }
      return;
    }

    // Handle stdin input for once mode
    let stdinData = '';
    process.stdin.on('data', chunk => (stdinData += chunk));
    process.stdin.on('end', async () => {
      try {
        let prompt = stdinData.trim();
        if (prompt.startsWith('{')) {
          const obj = JSON.parse(prompt);
          prompt = obj.prompt ?? '';
          if (obj.seat) ai.setModel(obj.seat);
        }

        const answer = await ai.processMessage(prompt);
        const out = jsonOut ? { answer, model: ai.getModel() } : answer;
        process.stdout.write(JSON.stringify(out));
      } catch (err: any) {
        process.stderr.write(String(err));
        process.exit(1);
      }
      process.exit(0);
    });
    return; // skip interactive setup
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
    if (message === '/model' || message.startsWith('/model ')) {
      const parts = message.split(/\s+/);
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
      if (ai.getModel() === 'zen') {
        try {
          const cfg = await loadSeatConfig();
          const codingModel = (cfg.coding as any)?.tag ?? (cfg.coding as any) ?? 'deepseek-coder';
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

      console.log(colorize(`🩺 Status Report:\n  • ${memoryInfo}\n  • Active model: ${ai.getModel()}`, 'cyan'));
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

        await settingsManager.set(key as any, parsedValue);
        console.log(colorize(`✅ Setting '${key}' updated to: ${parsedValue}`, 'green'));
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
        console.log(colorize('🔄 Settings reset to defaults', 'green'));
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
  /model       - Show current model (or Synthesizer)
  /model list  - List installed Ollama models
  /model <tag> - Switch to single-model mode (e.g., deepseek)
  /model synth - Enable multi-model blending mode
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
export { CLIAIService, ensurePhi3 };

// ---- Execute when run directly -------------------------------------------
// Support both CommonJS (require.main) and ES module (import.meta.url) entry.
const isDirectCJS = typeof require !== 'undefined' && require.main === module;
const isDirectESM = typeof import.meta !== 'undefined' && import.meta.url === (typeof process !== 'undefined' ? `file://${process.argv[1]}` : '');

if (isDirectCJS || isDirectESM) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}
