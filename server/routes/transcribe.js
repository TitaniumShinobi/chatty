import express from 'express';
import multer from 'multer';
import { Buffer } from 'node:buffer';
import fs from 'fs';
import fsPromises from 'node:fs/promises';
import path from 'path';
import process from 'node:process';
import {
  speechToText,
  ensureCompatibleFormat,
  detectAudioFormat,
  prepareWavForLocalTranscribe,
  transcribeWithFasterWhisper,
} from '../replit_integrations/audio/client.js';
import { attachAuthIfPresent } from '../auth/middleware/auth.js';
import { runVADOnPath, shouldUseVAD, getVADEnv, trimWavSegment } from '../utils/vad.js';

const router = express.Router();

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export function shouldAllowAnonymousTranscribe(req, env = process.env) {
  return env.NODE_ENV === 'development';
}

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
  return Boolean(INTERNAL_SERVICE_KEY) && key === INTERNAL_SERVICE_KEY;
}

router.use(attachAuthIfPresent);

export async function handleTranscribeRequest(req, res) {
  if (!req.user && !isInternalService(req) && !shouldAllowAnonymousTranscribe(req)) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  const TRANSCRIPTION_BACKEND = (process.env.TRANSCRIPTION_BACKEND || 'local').toLowerCase();
  const USE_VAD = shouldUseVAD();
  let tmpPath = null;
  let wavPath = null;
  let trimmedPath = null;
  try {
    let audioBuffer;

    if (req.file) {
      tmpPath = req.file.path;
      audioBuffer = fs.readFileSync(tmpPath);
    } else if (req.body?.audio) {
      const allowedKeys = new Set(['audio', 'language']);
      const unknownKeys = Object.keys(req.body || {}).filter((key) => !allowedKeys.has(key));
      if (unknownKeys.length) return res.status(400).json({ ok: false, error: 'unknown request field' });
      if (typeof req.body.audio !== 'string') return res.status(400).json({ ok: false, error: 'audio must be a base64 string' });
      audioBuffer = Buffer.from(req.body.audio, 'base64');
    } else {
      return res.status(400).json({ ok: false, error: 'No audio provided. Send as multipart "audio" field or JSON { audio: "<base64>" }' });
    }

    const detected = detectAudioFormat(audioBuffer);
    const rawLanguage = req.query.language || req.body?.language || '';
    if (rawLanguage && typeof rawLanguage !== 'string') return res.status(400).json({ ok: false, error: 'language must be a string' });
    const language = rawLanguage.trim().toLowerCase() || null;
    if (language) console.log('[Transcribe] Language hint:', language);
    console.log('[Transcribe] Upload OK, length:', audioBuffer.length, 'detected format:', detected, 'backend:', TRANSCRIPTION_BACKEND);

    const sttOptions = language ? { language: language.length >= 2 ? language : 'en' } : {};
    let text;
    let sttWavPath = null;

    if (USE_VAD) {
      wavPath = await prepareWavForLocalTranscribe(audioBuffer);
      const vadResult = await runVADOnPath(wavPath, getVADEnv());
      if (!vadResult?.hasSpeech) {
        return res.status(400).json({
          ok: false,
          error: 'No speech detected',
          message: "Didn't catch speech. Try again.",
        });
      }
      if (vadResult.startMs != null && vadResult.endMs != null && vadResult.endMs > vadResult.startMs) {
        try {
          trimmedPath = await trimWavSegment(
            wavPath,
            Math.max(0, vadResult.startMs - 80),
            vadResult.endMs + 120
          );
          console.log('[Transcribe][VAD] trimming to', vadResult.startMs, vadResult.endMs);
          sttWavPath = trimmedPath;
        } catch (err) {
          console.warn('[Transcribe][VAD] trim failed, using full audio', err?.message);
          sttWavPath = wavPath;
        }
      } else {
        sttWavPath = wavPath;
      }
    }

    if (TRANSCRIPTION_BACKEND === 'openai') {
      if (sttWavPath) {
        const sttBuffer = await fsPromises.readFile(sttWavPath);
        text = await speechToText(sttBuffer, 'wav', sttOptions);
      } else {
        const { buffer: compatBuffer, format } = await ensureCompatibleFormat(audioBuffer);
        console.log('[Transcribe] Converted to format:', format, 'length:', compatBuffer.length);
        text = await speechToText(compatBuffer, format, sttOptions);
      }
    } else {
      if (!sttWavPath) {
        wavPath = await prepareWavForLocalTranscribe(audioBuffer);
        sttWavPath = wavPath;
      }
      text = await transcribeWithFasterWhisper(sttWavPath, sttOptions);
    }
    if (text == null || typeof text !== 'string') {
      throw new Error('Transcription returned invalid result');
    }

    res.json({ ok: true, text });
  } catch (err) {
    console.error('[Transcribe] Error:', err.message);
    if (err.stack) console.error('[Transcribe] Stack:', err.stack);
    let message = err.message || 'Transcription failed';
    const isQuota =
      message.includes('429') ||
      message.toLowerCase().includes('quota exceeded') ||
      message.toLowerCase().includes('current quota');
    if (isQuota) {
      message =
        'Transcription quota exceeded. Add billing to the API key account or use a different key.';
    }
    const isConfigError =
      message.includes('not configured') ||
      message.includes('AI_INTEGRATIONS_OPENAI_API_KEY') ||
      message.includes('OPENAI_API_KEY');
    const status = isConfigError || isQuota ? 503 : 500;
    res.status(status).json({ ok: false, error: 'Transcription failed', message });
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    if (wavPath && fs.existsSync(wavPath)) {
      fs.unlinkSync(wavPath);
    }
    if (trimmedPath && trimmedPath !== wavPath && fs.existsSync(trimmedPath)) {
      fs.unlinkSync(trimmedPath);
    }
  }
}

router.post('/', upload.single('audio'), handleTranscribeRequest);

export default router;
