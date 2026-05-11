#!/usr/bin/env node

try {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(':memory:');
  db.prepare('SELECT 1').get();
  db.close();
} catch (error) {
  const message = error && typeof error.message === 'string' ? error.message : String(error);

  console.error(
    [
      '',
      'better-sqlite3 is not usable with the current Node.js runtime.',
      `Node.js: ${process.versions.node} (ABI ${process.versions.modules})`,
      '',
      message,
      '',
      'Recommended fix:',
      '  npm rebuild better-sqlite3',
      'If that does not work, remove and reinstall dependencies under the active Node version.',
      ''
    ].join('\n')
  );

  process.exit(1);
}
