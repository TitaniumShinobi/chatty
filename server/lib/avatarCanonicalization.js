import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function extensionFromMimeType(mimeType = '') {
  const normalized = String(mimeType || '').trim().toLowerCase();
  const mapping = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };
  return mapping[normalized] || 'img';
}

async function convertWithSharp(buffer) {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default || sharpModule;
  return sharp(buffer).rotate().png().toBuffer();
}

async function convertWithSips(buffer, mimeType = 'image/jpeg') {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chatty-avatar-'));
  const inputPath = path.join(tmpDir, `input.${extensionFromMimeType(mimeType)}`);
  const outputPath = path.join(tmpDir, 'output.png');

  try {
    await fs.writeFile(inputPath, buffer);
    await execFileAsync('sips', ['-s', 'format', 'png', inputPath, '--out', outputPath]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function convertImageBufferToPng(buffer, mimeType = 'image/jpeg') {
  try {
    return await convertWithSharp(buffer);
  } catch {
    return convertWithSips(buffer, mimeType);
  }
}
