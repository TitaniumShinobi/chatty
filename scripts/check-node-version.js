#!/usr/bin/env node

const requiredVersion = process.env.CHATTY_REQUIRED_NODE_VERSION || 'v20.20.1';

if (process.version === requiredVersion) {
  process.exit(0);
}

console.error(
  [
    '',
    `Unsupported Node.js version: ${process.versions.node}`,
    `Chatty local startup requires ${requiredVersion}.`,
    'Recommended fix:',
    `  nvm use ${requiredVersion}`,
    ''
  ].join('\n')
);

process.exit(1);
