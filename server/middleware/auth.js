import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  // HARDCODED AUTHENTICATION FOR DEVELOPMENT
  // This bypasses Google OAuth for testing the unified intelligence system
  if (process.env.NODE_ENV === 'development' || !process.env.JWT_SECRET) {
    console.log('🔓 [Auth] Using hardcoded development authentication');
    req.user = {
      id: 'devon_woodson_1762969514958',
      email: 'dwoodson92@gmail.com',
      name: 'Devon Woodson',
      sub: 'hardcoded_dev_user',
      picture: 'https://ui-avatars.com/api/?name=Devon+Woodson&background=5865F2&color=fff&size=128&bold=true',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };
    return next();
  }

  // Original OAuth authentication for production
  const raw = req.cookies?.[process.env.COOKIE_NAME || "sid"];
  if (!raw) return res.status(401).json({ ok: false });
  try {
    req.user = jwt.verify(raw, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ ok: false });
  }
}
