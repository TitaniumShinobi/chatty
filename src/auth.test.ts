import {
  fetchWithDevAuthRetry,
  resetDevAuthStateForTests,
} from './auth';
import { buildGoogleLoginUrl } from './lib/auth';

describe('fetchWithDevAuthRetry', () => {
  beforeEach(() => {
    resetDevAuthStateForTests();
    jest.resetAllMocks();
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
