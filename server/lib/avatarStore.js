let avatarStoreConfig = null;

/**
 * Optional avatar CDN store bootstrap.
 * Chatty can run without this module; server startup should never fail if
 * avatar CDN wiring is unavailable.
 */
export function initAvatarStore(config = {}) {
  avatarStoreConfig = { ...config };
  return avatarStoreConfig;
}

export function getAvatarStoreConfig() {
  return avatarStoreConfig;
}
