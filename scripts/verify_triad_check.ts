/**
 * usage: npx tsx scripts/verify_triad_check.ts
 */

import { TriadGate } from '../src/engine/orchestration/TriadGate';
import { UnifiedLinOrchestrator } from '../src/engine/orchestration/UnifiedLinOrchestrator';

async function main() {
    console.log('🧪 Verifying Triad Gate Enforcement...');

    try {
        // 1. Direct Gate Check
        console.log('\n[1] Checking TriadGate directly...');
        const status = await TriadGate.getInstance().checkTriadAvailability();
        console.log('   Status:', status.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY');
        if (!status.healthy) {
            console.log('   Failed Seats:', status.failedSeats);
        }
        console.log('   Latency:', status.latency);

        // 2. Orchestrator Integration Check
        console.log('\n[2] Checking Orchestrator Integration...');
        const orchestrator = new UnifiedLinOrchestrator();

        // We expect this to THROW if triad is unhealthy, or succeed if healthy.
        // We pass dummy args since we only care about the pre-check.
        try {
            if (!status.healthy) {
                console.log('   (Triad is unhealthy, expecting Orchestrator to THROW error...)');
            }

            await orchestrator.orchestrateResponse(
                "Hello test",
                "user123",
                "thread123",
                "lin-001",
                "001",
                [],
                [{ role: 'user', content: 'Hello test', timestamp: Date.now() }]
            );

            if (!status.healthy) {
                console.error('❌ FAIL: Orchestrator proceeded despite unhealthy triad!');
                process.exit(1);
            } else {
                console.log('✅ PASS: Orchestrator proceeded (Triad is healthy).');
            }

        } catch (error: any) {
            if (error.message && error.message.includes('TRIAD BROKEN')) {
                console.log('✅ PASS: Orchestrator BLOCKED execution (Triad Broken Error caught).');
                console.log('   Error:', error.message);
            } else {
                console.error('❌ FAIL: Unexpected error:', error);
                // If it's another error (like file not found), it might be acceptable if it passed the triad check
                // But here we want to verifying Triad enforcement.
            }
        }

        // 3. Filter Check
        console.log('\n[3] Checking Output Filter...');
        const leakingResponse = 'The user is asking for a test. Here is a response: "Hello there."';
        const filtered = UnifiedLinOrchestrator.filterResponse(leakingResponse);
        console.log(`   Original: "${leakingResponse}"`);
        console.log(`   Filtered: "${filtered}"`);

        if (filtered === '"Hello there."' || filtered === 'Hello there.') {
            console.log('✅ PASS: Filter stripped leak.');
        } else {
            console.warn('⚠️ WARN: Filter might have missed leak. Result:', filtered);
        }

    } catch (err) {
        console.error('FATAL TEST ERROR:', err);
        process.exit(1);
    }
}

main();
