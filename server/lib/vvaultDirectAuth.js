function parseCookieHeader(headerValue = "") {
  if (!headerValue || typeof headerValue !== "string") return {};
  return headerValue.split(";").reduce((accumulator, part) => {
    const [rawKey, ...valueParts] = part.trim().split("=");
    if (!rawKey) return accumulator;
    accumulator[rawKey] = decodeURIComponent(valueParts.join("=") || "");
    return accumulator;
  }, {});
}

function hasNamedCookie(rawCookieHeader, cookieName) {
  return Boolean(parseCookieHeader(rawCookieHeader)[cookieName]);
}

function buildFailure(status, errorCode, message, details = {}) {
  return {
    ok: false,
    status,
    errorCode,
    error: message,
    message,
    details,
  };
}

function isSharedAuthFailure(attempt) {
  if (!attempt) return false;
  return attempt.method === "shared_auth_bridge" && [401, 403].includes(attempt.status);
}

function isBridgeConfigurationFailure(attempt) {
  if (!attempt) return false;
  if (attempt.method === "shared_auth_bridge") {
    return (
      [400, 404].includes(attempt.status) ||
      (attempt.status === 503 &&
        /auth_session_secret|not configured|misconfigured/i.test(String(attempt.error || "")))
    );
  }
  if (attempt.method === "legacy_service_exchange") {
    return [400, 401, 403, 404].includes(attempt.status);
  }
  return false;
}

function isConnectivityFailure(attempt) {
  if (!attempt) return false;
  return (
    attempt.replitProxyError != null ||
    attempt.status == null ||
    attempt.status === 502 ||
    attempt.status === 503 ||
    attempt.status === 504
  );
}

async function attemptSharedAuthBridge({
  target,
  rawCookieHeader,
  fetchImpl,
  isHostAsleepResponse,
  replitProxyErrorHeader,
}) {
  const url = `${target.origin}/api/vault/session-bridge`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        cookie: rawCookieHeader,
      },
      redirect: "manual",
    });

    if (isHostAsleepResponse(response)) {
      return {
        ok: false,
        attempt: {
          method: "shared_auth_bridge",
          name: target.name,
          origin: target.origin,
          status: response.status,
          replitProxyError: response.headers.get(replitProxyErrorHeader) || null,
        },
      };
    }

    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.success && data?.token) {
      return {
        ok: true,
        payload: {
          ok: true,
          token: data.token,
          expiresAt: data.expires_at || null,
          apiBaseUrl: data.api_base_url || `${target.origin}/api/vault`,
          selectedTargetName: target.name,
          user: data.user || null,
          authMethod: "shared_auth_bridge",
        },
      };
    }

    return {
      ok: false,
      attempt: {
        method: "shared_auth_bridge",
        name: target.name,
        origin: target.origin,
        status: response.status,
        error: data?.error || null,
        replitProxyError: response.headers.get(replitProxyErrorHeader) || null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      attempt: {
        method: "shared_auth_bridge",
        name: target.name,
        origin: target.origin,
        status: null,
        errorCode: error?.code || null,
        error: error?.message || null,
        replitProxyError: null,
      },
    };
  }
}

async function attemptLegacyExchange({
  target,
  email,
  displayName,
  fetchImpl,
  isHostAsleepResponse,
  replitProxyErrorHeader,
}) {
  const url = `${target.origin}/api/chatty/session/exchange`;
  const headers = {
    "X-Chatty-User": email,
    "X-Chatty-Name": displayName,
  };
  if (target.token) {
    headers["X-Chatty-Key"] = target.token;
  }

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
    });

    if (isHostAsleepResponse(response)) {
      return {
        ok: false,
        attempt: {
          method: "legacy_service_exchange",
          name: target.name,
          origin: target.origin,
          status: response.status,
          replitProxyError: response.headers.get(replitProxyErrorHeader) || null,
        },
      };
    }

    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.success && data?.token) {
      return {
        ok: true,
        payload: {
          ok: true,
          token: data.token,
          expiresAt: data.expires_at || null,
          apiBaseUrl: data.api_base_url || `${target.origin}/api/vault`,
          selectedTargetName: target.name,
          user: data.user || null,
          authMethod: "legacy_service_exchange",
        },
      };
    }

    return {
      ok: false,
      attempt: {
        method: "legacy_service_exchange",
        name: target.name,
        origin: target.origin,
        status: response.status,
        error: data?.error || null,
        replitProxyError: response.headers.get(replitProxyErrorHeader) || null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      attempt: {
        method: "legacy_service_exchange",
        name: target.name,
        origin: target.origin,
        status: null,
        errorCode: error?.code || null,
        error: error?.message || null,
        replitProxyError: null,
      },
    };
  }
}

export async function resolveVvaultDirectAuth({
  targets,
  rawCookieHeader,
  email,
  displayName,
  cookieName = "auth_sid",
  allowLegacyFallback = false,
  fetchImpl = globalThis.fetch,
  isHostAsleepResponse = () => false,
  replitProxyErrorHeader = "Replit-Proxy-Error",
}) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return buildFailure(
      503,
      "AUTH_BRIDGE_MISCONFIGURED",
      "VVAULT direct auth is not configured",
      { missingTargets: true, attempts: [] },
    );
  }

  const attempts = [];
  const hasSharedAuthCookie = hasNamedCookie(rawCookieHeader, cookieName);

  if (!hasSharedAuthCookie && (!allowLegacyFallback || !email)) {
    return buildFailure(401, "AUTH_REQUIRED", "Shared authentication required", {
      sharedAuthCookiePresent: false,
      attempts,
      legacyFallbackAvailable: allowLegacyFallback,
    });
  }

  if (hasSharedAuthCookie) {
    for (const target of targets) {
      const result = await attemptSharedAuthBridge({
        target,
        rawCookieHeader,
        fetchImpl,
        isHostAsleepResponse,
        replitProxyErrorHeader,
      });
      if (result.ok) {
        return result.payload;
      }
      attempts.push(result.attempt);
    }
  }

  if (allowLegacyFallback && email) {
    for (const target of targets) {
      const result = await attemptLegacyExchange({
        target,
        email,
        displayName,
        fetchImpl,
        isHostAsleepResponse,
        replitProxyErrorHeader,
      });
      if (result.ok) {
        return result.payload;
      }
      attempts.push(result.attempt);
    }
  }

  if (attempts.some(isSharedAuthFailure)) {
    return buildFailure(401, "AUTH_REQUIRED", "Shared authentication required", {
      sharedAuthCookiePresent: hasSharedAuthCookie,
      attempts,
      legacyFallbackAvailable: allowLegacyFallback,
    });
  }

  if (attempts.some(isBridgeConfigurationFailure)) {
    return buildFailure(
      503,
      "AUTH_BRIDGE_MISCONFIGURED",
      "VVAULT shared auth bridge is unavailable or misconfigured",
      {
        sharedAuthCookiePresent: hasSharedAuthCookie,
        attempts,
        legacyFallbackAvailable: allowLegacyFallback,
      },
    );
  }

  if (attempts.some(isConnectivityFailure)) {
    return buildFailure(
      502,
      "VVAULT_UNREACHABLE",
      "Unable to reach the VVAULT server",
      {
        sharedAuthCookiePresent: hasSharedAuthCookie,
        attempts,
        legacyFallbackAvailable: allowLegacyFallback,
      },
    );
  }

  return buildFailure(
    502,
    "VVAULT_UNREACHABLE",
    "Unable to establish a VVAULT session",
    {
      sharedAuthCookiePresent: hasSharedAuthCookie,
      attempts,
      legacyFallbackAvailable: allowLegacyFallback,
    },
  );
}
