let devAutoLoginAttempted = false;

type DevAuthRetryOptions = {
  isDev?: boolean;
  logLabel?: string;
};

function withIncludedCredentials(init: RequestInit = {}): RequestInit {
  return {
    credentials: 'include',
    ...init,
  };
}

function resolveDevMode(): boolean {
  try {
    return Boolean((0, eval)('import.meta.env && import.meta.env.DEV'));
  } catch {
    return false;
  }
}

async function attemptDevLogin(logLabel: string): Promise<boolean> {
  if (devAutoLoginAttempted) return false;
  devAutoLoginAttempted = true;
  console.info(`[DevAuth] ${logLabel} got 401, attempting dev-login`);

  try {
    const loginRes = await fetch('/api/auth/dev-login', withIncludedCredentials());
    if (!loginRes.ok) {
      console.warn(`[DevAuth] ${logLabel} retry failed`, loginRes.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[DevAuth] ${logLabel} retry failed`, err);
    return false;
  }
}

export async function fetchWithDevAuthRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: DevAuthRetryOptions = {},
): Promise<Response> {
  const logLabel = options.logLabel || (typeof input === 'string' ? input : 'vvault request');
  const isDev = options.isDev ?? resolveDevMode();

  const response = await fetch(input, withIncludedCredentials(init));
  if (response.status !== 401 || !isDev) {
    return response;
  }

  const recovered = await attemptDevLogin(logLabel);
  if (!recovered) {
    return response;
  }

  const retryResponse = await fetch(input, withIncludedCredentials(init));
  console.info(`[DevAuth] ${logLabel} retry ${retryResponse.ok ? 'succeeded' : 'failed'}`);
  return retryResponse;
}

async function fetchMeOnce(): Promise<any | null> {
  const res = await fetchWithDevAuthRetry('/api/me', {}, { logLabel: '/api/me' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const data = await res.json();
  return data?.ok ? data.user : null;
}

export async function fetchMe(): Promise<any | null> {
  return fetchMeOnce();
}

export function resetDevAuthStateForTests() {
  devAutoLoginAttempted = false;
}
