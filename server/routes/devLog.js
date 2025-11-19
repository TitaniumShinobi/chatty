/**
 * Development Log Route
 * Receives UI interaction logs from frontend and logs them to terminal
 * Only active in development mode
 */

import express from 'express';

const router = express.Router();

// Only enable in development
const isDev = process.env.NODE_ENV === 'development' || process.env.DEV === 'true';

if (isDev) {
  router.post('/dev-log', express.json(), (req, res) => {
    
    const { type, tag, id, classes, text, href, timestamp, pathname, component } = req.body;

    // Format the log message
    const parts = [];
    
    // Timestamp (short format)
    const time = new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
    parts.push(`[${time}]`);

    // Event type
    parts.push(`🖱️ ${type.toUpperCase()}`);

    // Component name if available
    if (component) {
      parts.push(`<${component}>`);
    }

    // Tag and attributes
    const tagLower = tag.toLowerCase();
    const attrs = [];
    if (id) attrs.push(`id="${id}"`);
    if (classes) {
      const classList = classes.split(' ').filter(c => c && !c.includes('undefined')).slice(0, 3).join(' ');
      if (classList) attrs.push(`class="${classList}"`);
    }
    
    if (attrs.length > 0) {
      parts.push(`<${tagLower} ${attrs.join(' ')}>`);
    } else {
      parts.push(`<${tagLower}>`);
    }

    // Text content (truncated)
    if (text) {
      const displayText = text.length > 40 ? text.slice(0, 40) + '...' : text;
      parts.push(`"${displayText}"`);
    }

    // Href if it's a link
    if (href) {
      try {
        const url = new URL(href);
        parts.push(`→ ${url.pathname}${url.search}`);
      } catch {
        parts.push(`→ ${href.slice(0, 40)}`);
      }
    }

    // Pathname
    if (pathname) {
      parts.push(`@ ${pathname}`);
    }

    // Log to terminal
    console.log(parts.join(' '));

    res.sendStatus(200);
  });
} else {
  // In production, return 404
  router.post('/dev-log', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

// Test endpoint (quiet - no console logs)
router.get('/dev-log-test', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'dev-log route is working',
    isDev,
    nodeEnv: process.env.NODE_ENV 
  });
});

export default router;

