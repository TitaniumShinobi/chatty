/**
 * Construct Scaffolder
 * 
 * Bootstraps the full instance folder structure for a newly created GPT/construct.
 * 
 * Priority:
 * 1. Call VVAULT API POST /api/chatty/construct/create (VVAULT owns the file structure)
 * 2. If VVAULT is unreachable, write minimum identity files directly to Supabase vault_files
 * 
 * Files created:
 * - instances/{callsign}/identity/prompt.txt
 * - instances/{callsign}/identity/conditioning.txt
 * - instances/{callsign}/identity/personality.json
 * - instances/{callsign}/chatty/chat_with_{callsign}.md
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

function buildPromptContent(constructCallsign, config) {
  const name = config.name || constructCallsign.split('-')[0];
  const description = config.description || 'A custom AI construct created in Chatty.';
  const instructions = config.instructions || `You are ${name}, a custom AI construct created in Chatty.`;

  return `**You Are ${name}**
*${description}*
\`\`\`
${instructions}
\`\`\`
`;
}

function buildConditioningContent(constructCallsign) {
  return `>>${constructCallsign.toUpperCase()}_CONDITIONING_START

Identity enforcement:
- Always identify as ${constructCallsign} when asked
- Maintain your unique identity and personality

>>${constructCallsign.toUpperCase()}_CONDITIONING_END
`;
}

function buildPersonalityContent(constructCallsign, config) {
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
        traits: config.traits,
        personality: config.personality || config.personalityType || null,
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

  const files = [
    {
      filename: `instances/${constructCallsign}/identity/prompt.txt`,
      content: buildPromptContent(constructCallsign, config),
      file_type: 'identity',
    },
    {
      filename: `instances/${constructCallsign}/identity/conditioning.txt`,
      content: buildConditioningContent(constructCallsign),
      file_type: 'identity',
    },
    {
      filename: `instances/${constructCallsign}/identity/personality.json`,
      content: buildPersonalityContent(constructCallsign, config),
      file_type: 'identity',
    },
    {
      filename: `instances/${constructCallsign}/chatty/chat_with_${constructCallsign}.md`,
      content: buildConversationContent(constructCallsign, config),
      file_type: 'conversation',
    },
  ];

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
  console.log(`📦 [ConstructScaffolder] Scaffolding instance for ${constructCallsign}...`);

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
