/**
 * Voice Lab 2.0: tmp staging, URL fetch, audit, save.
 * - POST /upload: multipart file or JSON { url } -> temp file, return tmpId
 * - GET /audit?id=tmpId -> quality metrics, pass/fail, hints
 * - POST /save: { constructId, tmpId } or { constructId, starterId } -> final WAV + voiceRefs
 *
 * User constructs: reference audio and voice instructions use canonical identity files:
 * - instances/{callsign}/identity/voice.wav (processed reference audio preview)
 * - instances/{callsign}/identity/voice.json (machine voice contract; instructions + TTS metadata)
 * Legacy spoken instructions may still exist in voice.md, but this route does not write it.
 * Local dev can still use resources/voices/ and OPENVOICE_REFERENCE_AUDIO_* env vars; VVAULT is the durable home.
 */

import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { buildVoiceContractJson } from '../lib/voiceContract.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const projectRoot = path.join(__dirname, '..', '..');
const VOICES_DIR = path.join(projectRoot, 'resources', 'voices');
const STARTERS_DIR = path.join(projectRoot, 'resources', 'voices', 'starters');
const TEMP_DIR = path.join(__dirname, '..', 'temp-voice-uploads');
const VOICE_REFS_PATH = path.join(projectRoot, 'config', 'voiceRefs.json');

/** Canonical callsign for VVAULT paths (e.g. nova-001, zen-001). */
function canonicalCallsign(constructId) {
  const s = String(constructId || '').trim();
  const match = s.match(/([a-z]+)-\d{3}/i);
  if (match) return `${match[1].toLowerCase()}-001`;
  const key = constructKey(constructId);
  if (['zen', 'lin', 'nova'].includes(key)) return `${key}-001`;
  return `${key}-001`;
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;  // 100 MB so long files can be uploaded and trimmed in-app
const MAX_URL_BYTES = 50 * 1024 * 1024;      // 50 MB for URL fetch (long files → trim in-app)
const URL_FETCH_TIMEOUT_MS = 120000; // 2 min for long files
const TEMP_AGE_MS = 24 * 60 * 60 * 1000;     // 24h purge

const AUDIT = {
  MIN_DURATION_SEC: 20,
  MAX_DURATION_SEC: 30,
  TARGET_RATE: 16000,
  RMS_MIN_DB: -26,
  RMS_MAX_DB: -18,
  NOISE_FLOOR_MAX_DB: -45,
  SNR_MIN_DB: 35,
};

const AUDIO_EXT = /\.(wav|mp3|m4a|ogg|webm)$/i;

function isAllowedVoiceUploadMime(mimetype, originalname) {
  const mime = String(mimetype || '').toLowerCase();
  if (mime.startsWith('audio/')) return true;
  // Browsers / OS often send WAV as octet-stream or omit type; extension is the real signal.
  if (mime === 'application/octet-stream' || mime === '' || mime === 'binary/octet-stream') {
    return AUDIO_EXT.test(originalname || '');
  }
  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const extOk = AUDIO_EXT.test(name);
    cb(null, extOk && isAllowedVoiceUploadMime(file.mimetype, file.originalname));
  },
});

function constructKey(constructId) {
  const s = String(constructId || '').trim();
  const base = s.replace(/-0*1$/, '') || s;
  return base.split('-')[0] || base;
}

function loadVoiceRefs() {
  try {
    const raw = fsSync.readFileSync(VOICE_REFS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveVoiceRefs(data) {
  fsSync.mkdirSync(path.dirname(VOICE_REFS_PATH), { recursive: true });
  fsSync.writeFileSync(VOICE_REFS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function ensureTempDir() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

function tempPath(tmpId) {
  const safe = path.basename(tmpId).replace(/[^a-zA-Z0-9._-]/g, '');
  return path.join(TEMP_DIR, safe || randomUUID());
}

function voicePreviewContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.webm') return 'audio/webm';
  return 'application/octet-stream';
}

async function purgeOldTemp() {
  try {
    const entries = await fs.readdir(TEMP_DIR, { withFileTypes: true });
    const now = Date.now();
    for (const e of entries) {
      if (!e.isFile()) continue;
      const p = path.join(TEMP_DIR, e.name);
      const stat = await fs.stat(p).catch(() => null);
      if (stat && now - stat.mtimeMs > TEMP_AGE_MS) await fs.unlink(p).catch(() => {});
    }
  } catch (_) {}
}

// Run on module load
ensureTempDir().then(() => purgeOldTemp()).catch(() => {});

function runFfprobe(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format', '-show_streams',
      filePath,
    ];
    const proc = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout?.on('data', (d) => { out += d; });
    proc.stderr?.on('data', (d) => { err += d; });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || 'ffprobe failed'));
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(e);
      }
    });
    proc.on('error', reject);
  });
}

function runFfmpegVolume(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', filePath,
      '-af', 'volumedetect',
      '-f', 'null', '-',
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    proc.stderr?.on('data', (d) => { err += d; });
    proc.on('close', (code) => {
      const meanMatch = err.match(/mean_volume:\s*([-\d.]+)\s*dB/);
      const maxMatch = err.match(/max_volume:\s*([-\d.]+)\s*dB/);
      resolve({
        meanDb: meanMatch ? parseFloat(meanMatch[1]) : null,
        maxDb: maxMatch ? parseFloat(maxMatch[1]) : null,
      });
    });
    proc.on('error', reject);
  });
}

async function runAudit(filePath) {
  const hints = [];
  let durationSec = 0;
  let channels = 0;
  let sampleRateHz = 0;
  let rmsDb = null;
  let clippingCount = 0;

  try {
    const probe = await runFfprobe(filePath);
    const stream = probe.streams?.find((s) => s.codec_type === 'audio') || probe.streams?.[0];
    const fmt = probe.format || {};
    durationSec = parseFloat(stream?.duration ?? fmt.duration ?? 0, 10) || 0;
    channels = parseInt(stream?.channels || stream?.channel_layout?.split('(')?.[0] || 1, 10) || 1;
    sampleRateHz = parseInt(stream?.sample_rate || 0, 10) || 0;

    if (durationSec < AUDIT.MIN_DURATION_SEC) hints.push(`Clip too short (${durationSec.toFixed(1)} s). Use 20–30 s.`);
    if (durationSec > AUDIT.MAX_DURATION_SEC) hints.push(`Clip too long (${durationSec.toFixed(1)} s). We'll trim to 30 s.`);
    if (channels !== 1) hints.push(`Not mono (${channels} ch). We'll convert to mono.`);
    if (sampleRateHz && sampleRateHz !== AUDIT.TARGET_RATE) hints.push(`Sample rate ${sampleRateHz} Hz. We'll convert to 16 kHz.`);

    const vol = await runFfmpegVolume(filePath).catch(() => ({}));
    rmsDb = vol.meanDb;
    if (rmsDb != null) {
      if (rmsDb < AUDIT.RMS_MIN_DB) hints.push(`Loudness ${rmsDb.toFixed(1)} dBFS (target −26 to −18).`);
      if (rmsDb > AUDIT.RMS_MAX_DB) hints.push(`Loudness ${rmsDb.toFixed(1)} dBFS (target −26 to −18).`);
    }
    if (vol.maxDb != null && vol.maxDb >= 0) {
      clippingCount = 1;
      hints.push('Clipping detected.');
    }

    const pass =
      durationSec >= AUDIT.MIN_DURATION_SEC &&
      durationSec <= AUDIT.MAX_DURATION_SEC + 5 &&
      (rmsDb == null || (rmsDb >= AUDIT.RMS_MIN_DB && rmsDb <= AUDIT.RMS_MAX_DB)) &&
      clippingCount === 0;

    return {
      durationSec: Math.round(durationSec * 10) / 10,
      channels,
      sampleRateHz,
      rmsDb: rmsDb != null ? Math.round(rmsDb * 10) / 10 : null,
      noiseFloorDb: null,
      snrDb: null,
      clippingCount,
      pass,
      hints,
    };
  } catch (err) {
    return {
      durationSec: 0,
      channels: 0,
      sampleRateHz: 0,
      rmsDb: null,
      noiseFloorDb: null,
      snrDb: null,
      clippingCount: 0,
      pass: false,
      hints: ['Could not analyze file. ' + (err.message || '')],
    };
  }
}

function normalizeWithFfmpeg(srcPath, destPath, maxDurationSec = 30) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', srcPath,
      '-t', String(maxDurationSec),
      '-ac', '1', '-ar', String(AUDIT.TARGET_RATE),
      '-af', 'dynaudnorm',
      destPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    proc.stderr?.on('data', (d) => { err += d; });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.slice(-500)));
      resolve();
    });
    proc.on('error', reject);
  });
}

const TRIM_DURATION_SEC = 25;

/** Trim a segment from srcPath to destPath: start at startSec, duration durationSec (20-30), mono 16 kHz. */
function trimWithFfmpeg(srcPath, destPath, startSec, durationSec = TRIM_DURATION_SEC) {
  const dur = Math.min(30, Math.max(20, Number(durationSec) || TRIM_DURATION_SEC));
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', srcPath,
      '-ss', String(startSec),
      '-t', String(dur),
      '-ac', '1', '-ar', String(AUDIT.TARGET_RATE),
      destPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    proc.stderr?.on('data', (d) => { err += d; });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.slice(-500)));
      resolve();
    });
    proc.on('error', reject);
  });
}

// POST /upload — multipart file or JSON { url } (app-level express.json() parses JSON)
router.post('/upload', (req, res, next) => {
  if (req.is('application/json')) return next();
  upload.single('voice')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)`
        : (err.message || 'Upload rejected');
      return res.status(400).json({ ok: false, error: msg });
    }
    next();
  });
}, async (req, res) => {
  try {
    await ensureTempDir();
    let tmpId;
    let ext = '.wav';

    if (req.body && typeof req.body.url === 'string') {
      const url = req.body.url.trim();
      if (!url.startsWith('https://')) {
        return res.status(400).json({ ok: false, error: 'Only HTTPS URLs allowed' });
      }
      tmpId = randomUUID();
      const tmpPath = path.join(TEMP_DIR, tmpId + '.mp3');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        return res.status(400).json({ ok: false, error: `URL returned ${response.status}` });
      }
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_URL_BYTES) {
        return res.status(400).json({ ok: false, error: `URL content too large (max ${MAX_URL_BYTES / (1024 * 1024)} MB)` });
      }
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length > MAX_URL_BYTES) {
        return res.status(400).json({ ok: false, error: `URL content too large (max ${MAX_URL_BYTES / (1024 * 1024)} MB)` });
      }
      await fs.writeFile(tmpPath, buf);
      tmpId = tmpId + '.mp3';
      return res.status(200).json({ ok: true, tmpId });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        ok: false,
        error: 'No voice file received. Use WAV, MP3, M4A, OGG, or WebM. Stay signed in; the form field must be named "voice".',
      });
    }
    ext = path.extname(req.file.originalname || '.wav').toLowerCase() || '.wav';
    if (!/\.(wav|mp3|m4a|ogg|webm)$/.test(ext)) ext = '.wav';
    tmpId = randomUUID() + ext;
    const tmpPath = path.join(TEMP_DIR, tmpId);
    await fs.writeFile(tmpPath, req.file.buffer);
    return res.status(200).json({ ok: true, tmpId });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(400).json({ ok: false, error: 'URL fetch timed out' });
    }
    console.error('[VoiceUpload] upload error', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /trim — { tmpId, startSec, durationSec? } → trim 20-30 s from startSec, return new tmpId
router.post('/trim', express.json(), async (req, res) => {
  const { tmpId, startSec, durationSec } = req.body || {};
  if (!tmpId || typeof tmpId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing tmpId' });
  }
  const start = parseFloat(startSec);
  if (Number.isNaN(start) || start < 0) {
    return res.status(400).json({ ok: false, error: 'Invalid startSec (use 0 or positive seconds)' });
  }
  const duration = durationSec != null ? Math.min(30, Math.max(20, parseFloat(durationSec) || TRIM_DURATION_SEC)) : TRIM_DURATION_SEC;
  const srcPath = tempPath(tmpId);
  try {
    await fs.access(srcPath);
  } catch {
    return res.status(404).json({ ok: false, error: 'Temp file not found or expired' });
  }
  const newTmpId = randomUUID() + '.wav';
  const destPath = path.join(TEMP_DIR, newTmpId);
  try {
    await trimWithFfmpeg(srcPath, destPath, start, duration);
    return res.status(200).json({ ok: true, tmpId: newTmpId });
  } catch (err) {
    console.error('[VoiceUpload] trim error', err.message);
    return res.status(500).json({ ok: false, error: err.message || 'Trim failed' });
  }
});

// GET /preview?id=tmpId — stream staged temp audio for in-browser clip selection
router.get('/preview', async (req, res) => {
  const tmpId = req.query?.id;
  if (!tmpId || typeof tmpId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing id' });
  }
  const filePath = tempPath(tmpId);
  try {
    await fs.access(filePath);
  } catch {
    return res.status(404).json({ ok: false, error: 'Temp file not found or expired' });
  }
  res.setHeader('Content-Type', voicePreviewContentType(filePath));
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(filePath);
});

// GET /audit?id=tmpId
router.get('/audit', async (req, res) => {
  const tmpId = req.query?.id;
  if (!tmpId || typeof tmpId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing id' });
  }
  const filePath = tempPath(tmpId);
  try {
    await fs.access(filePath);
  } catch {
    return res.status(404).json({ ok: false, error: 'Temp file not found or expired' });
  }
  try {
    const result = await runAudit(filePath);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[VoiceUpload] audit error', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /save — { constructId, tmpId } or { constructId, starterId }
router.post('/save', express.json(), async (req, res) => {
  const { constructId, tmpId, starterId } = req.body || {};
  if (!constructId) {
    return res.status(400).json({ ok: false, error: 'Missing constructId' });
  }
  const key = constructKey(constructId);
  const refPath = `resources/voices/${key}_ref.wav`;
  const destPath = path.join(projectRoot, refPath);

  try {
    await fs.mkdir(VOICES_DIR, { recursive: true });

    if (starterId && ['starter_bright', 'starter_warm', 'starter_neutral'].includes(starterId)) {
      const src = path.join(STARTERS_DIR, `${starterId}.wav`);
      try {
        await fs.access(src);
      } catch {
        return res.status(404).json({ ok: false, error: 'Starter voice not found' });
      }
      await fs.copyFile(src, destPath);
    } else if (tmpId) {
      const srcPath = tempPath(tmpId);
      try {
        await fs.access(srcPath);
      } catch {
        return res.status(404).json({ ok: false, error: 'Temp file not found or expired' });
      }
      await normalizeWithFfmpeg(srcPath, destPath, AUDIT.MAX_DURATION_SEC);
      await fs.unlink(srcPath).catch(() => {});
    } else {
      return res.status(400).json({ ok: false, error: 'Provide tmpId or starterId' });
    }

    const refs = loadVoiceRefs();
    refs[key] = { refPath };
    saveVoiceRefs(refs);
    console.log('[VoiceUpload] saved', refPath, 'for construct', key);

    // VVAULT: store reference audio and voice.json for user constructs (survives restarts, tied to callsign)
    const callsign = canonicalCallsign(constructId);
    try {
      const { getSupabaseClient } = await import('../lib/supabaseClient.js');
      const supabase = getSupabaseClient();
      if (supabase && req.user?.email) {
        let supabaseUserId = null;
        const { data: byEmail } = await supabase.from('users').select('id').eq('email', req.user.email).limit(1).maybeSingle();
        if (byEmail?.id) supabaseUserId = byEmail.id;
        if (!supabaseUserId && req.user?.id) {
          const { data: byName } = await supabase.from('users').select('id').ilike('name', `%${String(req.user.id).split('_')[0]}%`).limit(1).maybeSingle();
          if (byName?.id) supabaseUserId = byName.id;
        }
        if (supabaseUserId) {
          const wavBuffer = await fs.readFile(destPath);
          const voiceVaultPath = `instances/${callsign}/identity/voice.wav`;
          const storagePath = `identity/${supabaseUserId}/${voiceVaultPath}`;
          const { error: uploadErr } = await supabase.storage
            .from('vault-files')
            .upload(storagePath, wavBuffer, { contentType: 'audio/wav', upsert: true });
          if (uploadErr) {
            console.warn('[VoiceUpload] VVAULT storage upload failed:', uploadErr.message);
          } else {
            const contentPlaceholder = `[binary:audio/wav:${wavBuffer.length}]`;
            const { data: existing } = await supabase.from('vault_files').select('id').eq('filename', voiceVaultPath).eq('construct_id', callsign).eq('user_id', supabaseUserId).maybeSingle();
            if (existing) {
              await supabase.from('vault_files').update({ content: contentPlaceholder, storage_path: storagePath, file_type: 'identity' }).eq('id', existing.id);
            } else {
              await supabase.from('vault_files').insert({
                user_id: supabaseUserId,
                construct_id: callsign,
                filename: voiceVaultPath,
                content: contentPlaceholder,
                storage_path: storagePath,
                file_type: 'identity',
              });
            }
            const voiceJsonPath = `instances/${callsign}/identity/voice.json`;
            const { data: existingJson } = await supabase.from('vault_files').select('id, content').eq('filename', voiceJsonPath).eq('construct_id', callsign).maybeSingle();
            const voiceJsonContent = buildVoiceContractJson({
              existing: existingJson?.content,
              ref: 'voice.wav',
              voiceId: 'openvoice',
              source: 'voice_lab',
            });
            if (existingJson) {
              await supabase.from('vault_files').update({ content: voiceJsonContent, file_type: 'identity' }).eq('id', existingJson.id);
            } else {
              await supabase.from('vault_files').insert({
                user_id: supabaseUserId,
                construct_id: callsign,
                filename: voiceJsonPath,
                content: voiceJsonContent,
                file_type: 'identity',
              });
            }
            console.log('[VoiceUpload] VVAULT saved', voiceVaultPath, 'and', voiceJsonPath, 'for', callsign);
          }
        }
      }
    } catch (vvErr) {
      console.warn('[VoiceUpload] VVAULT save failed (local ref still saved):', vvErr?.message);
    }

    return res.json({ ok: true, refPath });
  } catch (err) {
    console.error('[VoiceUpload] save error', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /help — return voice lab help markdown for in-UI drawer
const HELP_PATH = path.join(projectRoot, 'docs', 'voice-lab-help.md');
router.get('/help', async (_req, res) => {
  try {
    const raw = await fs.readFile(HELP_PATH, 'utf8');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(raw);
  } catch {
    res.status(404).send('Help not found');
  }
});

export default router;
