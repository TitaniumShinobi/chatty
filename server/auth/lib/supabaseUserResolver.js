/**
 * Shared Supabase user resolver - single source of truth for OAuth → Supabase mapping.
 * Input: OAuth email + chatty user id.
 * Resolve by email first; if not found, upsert then use new id.
 * Never diverge per route.
 */
import {
  isCanonicalOwner,
  resolveCanonicalOwnerSupabaseUserId,
} from "../../lib/constructSovereigntyPolicy.js";

const IS_DEV = process.env.NODE_ENV !== 'production';
const CACHE_TTL = 5 * 60 * 1000;
const SUPABASE_QUERY_TIMEOUT_MS = Number(process.env.SUPABASE_QUERY_TIMEOUT_MS || 2500);
const _cache = new Map();
const UUID_REGEX = /^[0-9a-f-]{36}$/i;

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '(none)';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '(invalid)';
  const visible = Math.min(2, Math.floor(local.length / 2));
  return `${local.slice(0, visible)}***@${domain}`;
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Resolve Supabase user id from OAuth context.
 * @param {{ email?: string, chattyUserId?: string }} - OAuth email and Chatty user id (sub/uid)
 * @returns {Promise<{ supabaseUserId: string|null, source: 'found'|'upserted'|'fallback' }>}
 */
export async function resolveSupabaseUserId({ email, chattyUserId }) {
  const cacheKey = email || chattyUserId || '';
  if (cacheKey) {
    const cached = _cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      if (IS_DEV) {
        console.log(`[supabaseUserResolver] cache hit ${maskEmail(email)} -> ${cached.id?.slice(0, 8) || 'null'}... source=${cached.source}`);
      }
      return { supabaseUserId: cached.id, source: cached.source };
    }
  }

  if (email && UUID_REGEX.test(email)) {
    _cache.set(cacheKey, { id: email, ts: Date.now(), source: 'passthrough' });
    return { supabaseUserId: email, source: 'passthrough' };
  }
  if (chattyUserId && UUID_REGEX.test(chattyUserId)) {
    _cache.set(cacheKey, { id: chattyUserId, ts: Date.now(), source: 'passthrough' });
    return { supabaseUserId: chattyUserId, source: 'passthrough' };
  }

  if (isCanonicalOwner({ email, chattyUserId, userId: chattyUserId })) {
    const canonicalSupabaseUserId = resolveCanonicalOwnerSupabaseUserId();
    _cache.set(cacheKey, { id: canonicalSupabaseUserId, ts: Date.now(), source: 'canonical_owner' });
    if (IS_DEV) {
      console.log(`[supabaseUserResolver] canonical owner fast path ${maskEmail(email)} -> ${canonicalSupabaseUserId.slice(0, 8)}... source=canonical_owner`);
    }
    return { supabaseUserId: canonicalSupabaseUserId, source: 'canonical_owner' };
  }

  const { getSupabaseClient } = await import('../../lib/supabaseClient.js');
  const supabase = getSupabaseClient();
  if (!supabase) {
    if (IS_DEV) {
      console.log(`[supabaseUserResolver] no Supabase client, fallback for ${maskEmail(email)}`);
    }
    return { supabaseUserId: null, source: 'fallback' };
  }

  if (!email && !chattyUserId) {
    return { supabaseUserId: null, source: 'fallback' };
  }

  try {
    if (email) {
      const { data: existing, error } = await withTimeout(
        supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .limit(1)
          .abortSignal(AbortSignal.timeout(SUPABASE_QUERY_TIMEOUT_MS))
          .maybeSingle(),
        SUPABASE_QUERY_TIMEOUT_MS + 200,
        'supabase users lookup'
      );

      if (!error && existing?.id) {
        _cache.set(cacheKey, { id: existing.id, ts: Date.now(), source: 'found' });
        if (IS_DEV) {
          console.log(`[supabaseUserResolver] found ${maskEmail(email)} -> ${existing.id.slice(0, 8)}... source=found`);
        }
        return { supabaseUserId: existing.id, source: 'found' };
      }

      const nameSlug = (email.split('@')[0] || 'user')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .slice(0, 50);
      const name = nameSlug + '_' + Date.now();

      let inserted = null;
      let upsertError = null;
      try {
        const result = await withTimeout(
          supabase
            .from('users')
            .upsert(
              { email, name },
              { onConflict: 'email', ignoreDuplicates: false }
            )
            .select('id')
            .abortSignal(AbortSignal.timeout(SUPABASE_QUERY_TIMEOUT_MS))
            .single(),
          SUPABASE_QUERY_TIMEOUT_MS + 200,
          'supabase users upsert'
        );
        inserted = result.data;
        upsertError = result.error;
      } catch (e) {
        upsertError = e;
      }

      if (!upsertError && inserted?.id) {
        _cache.set(cacheKey, { id: inserted.id, ts: Date.now(), source: 'upserted' });
        if (IS_DEV) {
          console.log(`[supabaseUserResolver] upserted ${maskEmail(email)} -> ${inserted.id.slice(0, 8)}... source=upserted`);
        }
        return { supabaseUserId: inserted.id, source: 'upserted' };
      }

      if (upsertError?.code === '23505') {
        const { data: retry } = await withTimeout(
          supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .limit(1)
            .abortSignal(AbortSignal.timeout(SUPABASE_QUERY_TIMEOUT_MS))
            .maybeSingle(),
          SUPABASE_QUERY_TIMEOUT_MS + 200,
          'supabase users retry lookup'
        );
        if (retry?.id) {
          _cache.set(cacheKey, { id: retry.id, ts: Date.now(), source: 'found' });
          if (IS_DEV) {
            console.log(`[supabaseUserResolver] race retry found ${maskEmail(email)} -> ${retry.id.slice(0, 8)}... source=found`);
          }
          return { supabaseUserId: retry.id, source: 'found' };
        }
      }

      const { data: insertData, error: insertError } = await withTimeout(
        supabase
          .from('users')
          .insert({ email, name })
          .select('id')
          .abortSignal(AbortSignal.timeout(SUPABASE_QUERY_TIMEOUT_MS))
          .single(),
        SUPABASE_QUERY_TIMEOUT_MS + 200,
        'supabase users insert'
      );
      if (!insertError && insertData?.id) {
        _cache.set(cacheKey, { id: insertData.id, ts: Date.now(), source: 'upserted' });
        if (IS_DEV) {
          console.log(`[supabaseUserResolver] inserted ${maskEmail(email)} -> ${insertData.id.slice(0, 8)}... source=upserted`);
        }
        return { supabaseUserId: insertData.id, source: 'upserted' };
      }
      if (insertError?.code === '23505') {
        const { data: retry } = await withTimeout(
          supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .limit(1)
            .abortSignal(AbortSignal.timeout(SUPABASE_QUERY_TIMEOUT_MS))
            .maybeSingle(),
          SUPABASE_QUERY_TIMEOUT_MS + 200,
          'supabase users post-insert retry'
        );
        if (retry?.id) {
          _cache.set(cacheKey, { id: retry.id, ts: Date.now(), source: 'found' });
          return { supabaseUserId: retry.id, source: 'found' };
        }
      }
    }
  } catch (err) {
    if (IS_DEV) {
      console.warn(`[supabaseUserResolver] error ${maskEmail(email)}:`, err.message);
    }
  }

  if (IS_DEV) {
    console.log(`[supabaseUserResolver] no match, fallback for ${maskEmail(email)} chattyUserId=${chattyUserId ? '***' : '(none)'}`);
  }
  return { supabaseUserId: null, source: 'fallback' };
}

/**
 * Backward-compat: resolve from emailOrId string (email or chatty id).
 * Used by supabaseStore when called with a single lookup string.
 */
export async function resolveSupabaseUserIdFromEmailOrId(emailOrId) {
  if (typeof emailOrId === 'string' && UUID_REGEX.test(emailOrId)) {
    return emailOrId;
  }
  const isEmail = typeof emailOrId === 'string' && emailOrId.includes('@');
  const { supabaseUserId } = await resolveSupabaseUserId({
    email: isEmail ? emailOrId : null,
    chattyUserId: isEmail ? null : emailOrId
  });
  return supabaseUserId;
}

export async function resolveRequestUser(req) {
  const chattyUserId =
    req?.user?.id || req?.user?.uid || req?.user?.sub || req?.user?.email || null;
  const email = req?.user?.email || null;
  const { supabaseUserId } = await resolveSupabaseUserId({ email, chattyUserId });
  return {
    supabaseUserId: supabaseUserId || null,
    chattyUserId: chattyUserId || null,
  };
}
