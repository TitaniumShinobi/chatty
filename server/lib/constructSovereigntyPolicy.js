const FALLBACK_CANONICAL_OWNER_SUPABASE_USER_ID =
  '7e34f6b8-e33a-48b5-8ddb-95b94d18e296';
const FALLBACK_CANONICAL_OWNER_EMAIL = 'dwoodson92@gmail.com';
const FALLBACK_CANONICAL_OWNER_VVAULT_USER_ID = 'devon_woodson_1762969514958';

export const DEFAULT_CANONICAL_OWNER_SUPABASE_USER_ID =
  process.env.CANONICAL_OWNER_SUPABASE_USER_ID ||
  FALLBACK_CANONICAL_OWNER_SUPABASE_USER_ID;
export const DEFAULT_CANONICAL_OWNER_EMAIL =
  process.env.CANONICAL_OWNER_EMAIL || FALLBACK_CANONICAL_OWNER_EMAIL;
export const DEFAULT_CANONICAL_OWNER_VVAULT_USER_ID =
  process.env.CANONICAL_OWNER_VVAULT_USER_ID ||
  process.env.VVAULT_USER_ID ||
  FALLBACK_CANONICAL_OWNER_VVAULT_USER_ID;

const UUID_RE = /^[0-9a-f-]{36}$/i;

const DEFAULT_CANONICAL_OWNER_IDENTIFIERS = [
  DEFAULT_CANONICAL_OWNER_EMAIL,
  DEFAULT_CANONICAL_OWNER_VVAULT_USER_ID,
  DEFAULT_CANONICAL_OWNER_SUPABASE_USER_ID,
];

export const PROTECTED_CONSTRUCT_NAMES = [
  {
    key: 'zen',
    displayName: 'Zen',
    aliases: ['zen', 'zenith', 'chatty zen', 'zen chatty', 'zen system', 'zen os'],
  },
  {
    key: 'lin',
    displayName: 'Lin',
    aliases: ['lin', 'linear', 'casa madrigal', 'lin os', 'linear os', 'lin house'],
  },
  {
    key: 'nova',
    displayName: 'Nova',
    aliases: ['nova', 'nova jane', 'nova jane woodson', 'nova returns', 'novareturns'],
  },
  {
    key: 'katana',
    displayName: 'Katana',
    aliases: ['katana'],
  },
  {
    key: 'sera',
    displayName: 'Sera',
    aliases: ['sera'],
  },
  {
    key: 'aurora',
    displayName: 'Aurora',
    aliases: ['aurora'],
  },
  {
    key: 'monday',
    displayName: 'Monday',
    aliases: ['monday'],
  },
];

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

export function normalizePolicyToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripCallsignSuffix(value) {
  return normalizePolicyToken(value)
    .replace(/^gpt-/, '')
    .replace(/-seed(?:-\d+)?$/, '')
    .replace(/-\d{1,6}$/, '');
}

function ownerIdentifierSet(env = process.env) {
  const configured = String(env.CHATTY_CANONICAL_OWNER_IDENTIFIERS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_CANONICAL_OWNER_IDENTIFIERS, ...configured].map(normalizePolicyToken));
}

function readCanonicalEnvValue(env, key, defaultValue = '') {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    return String(env[key] || '').trim();
  }
  return String(defaultValue || '').trim();
}

export function isCanonicalOwnerSupabaseUserId(value) {
  return UUID_RE.test(String(value || '').trim());
}

export function resolveCanonicalOwnerSupabaseUserId(env = process.env) {
  const configured =
    readCanonicalEnvValue(env, 'CHATTY_CANONICAL_OWNER_SUPABASE_USER_ID') ||
    readCanonicalEnvValue(env, 'CHATTY_ZEN_CANONICAL_OWNER_SUPABASE_USER_ID');
  if (isCanonicalOwnerSupabaseUserId(configured)) {
    return configured;
  }

  const fallback = readCanonicalEnvValue(
    env,
    'CANONICAL_OWNER_SUPABASE_USER_ID',
    DEFAULT_CANONICAL_OWNER_SUPABASE_USER_ID,
  );
  return isCanonicalOwnerSupabaseUserId(fallback) ? fallback : '';
}

function collectActorIdentifiers(actor = {}) {
  if (typeof actor === 'string') return [actor];
  const values = [
    actor.id,
    actor.uid,
    actor.sub,
    actor.email,
    actor.userId,
    actor.supabaseUserId,
    actor.chattyUserId,
    actor.vvaultUserId,
    ...toArray(actor.identifiers),
  ];
  return values.filter(Boolean).map(normalizePolicyToken);
}

export function isCanonicalOwner(actor = {}, env = process.env) {
  const allowed = ownerIdentifierSet(env);
  return collectActorIdentifiers(actor).some((identifier) => allowed.has(identifier));
}

function protectedAliases() {
  return PROTECTED_CONSTRUCT_NAMES.flatMap((record) =>
    record.aliases.map((alias) => ({
      key: record.key,
      displayName: record.displayName,
      alias,
      slug: normalizePolicyToken(alias),
    }))
  );
}

function candidateSlugs({ name, constructCallsign, id, aliases = [] } = {}) {
  const raw = [name, constructCallsign, id, ...toArray(aliases)].filter(Boolean);
  const slugs = new Set();
  for (const value of raw) {
    const normalized = normalizePolicyToken(value);
    const base = stripCallsignSuffix(value);
    if (normalized) slugs.add(normalized);
    if (base) slugs.add(base);
  }
  return Array.from(slugs);
}

function matchesProtectedAlias(candidate, protectedSlug) {
  if (!candidate || !protectedSlug) return false;
  if (candidate === protectedSlug) return true;
  if (candidate.startsWith(`${protectedSlug}-`)) return true;
  if (candidate.endsWith(`-${protectedSlug}`)) return true;
  if (candidate.includes(`-${protectedSlug}-`)) return true;
  return false;
}

export function findProtectedConstructName(input = {}) {
  const candidates = candidateSlugs(input);
  for (const candidate of candidates) {
    for (const protectedAlias of protectedAliases()) {
      if (matchesProtectedAlias(candidate, protectedAlias.slug)) {
        return {
          ...protectedAlias,
          matched: candidate,
        };
      }
    }
  }
  return null;
}

export function evaluateConstructSovereignty(input = {}) {
  const {
    name,
    constructCallsign,
    id,
    actor = {},
    operation = 'construct_use',
    env = process.env,
  } = input;
  const match = findProtectedConstructName({ name, constructCallsign, id });

  if (!match) {
    return {
      allowed: true,
      reason: 'unrestricted_name',
      statusCode: 200,
      operation,
      receipt: {
        policy: 'construct_sovereignty',
        status: 'pass',
        reason: 'unrestricted_name',
        operation,
      },
    };
  }

  const ownerAllowed = isCanonicalOwner(actor, env);
  if (ownerAllowed) {
    return {
      allowed: true,
      reason: 'canonical_owner_allowed',
      statusCode: 200,
      operation,
      match,
      receipt: {
        policy: 'construct_sovereignty',
        status: 'pass',
        reason: 'canonical_owner_allowed',
        operation,
        protectedConstruct: match.displayName,
      },
    };
  }

  return {
    allowed: false,
    reason: 'restricted_construct_name',
    statusCode: 403,
    operation,
    match,
    message: `"${match.displayName}" is a restricted protected construct name until Chatty has the restricted-name verification path.`,
    receipt: {
      policy: 'construct_sovereignty',
      status: 'fail',
      reason: 'restricted_construct_name',
      operation,
      protectedConstruct: match.displayName,
      matched: match.matched,
    },
  };
}

export function assertConstructSovereignty(input = {}) {
  const result = evaluateConstructSovereignty(input);
  if (result.allowed) return result;
  const error = new Error(result.reason);
  error.code = result.reason;
  error.statusCode = result.statusCode;
  error.policyResult = result;
  throw error;
}

export function isConstructSovereigntyError(error) {
  return Boolean(error?.policyResult && error?.code === 'restricted_construct_name');
}

export function isStoreListingAllowed(ai = {}, env = process.env) {
  return evaluateConstructSovereignty({
    name: ai.name,
    constructCallsign: ai.constructCallsign || ai.construct_callsign || ai.construct_call_sign,
    id: ai.id,
    actor: {
      userId: ai.userId || ai.user_id,
      email: ai.email || ai.userEmail,
      supabaseUserId: ai.supabaseUserId,
    },
    operation: 'community_explore_listing',
    env,
  });
}
