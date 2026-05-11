import { createClient } from '@supabase/supabase-js';

const SUPABASE_AUTH_TIMEOUT_MS = Number(process.env.SUPABASE_AUTH_TIMEOUT_MS || 1200);

function parseCookieHeader(rawCookie = '') {
  const parsed = {};
  if (!rawCookie || typeof rawCookie !== 'string') return parsed;
  for (const part of rawCookie.split(';')) {
    const [k, ...rest] = part.split('=');
    const key = (k || '').trim();
    if (!key) continue;
    parsed[key] = rest.join('=').trim();
  }
  return parsed;
}

function tryDecodeBase64(value = '') {
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function parseTokenCandidate(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return null;
  let value = rawValue.trim();
  if (!value) return null;

  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  try {
    value = decodeURIComponent(value);
  } catch {}

  const candidates = [value];
  if (value.startsWith('base64-')) {
    candidates.push(tryDecodeBase64(value.slice('base64-'.length)));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;

    const directToken = candidate.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    if (directToken) return directToken[0];

    const normalized = candidate.startsWith('j:') ? candidate.slice(2) : candidate;
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
        return parsed[0];
      }
      if (parsed && typeof parsed === 'object' && typeof parsed.access_token === 'string') {
        return parsed.access_token;
      }
    } catch {}
  }

  return null;
}

function extractAccessToken(req) {
  const headerAuth = String(req?.headers?.authorization || '').trim();
  if (headerAuth.toLowerCase().startsWith('bearer ')) {
    return headerAuth.slice(7).trim();
  }

  const cookieMap = {
    ...parseCookieHeader(req?.headers?.cookie || ''),
    ...(req?.cookies || {}),
  };

  for (const [key, rawValue] of Object.entries(cookieMap)) {
    if (!key || typeof rawValue !== 'string') continue;
    if (!key.includes('auth-token') && !key.includes('sb-') && !key.includes('supabase')) continue;
    const token = parseTokenCandidate(rawValue);
    if (token) return token;
  }

  return null;
}

async function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Resolve the current Supabase user by inspecting the request's cookies or
 * authorization header. This mirrors what `supabase.auth.getUser()` does in the
 * browser, but is safe to call server‑side on every request.
 *
 * The caller should catch any errors and translate them into a 401/400 as
 * appropriate; this helper simply throws when the session cannot be validated.
 *
 * @param {import('express').Request} req
 * @returns {Promise<import('@supabase/supabase-js').User>}
 */
export async function resolveSupabaseUser(req) {
  const accessToken = extractAccessToken(req);
  if (!accessToken) {
    throw new Error('No Supabase access token found');
  }
  const authHeader = accessToken
    ? `Bearer ${accessToken}`
    : String(req?.headers?.authorization || '');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: authHeader,
          Cookie: req?.headers?.cookie || '',
        },
      },
    }
  );

  const { data, error } = await withTimeout(
    supabase.auth.getUser(accessToken),
    SUPABASE_AUTH_TIMEOUT_MS,
    'supabase auth.getUser'
  );
  if (error || !data?.user) {
    throw new Error('Failed to resolve Supabase user ID');
  }

  return data.user;
}
