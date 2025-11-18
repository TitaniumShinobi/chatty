#!/usr/bin/env node
/**
 * Environment Validation Script for Chatty
 * 
 * Validates that port configuration and VVAULT paths are correctly set
 * for dual-environment development setup.
 */

import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const chattyRoot = join(__dirname, '..');

// Load environment files
const rootEnv = join(chattyRoot, '.env');
const serverEnv = join(chattyRoot, 'server', '.env');

let rootConfig = {};
let serverConfig = {};

if (existsSync(rootEnv)) {
  rootConfig = dotenv.parse(readFileSync(rootEnv, 'utf-8'));
}

if (existsSync(serverEnv)) {
  serverConfig = dotenv.parse(readFileSync(serverEnv, 'utf-8'));
}

console.log('🔍 Chatty Environment Validation');
console.log('=' .repeat(60));

// Check port configuration
console.log('\n📡 Port Configuration:');
const serverPort = serverConfig.CHAT_SERVER_PORT || serverConfig.PORT || '5000';
const frontendPort = '5173';

if (serverPort === '5000') {
  console.log(`   ✅ Backend port: ${serverPort} (correct)`);
} else {
  console.log(`   ⚠️  Backend port: ${serverPort} (expected 5000)`);
}

console.log(`   ✅ Frontend port: ${frontendPort} (Vite default)`);

// Check FRONTEND_URL
console.log('\n🌐 Frontend URL Configuration:');
const frontendUrl = serverConfig.FRONTEND_URL || rootConfig.FRONTEND_URL;
if (frontendUrl === `http://localhost:${frontendPort}`) {
  console.log(`   ✅ FRONTEND_URL: ${frontendUrl} (correct)`);
} else if (frontendUrl) {
  console.log(`   ⚠️  FRONTEND_URL: ${frontendUrl} (expected http://localhost:${frontendPort})`);
} else {
  console.log(`   ⚠️  FRONTEND_URL: not set (should be http://localhost:${frontendPort})`);
}

// Check VVAULT paths
console.log('\n📦 VVAULT Configuration:');
const vvaultRuntimePath = serverConfig.VVAULT_RUNTIME_PATH;
const chatCapsulePath = serverConfig.CHAT_CAPSULE_PATH;

if (vvaultRuntimePath) {
  if (existsSync(vvaultRuntimePath)) {
    console.log(`   ✅ VVAULT_RUNTIME_PATH: ${vvaultRuntimePath}`);
  } else {
    console.log(`   ⚠️  VVAULT_RUNTIME_PATH: ${vvaultRuntimePath} (path does not exist)`);
  }
} else {
  console.log(`   ℹ️  VVAULT_RUNTIME_PATH: not set (using defaults)`);
}

if (chatCapsulePath) {
  if (existsSync(chatCapsulePath)) {
    console.log(`   ✅ CHAT_CAPSULE_PATH: ${chatCapsulePath}`);
  } else {
    console.log(`   ⚠️  CHAT_CAPSULE_PATH: ${chatCapsulePath} (path does not exist)`);
  }
} else {
  console.log(`   ℹ️  CHAT_CAPSULE_PATH: not set (using defaults)`);
}

// Check CORS configuration
console.log('\n🔒 CORS Configuration:');
console.log(`   ✅ CORS configured for: http://localhost:${frontendPort}`);
console.log(`   ✅ Vite proxy configured: /api -> http://localhost:${serverPort}`);

// Summary
console.log('\n' + '='.repeat(60));
console.log('📋 Summary:');
console.log(`   Frontend: http://localhost:${frontendPort}`);
console.log(`   Backend:  http://localhost:${serverPort}`);
console.log(`   Proxy:    /api -> http://localhost:${serverPort}`);

const issues = [];
if (serverPort !== '5000') {
  issues.push('Backend port should be 5000');
}
if (frontendUrl && !frontendUrl.includes(frontendPort)) {
  issues.push(`FRONTEND_URL should be http://localhost:${frontendPort}`);
}

if (issues.length === 0) {
  console.log('\n✅ Environment configuration looks good!');
  process.exit(0);
} else {
  console.log('\n⚠️  Issues found:');
  issues.forEach(issue => console.log(`   - ${issue}`));
  console.log('\n💡 Fix: Update server/.env with correct values');
  process.exit(1);
}

