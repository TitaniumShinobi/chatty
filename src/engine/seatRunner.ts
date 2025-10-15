import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

export type Seat = 'smalltalk' | 'coding' | 'creative' | string;

type SeatInfo = { tag: string; role?: string } | string;
interface SeatConfig {
  [seat: string]: SeatInfo;
}

let cachedConfig: SeatConfig | undefined;

function loadSeatConfig(): SeatConfig {
  if (cachedConfig) return cachedConfig;
  const cfgPath = path.resolve(process.cwd(), 'models.json');
  try {
    const raw = fs.readFileSync(cfgPath, 'utf-8');
    cachedConfig = JSON.parse(raw);
  } catch (_) {}
  if (!cachedConfig) {
    cachedConfig = {
      smalltalk: 'phi3:latest',
      coding: 'deepseek-coder-v2',
      creative: 'mistral:instruct',
    };
  }
  return cachedConfig;
}

function envOverrideForSeat(seat: Seat): string | undefined {
  // e.g., OLLAMA_MODEL_CODING overrides coding seat
  const key = `OLLAMA_MODEL_${seat.toUpperCase()}`;
  return process.env[key];
}

function seatInfo(seat: Seat): SeatInfo | undefined {
  const cfg = loadSeatConfig();
  return cfg[seat];
}

function resolveModel(seat: Seat, explicit?: string): string {
  if (explicit) return explicit;
  const envSeat = envOverrideForSeat(seat);
  if (envSeat) return envSeat;
  const info = seatInfo(seat);
  if (!info) return 'phi3:latest';
  return typeof info === 'string' ? info : info.tag;
}

export function getSeatRole(seat: Seat): string | undefined {
  const info = seatInfo(seat);
  return typeof info === 'string' ? undefined : info?.role;
}

interface GenerateOptions {
  seat: Seat;
  prompt: string;
  modelOverride?: string;
  host?: string; // http://localhost
  port?: number; // 11434
}

export async function runSeat(opts: GenerateOptions): Promise<string> {
  const host = (opts.host ?? process.env.OLLAMA_HOST ?? 'http://localhost').replace(/\/$/, '');
  const port = (opts.port ?? Number(process.env.OLLAMA_PORT)) ?? 11434;
  const model = resolveModel(opts.seat, opts.modelOverride);

  // quick availability check via /api/tags
  const tagsURL = `${host}:${port}/api/tags`;
  try {
    const tagsJson = await fetchJSON(tagsURL);
    if (Array.isArray(tagsJson.models)) {
      const found = tagsJson.models.some((m: any) => m.name?.startsWith(model.split(":")[0]));
      if (!found) throw new Error(`ModelNotAvailable:${model}`);
    }
  } catch (_) {
    // if check fails we proceed; generation may still work
  }

  const url = `${host}:${port}/api/generate`;
  const { protocol } = new URL(url);
  const body = JSON.stringify({ model, prompt: opts.prompt, stream: false });

  return new Promise<string>((resolve, reject) => {
    const requester = protocol === 'https:' ? https.request : http.request;
    const req = requester(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Ollama error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response ?? '');
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// simple helper using native http/https
async function fetchJSON(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const { protocol } = new URL(urlStr);
    const requester = protocol === 'https:' ? https.request : http.request;
    const req = requester(urlStr, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export { loadSeatConfig };
