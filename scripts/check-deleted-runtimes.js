#!/usr/bin/env node
/**
 * Check Deleted Runtimes
 * 
 * Checks localStorage and VVAULT for deleted runtime entries to see if valid runtimes are being filtered out.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This script would need to run in browser context to check localStorage
// For now, provide instructions

console.log(`
🔍 Deleted Runtime Checker

To check if runtimes are marked as deleted:

1. Open browser console on http://localhost:5173
2. Run:
   const { RuntimeDeletionManager } = await import('/src/lib/runtimeDeletionManager.ts');
   const manager = RuntimeDeletionManager.getInstance();
   const deleted = manager.getAllDeletedRuntimes();
   console.log('Deleted runtimes:', deleted);
   
3. Check localStorage:
   console.log('Global deleted:', localStorage.getItem('chatty:deleted-runtimes'));
   console.log('User deleted:', localStorage.getItem('chatty:deleted-runtimes:user:YOUR_USER_ID'));

4. If runtimes are incorrectly marked as deleted, restore them:
   await manager.restoreRuntime('runtime-key-here', 'user-id-here');
`);

