import express from 'express';
import fetch from 'node-fetch';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

const router = express.Router();

const MOCR_BASE = process.env.MOCR_SERVICE_URL || 'http://localhost:3001';

const uploadDir = path.join(process.cwd(), 'temp-mocr-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      cb(null, `proxy_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
    }
  }),
  limits: { fileSize: 104857600 }
});

router.get('/health', async (_req, res) => {
  try {
    const resp = await fetch(`${MOCR_BASE}/health`, { timeout: 5000 });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ status: 'unreachable', error: err.message });
  }
});

router.get('/info', async (_req, res) => {
  try {
    const resp = await fetch(`${MOCR_BASE}/info`, { timeout: 5000 });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/jobs', upload.single('video'), async (req, res) => {
  let tmpPath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }
    tmpPath = req.file.path;

    const form = new FormData();
    form.append('video', fs.createReadStream(tmpPath), {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    if (req.body.config) {
      form.append('config', req.body.config);
    }

    const resp = await fetch(`${MOCR_BASE}/jobs`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    console.error('[MOCR Proxy] POST /jobs error:', err.message);
    res.status(502).json({ error: 'MOCR service error', message: err.message });
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
});

router.get('/jobs/:jobId', async (req, res) => {
  try {
    const resp = await fetch(`${MOCR_BASE}/jobs/${req.params.jobId}`, { timeout: 10000 });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const resp = await fetch(`${MOCR_BASE}/jobs${qs ? `?${qs}` : ''}`, { timeout: 10000 });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
