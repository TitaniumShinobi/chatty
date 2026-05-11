#!/usr/bin/env node
// migrateAvatarsToCDN.js
// copy legacy avatar files (local or Supabase) to CDN storage via avatarStore

import fs from 'fs';
import path from 'path';
import { initAvatarStore, uploadAvatar } from '../lib/avatarStore.js';
import { Pool } from 'pg'; // example if using Postgres
// or import Supabase client if needed

async function main() {
  // configure store from env
  initAvatarStore({
    region: process.env.AWS_REGION,
    bucket: process.env.AVATAR_BUCKET,
    cdnUrl: process.env.AVATAR_CDN,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const res = await client.query('SELECT id, avatar_path FROM avatars WHERE avatar_path IS NOT NULL');
    for (const row of res.rows) {
      const { id, avatar_path } = row;
      // read file from legacy path
      if (!fs.existsSync(avatar_path)) continue;
      const buffer = fs.readFileSync(avatar_path);
      const ext = path.extname(avatar_path);
      const key = `avatars/${id}${ext}`;
      const url = await uploadAvatar(buffer, key, mimeType(ext));
      await client.query('UPDATE avatars SET avatar_url=$1 WHERE id=$2', [url, id]);
      console.log(`migrated ${id} -> ${url}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function mimeType(ext) {
  switch (ext.toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    default: return 'application/octet-stream';
  }
}

main().catch(e=>{console.error(e); process.exit(1);});
