import express from 'express';
import path from 'node:path';
import fs from 'node:fs';

const router = express.Router();

function readPublished() {
  try {
    const base = path.resolve(path.join(new URL(import.meta.url).pathname, '..'));
    const outPath = path.join(base, '..', 'tmp', 'current_theme.json');
    if (!fs.existsSync(outPath)) return null;
    return JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } catch (e) {
    return null;
  }
}

router.get('/active', (_req, res) => {
  const published = readPublished();
  if (!published) {
    return res.json({ ok: true, activeTheme: null, updatedAt: null, note: 'no published theme available' });
  }
  return res.json({ ok: true, ...published });
});

export default router;
