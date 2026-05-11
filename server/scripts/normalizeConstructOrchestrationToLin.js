import '../loadEnv.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { resolveSupabaseUserId } from '../auth/lib/supabaseUserResolver.js';

function parseArgs(argv) {
  const args = {
    apply: false,
    chattyUserId: '',
    email: '',
    supabaseUserId: '',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next) continue;
    if (arg === '--chatty-user-id') {
      args.chattyUserId = next;
      index += 1;
    } else if (arg === '--email') {
      args.email = next;
      index += 1;
    } else if (arg === '--supabase-user-id') {
      args.supabaseUserId = next;
      index += 1;
    }
  }

  return args;
}

async function resolveTargetSupabaseUserId({ supabaseUserId, email, chattyUserId }) {
  if (supabaseUserId) return supabaseUserId;
  const resolved = await resolveSupabaseUserId({ email: email || null, chattyUserId: chattyUserId || null });
  return resolved.supabaseUserId || null;
}

function normalizePromptBundle(content) {
  const parsed = JSON.parse(content || '{}');
  return {
    changed: parsed.orchestrationMode !== 'lin',
    next: {
      ...parsed,
      orchestrationMode: 'lin',
      updatedAt: new Date().toISOString(),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client could not be initialized');
  }

  const targetSupabaseUserId = await resolveTargetSupabaseUserId(args);
  if (!targetSupabaseUserId) {
    throw new Error('Could not resolve target Supabase user id. Pass --supabase-user-id or a resolvable --email/--chatty-user-id.');
  }

  const { data, error } = await supabase
    .from('vault_files')
    .select('id,construct_id,filename,content')
    .eq('user_id', targetSupabaseUserId)
    .like('filename', 'instances/%/identity/prompt.json')
    .order('construct_id', { ascending: true });

  if (error) {
    throw new Error(`Failed to load construct prompt bundles: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const pending = [];
  for (const row of rows) {
    try {
      const normalized = normalizePromptBundle(row.content || '{}');
      if (normalized.changed) {
        pending.push({
          id: row.id,
          constructId: row.construct_id || row.filename,
          filename: row.filename,
          content: JSON.stringify(normalized.next, null, 2),
        });
      }
    } catch (error) {
      console.warn(`⚠️ Skipping invalid prompt bundle for ${row.construct_id || row.filename}: ${error.message}`);
    }
  }

  console.log(JSON.stringify({
    mode: args.apply ? 'apply' : 'dry-run',
    targetSupabaseUserId,
    promptBundleCount: rows.length,
    updatesNeeded: pending.length,
    constructs: pending.map((item) => item.constructId),
  }, null, 2));

  if (!args.apply || pending.length === 0) {
    return;
  }

  for (const item of pending) {
    const { error: updateError } = await supabase
      .from('vault_files')
      .update({ content: item.content })
      .eq('id', item.id);
    if (updateError) {
      throw new Error(`Failed to update ${item.constructId}: ${updateError.message}`);
    }
  }

  console.log(`✅ Updated ${pending.length} construct prompt bundles to orchestrationMode=lin`);
}

main().catch((error) => {
  console.error(`normalizeConstructOrchestrationToLin failed: ${error.message}`);
  process.exit(1);
});
