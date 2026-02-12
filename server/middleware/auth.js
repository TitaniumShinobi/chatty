import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const cookieName = process.env.COOKIE_NAME || "sid";
  const raw = req.cookies?.[cookieName];

  if (!raw) {
    return res.status(401).json({ ok: false });
  }

  try {
    const decoded = jwt.verify(raw, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    console.log(`[AUTH FAIL] ${req.method} ${req.url} - JWT verify error:`, err.message);
    return res.status(401).json({ ok: false });
  }
}
