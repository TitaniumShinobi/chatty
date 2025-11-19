import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
router.use(requireAuth);

// Get VVAULT root path
const require = createRequire(import.meta.url);
const { VVAULT_ROOT } = require('../../vvaultConnector/config.js');

// Media file extensions
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|bmp|svg|tiff|tif|ico)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|avi|mov|mkv|webm|flv|wmv|ts|3gp|ogv|m4v)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i;

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
 */
router.get('/media', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    const userEmail = req.user?.email;
    
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'User not authenticated' });
    }
    
    // Try to find user's VVAULT directory
    // Check both MongoDB user ID and VVAULT user ID formats
    const shard = 'shard_0000';
    const possibleUserIds = [
      userId,
      userEmail?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      // Also check for VVAULT format (devon_woodson_timestamp)
      userEmail ? userEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '_') : null
    ].filter(Boolean);
    
    const mediaFiles = [];
    
    // Scan imports directory for media files
    // Path: vvault/users/{shard}/{user_id}/imports/{provider}/media/
    for (const uid of possibleUserIds) {
      const importsPath = path.join(VVAULT_ROOT, 'users', shard, uid, 'imports');
      
      try {
        const exists = await fs.access(importsPath).then(() => true).catch(() => false);
        if (exists) {
          const media = await scanDirectoryForMedia(importsPath, importsPath, uid);
          mediaFiles.push(...media);
        }
      } catch (error) {
        // Directory doesn't exist, continue
      }
    }
    
    // Also scan constructs for media (in case media is stored per-construct)
    for (const uid of possibleUserIds) {
      const constructsPath = path.join(VVAULT_ROOT, 'users', shard, uid, 'constructs');
      
      try {
        const exists = await fs.access(constructsPath).then(() => true).catch(() => false);
        if (exists) {
          const constructs = await fs.readdir(constructsPath, { withFileTypes: true });
          
          for (const construct of constructs) {
            if (construct.isDirectory()) {
              const constructPath = path.join(constructsPath, construct.name);
              const media = await scanDirectoryForMedia(constructPath, constructsPath, uid);
              mediaFiles.push(...media);
            }
          }
        }
      } catch (error) {
        // Directory doesn't exist, continue
      }
    }
    
    // Remove duplicates (same file path)
    const uniqueMedia = Array.from(
      new Map(mediaFiles.map(item => [item.path, item])).values()
    );
    
    // Sort by creation date (newest first)
    uniqueMedia.sort((a, b) => b.createdAt - a.createdAt);
    
    console.log(`✅ [Library API] Found ${uniqueMedia.length} media files for user ${userEmail || userId}`);
    
    res.json({ ok: true, media: uniqueMedia });
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
    const userId = req.params.userId;
    const filePath = req.params[0]; // Everything after /media/:userId/
    
    // Security: prevent path traversal
    if (filePath.includes('..') || filePath.includes('/') && !filePath.startsWith('imports/') && !filePath.startsWith('constructs/')) {
      return res.status(403).json({ ok: false, error: 'Invalid path' });
    }
    
    const shard = 'shard_0000';
    const fullPath = path.join(VVAULT_ROOT, 'users', shard, userId, filePath);
    
    // Verify file exists and is within VVAULT
    if (!fullPath.startsWith(VVAULT_ROOT)) {
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

