import { getVvaultServiceTokens } from './vvaultBridgeConfig.js';

function resolveServiceTokenOperator(req) {
  const authHeader = String(req?.headers?.authorization || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length).trim()
    : '';
  const headerToken = String(
    req?.headers?.['x-chatty-key'] ||
    req?.headers?.['x-service-token'] ||
    '',
  ).trim();
  const token = bearerToken || headerToken;
  const tokens = getVvaultServiceTokens();
  if (!token || tokens.length === 0 || !tokens.includes(token)) return null;

  const userId = String(
    req?.headers?.['x-chatty-user-id'] ||
    req?.headers?.['x-chatty-operator-id'] ||
    '',
  ).trim();
  if (!userId) {
    return {
      ok: false,
      error: 'Service-token operator requests require x-chatty-user-id.',
    };
  }

  const email = String(
    req?.headers?.['x-chatty-user-email'] ||
    req?.headers?.['x-chatty-operator-email'] ||
    '',
  ).trim();
  const name = String(
    req?.headers?.['x-chatty-operator-name'] ||
    req?.headers?.['x-chatty-user-name'] ||
    'Zenith/Codex',
  ).trim();

  return {
    ok: true,
    userId,
    email,
    name,
  };
}

export async function normalizeVvaultRouteRequest({
  req,
  resolveSupabaseUser,
  buildAuthReceipt,
  normalizeInferenceRequest,
}) {
  const inferenceClock = req.clock || new Date().toISOString();
  const inferenceRequestId = req.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const authHeader = (req?.headers?.authorization || '').toString();
  const hasSupabaseAuthHeader = authHeader.toLowerCase().startsWith('bearer ');
  const hasReqUser = !!req?.user;

  let userId;
  let authRecovered = false;
  let supabaseSessionUserId = null;
  let authSource = 'supabase_session';
  const serviceTokenOperator = resolveServiceTokenOperator(req);

  if (serviceTokenOperator?.ok) {
    userId = serviceTokenOperator.userId;
    authSource = 'service_token_operator';
    req.user = {
      ...(req.user || {}),
      id: userId,
      sub: userId,
      email: serviceTokenOperator.email || req.user?.email || null,
      name: serviceTokenOperator.name,
      auth_provider: 'service_token',
    };
  } else if (serviceTokenOperator && serviceTokenOperator.ok === false) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: serviceTokenOperator.error },
      inferenceClock,
      inferenceRequestId,
      hasSupabaseAuthHeader,
      hasReqUser,
    };
  } else {
    try {
      const user = await resolveSupabaseUser(req);
      userId = user.id;
      supabaseSessionUserId = user.id;
    } catch {
      if (process.env.NODE_ENV !== 'production' && (req?.user?.id || req?.user?.sub)) {
        userId = req.user.id || req.user.sub;
        authRecovered = true;
        authSource = 'app_jwt_dev_fallback';
        console.warn(`[VVAULT Auth] Supabase session missing; dev fallback to app JWT for user ${userId}`);
      } else {
        return {
          ok: false,
          status: 401,
          body: { ok: false, error: 'Authentication required' },
          inferenceClock,
          inferenceRequestId,
          hasSupabaseAuthHeader,
          hasReqUser,
        };
      }
    }
  }

  const normalized = normalizeInferenceRequest(req.body);
  if (normalized.error) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: normalized.error },
      inferenceClock,
      inferenceRequestId,
      hasSupabaseAuthHeader,
      hasReqUser,
      userId,
      supabaseSessionUserId,
      authRecovered,
      authSource,
    };
  }

  const devDataOwnerOverride =
    process.env.NODE_ENV !== 'production' &&
    typeof process.env.CHATTY_DEV_DATA_OWNER_SUPABASE_USER_ID === 'string' &&
    /^[0-9a-f-]{36}$/i.test(process.env.CHATTY_DEV_DATA_OWNER_SUPABASE_USER_ID.trim())
      ? process.env.CHATTY_DEV_DATA_OWNER_SUPABASE_USER_ID.trim()
      : null;
  const dataOwnerUserId = devDataOwnerOverride || userId;
  const dataOwnerSource = devDataOwnerOverride ? 'dev_env_supabase_user_override' : authSource;
  const authReceipt = buildAuthReceipt({
    user: req.user,
    userId,
    supabaseSessionUserId,
    authSource,
    authRecovered,
    devDataOwnerOverride,
    dataOwnerUserId,
    dataOwnerSource,
  });

  return {
    ok: true,
    inferenceClock,
    inferenceRequestId,
    hasSupabaseAuthHeader,
    hasReqUser,
    userId,
    supabaseSessionUserId,
    authRecovered,
    authSource,
    devDataOwnerOverride,
    dataOwnerUserId,
    dataOwnerSource,
    authReceipt,
    normalized,
  };
}
