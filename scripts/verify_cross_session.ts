import { ZenMemoryOrchestrator } from '../src/engine/orchestration/ZenMemoryOrchestrator';

async function verifyCrossSession() {
    console.log('🧪 Verifying Cross-Session Memory...\n');

    const capturedUrls: string[] = [];

    // Mock fetch
    global.fetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        capturedUrls.push(url.toString());
        return {
            ok: true,
            json: async () => ({ ok: true, memories: [] }), // Minimal mock response
        } as Response;
    };

    // Mock global objects needed by ZenMemoryOrchestrator
    (global as any).window = {}; // To pass VaultStore check

    // Mock dependencies (threadManager, constructRegistry) via crude patching if needed
    // Since ZenMemoryOrchestrator imports them as singletons, we rely on them not throwing during instantiation
    // However, ensureReady() calls db-backed registries. This might fail.
    // We can bypass ensureReady() if we just verify loadLTMEntries logic?
    // No, public API is prepareMemoryContext.

    // Let's rely on the fact that ensureReady() might fail but we catch it or mock the singletons?
    // Actually, we can just spy on the `fetch` calls. The `ensureReady()` calls DB. 
    // If DB is not available in script env, it might fail. 

    // Let's assume we can instantiate the class.
    const orchestrator = new ZenMemoryOrchestrator({
        constructId: 'test-construct',
        userId: 'test-user',
        threadId: 'thread-123'
    });

    // Hack: Bypass initialization to avoid DB calls
    (orchestrator as any).initializationPromise = Promise.resolve();
    (orchestrator as any).threadId = 'thread-123';
    (orchestrator as any).constructId = 'test-construct';

    console.log('1️⃣ Testing standard context (Thread-Scoped)...');
    await orchestrator.prepareMemoryContext({});

    // Check the fetch URL for LTM search
    // Last fetch should be loadLTMEntries -> VaultStore.search. It should contain scope in query params.
    const standardCalls = capturedUrls.filter(u => u.includes('/api/vvault/identity/query') && u.includes('thread%20thread-123'));
    const lastStandard = standardCalls[standardCalls.length - 1];
    console.log('URL called:', lastStandard);

    if (lastStandard) {
        console.log('✅ Standard search includes thread ID scope');
    } else {
        console.log('❌ Standard search MISSING thread ID scope');
    }

    console.log('\n2️⃣ Testing semantic context (Cross-Session)...');
    await orchestrator.prepareMemoryContext({ query: 'machine learning' });

    const queryCalls = capturedUrls.filter(u => u.includes('/api/vvault/identity/query') && u.includes('query=machine%20learning'));
    // Note: 'machine learning' encoded is machine%20learning
    const lastQuery = queryCalls[queryCalls.length - 1];
    console.log('URL called:', lastQuery);

    if (lastQuery && !lastQuery.includes('thread thread-123')) {
        console.log('✅ Semantic search correctly used query param and removed thread scope');
    } else if (lastQuery && lastQuery.includes('thread thread-123')) {
        console.log('❌ Semantic search INCORRECTLY included thread scope');
    } else {
        console.log('❌ Semantic search URL not found or malformed');
    }

}

verifyCrossSession().catch(console.error);
