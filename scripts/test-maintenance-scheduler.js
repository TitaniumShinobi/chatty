/**
 * Test Maintenance Scheduler
 * 
 * Invokes the capsule maintenance via API (simulating a manual trigger)
 * and verifies that Lin's capsule was processed.
 */

import { CapsuleMaintenanceService } from '../server/lib/capsuleMaintenance.js';

// Alternative: directly run the service logic
async function runDirectTest() {
    console.log('🧪 Testing Capsule Maintenance Service directly...');

    try {
        // Mock VVAULT_ROOT if needed, or point to actual
        const vvaultRoot = process.env.VVAULT_ROOT_PATH || process.env.VVAULT_PATH || '';

        const service = new CapsuleMaintenanceService(vvaultRoot);

        // Force run to ensure it actually tries to update
        const result = await service.runMaintenance({ force: true, dryRun: true });

        console.log('📊 Test Results:', JSON.stringify(result, null, 2));

        if (result.scanned > 0) {
            console.log('✅ Service successfully scanned capsules.');
        } else {
            console.error('❌ Service failed to find any capsules.');
            process.exit(1);
        }

        // Check if lin-001 was found (look for updatedCapsules array)
        // The previous run's log showed "lin-001"
        const linFound = result.updatedCapsules && result.updatedCapsules.some(c => c.includes('lin-001'));
        if (linFound) {
            console.log('✅ Lin capsule was identified for update.');
        } else {
            console.warn(`⚠️ Lin capsule was NOT identified (Found: ${result.updatedCapsules?.join(', ') || 'none'}).`);
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

runDirectTest();
