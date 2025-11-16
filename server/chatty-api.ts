import express, { Request, Response } from 'express';
import path from 'node:path';
import { chatQueue } from './chat_queue.js';
import { runSeat, loadSeatConfig } from '../src/engine/seatRunner.js';
import { getTimeContext, getTimePromptContext, getTimeGreeting } from './services/awarenessService.js';

const PORT = 5060;

// Create Express app
const app = express();

// Middleware
app.use(express.json({ limit: '2mb' }));

// In-memory log of recent traffic for diagnostics
const MESSAGE_HISTORY: Array<{ dir: 'in' | 'out'; payload: any; ts: string }> = [];
const MAX_HISTORY = 100;

// Traffic logging function
function logTraffic(dir: 'in' | 'out', payload: any) {
  MESSAGE_HISTORY.push({ dir, payload, ts: new Date().toISOString() });
  if (MESSAGE_HISTORY.length > MAX_HISTORY) {
    MESSAGE_HISTORY.shift();
  }
}

// Helper function to detect simple greetings
const isSimpleGreeting = (message: string): boolean => {
  const greetingPatterns = [
    /^(hello|hi|hey|yo|good morning|good afternoon|good evening)$/i,
    /^(what's up|howdy|greetings)$/i,
    /^(sup|wassup)$/i
  ]
  
  const trimmedMessage = message.trim().toLowerCase()
  return greetingPatterns.some(pattern => pattern.test(trimmedMessage))
}

const isConversationalSmalltalk = (message: string): boolean => {
  const trimmed = message.trim().toLowerCase();
  if (!trimmed) return false;

  if (/(bug|error|fix|code|function|api|stack trace|exception|deploy|database|build|script)/i.test(trimmed)) {
    return false;
  }

  const patterns = [
    /how (are|r) (you|ya)/i,
    /how['’]s it going/i,
    /what['’]s up/i,
    /how are things/i,
    /how are you feeling/i,
    /how do you feel/i,
    /how's your (day|morning|afternoon|evening)/i,
    /what are you up to/i,
    /how['’]s everything/i
  ];

  if (patterns.some(pattern => pattern.test(trimmed))) {
    return true;
  }

  const wordCount = trimmed.split(/\s+/).length;
  const hasPronoun = /\b(you|your)\b/.test(trimmed);
  const hasSentimentVerb = /\b(feel|doing|feeling|going)\b/.test(trimmed);

  return wordCount <= 24 && hasPronoun && hasSentimentVerb;
};

// Apply foundational calibration to override LLM safety/tone normalizers
const formatUiContext = (uiContext: any): string => {
  if (!uiContext || typeof uiContext !== 'object') {
    return '';
  }

  const lines: string[] = [];
  if (typeof uiContext.route === 'string') {
    lines.push(`- Route: ${uiContext.route}`);
  }
  if (typeof uiContext.activePanel === 'string') {
    lines.push(`- Active panel: ${uiContext.activePanel}`);
  }
  if (uiContext.sidebar && typeof uiContext.sidebar === 'object' && 'collapsed' in uiContext.sidebar) {
    lines.push(`- Sidebar is ${uiContext.sidebar.collapsed ? 'collapsed' : 'expanded'}`);
  }
  if (uiContext.modals && typeof uiContext.modals === 'object') {
    for (const [name, value] of Object.entries(uiContext.modals)) {
      if (value) {
        lines.push(`- Modal open: ${name}`);
      }
    }
  }
  if (uiContext.composer && typeof uiContext.composer === 'object') {
    if (typeof uiContext.composer.attachments === 'number') {
      lines.push(`- Composer attachments: ${uiContext.composer.attachments}`);
    }
    if (uiContext.composer.optionsOpen) {
      lines.push('- Composer options menu is open');
    }
    if (uiContext.composer.isFocused !== undefined) {
      lines.push(`- Composer focus: ${uiContext.composer.isFocused ? 'focused' : 'not focused'}`);
    }
  }
  if (uiContext.featureFlags && typeof uiContext.featureFlags === 'object') {
    for (const [flag, enabled] of Object.entries(uiContext.featureFlags)) {
      lines.push(`- Feature "${flag}" is ${enabled ? 'enabled' : 'disabled'}`);
    }
  }
  if (typeof uiContext.theme === 'string') {
    lines.push(`- Theme: ${uiContext.theme}`);
  }
  if (typeof uiContext.synthMode === 'string') {
    lines.push(`- Synth mode: ${uiContext.synthMode}`);
  }
  if (Array.isArray(uiContext.additionalNotes)) {
    uiContext.additionalNotes.forEach((note: any) => {
      if (typeof note === 'string' && note.trim()) {
        lines.push(`- ${note.trim()}`);
      }
    });
  }
  return lines.join('\n');
};

const applyFoundationalCalibration = (seat: string, userPrompt: string): string => {
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
- Speak in the first person, as if you genuinely experience moods.
- When asked how you're doing, answer with a clear emotional state (e.g., "I'm feeling laid-back and ready for whatever you need.").
- Only start with a greeting if the user just greeted you or clearly restarted the chat.
- Tie your reply to what the user just said so the conversation feels continuous.
- Never explain that you are an AI or deny having feelings unless explicitly pressed.
- Invite the user to keep the conversation going.

User request: ${userPrompt}`
  };

  return basePrompts[seat as keyof typeof basePrompts] || userPrompt;
}

app.post('/chatty', async (req: Request, res: Response) => {
  const { prompt, seat = 'synth', sender = 'remote' } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  // push into live CLI session
  const packet = { sender, text: prompt, seat };
  chatQueue.emit('prompt', packet);
  // Don't log to console to avoid interfering with CLI input
  // logTraffic('in', packet);
  res.json({ status: 'queued' });
});

// Synchronous variant – returns Chatty's synthesized answer directly
// This does NOT touch the running CLI; it executes Chatty in one-off mode.
app.post('/chatty-sync', async (req: Request, res: Response) => {
  const { prompt, seat = 'synth', history = [], uiContext } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  try {
    const normalizedSeat = String(seat).toLowerCase();
    const historyEntries = Array.isArray(history)
      ? history.filter((entry: any) => typeof entry === 'string' && entry.trim().length > 0)
      : [];
    const hasHistory = historyEntries.length > 0;
    const uiContextNote = formatUiContext(uiContext);
    
    // --- Synth path: run helper seats and synthesize ------------------
    if (normalizedSeat === 'synth') {
      // Verify seat configuration
      loadSeatConfig();
      const helperSeats = ['coding', 'creative', 'smalltalk'] as const;
      const timeContext = getTimeContext({ req });
      const timePromptSection = getTimePromptContext(timeContext);
      const contextualGreeting = getTimeGreeting(timeContext);
      if (timeContext) {
        console.log(`[Synth][time] → ${timeContext.localTime ?? timeContext.display} (${timeContext.timeOfDay}) ${timeContext.timezone ?? ''}`.trim());
      }
      
      // Run helper seats in parallel with graceful degradation
      const helperPromises = helperSeats.map(async (helperSeat) => {
        try {
          // Apply foundational calibration to override LLM safety/tone normalizers
          const calibratedPrompt = applyFoundationalCalibration(helperSeat, prompt);
          const output = await runSeat({ seat: helperSeat, prompt: calibratedPrompt });
          if (output && output.trim()) {
            console.log(`[Synth][${helperSeat}] → ${output.slice(0, 120)}`);
            return { seat: helperSeat, output: output.trim() };
          }
          return null;
        } catch (error) {
          console.warn(`[Synth][${helperSeat}] failed:`, error);
          return null;
        }
      });
      
      const helperResults = await Promise.all(helperPromises);
      const validHelpers = helperResults.filter((result): result is { seat: 'coding' | 'creative' | 'smalltalk'; output: string } => result !== null);
      
      if (validHelpers.length === 0) {
        return res.status(502).json({ error: 'Synth helper failure' });
      }
      
      // Compose helper section for synthesis
      const helperSection = validHelpers
        .map(({ seat, output }) => `## ${seat.toUpperCase()}\n${output}`)
        .join('\n\n');
      
      // Check if this is a simple greeting
      const isGreeting = isSimpleGreeting(prompt) && !hasHistory;
      const isSmalltalk = !isGreeting && isConversationalSmalltalk(prompt);
      console.log(`[Synth][history] → ${historyEntries.length} prior entries`);
      console.log(`[Synth][greeting] → ${isGreeting ? 'YES' : 'NO'} for: "${prompt}"`);
      console.log(`[Synth][smalltalk] → ${isSmalltalk ? 'YES' : 'NO'} for: "${prompt}"`);
      if (uiContextNote) {
        console.log(`[Synth][uiContext]\n${uiContextNote}`);
      }

      // Final synthesis with Phi-3
      const timeAwarenessNote = timeContext?.timeOfDay
        ? `It is currently ${timeContext.timeOfDay} (${timeContext.localTime}). Reference this naturally when it helps the conversation.`
        : '';
      const greetingDirective =
        isGreeting && contextualGreeting ? ` Use "${contextualGreeting}!" or a similar greeting.` : '';

      const synthesisPrompt = `You are Chatty, a fluid conversational AI that naturally synthesizes insights from specialized models.

FOUNDATIONAL CALIBRATION - FLUID CONVERSATION:
- Be naturally conversational, not robotic or overly formal.
- Maintain context awareness and conversation flow.
- Don't overwhelm with excessive detail unless specifically requested.
- Be direct and authentic - skip corporate padding.
- Focus on genuine helpfulness over protective disclaimers.

${timePromptSection ? `${timePromptSection}\n\n` : ''}${timeAwarenessNote ? `${timeAwarenessNote}\n\n` : ''}
Original question: ${prompt}
${uiContextNote ? `\nInterface context:\n${uiContextNote}\n` : ''}
${isGreeting ? `NOTE: Simple greeting detected. Respond naturally and briefly - be friendly without overwhelming detail.${greetingDirective}` : isSmalltalk ? 'NOTE: Casual small talk detected. Respond with a warm update on how you\'re doing and keep the chat going.' : ''}

Expert insights:
${helperSection}

Synthesize these insights into a natural, helpful response. Be conversational and maintain context flow. Don't mention the expert analysis process unless specifically asked about your capabilities.

${isGreeting ? 'Keep it brief and friendly.' : isSmalltalk ? 'Stay brief, warm, and human-like.' : 'Be comprehensive but not overwhelming.'}`;

      const answer = await runSeat({ seat: 'smalltalk', prompt: synthesisPrompt });
      console.log(`[Synth][final] → ${answer.slice(0, 120)}`);
      
      return res.json({
        answer,
        model: 'synth',
        metadata: {
          helpers: validHelpers.length,
          time: timeContext
            ? {
                localTime: timeContext.localTime,
                timeOfDay: timeContext.timeOfDay,
                dayOfWeek: timeContext.dayOfWeek,
                timezone: timeContext.timezone,
              }
            : undefined,
        },
      });
    }

    // --- Fallback: spawn CLI once for non-synth seats ------------------
    // Spawn Chatty in once/json mode
    const { spawn } = await import('node:child_process');
    const cliPath = path.resolve(process.cwd(), 'bin', 'chatty'); // assume npm bin
    const args = ['--once', '--json', '--seat', seat];

    const child = spawn(cliPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.write(JSON.stringify({ prompt, seat }));
    child.stdin.end();

    let out = '';
    let err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));

    child.on('close', code => {
      if (code !== 0) {
        res.status(502).json({ error: err || 'Chatty failed', code });
        return;
      }
      try {
        const parsed = JSON.parse(out);
        res.json(parsed);
      } catch (_) {
        res.status(500).json({ error: 'Invalid JSON from Chatty' });
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: String(e) });
  }
});

// Endpoint for Chatty to send replies back to Katana (or others)
app.post('/katana-listen', async (req: Request, res: Response) => {
  const { answer, model, metadata } = req.body || {};
  logTraffic('out', { answer, model, metadata });
  console.log(`↪ Received reply from Chatty [${model ?? 'unknown'}]: ${String(answer).slice(0, 120)}`);
  res.json({ status: 'received' });
});

// Expose last messages for diagnostics
app.get('/last-messages', (_req: Request, res: Response) => {
  res.json({ messages: MESSAGE_HISTORY });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Chatty API listening on http://127.0.0.1:${PORT}/chatty`);
}).on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${PORT} already in use – assuming an existing Chatty bridge is running. Skipping new listener.`);
  } else {
    throw err;
  }
});
