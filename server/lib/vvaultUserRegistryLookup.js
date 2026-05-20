function normalizeTimeoutMs(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function resolveLinkedVvaultUserId({
  userModel,
  userLookupId,
  initialVvaultUserId = null,
  timeoutMs = Number(process.env.VVAULT_USER_REGISTRY_LOOKUP_TIMEOUT_MS || 500),
  logger = console,
} = {}) {
  let linkedVvaultUserId = initialVvaultUserId || null;
  if (!userLookupId || !userModel) {
    return linkedVvaultUserId;
  }

  const readyState = Number(
    userModel?.db?.readyState ??
      userModel?.collection?.conn?.readyState ??
      0,
  );

  if (readyState !== 1) {
    logger?.warn?.(
      `⚠️ [VVAULT API] Skipping user registry lookup for ${userLookupId}; mongoose readyState=${readyState}`,
    );
    return linkedVvaultUserId;
  }

  const boundedTimeoutMs = normalizeTimeoutMs(timeoutMs, 500);
  let timeoutId = null;

  try {
    const queryPromise = userModel
      .findById(userLookupId)
      .select("vvaultUserId email")
      .lean()
      .exec();

    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ __timedOut: true }), boundedTimeoutMs);
    });

    const userRecord = await Promise.race([queryPromise, timeoutPromise]);
    if (userRecord?.__timedOut) {
      logger?.warn?.(
        `⚠️ [VVAULT API] User registry lookup timed out after ${boundedTimeoutMs}ms for ${userLookupId}; continuing without Mongo-linked VVAULT id`,
      );
      return linkedVvaultUserId;
    }

    if (userRecord?.vvaultUserId) {
      linkedVvaultUserId = userRecord.vvaultUserId;
    }

    return linkedVvaultUserId;
  } catch (lookupError) {
    logger?.warn?.(
      `⚠️ [VVAULT API] Could not load user record for VVAULT lookup: ${lookupError.message}`,
    );
    return linkedVvaultUserId;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
