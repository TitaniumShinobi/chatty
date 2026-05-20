import express from 'express';
import fetch from 'node-fetch';
import stream from 'stream';
import process from 'node:process';
import fs from 'fs';
import path from 'path';

const VOICE_REFS_PATH = path.join(process.cwd(), 'config', 'voiceRefs.json');

/** Normalize construct identifiers to the key stored in voiceRefs (e.g. "nova-001" -> "nova"). */
function constructKey(constructId) {
  const s = String(constructId || '').trim();
  const base = s.replace(/-0*1$/, '') || s; // strip trailing -001 while keeping other numeric suffixes
  return base.split('-')[0] || base;
}

/** Canonical callsign for VVAULT paths (e.g. nova-001, zen-001). */
function canonicalCallsign(constructId) {
  const s = String(constructId || '').trim();
  const match = s.match(/([a-z]+)-\d{3}/i);
  if (match) return `${match[1].toLowerCase()}-001`;
  const key = constructKey(constructId);
  return `${key}-001`;
}

function loadVoiceRefs() {
  try {
    const raw = fs.readFileSync(VOICE_REFS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const router = express.Router();
const OPENVOICE_GRADIO_STYLES = new Set([
  'default',
  'whispering',
  'cheerful',
  'terrified',
  'angry',
  'sad',
  'friendly',
]);

function normalizeProvider(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveProvider(bodyProvider) {
  const requested = normalizeProvider(bodyProvider);
  if (requested) return requested;
  return normalizeProvider(process.env.TTS_PROVIDER) || 'openvoice';
}

function normalizeOpenVoiceMode(value) {
  const normalized = String(value || 'auto').trim().toLowerCase();
  if (normalized === 'direct' || normalized === 'gradio' || normalized === 'auto') {
    return normalized;
  }
  return 'auto';
}

function setAudioHeaders(res, contentType = 'audio/mpeg') {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
}

function buildOpenVoiceHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

function extractBase64Audio(payload) {
  return payload?.audio_base64 || payload?.audio || payload?.data?.audio_base64 || null;
}

function extractGradioAudioPath(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const fromData = Array.isArray(payload.data) ? payload.data[1] : null;
  if (typeof fromData === 'string') return fromData;
  if (fromData && typeof fromData === 'object' && typeof fromData.name === 'string') return fromData.name;
  if (typeof payload.audio_path === 'string') return payload.audio_path;
  if (payload.audio && typeof payload.audio === 'object' && typeof payload.audio.name === 'string') {
    return payload.audio.name;
  }
  return null;
}

function buildGradioFileUrl(baseUrl, filePath) {
  const trimmed = String(baseUrl).replace(/\/+$/, '');
  const path = String(filePath || '').trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (/^\/?file=/.test(path)) return `${trimmed}/${path.replace(/^\//, '')}`;
  return `${trimmed}/file=${encodeURI(path)}`;
}

async function relayRawAudio(providerResponse, res, fallbackType = 'audio/wav') {
  setAudioHeaders(res, providerResponse.headers.get('content-type') || fallbackType);
  const passthrough = new stream.PassThrough();
  providerResponse.body.pipe(passthrough).pipe(res);
  return { ok: true };
}

async function relayOpenVoiceResponse(providerResponse, res, { baseUrl, apiKey, fallbackType }) {
  const contentType = providerResponse.headers.get('content-type') || '';
  const isJson =
    contentType.includes('application/json') ||
    contentType.includes('text/json') ||
    contentType.includes('+json');

  if (!isJson) {
    return relayRawAudio(providerResponse, res, fallbackType || 'audio/wav');
  }

  const payload = await providerResponse.json().catch(() => null);
  if (!payload) {
    return { ok: false, error: 'OpenVoice returned invalid JSON payload' };
  }

  const base64 = extractBase64Audio(payload);
  if (base64) {
    const mimeType = payload?.mime_type || payload?.content_type || 'audio/wav';
    const audioBuffer = Buffer.from(String(base64), 'base64');
    setAudioHeaders(res, mimeType);
    res.send(audioBuffer);
    return { ok: true };
  }

  const gradioAudioPath = extractGradioAudioPath(payload);
  if (!gradioAudioPath) {
    return { ok: false, error: 'OpenVoice returned JSON without audio payload' };
  }

  const fileUrl = buildGradioFileUrl(baseUrl, gradioAudioPath);
  if (!fileUrl) {
    return { ok: false, error: 'OpenVoice returned an invalid Gradio audio path' };
  }

  const fileResponse = await fetch(fileUrl, {
    method: 'GET',
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!fileResponse.ok) {
    const body = await fileResponse.text().catch(() => '');
    return {
      ok: false,
      error: `OpenVoice Gradio audio fetch failed (${fileResponse.status})`,
      body,
    };
  }
  return relayRawAudio(fileResponse, res, 'audio/wav');
}

function resolveOpenVoiceStyle(style, voiceId) {
  const requestedStyle = normalizeProvider(style);
  if (OPENVOICE_GRADIO_STYLES.has(requestedStyle)) return requestedStyle;

  const configuredStyle = normalizeProvider(process.env.OPENVOICE_STYLE || process.env.OPENVOICE_GRADIO_STYLE);
  if (OPENVOICE_GRADIO_STYLES.has(configuredStyle)) return configuredStyle;

  const voiceAsStyle = normalizeProvider(voiceId);
  if (OPENVOICE_GRADIO_STYLES.has(voiceAsStyle)) return voiceAsStyle;

  return 'default';
}

function parseOpenVoiceFnIndex() {
  const raw = process.env.OPENVOICE_GRADIO_FN_INDEX || '1';
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 1;
}

/** Derive construct key from thread id (or embedded construct id). Supports any construct, not just zen/lin/nova. */
function constructFromThreadId(threadId) {
  const id = String(threadId || '').trim();
  if (!id) return null;
  const m = id.match(/^([a-z0-9-]+?)_/i); // e.g. nova-001_chat_with_devon -> nova-001
  const constructId = m ? m[1] : id;
  return constructKey(constructId);
}

/** Derive canonical callsign from threadId for VVAULT (e.g. nova-001, zen-001). */
function getCallsignFromThreadId(threadId) {
  const id = String(threadId || '').trim();
  const m = id.match(/^([a-z0-9-]+?)_/i);
  if (m) return m[1].toLowerCase();
  const m2 = id.match(/^([a-z]+-\d{3})/i);
  return m2 ? m2[1].toLowerCase() : null;
}

function getOpenVoiceReferencePathByConstruct(construct) {
  const key = constructKey(construct);
  const voiceRefs = loadVoiceRefs();
  const mapped = voiceRefs?.[key]?.refPath;
  if (mapped) return mapped;

  if (key === 'zen') {
    return process.env.OPENVOICE_REFERENCE_AUDIO_ZEN || process.env.OPENVOICE_REFERENCE_AUDIO || 'resources/demo_speaker2.mp3';
  }
  if (key === 'lin') {
    return process.env.OPENVOICE_REFERENCE_AUDIO_LIN || process.env.OPENVOICE_REFERENCE_AUDIO || 'resources/demo_speaker2.mp3';
  }
  if (key === 'nova') {
    return process.env.OPENVOICE_REFERENCE_AUDIO_NOVA || process.env.OPENVOICE_REFERENCE_AUDIO || 'resources/demo_speaker2.mp3';
  }
  return process.env.OPENVOICE_REFERENCE_AUDIO || process.env.OPENVOICE_GRADIO_REFERENCE_AUDIO || 'resources/demo_speaker2.mp3';
}

/** Map voice.json `ref` to vault_files logical path under identity/. */
function refToVaultAudioPath(callsign, ref) {
  if (!ref || typeof ref !== 'string') return null;
  if (ref === 'voice.wav' || ref.endsWith('/voice.wav')) {
    return `instances/${callsign}/identity/voice.wav`;
  }
  if (ref.startsWith('voice/')) {
    return `instances/${callsign}/identity/${ref}`;
  }
  return `instances/${callsign}/identity/voice/${ref}`;
}

/**
 * Resolve reference audio path: VVAULT identity/voice.wav first, then voice.json + ref (legacy voice/ref.wav), then env/local.
 * Returns a local file path for Gradio. Caches VVAULT downloads under resources/voices/.cache/
 */
async function resolveReferenceAudio(threadId, construct) {
  const callsign = getCallsignFromThreadId(threadId);
  if (!callsign) return getOpenVoiceReferencePathByConstruct(construct);

  try {
    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    const supabase = getSupabaseClient();
    if (!supabase) return getOpenVoiceReferencePathByConstruct(construct);

    const fs = await import('fs/promises');
    const cacheDir = path.join(process.cwd(), 'resources', 'voices', '.cache');
    await fs.mkdir(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, `${callsign.replace(/-/g, '_')}_ref.wav`);

    const tryDownload = async (refVaultPath) => {
      const { data: refRow, error: refErr } = await supabase
        .from('vault_files')
        .select('storage_path')
        .eq('construct_id', callsign)
        .eq('filename', refVaultPath)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (refErr || !refRow?.storage_path) return null;
      const { data: blob, error: dlErr } = await supabase.storage.from('vault-files').download(refRow.storage_path);
      if (dlErr || !blob) return null;
      const buf = Buffer.from(await blob.arrayBuffer());
      await fs.writeFile(cachePath, buf);
      return cachePath;
    };

    const canonicalWav = `instances/${callsign}/identity/voice.wav`;
    const direct = await tryDownload(canonicalWav);
    if (direct) return direct;

    const voiceJsonPath = `instances/${callsign}/identity/voice.json`;
    const { data: voiceRow, error: voiceErr } = await supabase
      .from('vault_files')
      .select('content')
      .eq('construct_id', callsign)
      .eq('filename', voiceJsonPath)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (voiceErr || !voiceRow?.content) return getOpenVoiceReferencePathByConstruct(construct);

    let meta;
    try {
      meta = typeof voiceRow.content === 'string' ? JSON.parse(voiceRow.content) : voiceRow.content;
    } catch {
      return getOpenVoiceReferencePathByConstruct(construct);
    }
    const ref = meta?.ref;
    const refVaultPath = refToVaultAudioPath(callsign, ref);
    if (!refVaultPath) return getOpenVoiceReferencePathByConstruct(construct);

    const viaJson = await tryDownload(refVaultPath);
    if (viaJson) return viaJson;
    return getOpenVoiceReferencePathByConstruct(construct);
  } catch (e) {
    return getOpenVoiceReferencePathByConstruct(construct);
  }
}

async function proxyOpenVoiceViaGradio({ text, style, voiceId, construct, threadId }, { baseUrl, apiKey }, res) {
  const endpointPath = process.env.OPENVOICE_GRADIO_PREDICT_PATH || '/api/predict';
  const endpoint = `${String(baseUrl).replace(/\/+$/, '')}${endpointPath.startsWith('/') ? '' : '/'}${endpointPath}`;
  const referenceAudio = await resolveReferenceAudio(threadId, construct);
  console.log('[TTS][OpenVoice][Gradio] construct=%s referenceAudio=%s voiceId=%s style=%s', construct, referenceAudio, voiceId, style);
  const agree = String(process.env.OPENVOICE_GRADIO_AGREE || 'true').trim().toLowerCase() !== 'false';

  const payload = {
    fn_index: parseOpenVoiceFnIndex(),
    data: [
      text,
      resolveOpenVoiceStyle(style, voiceId),
      {
        name: referenceAudio,
        data: null,
        is_file: true,
      },
      agree,
    ],
  };

  const providerResponse = await fetch(endpoint, {
    method: 'POST',
    headers: buildOpenVoiceHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!providerResponse.ok) {
    const body = await providerResponse.text().catch(() => '');
    return {
      ok: false,
      status: providerResponse.status,
      error: 'OpenVoice Gradio predict failed',
      body,
    };
  }

  return relayOpenVoiceResponse(providerResponse, res, {
    baseUrl,
    apiKey,
    fallbackType: 'audio/wav',
  });
}

async function proxyOpenVoice({ text, style, voiceId, language, threadId, speechProfile }, res) {
  // speechProfile is metadata only; not sent to OpenVoice until backend supports it. Optionally log: speechProfile.
  const construct = constructFromThreadId(threadId);
  const baseUrl = process.env.OPENVOICE_BASE_URL || process.env.OPENVOICE_URL;
  if (!baseUrl) {
    return res.status(503).json({
      ok: false,
      error: 'OpenVoice is selected but OPENVOICE_BASE_URL/OPENVOICE_URL is not configured',
    });
  }

  const mode = normalizeOpenVoiceMode(process.env.OPENVOICE_API_MODE);
  const endpointPath = process.env.OPENVOICE_TTS_PATH || '/tts';
  const endpoint = `${String(baseUrl).replace(/\/+$/, '')}${endpointPath.startsWith('/') ? '' : '/'}${endpointPath}`;
  const apiKey = process.env.OPENVOICE_API_KEY;

  const openVoicePayload = {
    text,
    voice: voiceId,
    speaker: voiceId,
    style: resolveOpenVoiceStyle(style, voiceId),
    language: language || 'en',
  };

  let directFailure = null;

  if (mode !== 'gradio') {
    const providerResponse = await fetch(endpoint, {
      method: 'POST',
      headers: buildOpenVoiceHeaders(apiKey),
      body: JSON.stringify(openVoicePayload),
    });

    if (providerResponse.ok) {
      const relayed = await relayOpenVoiceResponse(providerResponse, res, {
        baseUrl,
        apiKey,
        fallbackType: 'audio/wav',
      });
      if (relayed.ok) return undefined;
      directFailure = {
        error: relayed.error || 'OpenVoice direct response could not be converted to audio',
        body: relayed.body || '',
      };
    } else {
      const body = await providerResponse.text().catch(() => '');
      directFailure = {
        error: `OpenVoice provider failed (${providerResponse.status})`,
        status: providerResponse.status,
        body,
      };
    }

    if (directFailure) {
      console.error('[TTS][OpenVoice][direct]', directFailure.error, String(directFailure.body || '').slice(0, 200));
      if (mode === 'direct') {
        return res.status(502).json({
          ok: false,
          mode,
          ...directFailure,
        });
      }
    }
  }

  const gradioResult = await proxyOpenVoiceViaGradio({ text, style, voiceId, construct, threadId }, { baseUrl, apiKey }, res);
  if (gradioResult.ok) return undefined;

  console.error(
    '[TTS][OpenVoice][gradio]',
    gradioResult.error,
    String(gradioResult.body || '').slice(0, 200),
  );

  return res.status(502).json({
    ok: false,
    mode,
    error: gradioResult.error || 'OpenVoice Gradio fallback failed',
    status: gradioResult.status,
    directFailure,
  });
}

async function proxyElevenLabs({ text, voiceId }, res) {
  const elevenKey = process.env.ELEVENLABS_API_KEY || process.env.PREMIUM_TTS_KEY;
  if (!elevenKey) {
    return res.status(503).json({ ok: false, error: 'No ElevenLabs key configured on server' });
  }

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`;
  const providerResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': elevenKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!providerResponse.ok) {
    const body = await providerResponse.text().catch(() => '');
    console.error('[TTS][ElevenLabs] provider error', providerResponse.status, body.slice(0, 200));
    return res.status(502).json({
      ok: false,
      error: 'ElevenLabs provider failed',
      status: providerResponse.status,
    });
  }

  setAudioHeaders(res, providerResponse.headers.get('content-type') || 'audio/mpeg');
  const passthrough = new stream.PassThrough();
  providerResponse.body.pipe(passthrough).pipe(res);
  return undefined;
}

// GET /api/tts?sample=true&constructId=nova-001 — stream a short sample with the construct's voice (Voice Lab preview)
router.get('/', async (req, res) => {
  if (req.query?.sample !== 'true' || !req.query?.constructId) {
    return res.status(400).json({ ok: false, error: 'Use sample=true and constructId for sample playback' });
  }
  const constructId = String(req.query.constructId).trim();
  const threadId = `${canonicalCallsign(constructId)}_chat_with_preview`;
  const text = 'Hello! This is my new voice.';
  try {
    await proxyOpenVoice({ text, style: 'default', voiceId: 'default', language: 'en', threadId }, res);
  } catch (err) {
    console.error('[TTS] sample error', err.message);
    if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/tts
// Body: { text, voice?, style?, speechProfile?, provider?, language?, threadId? }
// threadId -> construct -> reference audio. style -> OpenVoice. speechProfile is metadata only (not applied to synthesis yet).
router.post('/', async (req, res) => {
  // requireAuth is applied by server mounting to limit abuse
  const { text, voice, style, speechProfile, provider: bodyProvider, language, threadId } = req.body || {};
  if (!text || typeof text !== 'string') return res.status(400).json({ ok: false, error: 'Missing text' });

  if (speechProfile != null && typeof speechProfile === 'string') {
    // Carry through as context only; backend does not use it for synthesis yet.
    req.ttsSpeechProfile = speechProfile;
  }

  const provider = resolveProvider(bodyProvider);
  const voiceId = voice || process.env.TTS_VOICE_ID || 'nova';
  try {
    if (provider === 'openvoice') {
      const construct = constructFromThreadId(threadId);
      const referencePath = getOpenVoiceReferencePathByConstruct(construct);
      console.log('[TTS][OpenVoice][debug] env', {
        OPENVOICE_REFERENCE_AUDIO: process.env.OPENVOICE_REFERENCE_AUDIO || '(unset)',
        OPENVOICE_REFERENCE_AUDIO_ZEN: process.env.OPENVOICE_REFERENCE_AUDIO_ZEN || '(unset)',
        OPENVOICE_REFERENCE_AUDIO_LIN: process.env.OPENVOICE_REFERENCE_AUDIO_LIN || '(unset)',
        OPENVOICE_REFERENCE_AUDIO_NOVA: process.env.OPENVOICE_REFERENCE_AUDIO_NOVA || '(unset)',
      });
      console.log('[TTS][OpenVoice][debug] request', { threadId, voice: voiceId, style, construct, referencePath });
      return await proxyOpenVoice({ text, style, voiceId, language, threadId, speechProfile }, res);
    }
    if (provider === 'elevenlabs') {
      return await proxyElevenLabs({ text, voiceId }, res);
    }

    return res.status(400).json({
      ok: false,
      error: `Unsupported TTS provider "${provider}"`,
      supportedProviders: ['openvoice', 'elevenlabs'],
    });
  } catch (err) {
    console.error('[TTS] Error', err && err.message ? err.message : err);
    res.status(500).json({ ok: false, error: err.message || 'TTS error' });
  }
});

export default router;
