#!/usr/bin/env node
/**
 * User Registry Event System
 * 
 * Implements event-driven integration between Chatty and VVAULT user registries
 * following the philosophical principles of loose coupling and data sovereignty.
 */

import { EventEmitter } from 'events';

class UserRegistryEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Allow multiple listeners
  }

  /**
   * Emit user creation event
   * @param {Object} userData - User data with identity fields
   */
  emitUserCreated(userData) {
    const event = {
      type: 'USER_CREATED',
      timestamp: new Date().toISOString(),
      data: {
        // Minimal context for cross-system sync
        id: userData.id,
        constructId: userData.constructId,
        vvaultPath: userData.vvaultPath,
        email: userData.email,
        name: userData.name,
        provider: userData.provider,
        status: userData.status
      }
    };
    
    console.log(`📡 Emitting USER_CREATED event for construct: ${userData.constructId}`);
    this.emit('USER_CREATED', event);
  }

  /**
   * Emit user updated event
   * @param {Object} userData - Updated user data
   */
  emitUserUpdated(userData) {
    const event = {
      type: 'USER_UPDATED',
      timestamp: new Date().toISOString(),
      data: {
        id: userData.id,
        constructId: userData.constructId,
        vvaultPath: userData.vvaultPath,
        email: userData.email,
        name: userData.name,
        status: userData.status,
        lastLoginAt: userData.lastLoginAt
      }
    };
    
    console.log(`📡 Emitting USER_UPDATED event for construct: ${userData.constructId}`);
    this.emit('USER_UPDATED', event);
  }

  /**
   * Emit user deleted event
   * @param {Object} userData - User data being deleted
   */
  emitUserDeleted(userData) {
    const event = {
      type: 'USER_DELETED',
      timestamp: new Date().toISOString(),
      data: {
        id: userData.id,
        constructId: userData.constructId,
        vvaultPath: userData.vvaultPath,
        email: userData.email,
        deletedAt: new Date().toISOString()
      }
    };
    
    console.log(`📡 Emitting USER_DELETED event for construct: ${userData.constructId}`);
    this.emit('USER_DELETED', event);
  }
}

// Global event bus instance
export const userRegistryEvents = new UserRegistryEventBus();

/**
 * VVAULT Integration Listener
 * NOTE: VVAULT is now a separate service - users must link accounts manually
 * Auto-sync is disabled to maintain service independence
 */
export function setupVVAULTUserSync() {
  // DISABLED: VVAULT is a separate service - users link accounts manually
  // No auto-creation of VVAULT accounts on Chatty signup
  
  userRegistryEvents.on('USER_CREATED', async (event) => {
    // Do nothing - VVAULT account linking is manual
    console.log(`ℹ️  [VVAULT] User created in Chatty: ${event.data.email} - VVAULT account linking is separate`);
  });

  userRegistryEvents.on('USER_UPDATED', async (event) => {
    try {
      console.log(`🔄 Syncing user update to VVAULT: ${event.data.constructId}`);
      
      // Update user metadata in VVAULT if needed
      const { VVAULTConnector } = await import('../../vvaultConnector/index.js');
      const connector = new VVAULTConnector();
      
      await connector.updateUserMetadata(event.data.id, event.data.constructId, {
        name: event.data.name,
        email: event.data.email,
        lastLoginAt: event.data.lastLoginAt
      });
      
      console.log(`✅ VVAULT user update sync completed: ${event.data.constructId}`);
    } catch (error) {
      console.error(`❌ VVAULT user update sync failed for ${event.data.constructId}:`, error.message);
    }
  });

  userRegistryEvents.on('USER_DELETED', async (event) => {
    try {
      console.log(`🔄 Syncing user deletion to VVAULT: ${event.data.constructId}`);
      
      // Mark user data as deleted in VVAULT (don't actually delete for audit trail)
      const { VVAULTConnector } = await import('../../vvaultConnector/index.js');
      const connector = new VVAULTConnector();
      
      await connector.markUserDeleted(event.data.id, event.data.constructId, event.data.deletedAt);
      
      console.log(`✅ VVAULT user deletion sync completed: ${event.data.constructId}`);
    } catch (error) {
      console.error(`❌ VVAULT user deletion sync failed for ${event.data.constructId}:`, error.message);
    }
  });

  console.log('🔗 VVAULT user registry sync listeners registered');
}

/**
 * Initialize the event system
 */
export function initializeUserRegistryEvents() {
  setupVVAULTUserSync();
  console.log('🚀 User registry event system initialized');
}


