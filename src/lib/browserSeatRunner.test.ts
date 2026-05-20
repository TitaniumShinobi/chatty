jest.mock('../auth', () => ({
  fetchWithDevAuthRetry: jest.fn(),
}));

import { fetchWithDevAuthRetry } from '../auth';
import { LIN_DEFAULT_MODELS } from '../config/linModelDefaults';
import { runSeat } from './browserSeatRunner';

describe('browserSeatRunner', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => new Response('', { status: 404 }));
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('uses dev-auth retry for health and generate requests', async () => {
    const fetchWithDevAuthRetryMock = fetchWithDevAuthRetry as jest.MockedFunction<typeof fetchWithDevAuthRetry>;

    fetchWithDevAuthRetryMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: 'hello there' }), { status: 200 }));

    const response = await runSeat({
      seat: 'smalltalk',
      prompt: 'hi',
      timeout: 1000,
      retries: 0,
    });

    expect(response).toBe('hello there');
    expect(fetchWithDevAuthRetryMock).toHaveBeenCalledTimes(2);
    expect(fetchWithDevAuthRetryMock).toHaveBeenNthCalledWith(
      1,
      '/api/lin/health',
      { method: 'GET' },
      { logLabel: '/api/lin/health' },
    );
    expect(fetchWithDevAuthRetryMock).toHaveBeenNthCalledWith(
      2,
      '/api/lin/generate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: expect.any(AbortSignal),
      }),
      { logLabel: '/api/lin/generate' },
    );
    const generateOptions = fetchWithDevAuthRetryMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(generateOptions.body as string)).toEqual(
      expect.objectContaining({
        seat: 'smalltalk',
        model: LIN_DEFAULT_MODELS.smalltalk,
      }),
    );
  });

  it('sends the fixed Lin coding seat to the helper endpoint', async () => {
    const fetchWithDevAuthRetryMock = fetchWithDevAuthRetry as jest.MockedFunction<typeof fetchWithDevAuthRetry>;

    fetchWithDevAuthRetryMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: 'coded' }), { status: 200 }));

    await runSeat({
      seat: 'coding',
      prompt: 'write a JavaScript function',
      timeout: 1000,
      retries: 0,
      constructId: 'katana-001',
    });

    const generateOptions = fetchWithDevAuthRetryMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(generateOptions.body as string)).toEqual(
      expect.objectContaining({
        seat: 'coding',
        model: LIN_DEFAULT_MODELS.coding,
        constructId: 'katana-001',
      }),
    );
  });

  it('sends the fixed Lin creative seat to the helper endpoint', async () => {
    const fetchWithDevAuthRetryMock = fetchWithDevAuthRetry as jest.MockedFunction<typeof fetchWithDevAuthRetry>;

    fetchWithDevAuthRetryMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: 'crafted' }), { status: 200 }));

    await runSeat({
      seat: 'creative',
      prompt: 'draft a tiny scene',
      timeout: 1000,
      retries: 0,
    });

    const generateOptions = fetchWithDevAuthRetryMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(generateOptions.body as string)).toEqual(
      expect.objectContaining({
        seat: 'creative',
        model: LIN_DEFAULT_MODELS.creative,
      }),
    );
  });
});
