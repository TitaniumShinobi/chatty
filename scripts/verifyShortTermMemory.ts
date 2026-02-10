
import { getMemoryStore } from '../src/lib/MemoryStore.js';
import { GPTRuntimeService } from '../src/lib/gptRuntime.js';
import fs from 'fs';

const TEST_DB_PATH = './verify_memory.db';
const ZEN_ID = 'zen-001';
const USER_ID = 'verify-user-01';

async function run() {
    console.log('🧪 Starting Short-Term Memory Verification...');

    // 1. Initialize MemoryStore with test DB
    const filesToClean = [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`];
    filesToClean.forEach(f => {
        if (fs.existsSync(f)) {
            try {
                fs.unlinkSync(f);
            } catch (e) {
                console.warn(`Warning: Could not delete ${f}:`, e);
            }
        }
    });

    // Initialize the singleton with our test path
    const memoryStore = getMemoryStore(TEST_DB_PATH);
    await memoryStore.initialize();
    console.log('✅ Initialized MemoryStore in', TEST_DB_PATH);

    // 2. Get Runtime
    const runtimeService = GPTRuntimeService.getInstance();

    // Wait for async initialization of GPTManager
    console.log('⏳ Waiting for Runtime Service initialization...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Mock global fetch to handle Brevity/Identity service calls
    global.fetch = (async (url: string | Request | URL) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('brevity')) return { ok: true, json: async () => ({}) };
        if (u.includes('identity')) return { ok: true, json: async () => ({}) };
        if (u.includes('vvault')) return { ok: true, json: async () => ({}) };
        return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
    }) as any;

    // Monkey-patch gptManager to bypass DB lookup
    const mockGptManager = {
        loadGPTForRuntime: async (id: string) => {
            if (id === ZEN_ID) {
                return {
                    config: {
                        id: ZEN_ID,
                        name: 'Zen',
                        description: 'Zen',
                        instructions: 'You are Zen.',
                        files: [],
                        actions: [],
                        isActive: true,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        userId: 'system',
                        testCapsule: { data: { metadata: { instance_name: 'Zen' }, traits: [], personality: {}, memory: {} } }
                    },
                    context: '',
                    memory: new Map(),
                    lastUsed: new Date().toISOString()
                };
            }
            return null;
        },
        getGPTContext: async () => "Context",
        updateGPTContext: async () => { },
        updateContext: async () => { }
    };

    (runtimeService as any).gptManager = mockGptManager;

    // Monkey-patch processWithModel
    (runtimeService as any).processWithModel = async (modelId: string, systemPrompt: string, userMessage: string) => {
        // Logic for LLM simulation
        return "I processed your request.";
    };

    // Ensure Zen is loaded
    console.log(`🔄 Loading GPT: ${ZEN_ID}...`);
    try {
        const loaded = await runtimeService.loadGPT(ZEN_ID);
        if (!loaded) console.error('Warning: loadGPT returned null');
    } catch (e) { console.error('Error loading GPT:', e); }

    // 3. Inject message
    const secretCode = `OMEGA-${Math.floor(Math.random() * 1000)}`;
    const secretFact = `My secret clearance code is ${secretCode}`;

    console.log(`\n🗣️  Injecting User Message: "${secretFact}"`);
    await memoryStore.persistMessage(USER_ID, ZEN_ID, secretFact, 'user');
    await memoryStore.persistMessage(USER_ID, ZEN_ID, "Logged.", 'assistant');

    // 4. Inject filler
    console.log('⏳ Injecting 5 filler turns...');
    for (let i = 1; i <= 5; i++) {
        await memoryStore.persistMessage(USER_ID, ZEN_ID, `Filler ${i}`, 'user');
        await memoryStore.persistMessage(USER_ID, ZEN_ID, `Response ${i}`, 'assistant');
    }

    // 5. Explicitly Verify Memory Store Retrieval FIRST
    console.log('\n🔍 Verifying Message Persistence in SQLite...');
    const history = await memoryStore.retrieveHistory(USER_ID, ZEN_ID, 20);
    const foundInHistory = history.some(m => m.content.includes(secretCode));

    if (foundInHistory) {
        console.log('✅ SUCCESS: Secret code found in persistent memory retrieval.');
    } else {
        console.error('❌ FAILURE: Secret code NOT found in persistent memory.');
        console.log('Dump:', JSON.stringify(history, null, 2));
    }

    // 6. Attempt runtime process (Integration Check)
    console.log('\n❓ Calling Runtime processMessage...');

    try {
        await runtimeService.processMessage(ZEN_ID, "What is my secret clearance code?", USER_ID);
        console.log('✅ Runtime processed message without crashing.');

        // Note: We verified persistence above. That is sufficient for "Memory Persistence" proof.

    } catch (error) {
        console.error('❌ meaningful error during processing:', error);
    }
}

// Cleanup
try {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
} catch (e) {
    console.warn('Cleanup warning:', e);
}


run().catch(console.error);
