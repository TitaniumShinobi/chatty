import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const raw = req.cookies?.[process.env.COOKIE_NAME || "sid"];
  if (!raw) return res.status(401).json({ ok: false });
  try {
    req.user = jwt.verify(raw, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ ok: false });
  }
}
