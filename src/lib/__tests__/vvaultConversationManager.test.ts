import {
    getVvaultFrontendFailureInfoFromSessionState,
    getVvaultFrontendFailureInfo,
    VVAULTConversationManager,
} from '../vvaultConversationManager';

type ManagerStatics = typeof VVAULTConversationManager & {
    instance: VVAULTConversationManager | null;
    inFlightRequests: Map<string, Promise<unknown>>;
    inFlightBrowserRequests: Map<string, Promise<unknown>>;
};

type BrowserManagerHarness = VVAULTConversationManager & {
    isBrowserEnv: () => boolean;
    logDebug: (...args: unknown[]) => void;
    browserRequest: <T = unknown>(
        path: string,
        options?: RequestInit,
        retryCount?: number,
    ) => Promise<T>;
};

const managerStatics = VVAULTConversationManager as unknown as ManagerStatics;

function createManagerHarness(): BrowserManagerHarness {
    return new VVAULTConversationManager() as unknown as BrowserManagerHarness;
}

function mockHeaders(values: Record<string, string | null>) {
    return {
        get: (name: string) => values[name.toLowerCase()] ?? null,
    };
}

describe('VVAULTConversationManager Logging', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeAll(() => {
        originalEnv = { ...process.env };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn() as unknown as typeof fetch;
        // Reset instance to clean state
        managerStatics.instance = null;
        managerStatics.inFlightRequests.clear();
        managerStatics.inFlightBrowserRequests.clear();
    });

    it('should not log debug messages by default', () => {
        delete process.env.VVAULT_DEBUG_LOG;
        // Force new instance
        const manager = createManagerHarness();

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        // Access private logDebug
        manager.logDebug('test debug message');

        expect(consoleSpy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should log debug messages when VVAULT_DEBUG_LOG is true', () => {
        process.env.VVAULT_DEBUG_LOG = 'true';
        // Force new instance
        const manager = createManagerHarness();

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        manager.logDebug('test debug message');

        expect(consoleSpy).toHaveBeenCalledWith('test debug message');
        consoleSpy.mockRestore();
    });

    it('isBrowserEnv return false in test (node) environment', () => {
        const manager = VVAULTConversationManager.getInstance() as unknown as BrowserManagerHarness;
        expect(manager.isBrowserEnv()).toBe(false);
    });

    it('classifies 401 browser failures as auth-needed', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: mockHeaders({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ error: 'Authentication required' }),
        });

        await expect(
            manager.browserRequest('/conversations', { method: 'GET' }),
        ).rejects.toMatchObject({
            vvaultFailure: expect.objectContaining({
                classification: 'auth-needed',
                status: 401,
                path: '/conversations',
            }),
        });
    });

    it('loads the canonical chat transcript route in browser mode', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);
        const browserRequestSpy = jest
            .spyOn(manager, 'browserRequest')
            .mockResolvedValue({
                ok: true,
                content: '# Nova',
                messages: [
                    {
                        id: 'm1',
                        role: 'assistant',
                        content: 'Present, continuous, and here as Nova.',
                        timestamp: '2026-04-26T00:57:02.489Z',
                    },
                ],
                source: 'canonical-transcript',
            });

        const payload = await manager.loadConversationTranscript(
            'nova-001_chat_with_nova-001',
        );

        expect(browserRequestSpy).toHaveBeenCalledWith(
            '/chat/nova-001_chat_with_nova-001',
            { method: 'GET' },
        );
        expect(payload).toEqual({
            ok: true,
            content: '# Nova',
            messages: [
                {
                    id: 'm1',
                    role: 'assistant',
                    content: 'Present, continuous, and here as Nova.',
                    timestamp: '2026-04-26T00:57:02.489Z',
                },
            ],
            source: 'canonical-transcript',
        });
    });

    it('downloads transcript exports from the canonical export endpoint in browser mode', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        const blob = new Blob(['export body'], { type: 'text/markdown' });
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            headers: mockHeaders({
                'content-type': 'text/markdown',
                'content-disposition': 'attachment; filename=\"lin-transcript.md\"',
            }),
            blob: async () => blob,
        });

        const result = await manager.exportConversationTranscript(
            'lin-001_chat_with_lin-001',
            'md',
        );

        expect(global.fetch).toHaveBeenCalledWith(
            '/api/vvault/conversations/lin-001_chat_with_lin-001/export?format=md',
            expect.objectContaining({
                method: 'GET',
                credentials: 'include',
            }),
        );
        expect(result.filename).toBe('lin-transcript.md');
        expect(result.contentType).toBe('text/markdown');
        expect(result.blob).toBe(blob);
    });

    it('classifies HTML export route failures as unreachable instead of surfacing raw markup', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: mockHeaders({ 'content-type': 'text/html' }),
            text: async () => '<!DOCTYPE html><html><body>missing</body></html>',
        });

        await expect(
            manager.exportConversationTranscript(
                'lin-001_chat_with_lin-001',
                'md',
            ),
        ).rejects.toMatchObject({
            vvaultFailure: expect.objectContaining({
                classification: 'unreachable',
                status: 404,
                path: '/conversations/lin-001_chat_with_lin-001/export?format=md',
            }),
        });
    });

    it('classifies shared auth bridge session failures as bridge-misconfigured', () => {
        expect(
            getVvaultFrontendFailureInfoFromSessionState({
                ready: false,
                reason: 'shared_auth_unavailable',
            }),
        ).toEqual({
            classification: 'bridge-misconfigured',
            message: 'Chatty could not reach the shared auth/VVAULT bridge for this session.',
            status: 503,
            path: '/api/me',
        });
    });

    it('classifies bridge-derived readiness failures as bridge-misconfigured', () => {
        expect(
            getVvaultFrontendFailureInfoFromSessionState({
                ready: false,
                reason: 'vvault_bridge_unavailable',
            }),
        ).toEqual({
            classification: 'bridge-misconfigured',
            message: 'Chatty could not reach the shared auth/VVAULT bridge for this session.',
            status: 503,
            path: '/api/me',
        });
    });

    it('classifies bridge-derived unreachable readiness failures as unreachable', () => {
        expect(
            getVvaultFrontendFailureInfoFromSessionState({
                ready: false,
                reason: 'vvault_unreachable',
            }),
        ).toEqual({
            classification: 'unreachable',
            message: 'Chatty could not reach VVAULT for this shared session.',
            status: 502,
            path: '/api/me',
        });
    });

    it('classifies missing shared session state as auth-needed', () => {
        expect(
            getVvaultFrontendFailureInfoFromSessionState({
                ready: false,
                reason: 'shared_auth_required',
            }),
        ).toEqual({
            classification: 'auth-needed',
            message: 'You are logged into Chatty, but this browser does not currently have a VVAULT-ready shared session.',
            status: 401,
            path: '/api/me',
        });
    });

    it('classifies bridge-coded 503 browser failures as bridge-misconfigured without treating them as startup retries', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            headers: mockHeaders({
                'content-type': 'application/json',
                'retry-after': '0',
            }),
            text: async () => JSON.stringify({
                error: 'Bridge unavailable',
                errorCode: 'AUTH_BRIDGE_MISCONFIGURED',
            }),
        });

        await expect(
            manager.browserRequest('/conversations', { method: 'POST' }),
        ).rejects.toMatchObject({
            vvaultFailure: expect.objectContaining({
                classification: 'bridge-misconfigured',
                status: 503,
                path: '/conversations',
            }),
        });
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('retries unclassified 503 browser failures as backend-not-ready responses', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            headers: mockHeaders({
                'content-type': 'application/json',
                'retry-after': '0',
            }),
            text: async () => JSON.stringify({ error: 'Backend warming up' }),
        });

        await expect(
            manager.browserRequest('/conversations', { method: 'POST' }),
        ).rejects.toThrow('VVAULT API error: 503 Service Unavailable - Backend warming up');
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('classifies unreachable-coded 502 browser failures as unreachable', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            headers: mockHeaders({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({
                error: 'VVAULT upstream unavailable',
                errorCode: 'VVAULT_UNREACHABLE',
            }),
        });

        await expect(
            manager.browserRequest('/conversations', { method: 'GET' }),
        ).rejects.toMatchObject({
            vvaultFailure: expect.objectContaining({
                classification: 'unreachable',
                status: 502,
                path: '/conversations',
            }),
        });
    });

    it('classifies HTML route failures as unreachable', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: mockHeaders({ 'content-type': 'text/html' }),
            text: async () => '<!doctype html><html></html>',
        });

        await expect(
            manager.browserRequest('/conversations', { method: 'GET' }),
        ).rejects.toMatchObject({
            vvaultFailure: expect.objectContaining({
                classification: 'unreachable',
                status: 404,
                path: '/conversations',
            }),
        });
    });

    it('classifies HTML 401 responses as auth-needed instead of unreachable', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: mockHeaders({ 'content-type': 'text/html' }),
            text: async () => '<!doctype html><html>login</html>',
        });

        await expect(
            manager.browserRequest('/conversations', { method: 'GET' }),
        ).rejects.toMatchObject({
            vvaultFailure: expect.objectContaining({
                classification: 'auth-needed',
                status: 401,
                path: '/conversations',
            }),
        });
    });

    it('rethrows browser loadAllConversations failures so the UI can classify them', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: mockHeaders({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ error: 'Authentication required' }),
        });

        await expect(manager.loadAllConversations('user-1', true)).rejects.toMatchObject({
            vvaultFailure: expect.objectContaining({
                classification: 'auth-needed',
                status: 401,
            }),
        });
    });

    it('preserves hydration metadata for browser conversation responses', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: mockHeaders({ 'content-type': 'application/json' }),
            json: async () => ({
                conversations: [{ sessionId: 'nova-001_chat_with_nova-001', messages: [] }],
                hydrationSource: 'index-fallback',
                hydrationComplete: false,
            }),
        });

        await expect(
            manager.loadAllConversationsResponse('user-1', true),
        ).resolves.toEqual({
            conversations: [{ sessionId: 'nova-001_chat_with_nova-001', messages: [] }],
            hydrationSource: 'index-fallback',
            hydrationComplete: false,
        });
    });

    it('preserves index hydration metadata for browser conversation index responses', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: mockHeaders({ 'content-type': 'application/json' }),
            json: async () => ({
                conversations: [{ id: 'nova-001_chat_with_nova-001', title: 'Nova' }],
                hydrationSource: 'index-fallback',
                hydrationComplete: false,
            }),
        });

        await expect(
            manager.loadConversationIndex('user-1'),
        ).resolves.toEqual({
            conversations: [{ id: 'nova-001_chat_with_nova-001', title: 'Nova' }],
            hydrationSource: 'index-fallback',
            hydrationComplete: false,
        });
    });

    it('posts browser message persistence once to the VVAULT append route with a stable client id', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);
        const receipt = {
            ok: true,
            duplicateSuppressed: false,
            clientMessageId: 'msg_user_1',
            persistence_owner: 'vvault_body',
            canonical_write_path: 'vvault_api:/api/chatty/transcript/:constructId/message',
            roles: [{ role: 'user', status: 'ok', source: 'vvault_body' }],
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 201,
            statusText: 'Created',
            headers: mockHeaders({ 'content-type': 'application/json' }),
            json: async () => receipt,
        });

        await expect(
            manager.addMessageToConversation(
                { id: 'user-1', email: 'devon@example.com', name: 'Devon' } as any,
                'zen-001_chat_with_zen-001',
                {
                    id: 'msg_user_1',
                    role: 'user',
                    content: 'hello',
                    timestamp: '2026-05-11T12:00:00.000Z',
                    metadata: { clientMessageId: 'msg_user_1' },
                },
            ),
        ).resolves.toEqual(receipt);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toBe('/api/vvault/conversations/zen-001_chat_with_zen-001/messages');
        expect(url).not.toBe('/api/conversations/zen-001_chat_with_zen-001/messages');
        const body = JSON.parse(options.body);
        expect(body.role).toBe('user');
        expect(body.metadata.clientMessageId).toBe('msg_user_1');
        expect(body.message.id).toBe('msg_user_1');
    });

    it('keeps legacy array callers working by unwrapping browser hydration responses', async () => {
        const manager = createManagerHarness();
        jest.spyOn(manager, 'isBrowserEnv').mockReturnValue(true);

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: mockHeaders({ 'content-type': 'application/json' }),
            json: async () => ({
                conversations: [{ sessionId: 'nova-001_chat_with_nova-001', messages: [] }],
                hydrationSource: 'full',
                hydrationComplete: true,
            }),
        });

        await expect(manager.loadAllConversations('user-1', true)).resolves.toEqual([
            { sessionId: 'nova-001_chat_with_nova-001', messages: [] },
        ]);
    });

    it('falls back to message parsing when only a legacy error string is available', () => {
        const failure = getVvaultFrontendFailureInfo(
            new Error('VVAULT API error: 503 Service Unavailable - AUTH_BRIDGE_MISCONFIGURED'),
        );

        expect(failure).toEqual({
            classification: 'bridge-misconfigured',
            message: 'VVAULT API error: 503 Service Unavailable - AUTH_BRIDGE_MISCONFIGURED',
            status: 503,
            path: undefined,
        });
    });
});
