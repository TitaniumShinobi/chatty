// Verbosity control for CLI output
// Allows controlling debug/log verbosity across the application

// Initialize from command line arguments at module load time
// This ensures verbosity is set before any other modules use it
const args = typeof process !== 'undefined' ? process.argv.slice(2) : [];
const quietFromArgs = args.includes('--quiet') || args.includes('-q');
const verboseFromArgs = args.includes('--verbose') || args.includes('-v');

let verbose = verboseFromArgs;
let quiet = quietFromArgs;

// Default to clean mode (suppress debug/info) unless verbose is explicitly requested
// This ensures clean output by default

export function setVerbose(enabled: boolean) {
  verbose = enabled;
}

export function setQuiet(enabled: boolean) {
  quiet = enabled;
}

export function isVerbose(): boolean {
  return verbose && !quiet;
}

export function isQuiet(): boolean {
  return quiet;
}

export function shouldLog(level: 'debug' | 'info' | 'warn' | 'error' = 'info'): boolean {
  if (quiet) {
    // Only show errors in quiet mode
    return level === 'error';
  }
  if (verbose) {
    // Show everything in verbose mode
    return true;
  }
  // Default: clean mode - only show errors and warnings (hide debug and info)
  return level === 'error' || level === 'warn';
}

