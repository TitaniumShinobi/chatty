import express from "express";
import { requireAuth } from "../middleware/auth.js";
import fs from "fs/promises";
import path from "path";

const router = express.Router();

/**
 * POST /api/workspace/context
 * 
 * Get workspace context (active file/buffer content) for editor integration.
 * This endpoint allows Cursor/editor to provide file content for Katana's context injection.
 * 
 * Body: { filePath?: string, content?: string, maxLength?: number }
 * 
 * If filePath is provided, reads the file from the workspace.
 * If content is provided, uses it directly (for editor buffer content).
 */
router.post("/context", requireAuth, async (req, res) => {
  try {
    const { filePath, content, maxLength = 10000 } = req.body || {};
    
    // Priority 1: Direct content (from editor buffer)
    if (content && typeof content === 'string') {
      const trimmed = content.length > maxLength
        ? content.substring(0, maxLength) + '...'
        : content;
      return res.json({ ok: true, content: trimmed });
    }
    
    // Priority 2: Read from file path (if provided and safe)
    if (filePath && typeof filePath === 'string') {
      // Security: Only allow reading from workspace directory
      const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
      const resolvedPath = path.resolve(workspaceRoot, filePath);
      
      // Ensure path is within workspace root
      if (!resolvedPath.startsWith(path.resolve(workspaceRoot))) {
        return res.status(403).json({ 
          ok: false, 
          error: 'File path must be within workspace root' 
        });
      }
      
      try {
        const fileContent = await fs.readFile(resolvedPath, 'utf-8');
        const trimmed = fileContent.length > maxLength
          ? fileContent.substring(0, maxLength) + '...'
          : fileContent;
        return res.json({ ok: true, content: trimmed });
      } catch (error) {
        console.warn(`⚠️ [workspace] Could not read file ${resolvedPath}:`, error);
        return res.status(404).json({ 
          ok: false, 
          error: `File not found: ${filePath}` 
        });
      }
    }
    
    // No content or filePath provided
    return res.json({ ok: true, content: null });
  } catch (error) {
    console.error('❌ [workspace] Error getting workspace context:', error);
    return res.status(500).json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;

