/**
 * Capsule Maintenance Cron Job
 * 
 * Schedule: Every Sunday at 3:00 AM
 */

import cron from 'node-cron';
import { CapsuleMaintenanceService } from '../lib/capsuleMaintenance.js';

export function initializeCapsuleCron() {
    console.log('⏰ [Cron] Initializing Capsule Maintenance Scheduler (Sunday @ 3:00 AM)');

    // Schedule for 3:00 AM every Sunday (0 3 * * 0)
    cron.schedule('0 3 * * 0', async () => {
        console.log('⏰ [Cron] Triggering Scheduled Capsule Maintenance...');
        const service = new CapsuleMaintenanceService(); // Uses default vvault path
        await service.runMaintenance();
    });
}
