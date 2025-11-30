import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';
import fs from 'fs';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ChromaDB Service Manager
 * Automatically starts ChromaDB server if not already running
 */
class ChromaDBService {
  constructor() {
    this.process = null;
    this.chromaPath = null;
    this.port = process.env.CHROMA_PORT || 8000;
    this.host = process.env.CHROMA_HOST || 'localhost';
    this.url = `http://${this.host}:${this.port}`;
    this.venvPath = join(os.tmpdir(), 'chromadb-venv');
    this.maxStartupWait = 60000; // 60 seconds (allows time for installation)
    this.checkInterval = 1000; // 1 second
    this.healthCheckIntervalMs = 15000;
    this.healthMonitor = null;
    this.starting = false;
    this.lastError = null;
    this.logFd = null;
  }

  closeLogFd() {
    if (this.logFd !== null) {
      try {
        fs.closeSync(this.logFd);
      } catch (error) {
        console.warn('[ChromaDB] Failed to close log descriptor:', error);
      }
      this.logFd = null;
    }
  }

  /**
   * Find ChromaDB executable
   */
  async findChromaExecutable() {
    // Helper to filter only executable files (avoids picking directories like ./chroma/)
    const candidates = [];
    const pushIfExecutable = (candidatePath) => {
      if (!candidatePath) return;
      try {
        const stat = fs.statSync(candidatePath);
        if (!stat.isFile()) return;
        fs.accessSync(candidatePath, fs.constants.X_OK);
        candidates.push(candidatePath);
      } catch (_) {
        // Ignore invalid candidates
      }
    };

    // Check PATH first
    try {
      const fromPath = execSync('command -v chroma', { encoding: 'utf8' }).trim();
      pushIfExecutable(fromPath);
    } catch (_) {
      // Not in PATH
    }

    // Check common locations
    [
      join(os.homedir(), '.local', 'bin', 'chroma'),
      join(this.venvPath, 'bin', 'chroma'),
      join(this.venvPath, 'Scripts', 'chroma.exe'),
    ].forEach(pushIfExecutable);

    if (candidates.length > 0) {
      return candidates[0];
    }
    return null;
  }

  /**
   * Check if ChromaDB is already running
   */
  async isRunning() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${this.url}/api/v1/heartbeat`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      return response.ok || response.status === 404; // 404 means server is up (v1 deprecated)
    } catch (error) {
      return false;
    }
  }

  /**
   * Install ChromaDB in a temporary venv
   */
  async installChromaDB() {
    console.log('📦 [ChromaDB] Installing ChromaDB...');

    // Determine Python command (prefer 3.11 for compatibility)
    let pythonCmd = 'python3';
    if (process.platform !== 'win32') {
      // Try Python 3.11 first (better compatibility)
      try {
        execSync('python3.11 --version', { stdio: 'ignore' });
        pythonCmd = 'python3.11';
      } catch (e) {
        // Fallback to python3
      }
    }

    const venvPython = join(this.venvPath, process.platform === 'win32' ? 'Scripts' : 'bin', 'python');
    const venvPip = join(this.venvPath, process.platform === 'win32' ? 'Scripts' : 'bin', 'pip');
    const chromaExe = join(this.venvPath, process.platform === 'win32' ? 'Scripts' : 'bin', 'chroma');

    // Create venv if it doesn't exist
    if (!fs.existsSync(this.venvPath)) {
      console.log(`🔧 [ChromaDB] Creating virtual environment with ${pythonCmd}...`);
      execSync(`${pythonCmd} -m venv "${this.venvPath}"`, { stdio: 'inherit' });
    }

    // Install ChromaDB if not already installed
    if (!fs.existsSync(chromaExe)) {
      console.log('📥 [ChromaDB] Installing ChromaDB package...');
      execSync(`${venvPip} install --upgrade pip --quiet`, { stdio: 'inherit' });
      execSync(`${venvPip} install chromadb --quiet`, { stdio: 'inherit' });
    }

    if (fs.existsSync(chromaExe)) {
      return chromaExe;
    }

    return null;
  }

  /**
   * Start ChromaDB server
   */
  async start() {
    if (this.starting) {
      return this.waitForServer();
    }

    // Check if already running
    if (await this.isRunning()) {
      console.log(`✅ [ChromaDB] Server already running at ${this.url}`);
      this.startHealthMonitor();
      return true;
    }

    this.starting = true;

    // Find or install ChromaDB
    this.chromaPath = await this.findChromaExecutable();

    if (!this.chromaPath) {
      console.log('📦 [ChromaDB] ChromaDB not found, installing...');
      this.chromaPath = await this.installChromaDB();
    }

    if (!this.chromaPath) {
      console.error('❌ [ChromaDB] Failed to find or install ChromaDB');
      console.error('💡 [ChromaDB] Please install manually: pip install chromadb');
      console.error('💡 [ChromaDB] Then run: chroma run --host localhost --port 8000');
      return false;
    }

    // Start ChromaDB process
    console.log(`🚀 [ChromaDB] Starting server at ${this.url}...`);
    console.log(`🚀 [ChromaDB] Using executable: ${this.chromaPath}`);

    const logFile = join(os.tmpdir(), 'chromadb.log');
    this.closeLogFd();
    let logFd = null;

    try {
      logFd = fs.openSync(logFile, 'a');
      this.logFd = logFd;
    } catch (error) {
      console.warn(`⚠️ [ChromaDB] Unable to open log file (${logFile}):`, error);
    }

    const writeLog = (message) => {
      if (this.logFd === null) {
        return;
      }
      try {
        fs.writeSync(this.logFd, `${new Date().toISOString()} - ${message}\n`);
      } catch (error) {
        console.warn('[ChromaDB] Failed to write to log file:', error);
      }
    };

    if (logFd !== null) {
      writeLog(`=== ChromaDB startup attempt at ${new Date().toISOString()} ===`);
    }

    const stdio = logFd !== null ? ['ignore', logFd, logFd] : ['ignore', 'ignore', 'ignore'];
    this.process = spawn(this.chromaPath, ['run', '--host', this.host, '--port', String(this.port)], {
      stdio,
      detached: false,
    });

    this.process.on('error', (error) => {
      const errorMsg = `Failed to start: ${error.message}`;
      console.error(`❌ [ChromaDB] ${errorMsg}`);
      this.lastError = errorMsg;
      this.process = null;
      writeLog(`ERROR: ${errorMsg}`);
      this.closeLogFd();
    });

    this.process.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        const errorMsg = `Process exited with code ${code}`;
        console.error(`❌ [ChromaDB] ${errorMsg}`);
        this.lastError = errorMsg;
      }
      writeLog(`EXIT: ${code !== 0 && code !== null ? `code ${code}` : 'process exited'}`);
      this.process = null;
      this.closeLogFd();
    });

    // Wait for server to be ready
    const started = await this.waitForServer();
    if (started) {
      console.log(`✅ [ChromaDB] Server started successfully at ${this.url}`);
      this.startHealthMonitor();
    } else {
      console.error(`❌ [ChromaDB] Server failed to start within ${this.maxStartupWait}ms`);
      this.stop();
    }

    this.starting = false;
    return started;
  }

  /**
   * Wait for ChromaDB server to be ready
   */
  async waitForServer() {
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.maxStartupWait) {
      if (await this.isRunning()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, this.checkInterval));
    }

    return false;
  }

  /**
   * Wait for ChromaDB to be ready (public API for other services)
   * @param {number} maxWait - Maximum time to wait in milliseconds (default: 60 seconds)
   * @returns {Promise<boolean>} - True if ChromaDB is ready, false if timeout
   */
  async waitForReady(maxWait = 60000) {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds
    let lastStatus = 'checking';
    
    while (Date.now() - startTime < maxWait) {
      if (await this.isRunning()) {
        this.lastError = null; // Clear error on success
        return true;
      }
      
      // Log progress every 10 seconds
      const elapsed = Date.now() - startTime;
      if (elapsed % 10000 < checkInterval && lastStatus !== `waiting-${Math.floor(elapsed / 10000)}`) {
        lastStatus = `waiting-${Math.floor(elapsed / 10000)}`;
        console.log(`⏳ [ChromaDB] Waiting for server... (${Math.floor(elapsed / 1000)}s elapsed)`);
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    return false;
  }

  /**
   * Stop ChromaDB server
   */
  stop() {
    if (this.process) {
      console.log('🛑 [ChromaDB] Stopping server...');
      this.process.kill();
      this.process = null;
    }
    if (this.healthMonitor) {
      clearInterval(this.healthMonitor);
      this.healthMonitor = null;
    }
    this.starting = false;
    this.closeLogFd();
  }

  /**
   * Get server status
   */
  async getStatus() {
    const running = await this.isRunning();
    const logFile = join(os.tmpdir(), 'chromadb.log');
    let lastLogLines = [];
    
    try {
      if (fs.existsSync(logFile)) {
        const logContent = fs.readFileSync(logFile, 'utf8');
        const lines = logContent.split('\n').filter(l => l.trim());
        lastLogLines = lines.slice(-10); // Last 10 lines
      }
    } catch (e) {
      // Ignore log read errors
    }
    
    return {
      running,
      url: this.url,
      processAlive: this.process !== null,
      starting: this.starting,
      lastError: this.lastError,
      chromaPath: this.chromaPath,
      logFile,
      lastLogLines
    };
  }

  startHealthMonitor() {
    if (this.healthMonitor) {
      return;
    }
    this.healthMonitor = setInterval(async () => {
      try {
        const running = await this.isRunning();
        if (!running) {
          console.warn('⚠️ [ChromaDB] Health check detected server offline. Attempting restart...');
          await this.start();
        }
      } catch (error) {
        console.error('❌ [ChromaDB] Health monitor error:', error);
      }
    }, this.healthCheckIntervalMs);
  }

  async ensureRunning() {
    const running = await this.isRunning();
    if (running) {
      return true;
    }
    return this.start();
  }
}

// Singleton instance
let chromaDBService = null;

/**
 * Get or create ChromaDB service instance
 */
export function getChromaDBService() {
  if (!chromaDBService) {
    chromaDBService = new ChromaDBService();
  }
  return chromaDBService;
}

/**
 * Initialize ChromaDB (start if not running)
 */
export async function initializeChromaDB() {
  const service = getChromaDBService();
  return await service.ensureRunning();
}

/**
 * Shutdown ChromaDB
 */
export function shutdownChromaDB() {
  const service = getChromaDBService();
  service.stop();
}

export default ChromaDBService;
