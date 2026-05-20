#!/usr/bin/env node
import { runCodexContinuityProof } from '../lib/codexContinuityProof.js';

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

try {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  const result = await runCodexContinuityProof();
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (Object.values(result.gates || {}).some((value) => value !== 'PASS')) {
    process.exitCode = 1;
  }
} catch (error) {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  process.stderr.write(`runCodexContinuityProof failed: ${error?.message || String(error)}\n`);
  process.exitCode = 1;
}
