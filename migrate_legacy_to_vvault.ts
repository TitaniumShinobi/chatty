#!/usr/bin/env node
/**
 * Migration Script: Legacy Data to VVAULT
 * 
 * Scans legacy backend/localStorage for threads and migrates them to VVAULT.
 * Deletes original data after successful migration.
 * 
 * @author Devon Woodson
 * @version 1.0.0
 */

import fs from 'fs/promises';
import path from 'path';
import { VVAULTConnector } from '../vvaultConnector/index.js';

interface LegacyThread {
  id: string;
  title: string;
  messages: any[];
  createdAt?: number;
  updatedAt?: number;
  archived?: boolean;
}

interface MigrationResult {
  success: boolean;
  migratedCount: number;
  errorCount: number;
  errors: string[];
  deletedLegacyData: boolean;
}

class LegacyToVVAULTMigrator {
  private vvaultConnector: VVAULTConnector;
  private migrationLog: string[] = [];

  constructor() {
    this.vvaultConnector = new VVAULTConnector();
  }

  /**
   * Initialize the migrator
   */
  async initialize(): Promise<void> {
    try {
      await this.vvaultConnector.initialize();
      console.log('✅ Migration system initialized');
    } catch (error) {
      console.error('❌ Failed to initialize migration system:', error);
      throw error;
    }
  }

  /**
   * Scan localStorage for legacy conversation data
   */
  private scanLocalStorage(): LegacyThread[] {
    const threads: LegacyThread[] = [];
    
    try {
      // Check for legacy global threads
      const legacyKey = 'chatty:threads';
      const legacyData = localStorage.getItem(legacyKey);
      
      if (legacyData) {
        try {
          const parsed = JSON.parse(legacyData);
          if (Array.isArray(parsed)) {
            threads.push(...parsed);
            this.migrationLog.push(`Found ${parsed.length} legacy threads in localStorage`);
          }
        } catch (error) {
          this.migrationLog.push(`Failed to parse legacy localStorage data: ${error}`);
        }
      }

      // Check for user-specific threads
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chatty:threads:') && key !== 'chatty:threads') {
          const userData = localStorage.getItem(key);
          if (userData) {
            try {
              const parsed = JSON.parse(userData);
              if (Array.isArray(parsed)) {
                threads.push(...parsed);
                this.migrationLog.push(`Found ${parsed.length} threads for user key: ${key}`);
              }
            } catch (error) {
              this.migrationLog.push(`Failed to parse user data for key ${key}: ${error}`);
            }
          }
        }
      }

    } catch (error) {
      this.migrationLog.push(`Error scanning localStorage: ${error}`);
    }

    return threads;
  }

  /**
   * Scan backend database for legacy conversation data
   */
  private async scanBackendDatabase(): Promise<LegacyThread[]> {
    const threads: LegacyThread[] = [];
    
    try {
      // This would need to be implemented based on your backend storage
      // For now, we'll assume the backend is already using VVAULT or is empty
      this.migrationLog.push('Backend database scan not implemented - assuming already migrated or empty');
    } catch (error) {
      this.migrationLog.push(`Error scanning backend database: ${error}`);
    }

    return threads;
  }

  /**
   * Migrate a single thread to VVAULT
   */
  private async migrateThread(userId: string, thread: LegacyThread): Promise<boolean> {
    try {
      console.log(`📝 Migrating thread ${thread.id} to VVAULT for user ${userId}`);
      
      // Migrate each message in the thread
      for (const message of thread.messages) {
        const timestamp = new Date(message.timestamp || message.ts || Date.now()).toISOString();
        
        await this.vvaultConnector.writeTranscript({
          userId: userId,
          sessionId: thread.id,
          timestamp: timestamp,
          role: message.role || 'user',
          content: message.content || message.text || 'Legacy message'
        });
      }

      // Add thread metadata as a system message
      const metadata = {
        title: thread.title,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        archived: thread.archived
      };

      await this.vvaultConnector.writeTranscript({
        userId: userId,
        sessionId: thread.id,
        timestamp: new Date().toISOString(),
        role: 'system',
        content: `THREAD_METADATA:${JSON.stringify(metadata)}`
      });

      console.log(`✅ Successfully migrated thread ${thread.id}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to migrate thread ${thread.id}:`, error);
      this.migrationLog.push(`Failed to migrate thread ${thread.id}: ${error}`);
      return false;
    }
  }

  /**
   * Delete legacy data after successful migration
   */
  private async deleteLegacyData(): Promise<void> {
    try {
      // Delete legacy localStorage keys
      const keysToDelete: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key === 'chatty:threads' ||
          key.startsWith('chatty:threads:') ||
          key.startsWith('chatty:threads:backup:') ||
          key.startsWith('chatty:full_backup:') ||
          key.startsWith('chatty:migration:') ||
          key.startsWith('chatty:restore_backup:')
        )) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        localStorage.removeItem(key);
        this.migrationLog.push(`Deleted legacy localStorage key: ${key}`);
      }

      console.log(`🗑️ Deleted ${keysToDelete.length} legacy localStorage keys`);
      
    } catch (error) {
      console.error('❌ Failed to delete legacy data:', error);
      this.migrationLog.push(`Failed to delete legacy data: ${error}`);
    }
  }

  /**
   * Run the complete migration process
   */
  async migrate(userId: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedCount: 0,
      errorCount: 0,
      errors: [],
      deletedLegacyData: false
    };

    try {
      console.log(`🔄 Starting migration to VVAULT for user: ${userId}`);
      
      // Scan for legacy data
      const localStorageThreads = this.scanLocalStorage();
      const backendThreads = await this.scanBackendDatabase();
      const allThreads = [...localStorageThreads, ...backendThreads];

      console.log(`📦 Found ${allThreads.length} legacy threads to migrate`);

      if (allThreads.length === 0) {
        console.log('ℹ️ No legacy data found to migrate');
        result.success = true;
        return result;
      }

      // Migrate each thread
      for (const thread of allThreads) {
        const success = await this.migrateThread(userId, thread);
        if (success) {
          result.migratedCount++;
        } else {
          result.errorCount++;
        }
      }

      // Delete legacy data if migration was successful
      if (result.errorCount === 0) {
        await this.deleteLegacyData();
        result.deletedLegacyData = true;
        console.log('✅ Legacy data deleted after successful migration');
      } else {
        console.log(`⚠️ Keeping legacy data due to ${result.errorCount} migration errors`);
      }

      result.success = result.errorCount === 0;
      result.errors = this.migrationLog;

      console.log(`🎯 Migration completed: ${result.migratedCount} threads migrated, ${result.errorCount} errors`);
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      result.errors = [...this.migrationLog, `Migration failed: ${error}`];
    }

    return result;
  }

  /**
   * Generate migration report
   */
  generateReport(result: MigrationResult): string {
    const report = [
      '# VVAULT Migration Report',
      '',
      `**Migration Date:** ${new Date().toISOString()}`,
      `**Status:** ${result.success ? '✅ Success' : '❌ Failed'}`,
      `**Threads Migrated:** ${result.migratedCount}`,
      `**Errors:** ${result.errorCount}`,
      `**Legacy Data Deleted:** ${result.deletedLegacyData ? 'Yes' : 'No'}`,
      '',
      '## Migration Log',
      '',
      ...result.errors.map(error => `- ${error}`),
      '',
      '## Next Steps',
      '',
      result.success 
        ? '- ✅ Migration completed successfully'
        : '- ❌ Review errors and retry migration if needed',
      '- 🔍 Verify conversations are accessible in VVAULT',
      '- 🧪 Test conversation loading and saving',
      '- 📊 Monitor VVAULT storage usage'
    ];

    return report.join('\n');
  }
}

/**
 * Main migration function
 */
export async function migrateLegacyToVVAULT(userId: string): Promise<MigrationResult> {
  const migrator = new LegacyToVVAULTMigrator();
  
  try {
    await migrator.initialize();
    const result = await migrator.migrate(userId);
    
    // Generate and save report
    const report = migrator.generateReport(result);
    const reportPath = path.join(process.cwd(), `migration-report-${Date.now()}.md`);
    await fs.writeFile(reportPath, report);
    
    console.log(`📄 Migration report saved to: ${reportPath}`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      migratedCount: 0,
      errorCount: 1,
      errors: [`Migration failed: ${error}`],
      deletedLegacyData: false
    };
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const userId = process.argv[2];
  
  if (!userId) {
    console.error('Usage: node migrate_legacy_to_vvault.js <userId>');
    process.exit(1);
  }

  migrateLegacyToVVAULT(userId)
    .then(result => {
      console.log('\n' + '='.repeat(50));
      console.log('MIGRATION COMPLETE');
      console.log('='.repeat(50));
      console.log(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`Threads Migrated: ${result.migratedCount}`);
      console.log(`Errors: ${result.errorCount}`);
      console.log(`Legacy Data Deleted: ${result.deletedLegacyData ? 'Yes' : 'No'}`);
      
      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(error => console.log(`  - ${error}`));
      }
      
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
