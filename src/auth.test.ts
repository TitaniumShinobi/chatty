import {
  fetchWithDevAuthRetry,
  resetDevAuthStateForTests,
} from './auth';
import {
  buildAuthLogoutApiUrl,
  buildGoogleLoginUrl,
  buildHostedLogoutUrl,
  logout,
} from './lib/auth';

const originalWindow = (global as any).window;

function installWindowMock(href = 'https://chatty.thewreck.org/app') {
  const replace = jest.fn();
  const localStorage = {
    removeItem: jest.fn(),
  };
  (global as any).window = {
    location: {
      href,
      replace,
    },
    localStorage,
  };
  return { replace, localStorage };
}

afterEach(() => {
  (global as any).window = originalWindow;
  jest.restoreAllMocks();
});

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

describe('hosted Auth logout URLs', () => {
  it('builds the hosted logout URL for the public Chatty origin', () => {
    expect(buildHostedLogoutUrl('https://chatty.thewreck.org/app?thread=123')).toBe(
      'https://auth.thewreck.org/api/auth/logout?origin=https%3A%2F%2Fchatty.thewreck.org',
    );
  });

  it('builds the hosted JSON logout URL for the public Auth origin', () => {
    expect(buildAuthLogoutApiUrl('https://chatty.thewreck.org/app')).toBe(
      'https://auth.thewreck.org/api/auth/logout',
    );
  });
});

describe('logout', () => {
  it('posts hosted Auth JSON logout, verifies /api/me no-store, then lands on /', async () => {
    const { replace, localStorage } = installWindowMock();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 401 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await logout();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/logout', {
      method: 'POST',
      credentials: 'include',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://auth.thewreck.org/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/me', {
      credentials: 'include',
      cache: 'no-store',
    });
    expect(localStorage.removeItem).toHaveBeenCalledWith('auth:session');
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('falls back to hosted Auth logout and does not land on / when /api/me is still authenticated', async () => {
    const { replace } = installWindowMock();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        user: { id: 'life-user-1', email: 'shared@example.com' },
      }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(logout()).rejects.toThrow('Logout did not clear the active browser session.');

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      'https://auth.thewreck.org/api/auth/logout?origin=https%3A%2F%2Fchatty.thewreck.org',
    );
    expect(replace).not.toHaveBeenCalledWith('/');
  });

  it('does not land on / when hosted Auth JSON logout fails', async () => {
    const { replace } = installWindowMock();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 500 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(logout()).rejects.toThrow('Auth logout failed; canonical session may still be active.');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(replace).not.toHaveBeenCalled();
  });
});
