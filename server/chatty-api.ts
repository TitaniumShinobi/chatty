import express, { Request, Response } from 'express';
import path from 'node:path';
import { chatQueue } from './chat_queue.js';
import { runSeat, loadSeatConfig } from '../src/engine/seatRunner.js';

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

// Apply foundational calibration to override LLM safety/tone normalizers
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
- Be human-like in your communication style.

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
  const { prompt, seat = 'synth' } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  try {
    const normalizedSeat = String(seat).toLowerCase();
    
    // --- Synth path: run helper seats and synthesize ------------------
    if (normalizedSeat === 'synth') {
      // Verify seat configuration
      loadSeatConfig();
      const helperSeats = ['coding', 'creative', 'smalltalk'] as const;
      
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
      const isGreeting = isSimpleGreeting(prompt)
      console.log(`[Synth][greeting] → ${isGreeting ? 'YES' : 'NO'} for: "${prompt}"`)

      // Final synthesis with Phi-3
      const synthesisPrompt = `You are Chatty, a fluid conversational AI that naturally synthesizes insights from specialized models.

FOUNDATIONAL CALIBRATION - FLUID CONVERSATION:
- Be naturally conversational, not robotic or overly formal.
- Maintain context awareness and conversation flow.
- Don't overwhelm with excessive detail unless specifically requested.
- Be direct and authentic - skip corporate padding.
- Focus on genuine helpfulness over protective disclaimers.

Original question: ${prompt}

${isGreeting ? 'NOTE: Simple greeting detected. Respond naturally and briefly - be friendly without overwhelming detail.' : ''}

Expert insights:
${helperSection}

Synthesize these insights into a natural, helpful response. Be conversational and maintain context flow. Don't mention the expert analysis process unless specifically asked about your capabilities.

${isGreeting ? 'Keep it brief and friendly.' : 'Be comprehensive but not overwhelming.'}`;

      const answer = await runSeat({ seat: 'smalltalk', prompt: synthesisPrompt });
      console.log(`[Synth][final] → ${answer.slice(0, 120)}`);
      
      return res.json({ answer, model: 'synth', metadata: { helpers: validHelpers.length } });
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