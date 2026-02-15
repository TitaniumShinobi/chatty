import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { speechToText, ensureCompatibleFormat } from '../replit_integrations/audio/client.ts';

const router = express.Router();

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'chatty-internal-service-2026';

const uploadDir = path.join(process.cwd(), 'temp-transcribe-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      cb(null, `asr_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }
});

function isInternalService(req) {
  const key = req.headers['x-internal-service-key'];
  return key === INTERNAL_SERVICE_KEY;
}

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.user && !isInternalService(req)) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  let tmpPath = null;
  try {
    let audioBuffer;

    if (req.file) {
      tmpPath = req.file.path;
      audioBuffer = fs.readFileSync(tmpPath);
    } else if (req.body?.audio) {
      audioBuffer = Buffer.from(req.body.audio, 'base64');
    } else {
      return res.status(400).json({ ok: false, error: 'No audio provided. Send as multipart "audio" field or JSON { audio: "<base64>" }' });
    }

    const { buffer: compatBuffer, format } = await ensureCompatibleFormat(audioBuffer);
    const text = await speechToText(compatBuffer, format);

    res.json({ ok: true, text });
  } catch (err) {
    console.error('[Transcribe] Error:', err.message);
    res.status(500).json({ ok: false, error: 'Transcription failed', message: err.message });
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
});

export default router;
