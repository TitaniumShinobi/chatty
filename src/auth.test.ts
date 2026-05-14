import {
  fetchWithDevAuthRetry,
  resetDevAuthStateForTests,
} from './auth';
import { buildGoogleLoginUrl, buildHostedAuthUrl } from './lib/auth';

jest.mock('./lib/chattyVvaultDoor', () => ({
  resolveClientDoorName: jest.fn((currentHref?: string) => 'private'),
  resolveClientDoorContract: jest.fn(() => ({
    authPublicOrigin: 'https://auth.thewreck.org',
  })),
}));

describe('fetchWithDevAuthRetry', () => {
  beforeEach(() => {
    resetDevAuthStateForTests();
    jest.resetAllMocks();
    const doorModule = jest.requireMock('./lib/chattyVvaultDoor') as {
      resolveClientDoorName: jest.Mock;
      resolveClientDoorContract: jest.Mock;
    };
    doorModule.resolveClientDoorName.mockImplementation(() => 'private');
    doorModule.resolveClientDoorContract.mockImplementation(() => ({
      authPublicOrigin: 'https://auth.thewreck.org',
    }));
  });

  it('retries a vvault request once after dev-login on 401 in development', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await fetchWithDevAuthRetry(
      '/api/vvault/message',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ constructId: 'zen-001', message: 'hi' }),
      },
      { isDev: true, logLabel: '/api/vvault/message' },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/vvault/message');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/dev-login');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/vvault/message');
  });
});

describe('buildGoogleLoginUrl', () => {
  it('preserves cli_callback when present on the current URL', () => {
    expect(
      buildGoogleLoginUrl('http://localhost:5173/?cli_callback=http%3A%2F%2Flocalhost%3A5174%2Fcli-auth-callback'),
    ).toBe('/api/auth/google?cli_callback=http%3A%2F%2Flocalhost%3A5174%2Fcli-auth-callback');
  });

  it('uses the normal google auth path when no cli callback is present', () => {
    expect(buildGoogleLoginUrl('http://localhost:5173/')).toBe('/api/auth/google');
  });
});

describe('buildHostedAuthUrl', () => {
  it('points the public door at the hosted auth origin with the current origin attached', () => {
    expect(
      buildHostedAuthUrl('signup', 'https://chatty.thewreck.org/?reason=missing_consent'),
    ).toBe('https://auth.thewreck.org/?origin=https%3A%2F%2Fchatty.thewreck.org&mode=signup');
  });
});
