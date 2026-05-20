import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';

test('vvault connector config expands tilde roots to an absolute path', async () => {
  const previousRootPath = process.env.VVAULT_ROOT_PATH;
  const previousPath = process.env.VVAULT_PATH;
  process.env.VVAULT_ROOT_PATH = '~/Documents/GitHub/vvault';
  delete process.env.VVAULT_PATH;

  try {
    const moduleUrl = new URL(`../../vvaultConnector/config.js?test=${Date.now()}`, import.meta.url);
    const config = await import(moduleUrl.href);
    assert.equal(
      config.VVAULT_ROOT,
      path.resolve(path.join(os.homedir(), 'Documents/GitHub/vvault')),
    );
    assert.equal(config.getBasePath(), config.VVAULT_ROOT);
  } finally {
    if (previousRootPath === undefined) {
      delete process.env.VVAULT_ROOT_PATH;
    } else {
      process.env.VVAULT_ROOT_PATH = previousRootPath;
    }
    if (previousPath === undefined) {
      delete process.env.VVAULT_PATH;
    } else {
      process.env.VVAULT_PATH = previousPath;
    }
  }
});
