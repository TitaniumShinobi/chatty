import crypto from 'crypto';

export function requestClock(req, res, next) {
  req.clock = new Date().toISOString();
  req.requestId = crypto.randomUUID();
  next();
}
