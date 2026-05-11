import OpenAI from 'openai';
import { buildEnrichedContext } from './memoryContextBuilder.js';
import { GPTManager } from './gptManager.js';
import { getEnabledSessions, recordEmission } from '../routes/selfprompt.js';

const POLL_INTERVAL_MS = 10_000;
let loopTimer = null;

function getLLMClient() {
  const replitKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  if (replitKey) {
    return {
      client: new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
        apiKey: replitKey,
      }),
      model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
      provider: 'replitOpenrouter'
    };
  }

  const directKey = process.env.OPENAI_API_KEY;
  const replitOpenaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const openaiKey = directKey || (replitOpenaiKey && replitOpenaiKey !== '_DUMMY_API_KEY_' ? replitOpenaiKey : null);
  if (openaiKey) {
    return {
      client: new OpenAI({
        baseURL: directKey ? 'https://api.openai.com/v1' : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1'),
        apiKey: openaiKey,
      }),
      model: 'gpt-4o-mini',
      provider: 'openai'
    };
  }

  return null;
}

async function emitProactiveMessage(session) {
  const { construct_id: constructId, thread_id: threadId, user_id: userId } = session;
  console.log(`[Selfprompt] Emitting proactive message for ${constructId} in thread ${threadId}`);

  const llm = getLLMClient();
  if (!llm) {
    console.warn('[Selfprompt] No LLM client available, skipping emission');
    return;
  }

  const gptManager = GPTManager.getInstance();
  let gptConfig = null;
  try {
    gptConfig = await gptManager.getGPTByCallsign(constructId);
  } catch (_) {}

  const enrichedContext = await buildEnrichedContext({
    userId,
    constructId,
    userMessage: '[SELFPROMPT: The user has been inactive. Generate a brief, natural follow-up or observation based on recent context. Be concise.]',
    gptConfig,
  });

  let systemPrompt = enrichedContext.systemPrompt;
  systemPrompt += '\n\n[SELFPROMPT DIRECTIVE: You are generating a proactive message because the user has been silent. Keep it brief (1-3 sentences), natural, and context-aware. Do not ask if the user is still there. Instead, share an observation, continue a thought, or offer something relevant.]';

  try {
    const completion = await llm.client.chat.completions.create({
      model: llm.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '[SELFPROMPT: Generate a brief proactive follow-up. Do not reference this prompt.]' }
      ],
      max_tokens: 512,
    });

    const aiResponse = completion.choices[0]?.message?.content;
    if (!aiResponse || aiResponse.trim().length === 0) {
      console.warn('[Selfprompt] Empty LLM response, skipping');
      return;
    }

    recordEmission(constructId, threadId);

    const messagePayload = {
      constructId,
      threadId,
      role: 'assistant',
      content: aiResponse.trim(),
      tool_trace: [{ tool: 'selfprompt', detail: `proactive emission after inactivity (${session.interval_sec}s)` }],
      timestamp: new Date().toISOString(),
      source: `selfprompt-${llm.provider}`,
      model: llm.model,
    };

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error } = await supabase.from('conversation_messages').insert({
          conversation_id: threadId,
          role: 'assistant',
          content: aiResponse.trim(),
          metadata: JSON.stringify({
            tool_trace: messagePayload.tool_trace,
            source: messagePayload.source,
            model: messagePayload.model,
            selfprompt: true
          }),
          created_at: messagePayload.timestamp
        });

        if (error) {
          console.warn('[Selfprompt] Supabase persist failed:', error.message);
          persistToLocalDb(messagePayload);
        } else {
          console.log(`[Selfprompt] Proactive message persisted to Supabase for ${constructId}`);
        }
      } else {
        persistToLocalDb(messagePayload);
      }
    } catch (persistErr) {
      console.warn('[Selfprompt] Persistence error:', persistErr.message);
      persistToLocalDb(messagePayload);
    }

    console.log(`[Selfprompt] Proactive message emitted for ${constructId}: "${aiResponse.trim().slice(0, 80)}..."`);
  } catch (llmErr) {
    console.error(`[Selfprompt] LLM call failed for ${constructId}:`, llmErr.message);
  }
}

async function persistToLocalDb(payload) {
  try {
    const { getSelfpromptDb } = await import('../routes/selfprompt.js');
    const db = getSelfpromptDb();
    db.exec(`CREATE TABLE IF NOT EXISTS selfprompt_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      construct_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      role TEXT DEFAULT 'assistant',
      content TEXT,
      tool_trace TEXT,
      source TEXT,
      model TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.prepare(`INSERT INTO selfprompt_messages (construct_id, thread_id, content, tool_trace, source, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      payload.constructId, payload.threadId, payload.content,
      JSON.stringify(payload.tool_trace), payload.source, payload.model, payload.timestamp
    );
    console.log(`[Selfprompt] Proactive message saved to local DB for ${payload.constructId}`);
  } catch (err) {
    console.error('[Selfprompt] Local DB persist failed:', err.message);
  }
}

async function checkAndEmit() {
  try {
    const sessions = getEnabledSessions();
    if (!sessions || sessions.length === 0) return;

    const now = Math.floor(Date.now() / 1000);

    for (const session of sessions) {
      const lastActivity = session.last_user_activity_at || 0;
      const lastEmission = session.last_emission_at || 0;
      const interval = session.interval_sec || 60;

      const inactivityMet = (now - lastActivity) >= interval;
      const emissionCooldown = (now - lastEmission) >= interval;

      if (inactivityMet && emissionCooldown) {
        try {
          await emitProactiveMessage(session);
        } catch (err) {
          console.error(`[Selfprompt] Emission failed for ${session.construct_id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[Selfprompt] Check loop error:', err.message);
  }
}

export function startSelfpromptLoop() {
  if (loopTimer) return;
  loopTimer = setInterval(checkAndEmit, POLL_INTERVAL_MS);
  console.log(`[Selfprompt] Proactive emission loop started (polling every ${POLL_INTERVAL_MS / 1000}s)`);
}

export function stopSelfpromptLoop() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
    console.log('[Selfprompt] Proactive emission loop stopped');
  }
}
