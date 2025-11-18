/**
 * Proxy entrypoint for VVAULT Connector.
 * Provides a space-free import path that re-exports the latest connector implementation.
 *
 * This layer is CommonJS so it can require the existing connector files (which also use CJS).
 * The parent app (ESM) can still `import()` this; Vite will treat the CJS exports as default/named properties.
 */
const connector = require('./index 3.js');

module.exports = {
  ...connector,
  default: connector
};
