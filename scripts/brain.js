#!/usr/bin/env node

/**
 * Chatty Brain - Main Application Entry Point
 * Similar to brain.py pattern used in other projects
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkDependencies() {
  log('🔍 Checking dependencies...', 'blue');
  
  // Check if package.json exists
  if (!fs.existsSync('package.json')) {
    log('❌ Error: package.json not found. Make sure you\'re in the Chatty project root.', 'red');
    process.exit(1);
  }
  
  // Check if node_modules exists
  if (!fs.existsSync('node_modules')) {
    log('📦 Installing frontend dependencies...', 'yellow');
    const install = spawn('npm', ['install'], { stdio: 'inherit' });
    install.on('close', (code) => {
      if (code !== 0) {
        log('❌ Failed to install frontend dependencies', 'red');
        process.exit(1);
      }
    });
  }
  
  // Check if server/node_modules exists
  if (!fs.existsSync('server/node_modules')) {
    log('📦 Installing server dependencies...', 'yellow');
    const install = spawn('npm', ['install'], { 
      stdio: 'inherit',
      cwd: 'server'
    });
    install.on('close', (code) => {
      if (code !== 0) {
        log('❌ Failed to install server dependencies', 'red');
        process.exit(1);
      }
    });
  }
}

function startServers() {
  log('🚀 Starting Chatty servers...', 'green');
  log('   Frontend: http://localhost:5173', 'cyan');
  log('   Backend:  http://localhost:3001', 'cyan');
  log('   Health:   http://localhost:3001/health', 'cyan');
  log('');
  log('Press Ctrl+C to stop both servers', 'yellow');
  log('');
  
  // Start both servers using concurrently
  const dev = spawn('npm', ['run', 'dev:full'], { stdio: 'inherit' });
  
  dev.on('close', (code) => {
    log(`\n🛑 Servers stopped with code ${code}`, 'magenta');
    process.exit(code);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log('\n🛑 Shutting down servers...', 'yellow');
    dev.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    log('\n🛑 Shutting down servers...', 'yellow');
    dev.kill('SIGTERM');
  });
}

function main() {
  log('🧠 Chatty Brain - Main Application Entry Point', 'magenta');
  log('==============================================', 'magenta');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const mode = args[0] || 'dev';
  
  switch (mode) {
    case 'dev':
    case 'development':
      log('🎯 Mode: Development', 'green');
      checkDependencies();
      startServers();
      break;
      
    case 'build':
      log('🏗️  Mode: Build', 'green');
      const build = spawn('npm', ['run', 'build'], { stdio: 'inherit' });
      build.on('close', (code) => process.exit(code));
      break;
      
    case 'preview':
      log('👀 Mode: Preview', 'green');
      const preview = spawn('npm', ['run', 'preview'], { stdio: 'inherit' });
      preview.on('close', (code) => process.exit(code));
      break;
      
    case 'server':
      log('🖥️  Mode: Server Only', 'green');
      const server = spawn('npm', ['run', 'server'], { stdio: 'inherit' });
      server.on('close', (code) => process.exit(code));
      break;
      
    case 'frontend':
      log('🌐 Mode: Frontend Only', 'green');
      const frontend = spawn('npm', ['run', 'dev'], { stdio: 'inherit' });
      frontend.on('close', (code) => process.exit(code));
      break;
      
    case 'help':
    case '--help':
    case '-h':
      log('📖 Chatty Brain - Available Commands:', 'cyan');
      log('  node brain.js [mode]', 'yellow');
      log('');
      log('Modes:', 'cyan');
      log('  dev, development  - Start both frontend and backend (default)', 'green');
      log('  server            - Start backend server only', 'green');
      log('  frontend          - Start frontend server only', 'green');
      log('  build             - Build for production', 'green');
      log('  preview           - Preview production build', 'green');
      log('  help              - Show this help message', 'green');
      break;
      
    default:
      log(`❌ Unknown mode: ${mode}`, 'red');
      log('Run "node brain.js help" for available options', 'yellow');
      process.exit(1);
  }
}

// Run the main function
main();
