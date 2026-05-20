import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { attachAuthIfPresent } from '../auth/middleware/auth.js';
import { shouldAllowAnonymousTranscribe } from '../routes/transcribe.js';

describe('transcribe auth integration', () => {
  it('hydrates req.user from the session cookie when present', async () => {
    const originalCookieName = process.env.COOKIE_NAME;
    const originalJwtSecret = process.env.JWT_SECRET;
    process.env.COOKIE_NAME = 'sid';
    process.env.JWT_SECRET = 'test-secret';

    const token = jwt.sign({ id: 'user-123', email: 'user@example.com' }, process.env.JWT_SECRET);
    const req = {
      method: 'POST',
      url: '/api/transcribe',
      cookies: { sid: token },
    };

    await new Promise((resolve) => {
      attachAuthIfPresent(req, {}, resolve);
    });

    assert.equal(req.user.id, 'user-123');
    assert.equal(req.user.email, 'user@example.com');

    process.env.COOKIE_NAME = originalCookieName;
    process.env.JWT_SECRET = originalJwtSecret;
  });

  it('blocks anonymous transcribe in production unless explicitly enabled', () => {
    assert.equal(
      shouldAllowAnonymousTranscribe({}, { NODE_ENV: 'production', ALLOW_ANON_TRANSCRIBE: 'false' }),
      false
    );
    assert.equal(
      shouldAllowAnonymousTranscribe({}, { NODE_ENV: 'production', ALLOW_ANON_TRANSCRIBE: 'true' }),
      true
    );
  });

  it('allows anonymous transcribe outside production by default', () => {
    assert.equal(
      shouldAllowAnonymousTranscribe({}, { NODE_ENV: 'development' }),
      true
    );
  });
});
