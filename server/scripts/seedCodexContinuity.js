#!/usr/bin/env node
import { seedCodexContinuity } from '../lib/codexContinuitySeed.js';

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

try {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  const result = await seedCodexContinuity();
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  const output = {
    filesChanged: result.filesChanged,
    writePathUsed: result.writePathUsed,
    seededRuntimeTurnState: result.seededRuntimeTurnState,
    resumeTokenJson: result.resumeTokenJson,
    chattyResumeUrl: result.chattyResumeUrl,
    verificationCommandsRun: result.verificationCommandsRun,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} catch (error) {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  process.stderr.write(`seedCodexContinuity failed: ${error?.message || String(error)}\n`);
  process.exitCode = 1;
}
