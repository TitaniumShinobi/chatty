/**
 * Attachments API Routes
 * 
 * Handles file upload to Supabase Storage for persistent attachment storage.
 */

import { Router } from 'express';
import { uploadAttachments } from '../lib/attachmentStorage.js';

const router = Router();

/**
 * POST /api/attachments/upload
 * Upload attachments to storage and return permanent URLs
 * 
 * Body:
 * - userId: string
 * - constructId: string
 * - conversationId: string
 * - attachments: Array<{name: string, type: string, data: string (base64)}>
 * 
 * Returns:
 * - success: boolean
 * - attachments: Array<Attachment> with URLs
 */
router.post('/upload', async (req, res) => {
  try {
    // Use email as primary identifier for Supabase storage consistency
    // This matches how other VVAULT routes resolve user identity
    const userEmail = req.user?.email;
    const userId = userEmail || req.user?.id || req.user?.sub;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { constructId, conversationId, attachments } = req.body;

    if (!constructId || !conversationId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing constructId or conversationId' 
      });
    }

    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No attachments provided' 
      });
    }

    console.log(`📤 [Attachments API] Uploading ${attachments.length} files for ${constructId}`);

    const uploadedAttachments = await uploadAttachments({
      userId,
      constructId,
      conversationId,
      attachments
    });

    console.log(`✅ [Attachments API] Uploaded ${uploadedAttachments.length} files`);

    res.json({
      success: true,
      attachments: uploadedAttachments
    });
  } catch (error) {
    console.error('❌ [Attachments API] Upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload attachments' 
    });
  }
});

export default router;
