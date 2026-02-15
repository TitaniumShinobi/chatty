export function resolveUserId(user = {}) {
  return user.sub || user.id || user.uid || user.user_id || user._id || null;
}
