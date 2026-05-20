import '../loadEnv.js';
import { performance } from 'node:perf_hooks';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { loadCanonicalConstructIdentity } from '../lib/constructIdentityRepository.js';
import { listCanonicalConversations, getCanonicalConversationMessages } from '../lib/conversationRepository.js';

const AVATAR_LIMIT = Number(process.env.CHATTY_SMOKE_AVATAR_LIMIT || 20);
const AVATAR_BUDGET_MS = Number(process.env.CHATTY_SMOKE_AVATAR_BUDGET_MS || 1000);
const CONVERSATION_LIST_BUDGET_MS = Number(process.env.CHATTY_SMOKE_CONVERSATION_LIST_BUDGET_MS || 1000);
const CONVERSATION_MESSAGES_BUDGET_MS = Number(process.env.CHATTY_SMOKE_CONVERSATION_MESSAGES_BUDGET_MS || 1000);

function parseArg(name) {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function resolveSmokeUserId(supabase) {
  const explicit = parseArg('--user') || process.env.CHATTY_SMOKE_USER;
  if (explicit) {
    return explicit;
  }

  const { data, error } = await supabase
    .from('vault_files')
    .select('user_id')
    .not('user_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to auto-select smoke user: ${error.message}`);
  }

  if (!data?.user_id) {
    throw new Error('No vault_files rows with user_id found for smoke test');
  }

  return data.user_id;
}

async function loadAvatarConstructIds(supabase, supabaseUserId) {
  const { data, error } = await supabase
    .from('vault_files')
    .select('construct_id,filename,created_at')
    .eq('user_id', supabaseUserId)
    .not('construct_id', 'is', null)
    .or('filename.like.%avatar.png,filename.like.%avatar.jpg,filename.like.%avatar.jpeg,filename.like.%avatar.webp,filename.like.%avatar.svg,filename.like.%avatar.avif')
    .order('created_at', { ascending: false })
    .limit(AVATAR_LIMIT * 4);

  if (error) {
    throw new Error(`Failed to load avatar candidates: ${error.message}`);
  }

  const constructIds = [];
  const seen = new Set();
  for (const row of data || []) {
    if (!row.construct_id || seen.has(row.construct_id)) continue;
    seen.add(row.construct_id);
    constructIds.push(row.construct_id);
    if (constructIds.length >= AVATAR_LIMIT) break;
  }
  return constructIds;
}

function printMetric(label, value, budget) {
  const status = value <= budget ? 'PASS' : 'FAIL';
  console.log(`${status} ${label}: ${value.toFixed(1)}ms (budget ${budget}ms)`);
  return status === 'PASS';
}

async function main() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client could not be initialized');
  }

  const supabaseUserId = await resolveSmokeUserId(supabase);
  console.log(`Smoke user: ${supabaseUserId}`);

  const avatarConstructIds = await loadAvatarConstructIds(supabase, supabaseUserId);
  const avatarItems = avatarConstructIds.map((constructId) => ({ aiId: constructId, constructId }));

  await Promise.all(avatarItems.map((item) => loadCanonicalConstructIdentity({
    constructId: item.constructId,
    supabaseUserId,
  })));
  const tAvatar0 = performance.now();
  const avatarIdentities = await Promise.all(avatarItems.map((item) => loadCanonicalConstructIdentity({
    constructId: item.constructId,
    supabaseUserId,
  })));
  const avatarDescriptorMap = new Map(
    avatarIdentities
      .filter((identity) => identity?.avatarDescriptor)
      .map((identity) => [identity.constructId, identity.avatarDescriptor]),
  );
  const avatarMs = performance.now() - tAvatar0;

  await listCanonicalConversations({ supabaseUserId });
  const tList0 = performance.now();
  const canonicalConversations = await listCanonicalConversations({ supabaseUserId });
  const listMs = performance.now() - tList0;

  let messageMs = 0;
  let canonicalMessages = [];
  const firstConversation = canonicalConversations[0] || null;
  if (firstConversation?._id) {
    await getCanonicalConversationMessages({
      supabaseUserId,
      conversationId: firstConversation._id,
      constructId: firstConversation.constructId,
    });
    const tMessages0 = performance.now();
    canonicalMessages = await getCanonicalConversationMessages({
      supabaseUserId,
      conversationId: firstConversation._id,
      constructId: firstConversation.constructId,
    });
    messageMs = performance.now() - tMessages0;
  }

  console.log('\nSummary');
  console.log('-------');
  console.log(`Avatar descriptors: ${avatarDescriptorMap.size}`);
  console.log(`Canonical conversations: ${canonicalConversations.length}`);
  console.log(`First conversation: ${firstConversation?._id || '(none)'}`);
  console.log(`First conversation messages: ${canonicalMessages.length}`);

  const passAvatar = printMetric('avatar descriptor batch', avatarMs, AVATAR_BUDGET_MS);
  const passList = printMetric('conversation list', listMs, CONVERSATION_LIST_BUDGET_MS);
  const passMessages = firstConversation
    ? printMetric('conversation messages', messageMs, CONVERSATION_MESSAGES_BUDGET_MS)
    : true;

  if (avatarDescriptorMap.size === 0) {
    throw new Error('Smoke test found zero canonical avatar descriptors');
  }
  if (canonicalConversations.length === 0) {
    throw new Error('Smoke test found zero canonical conversations');
  }
  if (firstConversation && canonicalMessages.length === 0) {
    throw new Error(`Smoke test found zero messages for ${firstConversation._id}`);
  }
  if (!passAvatar || !passList || !passMessages) {
    throw new Error('One or more latency budgets were exceeded');
  }

  console.log('\nPASS canonical:supabase:smoke');
}

main().catch((error) => {
  console.error(`FAIL canonical:supabase:smoke - ${error.message}`);
  process.exit(1);
});
