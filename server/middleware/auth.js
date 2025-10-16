import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const raw = req.cookies?.[process.env.COOKIE_NAME || "sid"];
  if (!raw) return res.status(401).json({ ok: false });
  try {
    req.user = jwt.verify(raw, process.env.JWT_SECRET);
    // Ensure `sub` exists for backward/forward compatibility; fall back to
    // other common fields if necessary so server can reliably use req.user.sub
    if (!req.user.sub) {
      req.user.sub = req.user.id || req.user.uid || req.user.email || undefined;
    }
    return next();
  } catch {
    return res.status(401).json({ ok: false });
  }
}
