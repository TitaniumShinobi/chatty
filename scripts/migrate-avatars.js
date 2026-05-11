#!/usr/bin/env node
// Normalize avatars to identity/avatar.png and move misplaced capsules out of identity/

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let sharp = null;
try {
  // Lazy-load sharp if available
  sharp = await import('sharp');
} catch (err) {
  console.error('sharp is required for migration. Install it and rerun.');
  process.exit(1);
}

const ROOT = process.cwd();
const VVAULT = path.join(ROOT, 'vvault');
const SHARD = 'shard_0000';

const identityRoots = [
  path.join(VVAULT, 'intelligences', SHARD),
  path.join(VVAULT, 'users', SHARD),
];

function hash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function normalizeAvatar(identityDir, constructId) {
  const entries = await fs.promises.readdir(identityDir, { withFileTypes: true }).catch(() => []);
  const avatarFiles = entries
    .filter(e => e.isFile() && e.name.startsWith('avatar.'))
    .map(e => e.name);

  const target = path.join(identityDir, 'avatar.png');
  let targetBuf = null;

  // If avatar.png exists, load it for hash compare
  try {
    targetBuf = await fs.promises.readFile(target);
  } catch {}

  // Pick a source to normalize (prefer existing avatar.png; else first other avatar.*)
  let sourceName = avatarFiles.includes('avatar.png') ? 'avatar.png' : avatarFiles.find(n => n !== 'avatar.png');
  if (!sourceName) return; // nothing to do

  const sourcePath = path.join(identityDir, sourceName);
  let buf = await fs.promises.readFile(sourcePath);

  // Normalize to PNG 512x512 cover
  buf = await sharp.default(buf).rotate().resize(512, 512, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();

  if (targetBuf && hash(targetBuf) === hash(buf)) {
    // Already normalized; just remove extras
  } else {
    await fs.promises.mkdir(identityDir, { recursive: true });
    await fs.promises.writeFile(target, buf);
    console.log(`✅ wrote ${target}`);
  }

  // Remove non-png avatar variants
  for (const name of avatarFiles) {
    if (name !== 'avatar.png') {
      await fs.promises.unlink(path.join(identityDir, name)).catch(() => {});
    }
  }
}

async function moveCapsules(identityDir, constructId) {
  const entries = await fs.promises.readdir(identityDir, { withFileTypes: true }).catch(() => []);
  const capsules = entries.filter(e => e.isFile() && e.name.endsWith('.capsule'));
  if (!capsules.length) return;

  // Determine memup target (sibling of identity within construct folder)
  const memupDir = path.join(identityDir, '..', 'memup');
  await fs.promises.mkdir(memupDir, { recursive: true });

  for (const cap of capsules) {
    const src = path.join(identityDir, cap.name);
    const dst = path.join(memupDir, `${constructId}.capsule`);
    await fs.promises.rename(src, dst).catch(async () => {
      // If exists, skip overwrite
      if (!fs.existsSync(dst)) throw new Error(`Cannot move ${src}`);
    });
    console.log(`🚚 moved capsule ${src} -> ${dst}`);
  }
}

async function processIdentity(identityDir) {
  const constructId = path.basename(path.dirname(identityDir));
  await normalizeAvatar(identityDir, constructId);
  await moveCapsules(identityDir, constructId);
}

async function walk() {
  for (const root of identityRoots) {
    if (!fs.existsSync(root)) continue;

    // intelligences: root/*/identity
    if (root.includes('intelligences')) {
      const constructs = await fs.promises.readdir(root).catch(() => []);
      for (const c of constructs) {
        const identityDir = path.join(root, c, 'identity');
        if (fs.existsSync(identityDir)) await processIdentity(identityDir);
      }
    }

    // users: root/*/instances/*/identity
    if (root.includes('users')) {
      const users = await fs.promises.readdir(root).catch(() => []);
      for (const u of users) {
        const instRoot = path.join(root, u, 'instances');
        if (!fs.existsSync(instRoot)) continue;
        const instances = await fs.promises.readdir(instRoot).catch(() => []);
        for (const inst of instances) {
          const identityDir = path.join(instRoot, inst, 'identity');
          if (fs.existsSync(identityDir)) await processIdentity(identityDir);
        }
      }
    }
  }
}

walk()
  .then(() => {
    console.log('Done.');
  })
  .catch(err => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  });
