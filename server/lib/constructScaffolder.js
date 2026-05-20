/**
 * Construct Scaffolder
 * 
 * Bootstraps the full instance folder structure for a newly created GPT/construct.
 * 
 * Priority:
 * 1. Write the local VVAULT filesystem bundle when available
 * 2. Optionally call VVAULT API POST /api/chatty/construct/create
 * 3. If neither local nor VVAULT API are available, fall back to Supabase vault_files
 * 
 * Full directory template (under instances/{callsign}/):
 *   assets/                          - Images (png, jpg, jpeg, svg)
 *   chatty/
 *     chat_with_{callsign}.md        - Primary Chatty conversation transcript
 *   config/
 *     metadata.json                  - Construct metadata (updated w/capsule)
 *     personality.json               - Personality traits (generated from GPT body)
 *     tone_profile.json              - Tone and communication profile
 *   data/                            - General data storage
 *   identity/
 *     avatar.png                     - Construct avatar (placeholder until user uploads)
 *     conditioning.txt               - Conditioning directives
 *     definition.json                - Structured identity definition placeholder
 *     prompt.json                    - Canonical GPT settings bundle
 *     prompt.txt                     - Prompt fallback / readable identity view
 *     voice.json                     - Canonical machine-readable voice contract
 *   logs/
 *     capsule.log
 *     chat.log
 *     identity_guard.log
 *     server.log
 *   memup/                           - Capsule memory storage
 * 
 * Platform transcript directories (always created):
 *   codex/                           - Codex agent transcripts
 *   chatgpt/                         - ChatGPT transcripts
 *   character.ai/                    - Character.AI transcripts
 *   github_copilot/                  - GitHub Copilot transcripts
 * 
 * Optional directories (created only if user enables them):
 *   documents/                       - Raw files with folder organization
 * 
 * All filenames are RELATIVE paths. The user_id and construct_id columns
 * handle user/construct association. NEVER use full internal VVAULT paths.
 */

import path from 'path';
import { assertValidVaultFilename } from './vaultPathGuard.js';
import { getVvaultBasePath } from './vvaultPaths.js';
import {
  buildConstructBundleEntries,
  writeConstructBundleEntries,
} from './constructBundle.js';

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

function buildScaffoldFiles(constructCallsign, config) {
  return buildConstructBundleEntries(constructCallsign, config).map((entry) => ({
    filename: entry.filename,
    content: entry.content,
    file_type: entry.fileType,
    replaceExisting: entry.replaceExisting === true,
  }));
}

async function scaffoldViaLocalFilesystem(constructCallsign, config, options = {}) {
  try {
    const vvaultRoot = path.resolve(options.basePath || getVvaultBasePath());
    const files = buildConstructBundleEntries(constructCallsign, config);
    const result = await writeConstructBundleEntries(vvaultRoot, files, {
      syncGenerated: options.syncGenerated === true,
    });
    console.log(
      `✅ [ConstructScaffolder] Local VVAULT scaffolded ${constructCallsign} at ${vvaultRoot} (${result.created} created, ${result.updated} updated, ${result.existed} existed)`,
    );
    return {
      ...result,
      source: 'local-vvault-filesystem',
      rootPath: vvaultRoot,
    };
  } catch (error) {
    console.warn(`⚠️ [ConstructScaffolder] Local filesystem scaffold failed for ${constructCallsign}: ${error.message}`);
    return { success: false, reason: error.message };
  }
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

async function scaffoldViaSupabase(constructCallsign, config, userId, supabase, options = {}) {
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

    if (existing && !(options.syncGenerated === true && file.replaceExisting)) {
      console.log(`⏭️ [ConstructScaffolder] File already exists: ${file.filename}`);
      results.push({ filename: file.filename, status: 'exists' });
      continue;
    }

    const rowPayload = {
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
    };

    const { error } = existing
      ? await supabase
          .from('vault_files')
          .update({
            content: rowPayload.content,
            file_type: rowPayload.file_type,
            metadata: rowPayload.metadata,
          })
          .eq('id', existing.id)
      : await supabase
          .from('vault_files')
          .insert(rowPayload);

    if (error) {
      console.error(`❌ [ConstructScaffolder] Failed to create ${file.filename}: ${error.message}`);
      results.push({ filename: file.filename, status: 'error', error: error.message });
    } else {
      const status = existing ? 'updated' : 'created';
      console.log(`✅ [ConstructScaffolder] ${status === 'updated' ? 'Updated' : 'Created'} ${file.filename}`);
      results.push({ filename: file.filename, status });
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const updated = results.filter(r => r.status === 'updated').length;
  const existed = results.filter(r => r.status === 'exists').length;
  const failed = results.filter(r => r.status === 'error').length;

  console.log(`📦 [ConstructScaffolder] Supabase fallback: ${created} created, ${updated} updated, ${existed} existed, ${failed} failed`);

  return {
    success: failed === 0,
    source: 'supabase-direct',
    created,
    updated,
    existed,
    failed,
    results,
  };
}

export async function scaffoldConstruct(constructCallsign, config, options = {}) {
  const {
    userId,
    userEmail,
    supabase,
    localOnly = false,
    syncGenerated = false,
    basePath = null,
  } = options;
  console.log(`📦 [ConstructScaffolder] Scaffolding full instance for ${constructCallsign}...`);

  if (!constructCallsign || !constructCallsign.match(/-\d+$/)) {
    console.warn(`⚠️ [ConstructScaffolder] Invalid callsign format: ${constructCallsign}. Expected format: name-001`);
    if (constructCallsign && !constructCallsign.match(/-\d+$/)) {
      constructCallsign = `${constructCallsign}-001`;
      console.log(`🔧 [ConstructScaffolder] Auto-normalized callsign to: ${constructCallsign}`);
    }
  }

  const localResult = await scaffoldViaLocalFilesystem(constructCallsign, config, {
    basePath,
    syncGenerated,
  });
  if (localResult.success) {
    return localResult;
  }

  if (localOnly) {
    return localResult;
  }

  const vvaultResult = await scaffoldViaVVAULT(constructCallsign, config, userEmail);

  if (vvaultResult.success) {
    return vvaultResult;
  }

  console.log(`🔄 [ConstructScaffolder] VVAULT unavailable (${vvaultResult.reason}), falling back to Supabase direct write`);
  return scaffoldViaSupabase(constructCallsign, config, userId, supabase, { syncGenerated });
}
