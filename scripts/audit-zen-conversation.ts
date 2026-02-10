
// MOCK DEPENDENCIES BEFORE IMPORTING ORCHESTRATOR
import { constructRegistry } from './src/state/constructs';
import { threadManager } from './src/core/thread/SingletonThreadManager';

// Mock ConstructRegistry
constructRegistry.getConstruct = async () => ({
    constructId: 'audit-zen-001',
    roleLock: { allowedRoles: [], prohibitedRoles: [], contextBoundaries: [], behaviorConstraints: [] },
    vaultStore: { saveMessage: async () => { }, search: async () => [], getVaultSummaryMeta: async () => [], getStats: async () => ({}) } as any,
    fingerprint: 'mock-fingerprint',
    lastValidated: Date.now()
});
constructRegistry.registerConstruct = async () => { };

// Mock ThreadManager
threadManager.getThreads = async () => [{ id: 'mock-thread-001', constructId: 'audit-zen-001', createdAt: Date.now(), updatedAt: Date.now(), isActive: true }];
threadManager.createThread = async () => ({ id: 'mock-thread-001', constructId: 'audit-zen-001', createdAt: Date.now(), updatedAt: Date.now(), isActive: true });
threadManager.acquireLease = async () => 'mock-lease-token';

import { ZenMemoryOrchestrator } from './src/engine/orchestration/ZenMemoryOrchestrator';

// Mock Persona Provider
const mockPersonaProvider = (userId: string) => ({
    name: 'Zen',
    role: 'Creative Technical Partner',
    voice: 'Direct, Insightful, and slightly abstract',
    traits: ['memory-driven', 'context-aware']
});

// Mock VVAULT Connector (to capture what Zen *tries* to save)
const mockVvaultConnector = {
    writeTranscript: async (params: any) => {
        console.log(`[MockVVAULT] Saved transcript: ${params.role} -> "${params.content.substring(0, 30)}..."`);
        return { success: true };
    },
    readMemories: async (userId: string, options: any) => {
        console.log(`[MockVVAULT] Reading memories for ${userId}`);
        return [];
    }
};

async function runAudit() {
    console.log('🔍 STARTING ZEN CONVERSATIONAL AUDIT');
    console.log('=======================================');

    // 1. Initialize Orchestrator
    const zen = new ZenMemoryOrchestrator({
        constructId: 'audit-zen-001',
        userId: 'audit-user',
        personaProvider: mockPersonaProvider,
        vvaultConnector: mockVvaultConnector,
        maxStmWindow: 10,  // Keep 10 messages in short-term
        maxLtmEntries: 5   // Fetch 5 long-term memories
    });

    await zen.ensureReady();
    console.log('✅ Zen Orchestrator Initialized');

    // 2. Scenario Data
    const conversation = [
        {
            step: 1,
            role: 'user',
            content: "I'm working on a new game engine called 'Vortex'. It uses sparse voxel octrees.",
            intent: 'Set Context'
        },
        {
            step: 2,
            role: 'assistant',
            content: "Vortex sounds fascinating. Sparse voxel octrees are excellent for detailed geometry. How are you handling the memory footprint?",
            intent: 'Acknowledge Context'
        },
        {
            step: 3,
            role: 'user',
            content: "I'm hungry, maybe I should get some sushi.",
            intent: 'Distraction'
        },
        {
            step: 4,
            role: 'assistant',
            content: "Sushi sounds good. A break might help you focus.",
            intent: 'Acknowledge Distraction'
        },
        {
            step: 5,
            role: 'user',
            content: "Anyway, what data structure did I say I was using for the engine again?",
            intent: 'Recall Test'
        }
    ];

    // 3. Execution Loop
    console.log('\n💬 RUNNING CONVERSATION FLOW...');

    for (const turn of conversation) {
        if (turn.role === 'user') {
            console.log(`\n[Turn ${turn.step}] User: "${turn.content}"`);
            await zen.captureMessage('user' as any, turn.content, { intent: turn.intent });
        } else {
            console.log(`[Turn ${turn.step}] Zen ( Simulated ): "${turn.content}"`);
            await zen.captureMessage('assistant' as any, turn.content, { intent: turn.intent });
        }
    }

    // 4. Verification: Inspect Internal State
    console.log('\n🔎 INSPECTING MEMORY STATE...');

    // We prepare the context as if we are about to generate the NEXT response (Step 6)
    const context = await zen.prepareMemoryContext();

    // Analyze STM (Short Term Memory)
    const stmContent = context.stmWindow.map(m => m.content).join(' ');
    const hasVortex = stmContent.includes('Vortex');
    const hasVoxels = stmContent.includes('voxel octrees');
    const hasSushi = stmContent.includes('sushi');

    console.log('STM Analysis:');
    console.log(`- Contains 'Vortex': ${hasVortex ? '✅' : '❌'}`);
    console.log(`- Contains 'Voxels': ${hasVoxels ? '✅' : '❌'}`);
    console.log(`- Contains 'Sushi' (Distraction): ${hasSushi ? '✅' : '❌'}`);

    // 5. Final Verdict
    console.log('\n🏆 AUDIT VERDICT');
    if (hasVortex && hasVoxels) {
        console.log("✅ PASS: Zen successfully retained the 'Vortex' project context through the distraction.");
        console.log('   The orchestrator properly fed the STM window with previous turns.');
    } else {
        console.log('❌ FAIL: Zen lost the project context.');
    }

    console.log('=======================================');
}

runAudit().catch(console.error);
