import { validateIdentityBundle } from '../lib/identityBundlePreflight.js';

describe('identity bundle preflight', () => {
  test('returns missing code when required identity parts are absent', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'zen-001',
      },
      {
        loadIdentityFiles: async () => ({ prompt: '', conditioning: '' }),
        getCapsuleIntegration: async () => ({ loadCapsule: async () => null }),
      }
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('IDENTITY_BUNDLE_MISSING');
    expect(result.details.missing).toEqual(expect.arrayContaining(['prompt', 'conditioning', 'capsule']));
  });

  test('returns invalid code when identity fields are malformed', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'zen-001',
      },
      {
        loadIdentityFiles: async () => ({ prompt: { bad: true }, conditioning: ['x'] }),
        getCapsuleIntegration: async () => ({ loadCapsule: async () => ({}) }),
      }
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('IDENTITY_BUNDLE_INVALID');
    expect(result.details.invalid).toEqual(expect.arrayContaining(['prompt', 'conditioning']));
  });

  test('passes when prompt + conditioning + capsule are present', async () => {
    const result = await validateIdentityBundle(
      {
        userId: 'u1',
        constructId: 'zen-001',
      },
      {
        loadIdentityFiles: async () => ({ prompt: 'p', conditioning: 'c' }),
        getCapsuleIntegration: async () => ({ loadCapsule: async () => ({ identity: { name: 'Zen' } }) }),
      }
    );

    expect(result.ok).toBe(true);
    expect(result.identity).toBeTruthy();
    expect(result.capsule).toBeTruthy();
  });
});
