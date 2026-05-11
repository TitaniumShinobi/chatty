#!/usr/bin/env node

const [major] = process.versions.node.split('.').map(Number);
const supportedMajors = new Set([20, 21, 22]);

if (supportedMajors.has(major)) {
  process.exit(0);
}

console.error(
  [
    '',
    `Unsupported Node.js version: ${process.versions.node}`,
    'Chatty local startup is supported on Node 20-22.',
    'Recommended fix:',
    '  nvm use v20.20.1',
    ''
  ].join('\n')
);

process.exit(1);
