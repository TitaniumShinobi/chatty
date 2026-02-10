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
      picture: 'https://lh3.googleusercontent.com/a/ACg8ocJHDwdzQ_8VIvvqOTyLRV6y1YoJ22NPhehAfFU2g1BbopbHnkll=s288-c-no',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };
    return next();
  }

  // Original OAuth authentication for production
  const cookieName = process.env.COOKIE_NAME || "sid";
  const raw = req.cookies?.[cookieName];

  if (!raw) {
    console.log(`[AUTH FAIL] ${req.method} ${req.url} - IP: ${req.ip} - No ${cookieName} cookie`);
    return res.status(401).json({ ok: false });
  }

  try {
    const decoded = jwt.verify(raw, process.env.JWT_SECRET);
    console.log(`[AUTH SUCCESS] User: ${decoded.email || decoded.sub || decoded.id || 'unknown'}`);
    req.user = decoded;
    return next();
  } catch (err) {
    console.log(`[AUTH FAIL] ${req.method} ${req.url} - JWT verify error:`, err.message);
    return res.status(401).json({ ok: false });
  }
}
