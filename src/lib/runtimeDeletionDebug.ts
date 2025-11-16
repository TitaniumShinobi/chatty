/**
 * Debug utilities for Runtime Deletion System
 * 
 * This file provides debugging utilities to verify the runtime deletion system works correctly.
 */

import RuntimeDeletionManager from './runtimeDeletionManager';

export interface RuntimeDeletionDebugInfo {
  totalDeletedRuntimes: number;
  deletedRuntimes: Array<{
    key: string;
    runtimeId: string;
    name: string;
    deletedAt: number;
    reason?: string;
  }>;
  storageKeys: string[];
  localStorageSize: number;
  isWorkingCorrectly: boolean;
  recommendations: string[];
}

/**
 * Get comprehensive debug information about the runtime deletion system
 */
export function getRuntimeDeletionDebugInfo(): RuntimeDeletionDebugInfo {
  const manager = RuntimeDeletionManager.getInstance();
  const debugInfo = manager.getDebugInfo();
  
  // Calculate localStorage usage
  let totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.includes('deleted-runtime')) {
      const value = localStorage.getItem(key);
      totalSize += (key.length + (value?.length || 0)) * 2; // Approximate UTF-16 size
    }
  }

  // Check if system is working correctly
  const isWorkingCorrectly = debugInfo.storageKeys.length > 0 || debugInfo.totalDeleted === 0;
  
  // Generate recommendations
  const recommendations: string[] = [];
  if (debugInfo.totalDeleted > 50) {
    recommendations.push('Consider clearing old deleted runtime entries (>50 entries detected)');
  }
  if (totalSize > 100000) { // >100KB
    recommendations.push('Runtime deletion storage is large (>100KB), consider cleanup');
  }
  if (!isWorkingCorrectly) {
    recommendations.push('Runtime deletion system may not be functioning correctly');
  }

  return {
    totalDeletedRuntimes: debugInfo.totalDeleted,
    deletedRuntimes: debugInfo.entries.map(entry => ({
      key: entry.key,
      runtimeId: entry.runtimeId,
      name: entry.name,
      deletedAt: entry.deletedAt,
      reason: entry.reason
    })),
    storageKeys: debugInfo.storageKeys,
    localStorageSize: totalSize,
    isWorkingCorrectly,
    recommendations
  };
}

/**
 * Test the runtime deletion system with mock data
 */
export async function testRuntimeDeletionSystem(): Promise<{
  success: boolean;
  results: string[];
  errors: string[];
}> {
  const manager = RuntimeDeletionManager.getInstance();
  const results: string[] = [];
  const errors: string[] = [];

  try {
    const testRuntimeKey = 'test-runtime-' + Date.now();
    const testRuntimeId = 'test-runtime-id';
    const testRuntimeName = 'Test Runtime';

    // Test 1: Delete a runtime
    results.push('Testing runtime deletion...');
    await manager.deleteRuntime(testRuntimeKey, testRuntimeId, testRuntimeName, undefined, 'Testing');
    
    // Test 2: Check if runtime is marked as deleted
    const isDeleted = manager.isRuntimeDeleted(testRuntimeKey);
    if (isDeleted) {
      results.push('✅ Runtime correctly marked as deleted');
    } else {
      errors.push('❌ Runtime not marked as deleted');
    }

    // Test 3: Check runtime ID deletion
    const isIdDeleted = manager.isRuntimeIdDeleted(testRuntimeId);
    if (isIdDeleted) {
      results.push('✅ Runtime ID correctly marked as deleted');
    } else {
      errors.push('❌ Runtime ID not marked as deleted');
    }

    // Test 4: Test filtering
    const mockRuntimes = [
      { key: testRuntimeKey, runtimeId: testRuntimeId, name: testRuntimeName },
      { key: 'active-runtime', runtimeId: 'active-id', name: 'Active Runtime' }
    ];
    const filtered = manager.filterDeletedRuntimes(mockRuntimes);
    if (filtered.length === 1 && filtered[0].key === 'active-runtime') {
      results.push('✅ Runtime filtering works correctly');
    } else {
      errors.push('❌ Runtime filtering failed');
    }

    // Test 5: Test restoration
    const restored = await manager.restoreRuntime(testRuntimeKey);
    if (restored) {
      results.push('✅ Runtime restoration works');
    } else {
      errors.push('❌ Runtime restoration failed');
    }

    // Test 6: Verify restoration worked
    const isStillDeleted = manager.isRuntimeDeleted(testRuntimeKey);
    if (!isStillDeleted) {
      results.push('✅ Runtime correctly restored');
    } else {
      errors.push('❌ Runtime still marked as deleted after restoration');
    }

    return {
      success: errors.length === 0,
      results,
      errors
    };
  } catch (error: any) {
    errors.push(`❌ Test failed with error: ${error.message}`);
    return {
      success: false,
      results,
      errors
    };
  }
}

/**
 * Clear all deleted runtime data (admin function)
 */
export async function clearAllRuntimeDeletionData(): Promise<{ success: boolean; message: string }> {
  try {
    const manager = RuntimeDeletionManager.getInstance();
    await manager.clearAllDeletedRuntimes();
    
    return {
      success: true,
      message: '✅ All runtime deletion data cleared successfully'
    };
  } catch (error: any) {
    return {
      success: false,
      message: `❌ Failed to clear runtime deletion data: ${error.message}`
    };
  }
}

/**
 * Log runtime deletion system status to console
 */
export function logRuntimeDeletionStatus(): void {
  const debugInfo = getRuntimeDeletionDebugInfo();
  
  console.group('🗑️ Runtime Deletion System Status');
  console.log('Total deleted runtimes:', debugInfo.totalDeletedRuntimes);
  console.log('Storage size:', `${(debugInfo.localStorageSize / 1024).toFixed(2)} KB`);
  console.log('Storage keys:', debugInfo.storageKeys);
  console.log('Working correctly:', debugInfo.isWorkingCorrectly ? '✅' : '❌');
  
  if (debugInfo.deletedRuntimes.length > 0) {
    console.table(debugInfo.deletedRuntimes.map(rt => ({
      name: rt.name,
      runtimeId: rt.runtimeId,
      deletedAt: new Date(rt.deletedAt).toLocaleString(),
      reason: rt.reason || 'No reason provided'
    })));
  }
  
  if (debugInfo.recommendations.length > 0) {
    console.warn('Recommendations:');
    debugInfo.recommendations.forEach(rec => console.warn('•', rec));
  }
  
  console.groupEnd();
}

/**
 * Add debug commands to window for browser console access
 */
export function addRuntimeDeletionDebugCommands(): void {
  if (typeof window !== 'undefined') {
    (window as any).chattyRuntimeDeletion = {
      getDebugInfo: getRuntimeDeletionDebugInfo,
      testSystem: testRuntimeDeletionSystem,
      clearAll: clearAllRuntimeDeletionData,
      logStatus: logRuntimeDeletionStatus,
      manager: RuntimeDeletionManager.getInstance()
    };
    
    console.log('🗑️ Runtime Deletion Debug Commands Added:');
    console.log('• window.chattyRuntimeDeletion.getDebugInfo() - Get debug info');
    console.log('• window.chattyRuntimeDeletion.testSystem() - Test the system');
    console.log('• window.chattyRuntimeDeletion.clearAll() - Clear all deletion data');
    console.log('• window.chattyRuntimeDeletion.logStatus() - Log current status');
    console.log('• window.chattyRuntimeDeletion.manager - Access manager instance');
  }
}