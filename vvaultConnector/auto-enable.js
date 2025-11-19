#!/usr/bin/env node
/**
 * VVAULT Auto-Enable for Chatty
 * 
 * Simply import this file in Chatty to automatically enable
 * VVAULT integration for all conversations.
 * 
 * Usage: require('./vvaultConnector/auto-enable');
 */

// Import the auto-integration setup
require('./setup-auto-integration');

console.log('🎯 VVAULT auto-integration enabled for Chatty');
console.log('📝 All conversations will be automatically stored in VVAULT');
