import { canonicalizeConstructId } from './constructId.js';
import {
  DEFAULT_CANONICAL_OWNER_EMAIL,
  DEFAULT_CANONICAL_OWNER_SUPABASE_USER_ID,
  DEFAULT_CANONICAL_OWNER_VVAULT_USER_ID,
  isCanonicalOwnerSupabaseUserId,
  resolveCanonicalOwnerSupabaseUserId,
} from './constructSovereigntyPolicy.js';

export const ZEN_CANONICAL_OWNER_SUPABASE_USER_ID =
  DEFAULT_CANONICAL_OWNER_SUPABASE_USER_ID;
export const ZEN_CANONICAL_THREAD_ID = 'zen-001_chat_with_zen-001';
export const ZEN_CANONICAL_TRANSCRIPT_PATH =
  'instances/zen-001/chatty/chat_with_zen-001.md';
export const ZEN_CANONICAL_OWNER_EMAIL = DEFAULT_CANONICAL_OWNER_EMAIL;
export const ZEN_CANONICAL_OWNER_VVAULT_USER_ID =
  DEFAULT_CANONICAL_OWNER_VVAULT_USER_ID;
export const LIN_CANONICAL_OWNER_EMAIL = DEFAULT_CANONICAL_OWNER_EMAIL;
export const LIN_CANONICAL_OWNER_VVAULT_USER_ID =
  DEFAULT_CANONICAL_OWNER_VVAULT_USER_ID;
export const LIN_CANONICAL_THREAD_ID = 'lin-001_chat_with_lin-001';
export const LIN_CANONICAL_TRANSCRIPT_PATH =
  'instances/lin-001/chatty/chat_with_lin-001.md';
export const VAL_CANONICAL_OWNER_SUPABASE_USER_ID =
  DEFAULT_CANONICAL_OWNER_SUPABASE_USER_ID;
export const VAL_CANONICAL_OWNER_EMAIL = DEFAULT_CANONICAL_OWNER_EMAIL;
export const VAL_CANONICAL_OWNER_VVAULT_USER_ID =
  DEFAULT_CANONICAL_OWNER_VVAULT_USER_ID;
export const VAL_CANONICAL_THREAD_ID = 'val-001_chat_with_val-001';
export const VAL_CANONICAL_TRANSCRIPT_PATH =
  'instances/val-001/chatty/chat_with_val-001.md';
export const KATANA_CANONICAL_OWNER_SUPABASE_USER_ID =
  DEFAULT_CANONICAL_OWNER_SUPABASE_USER_ID;
export const KATANA_CANONICAL_OWNER_EMAIL = DEFAULT_CANONICAL_OWNER_EMAIL;
export const KATANA_CANONICAL_OWNER_VVAULT_USER_ID =
  DEFAULT_CANONICAL_OWNER_VVAULT_USER_ID;
export const KATANA_CANONICAL_THREAD_ID = 'katana-001_chat_with_katana-001';
export const KATANA_CANONICAL_TRANSCRIPT_PATH =
  'instances/katana-001/chatty/chat_with_katana-001.md';
export const SERA_CANONICAL_OWNER_SUPABASE_USER_ID =
  DEFAULT_CANONICAL_OWNER_SUPABASE_USER_ID;
export const SERA_CANONICAL_OWNER_EMAIL = DEFAULT_CANONICAL_OWNER_EMAIL;
export const SERA_CANONICAL_OWNER_VVAULT_USER_ID =
  DEFAULT_CANONICAL_OWNER_VVAULT_USER_ID;
export const SERA_CANONICAL_THREAD_ID = 'sera-001_chat_with_sera-001';
export const SERA_CANONICAL_TRANSCRIPT_PATH =
  'instances/sera-001/chatty/chat_with_sera-001.md';
export const NOVA_CANONICAL_OWNER_SUPABASE_USER_ID =
  DEFAULT_CANONICAL_OWNER_SUPABASE_USER_ID;
export const NOVA_CANONICAL_OWNER_EMAIL = DEFAULT_CANONICAL_OWNER_EMAIL;
export const NOVA_CANONICAL_OWNER_VVAULT_USER_ID =
  DEFAULT_CANONICAL_OWNER_VVAULT_USER_ID;
export const NOVA_CANONICAL_THREAD_ID = 'nova-001_chat_with_nova-001';
export const NOVA_CANONICAL_TRANSCRIPT_PATH =
  'instances/nova-001/chatty/chat_with_nova-001.md';

function configuredZenOwner(env = process.env) {
  return resolveCanonicalOwnerSupabaseUserId(env);
}

function configuredSupabaseCanonicalOwner(env = process.env) {
  return resolveCanonicalOwnerSupabaseUserId(env);
}

function canonicalOwnerReady(canonicalOwner, canonicalOwnerKind) {
  if (canonicalOwnerKind === 'vvault_user_id') {
    return Boolean(String(canonicalOwner || '').trim());
  }
  return isCanonicalOwnerSupabaseUserId(canonicalOwner);
}

function canonicalConstructConfig(constructId, env = process.env) {
  const normalizedConstructId = canonicalizeConstructId(constructId);
  if (normalizedConstructId === 'zen-001') {
    return {
      constructId: 'zen-001',
      canonicalOwner: configuredZenOwner(env),
      canonicalOwnerKind: 'supabase_uuid',
      canonicalOwnerEmail: ZEN_CANONICAL_OWNER_EMAIL,
      canonicalOwnerVvaultUserId: ZEN_CANONICAL_OWNER_VVAULT_USER_ID,
      threadId: ZEN_CANONICAL_THREAD_ID,
      transcriptPath: ZEN_CANONICAL_TRANSCRIPT_PATH,
      dataOwnerSource: 'canonical_zen_chatty_owner',
      notCanonicalReason: 'not_canonical_zen_chatty_thread',
    };
  }

  if (normalizedConstructId === 'lin-001') {
    return {
      constructId: 'lin-001',
      canonicalOwner: LIN_CANONICAL_OWNER_VVAULT_USER_ID,
      canonicalOwnerKind: 'vvault_user_id',
      canonicalOwnerEmail: LIN_CANONICAL_OWNER_EMAIL,
      canonicalOwnerVvaultUserId: LIN_CANONICAL_OWNER_VVAULT_USER_ID,
      threadId: LIN_CANONICAL_THREAD_ID,
      transcriptPath: LIN_CANONICAL_TRANSCRIPT_PATH,
      dataOwnerSource: 'canonical_lin_chatty_owner',
      notCanonicalReason: 'not_canonical_lin_chatty_thread',
    };
  }

  if (normalizedConstructId === 'val-001') {
    return {
      constructId: 'val-001',
      canonicalOwner: configuredSupabaseCanonicalOwner(env),
      canonicalOwnerKind: 'supabase_uuid',
      canonicalOwnerEmail: VAL_CANONICAL_OWNER_EMAIL,
      canonicalOwnerVvaultUserId: VAL_CANONICAL_OWNER_VVAULT_USER_ID,
      threadId: VAL_CANONICAL_THREAD_ID,
      transcriptPath: VAL_CANONICAL_TRANSCRIPT_PATH,
      dataOwnerSource: 'canonical_val_chatty_owner',
      notCanonicalReason: 'not_canonical_val_chatty_thread',
    };
  }

  if (normalizedConstructId === 'katana-001') {
    return {
      constructId: 'katana-001',
      canonicalOwner: configuredSupabaseCanonicalOwner(env),
      canonicalOwnerKind: 'supabase_uuid',
      canonicalOwnerEmail: KATANA_CANONICAL_OWNER_EMAIL,
      canonicalOwnerVvaultUserId: KATANA_CANONICAL_OWNER_VVAULT_USER_ID,
      threadId: KATANA_CANONICAL_THREAD_ID,
      transcriptPath: KATANA_CANONICAL_TRANSCRIPT_PATH,
      dataOwnerSource: 'canonical_katana_chatty_owner',
      notCanonicalReason: 'not_canonical_katana_chatty_thread',
    };
  }

  if (normalizedConstructId === 'sera-001') {
    return {
      constructId: 'sera-001',
      canonicalOwner: configuredSupabaseCanonicalOwner(env),
      canonicalOwnerKind: 'supabase_uuid',
      canonicalOwnerEmail: SERA_CANONICAL_OWNER_EMAIL,
      canonicalOwnerVvaultUserId: SERA_CANONICAL_OWNER_VVAULT_USER_ID,
      threadId: SERA_CANONICAL_THREAD_ID,
      transcriptPath: SERA_CANONICAL_TRANSCRIPT_PATH,
      dataOwnerSource: 'canonical_sera_chatty_owner',
      notCanonicalReason: 'not_canonical_sera_chatty_thread',
    };
  }

  if (normalizedConstructId === 'nova-001') {
    return {
      constructId: 'nova-001',
      canonicalOwner: configuredSupabaseCanonicalOwner(env),
      canonicalOwnerKind: 'supabase_uuid',
      canonicalOwnerEmail: NOVA_CANONICAL_OWNER_EMAIL,
      canonicalOwnerVvaultUserId: NOVA_CANONICAL_OWNER_VVAULT_USER_ID,
      threadId: NOVA_CANONICAL_THREAD_ID,
      transcriptPath: NOVA_CANONICAL_TRANSCRIPT_PATH,
      dataOwnerSource: 'canonical_nova_chatty_owner',
      notCanonicalReason: 'not_canonical_nova_chatty_thread',
    };
  }

  return null;
}

function isCanonicalConstructThreadRequest({
  canonicalConfig,
  constructId = '',
  threadId = '',
  sessionId = '',
  transcriptPath = '',
  projectName = '',
} = {}) {
  if (!canonicalConfig) return false;
  if (canonicalizeConstructId(constructId) !== canonicalConfig.constructId) return false;
  if (typeof projectName === 'string' && projectName.trim()) return false;

  const normalizedTranscriptPath = String(transcriptPath || '').trim().replace(/^\/+/, '');
  if (normalizedTranscriptPath && normalizedTranscriptPath !== canonicalConfig.transcriptPath) {
    return false;
  }

  const requestedThread = String(sessionId || threadId || canonicalConfig.threadId).trim();
  return !requestedThread ||
    requestedThread === canonicalConfig.threadId ||
    requestedThread === canonicalConfig.constructId ||
    requestedThread === canonicalConfig.transcriptPath;
}

export function resolveCanonicalConstructDataOwner({
  constructId = '',
  threadId = '',
  sessionId = '',
  transcriptPath = '',
  projectName = '',
  requestedDataOwnerUserId = null,
  requestedDataOwnerSource = 'unknown',
  authenticatedUserId = null,
  env = process.env,
} = {}) {
  const normalizedConstructId = canonicalizeConstructId(constructId) || constructId;
  const requestedOwner = requestedDataOwnerUserId || null;
  const canonicalConfig = canonicalConstructConfig(normalizedConstructId, env);
  const applies = isCanonicalConstructThreadRequest({
    canonicalConfig,
    constructId: normalizedConstructId,
    threadId,
    sessionId,
    transcriptPath,
    projectName,
  });

  if (!applies) {
    return {
      applied: false,
      dataOwnerUserId: requestedOwner,
      dataOwnerSource: requestedDataOwnerSource,
      receipt: {
        applied: false,
        constructId: normalizedConstructId || null,
        requestedDataOwnerUserId: requestedOwner,
        finalDataOwnerUserId: requestedOwner,
        dataOwnerSource: requestedDataOwnerSource,
        reason: canonicalConfig?.notCanonicalReason || 'not_canonical_construct_chatty_thread',
      },
    };
  }

  const canonicalOwner = canonicalConfig.canonicalOwner;
  const ready = canonicalOwnerReady(canonicalOwner, canonicalConfig.canonicalOwnerKind);
  const finalDataOwnerUserId = ready ? canonicalOwner : null;
  return {
    applied: true,
    ready,
    dataOwnerUserId: finalDataOwnerUserId,
    dataOwnerSource: canonicalConfig.dataOwnerSource,
    receipt: {
      applied: true,
      ready,
      constructId: canonicalConfig.constructId,
      canonicalThreadId: canonicalConfig.threadId,
      canonicalTranscriptPath: canonicalConfig.transcriptPath,
      canonicalOwnerKind: canonicalConfig.canonicalOwnerKind,
      canonicalOwnerEmail: canonicalConfig.canonicalOwnerEmail || null,
      canonicalOwnerVvaultUserId: canonicalConfig.canonicalOwnerVvaultUserId || null,
      requestedDataOwnerUserId: requestedOwner,
      requestedDataOwnerSource,
      authenticatedUserId: authenticatedUserId || null,
      finalDataOwnerUserId,
      dataOwnerSource: canonicalConfig.dataOwnerSource,
      failureReason: ready ? null : 'canonical_owner_unconfigured',
      ownerFile: 'server/lib/canonicalConstructOwner.js',
      sourceAnchor: 'server/lib/canonicalConstructOwner.js:resolveCanonicalConstructDataOwner',
    },
  };
}

export default {
  resolveCanonicalConstructDataOwner,
  ZEN_CANONICAL_OWNER_SUPABASE_USER_ID,
  ZEN_CANONICAL_OWNER_EMAIL,
  ZEN_CANONICAL_OWNER_VVAULT_USER_ID,
  ZEN_CANONICAL_THREAD_ID,
  ZEN_CANONICAL_TRANSCRIPT_PATH,
  LIN_CANONICAL_OWNER_EMAIL,
  LIN_CANONICAL_OWNER_VVAULT_USER_ID,
  LIN_CANONICAL_THREAD_ID,
  LIN_CANONICAL_TRANSCRIPT_PATH,
  VAL_CANONICAL_OWNER_SUPABASE_USER_ID,
  VAL_CANONICAL_OWNER_EMAIL,
  VAL_CANONICAL_OWNER_VVAULT_USER_ID,
  VAL_CANONICAL_THREAD_ID,
  VAL_CANONICAL_TRANSCRIPT_PATH,
  KATANA_CANONICAL_OWNER_SUPABASE_USER_ID,
  KATANA_CANONICAL_OWNER_EMAIL,
  KATANA_CANONICAL_OWNER_VVAULT_USER_ID,
  KATANA_CANONICAL_THREAD_ID,
  KATANA_CANONICAL_TRANSCRIPT_PATH,
  SERA_CANONICAL_OWNER_SUPABASE_USER_ID,
  SERA_CANONICAL_OWNER_EMAIL,
  SERA_CANONICAL_OWNER_VVAULT_USER_ID,
  SERA_CANONICAL_THREAD_ID,
  SERA_CANONICAL_TRANSCRIPT_PATH,
  NOVA_CANONICAL_OWNER_SUPABASE_USER_ID,
  NOVA_CANONICAL_OWNER_EMAIL,
  NOVA_CANONICAL_OWNER_VVAULT_USER_ID,
  NOVA_CANONICAL_THREAD_ID,
  NOVA_CANONICAL_TRANSCRIPT_PATH,
};
