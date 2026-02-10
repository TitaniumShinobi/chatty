import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
router.use(requireAuth);

// Media file extensions
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|bmp|svg|tiff|tif|ico)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|avi|mov|mkv|webm|flv|wmv|ts|3gp|ogv|m4v)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i;

// User media root lives in Chatty workspace, not in VVAULT (protect sovereign constructs)
const USER_MEDIA_ROOT = path.join(process.cwd(), 'user-media');

async function ensureUserMediaDir(userId) {
  const userDir = path.join(USER_MEDIA_ROOT, sanitizeUserId(userId));
  await fs.mkdir(userDir, { recursive: true });
  return userDir;
}

function sanitizeUserId(userId) {
  return String(userId || 'anonymous').replace(/[^a-zA-Z0-9_\-]/g, '_');
}

/**
 * Recursively scan directory for media files
 */
async function scanDirectoryForMedia(dirPath, basePath, userId) {
  const mediaFiles = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subMedia = await scanDirectoryForMedia(fullPath, basePath, userId);
        mediaFiles.push(...subMedia);
      } else if (entry.isFile()) {
        // Check if it's a media file
        const isImage = IMAGE_EXTENSIONS.test(entry.name);
        const isVideo = VIDEO_EXTENSIONS.test(entry.name);
        const isAudio = AUDIO_EXTENSIONS.test(entry.name);
        
        if (isImage || isVideo || isAudio) {
          const stats = await fs.stat(fullPath);
          const fileType = isImage ? 'image' : (isVideo ? 'video' : 'audio');
          
          // Create a URL-safe path for serving the file
          const urlPath = `/api/library/media/${userId}/${relativePath.replace(/\\/g, '/')}`;
          
          mediaFiles.push({
            id: `media-${path.basename(fullPath, path.extname(fullPath))}-${stats.mtime.getTime()}`,
            type: fileType,
            title: entry.name,
            url: urlPath,
            size: stats.size,
            createdAt: stats.birthtime.getTime(),
            updatedAt: stats.mtime.getTime(),
            path: relativePath
          });
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️ Error scanning directory ${dirPath}:`, error.message);
  }
  
  return mediaFiles;
}

/**
 * Get all media files for the current user
 * Note: user media lives in Chatty workspace (user-media/{userId}), not in VVAULT.
 */
router.get('/media', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    const userEmail = req.user?.email;
    
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'User not authenticated' });
    }

    const safeUserId = sanitizeUserId(userId);
    const userDir = await ensureUserMediaDir(safeUserId);

    const media = await scanDirectoryForMedia(userDir, userDir, safeUserId);
    // Sort by creation date (newest first)
    media.sort((a, b) => b.createdAt - a.createdAt);

    console.log(`✅ [Library API] Found ${media.length} media files for user ${userEmail || safeUserId} (user-media)`);
    res.json({ ok: true, media });
  } catch (error) {
    console.error('❌ [Library API] Failed to get media files:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Serve media files
 */
router.get('/media/:userId/*', async (req, res) => {
  try {
    const userId = sanitizeUserId(req.params.userId);
    const filePath = req.params[0]; // Everything after /media/:userId/
    
    // Security: prevent path traversal
    if (filePath.includes('..')) {
      return res.status(403).json({ ok: false, error: 'Invalid path' });
    }
    
    const userDir = await ensureUserMediaDir(userId);
    const fullPath = path.join(userDir, filePath);
    
    // Verify file exists and is within user media root
    if (!fullPath.startsWith(userDir)) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    
    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) {
        return res.status(404).json({ ok: false, error: 'File not found' });
      }
      
      // Determine content type
      const ext = path.extname(fullPath).toLowerCase();
      let contentType = 'application/octet-stream';
      if (IMAGE_EXTENSIONS.test(ext)) {
        contentType = ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1)}`;
        if (ext === '.jpg') contentType = 'image/jpeg';
      } else if (VIDEO_EXTENSIONS.test(ext)) {
        contentType = `video/${ext.slice(1)}`;
        if (ext === '.mp4') contentType = 'video/mp4';
      } else if (AUDIO_EXTENSIONS.test(ext)) {
        contentType = `audio/${ext.slice(1)}`;
        if (ext === '.mp3') contentType = 'audio/mpeg';
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      
      const fileBuffer = await fs.readFile(fullPath);
      res.send(fileBuffer);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ ok: false, error: 'File not found' });
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ [Library API] Failed to serve media file:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
