import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const raw = req.cookies?.[process.env.COOKIE_NAME || "sid"];
  if (!raw) {
    console.log(`🚫 Unauthenticated request to ${req.method} ${req.path}`);
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }
  
  try {
    req.user = jwt.verify(raw, process.env.JWT_SECRET);
    
    // Ensure `sub` exists for backward/forward compatibility; fall back to
    // other common fields if necessary so server can reliably use req.user.sub
    if (!req.user.sub) {
      req.user.sub = req.user.id || req.user.uid || req.user.email || undefined;
      console.warn(`⚠️ User missing sub field, using fallback: ${req.user.sub}`);
    }
    
    // Log authenticated requests with user identity
    console.log(`🔐 Authenticated request: ${req.user.email} (ID: ${req.user.sub}) → ${req.method} ${req.path}`);
    
    // Add construct-aware context
    req.constructId = req.user.constructId;
    req.vvaultPath = req.user.vvaultPath;
    
    return next();
  } catch (error) {
    console.log(`🚫 Invalid token for ${req.method} ${req.path}:`, error.message);
    return res.status(401).json({ ok: false, error: "Invalid authentication token" });
  }
}
