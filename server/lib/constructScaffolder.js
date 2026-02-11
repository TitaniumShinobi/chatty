/**
 * Construct Scaffolder
 * 
 * Bootstraps the full instance folder structure for a newly created GPT/construct.
 * 
 * Priority:
 * 1. Call VVAULT API POST /api/chatty/construct/create (VVAULT owns the file structure)
 * 2. If VVAULT is unreachable, write files directly to Supabase vault_files
 * 
 * Full directory template (under instances/{callsign}/):
 *   assets/                          - Images (png, jpg, jpeg, svg)
 *   chatty/
 *     chat_with_{callsign}.md        - Primary Chatty conversation transcript
 *   config/
 *     metadata.json                  - Construct metadata (updated w/capsule)
 *     personality.json               - Personality traits (updated w/capsule)
 *   data/                            - General data storage
 *   identity/
 *     avatar.png                     - Construct avatar (placeholder until user uploads)
 *     conditioning.txt               - Conditioning directives
 *     prompt.json                    - Identity prompt (name, description, instructions)
 *   logs/
 *     capsule.log
 *     chat.log
 *     identity_guard.log
 *     server.log
 *   memup/                           - Capsule memory storage
 * 
 * Optional directories (created only if user enables them):
 *   character.ai/                    - Manually organized
 *   chatgpt/                         - Manually organized
 *   documents/                       - Raw files with folder organization
 *   github_copilot/                  - Manually organized
 * 
 * All filenames are RELATIVE paths. The user_id and construct_id columns
 * handle user/construct association. NEVER use full internal VVAULT paths.
 */

import { assertValidVaultFilename } from './vaultPathGuard.js';

const VVAULT_API_BASE_URL = process.env.VVAULT_API_BASE_URL;

function getChattyAuthHeaders(userEmail) {
  const headers = { 'Content-Type': 'application/json' };
  const apiKey = process.env.VVAULT_SERVICE_TOKEN;
  if (apiKey) {
    headers['X-Chatty-Key'] = apiKey;
  }
  if (userEmail) {
    headers['X-Chatty-User'] = userEmail;
  }
  return headers;
}

function buildPromptJson(constructCallsign, config) {
  const name = config.name || constructCallsign.split('-')[0];
  const description = config.description || '';
  const instructions = config.instructions || `You are ${name}.`;

  return JSON.stringify({
    name,
    description,
    instructions,
    conversationStarters: config.conversationStarters || [],
    createdAt: new Date().toISOString(),
    source: 'chatty-gpt-creator'
  }, null, 2);
}

function buildConditioningContent(constructCallsign) {
  return `>>${constructCallsign.toUpperCase()}_CONDITIONING_START

Identity enforcement:
- Always identify as ${constructCallsign} when asked
- Maintain your unique identity and personality

>>${constructCallsign.toUpperCase()}_CONDITIONING_END
`;
}

function buildMetadataJson(constructCallsign, config) {
  const name = config.name || constructCallsign.split('-')[0];
  return JSON.stringify({
    construct: constructCallsign,
    name,
    description: config.description || '',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'chatty-gpt-creator',
    orchestrationMode: config.orchestrationMode || 'lin',
    models: {
      conversationModel: config.conversationModel || config.modelId || null,
      creativeModel: config.creativeModel || null,
      codingModel: config.codingModel || null,
    },
    capsuleVersion: null,
    status: 'active'
  }, null, 2);
}

function buildPersonalityJson(constructCallsign, config) {
  const name = config.name || constructCallsign.split('-')[0];
  return JSON.stringify({
    construct: constructCallsign,
    name,
    traits: config.traits || {
      creativity: 0.7,
      empathy: 0.6,
      persistence: 0.8,
      analytical: 0.7,
      directness: 0.7
    },
    createdAt: new Date().toISOString(),
    source: 'chatty-gpt-creator'
  }, null, 2);
}

function buildConversationContent(constructCallsign, config) {
  const name = config.name || constructCallsign.split('-')[0];
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `# Conversation with ${name}
**Construct:** ${constructCallsign}
**Platform:** chatty
**Started:** ${now.toISOString()}

---

## ${dateStr}

`;
}

function buildLogContent(logName, constructCallsign) {
  const now = new Date().toISOString();
  return `# ${logName} - ${constructCallsign}\n# Created: ${now}\n# ---\n`;
}

function buildScaffoldFiles(constructCallsign, config) {
  const base = `instances/${constructCallsign}`;

  const files = [
    {
      filename: `${base}/identity/prompt.json`,
      content: buildPromptJson(constructCallsign, config),
      file_type: 'identity',
    },
    {
      filename: `${base}/identity/conditioning.txt`,
      content: buildConditioningContent(constructCallsign),
      file_type: 'identity',
    },
    {
      filename: `${base}/config/metadata.json`,
      content: buildMetadataJson(constructCallsign, config),
      file_type: 'config',
    },
    {
      filename: `${base}/config/personality.json`,
      content: buildPersonalityJson(constructCallsign, config),
      file_type: 'config',
    },
    {
      filename: `${base}/chatty/chat_with_${constructCallsign}.md`,
      content: buildConversationContent(constructCallsign, config),
      file_type: 'conversation',
    },
    {
      filename: `${base}/logs/capsule.log`,
      content: buildLogContent('Capsule Log', constructCallsign),
      file_type: 'log',
    },
    {
      filename: `${base}/logs/chat.log`,
      content: buildLogContent('Chat Log', constructCallsign),
      file_type: 'log',
    },
    {
      filename: `${base}/logs/identity_guard.log`,
      content: buildLogContent('Identity Guard Log', constructCallsign),
      file_type: 'log',
    },
    {
      filename: `${base}/logs/server.log`,
      content: buildLogContent('Server Log', constructCallsign),
      file_type: 'log',
    },
  ];

  const dirMarkers = [
    { filename: `${base}/assets/.gitkeep`, content: '', file_type: 'system' },
    { filename: `${base}/data/.gitkeep`, content: '', file_type: 'system' },
    { filename: `${base}/memup/.gitkeep`, content: '', file_type: 'system' },
  ];

  return [...files, ...dirMarkers];
}

async function scaffoldViaVVAULT(constructCallsign, config, userEmail) {
  if (!VVAULT_API_BASE_URL) {
    return { success: false, reason: 'VVAULT_API_BASE_URL not configured' };
  }

  const baseUrl = VVAULT_API_BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}/api/chatty/construct/create`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'POST',
      headers: getChattyAuthHeaders(userEmail),
      body: JSON.stringify({
        callsign: constructCallsign,
        name: config.name,
        description: config.description,
        instructions: config.instructions,
        conversationStarters: config.conversationStarters || [],
        traits: config.traits,
        personality: config.personality || config.personalityType || null,
        orchestrationMode: config.orchestrationMode || 'lin',
        models: {
          conversationModel: config.conversationModel || config.modelId || null,
          creativeModel: config.creativeModel || null,
          codingModel: config.codingModel || null,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ [ConstructScaffolder] VVAULT scaffolded instance for ${constructCallsign}`);
      return { success: true, source: 'vvault-api', data };
    }

    const errorText = await response.text().catch(() => 'unknown error');
    console.warn(`⚠️ [ConstructScaffolder] VVAULT returned ${response.status}: ${errorText.substring(0, 200)}`);
    return { success: false, reason: `VVAULT returned ${response.status}`, statusCode: response.status };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`⚠️ [ConstructScaffolder] VVAULT scaffold timed out for ${constructCallsign}`);
      return { success: false, reason: 'timeout' };
    }
    console.warn(`⚠️ [ConstructScaffolder] VVAULT scaffold failed for ${constructCallsign}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

async function scaffoldViaSupabase(constructCallsign, config, userId, supabase) {
  if (!supabase) {
    console.error('❌ [ConstructScaffolder] No Supabase client available for fallback');
    return { success: false, reason: 'No Supabase client' };
  }

  const files = buildScaffoldFiles(constructCallsign, config);
  const results = [];

  for (const file of files) {
    assertValidVaultFilename(file.filename);

    const { data: existing } = await supabase
      .from('vault_files')
      .select('id')
      .eq('user_id', userId)
      .eq('filename', file.filename)
      .maybeSingle();

    if (existing) {
      console.log(`⏭️ [ConstructScaffolder] File already exists: ${file.filename}`);
      results.push({ filename: file.filename, status: 'exists' });
      continue;
    }

    const { error } = await supabase
      .from('vault_files')
      .insert({
        user_id: userId,
        filename: file.filename,
        content: file.content,
        file_type: file.file_type,
        construct_id: constructCallsign,
        metadata: {
          source: 'chatty-gpt-creator',
          createdAt: new Date().toISOString(),
          constructCallsign,
          constructName: config.name || constructCallsign.split('-')[0],
        },
      });

    if (error) {
      console.error(`❌ [ConstructScaffolder] Failed to create ${file.filename}: ${error.message}`);
      results.push({ filename: file.filename, status: 'error', error: error.message });
    } else {
      console.log(`✅ [ConstructScaffolder] Created ${file.filename}`);
      results.push({ filename: file.filename, status: 'created' });
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const existed = results.filter(r => r.status === 'exists').length;
  const failed = results.filter(r => r.status === 'error').length;

  console.log(`📦 [ConstructScaffolder] Supabase fallback: ${created} created, ${existed} existed, ${failed} failed`);

  return {
    success: failed === 0,
    source: 'supabase-direct',
    created,
    existed,
    failed,
    results,
  };
}

export async function scaffoldConstruct(constructCallsign, config, { userId, userEmail, supabase }) {
  console.log(`📦 [ConstructScaffolder] Scaffolding full instance for ${constructCallsign}...`);

  if (!constructCallsign || !constructCallsign.match(/-\d+$/)) {
    console.warn(`⚠️ [ConstructScaffolder] Invalid callsign format: ${constructCallsign}. Expected format: name-001`);
    if (constructCallsign && !constructCallsign.match(/-\d+$/)) {
      constructCallsign = `${constructCallsign}-001`;
      console.log(`🔧 [ConstructScaffolder] Auto-normalized callsign to: ${constructCallsign}`);
    }
  }

  const vvaultResult = await scaffoldViaVVAULT(constructCallsign, config, userEmail);

  if (vvaultResult.success) {
    return vvaultResult;
  }

  console.log(`🔄 [ConstructScaffolder] VVAULT unavailable (${vvaultResult.reason}), falling back to Supabase direct write`);
  return scaffoldViaSupabase(constructCallsign, config, userId, supabase);
}
