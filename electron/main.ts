import { app, BrowserWindow } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import waitOn from 'wait-on';

type Mode = 'dev' | 'prod';

const args = process.argv.slice(2);
const mode: Mode = args.find((arg) => arg.startsWith('--mode='))?.split('=')[1] === 'prod' ? 'prod' : 'dev';
const runSnapshot = args.includes('--snapshot-before-launch');

let mainWindow: BrowserWindow | null = null;
let backgroundProcess: ChildProcessWithoutNullStreams | null = null;

const SERVER_URL = 'http://localhost:3000';
const VITE_URL = 'http://localhost:5173';

async function runEnvSnapshot() {
  if (!runSnapshot) return;

  try {
    console.log('🛰️  [Electron] Running environment snapshot before launch...');
    await new Promise<void>((resolve, reject) => {
      const snapshot = spawn('node', ['scripts/envSnapshot.js', '--tag=electron-shell'], {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit'
      });

      snapshot.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`envSnapshot exited with ${code}`));
        }
      });
    });
  } catch (error) {
    console.warn('⚠️  [Electron] envSnapshot failed:', error);
  }
}

function spawnBackgroundProcess() {
  const command = mode === 'dev' ? 'npm' : 'npm';
  const subcommand = mode === 'dev' ? 'dev:full' : 'start:prod';
  backgroundProcess = spawn(command, ['run', subcommand], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: mode === 'dev' ? 'development' : 'production' },
    shell: process.platform === 'win32'
  });

  backgroundProcess.stdout.setEncoding('utf8');
  backgroundProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[Server] ${chunk}`);
  });
  backgroundProcess.stderr.setEncoding('utf8');
  backgroundProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[Server] ${chunk}`);
  });

  backgroundProcess.on('exit', (code) => {
    console.log(`🧠 [Electron] Background process exited with ${code}`);
    if (code !== 0 && !app.isQuitting) {
      app.quit();
    }
  });
}

function buildWaitTargets(): string[] {
  if (mode === 'dev') {
    return [VITE_URL, `${SERVER_URL}/api/health`];
  }
  return [`${SERVER_URL}/api/health`];
}

async function waitForServices() {
  const resources = buildWaitTargets();
  try {
    await waitOn({
      resources,
      timeout: 120000,
      interval: 1000,
      tcpTimeout: 1000,
      window: 3000
    });
    console.log('🪐 [Electron] All services are ready:', resources);
  } catch (error) {
    console.warn('⚠️ [Electron] Timeout waiting for services:', error);
  }
}

function createWindow() {
  const targetUrl = mode === 'dev' ? VITE_URL : SERVER_URL;

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#080808',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 12 },
    show: false,
    frame: true,
    visualEffectState: 'active',
    vibrancy: 'ultra-dark',
    title: 'Chatty — Quantum Shell',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(targetUrl);
}

async function start() {
  await runEnvSnapshot();
  spawnBackgroundProcess();
  await waitForServices();
  createWindow();
}

function stopBackgroundProcess() {
  if (!backgroundProcess || backgroundProcess.killed) return;
  backgroundProcess.kill('SIGTERM');
  backgroundProcess = null;
}

app.on('ready', start);

app.on('before-quit', () => {
  stopBackgroundProcess();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackgroundProcess();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
