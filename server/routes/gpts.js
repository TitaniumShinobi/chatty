// GPT Creator API Routes
import express from 'express';
import multer from 'multer';
import { GPTManager } from '../lib/gptManager.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Initialize GPT Manager
const gptManager = GPTManager.getInstance();

// Helper function to verify GPT ownership
async function verifyGPTOwnership(gptId, userId) {
  if (!userId) {
    throw new Error('User authentication required');
  }
  
  const gpt = await gptManager.getGPT(gptId);
  if (!gpt) {
    throw new Error('GPT not found');
  }
  
  if (gpt.userId !== userId) {
    console.warn(`⚠️ [gpts.js] User ${userId} attempted to access GPT ${gptId} owned by ${gpt.userId}`);
    throw new Error('Access denied: GPT does not belong to you');
  }
  
  return gpt;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow text files, PDFs, images, videos, and common document formats
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/pdf',
      'application/json',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/svg+xml',
      'image/webp',
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'video/x-matroska',
      'video/webm',
      'video/x-flv',
      'video/x-ms-wmv',
      'video/mp2t',
      'video/3gpp',
      'video/ogg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

// Get all GPTs for a user
router.get('/', async (req, res) => {
  try {
    console.log(`📥 Fetching GPTs for user: ${req.user.email} (ID: ${req.user.sub})`);
    const gpts = await gptManager.getAllGPTs(req.user.sub);
    console.log(`✅ Loaded ${gpts.length} GPTs for user: ${req.user.email}`);
    res.json({ success: true, gpts });
  } catch (error) {
    console.error(`❌ Error fetching GPTs for user ${req.user.email}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get a specific GPT (with ownership verification)
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    const gpt = await gptManager.getGPT(req.params.id);
    res.json({ success: true, gpt });
  } catch (error) {
    if (error.message === 'User authentication required') {
      return res.status(401).json({ success: false, error: error.message });
    }
    if (error.message === 'GPT not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error fetching GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new GPT
router.post('/', async (req, res) => {
  try {
    console.log(`📝 Creating GPT for user: ${req.user.email} (ID: ${req.user.sub})`);
    const gptData = {
      ...req.body,
      userId: req.user.sub,
      isActive: false
    };

    const gpt = await gptManager.createGPT(gptData, 'gpt');
    console.log(`✅ Created GPT ${gpt.id} for user: ${req.user.email}`);
    
    // Create canonical conversation file in VVAULT (similar to Synth)
    try {
      const { createPrimaryConversationFile } = await import('../services/importService.js');
      const { VVAULT_ROOT } = require('../../vvaultConnector/config');
      const { resolveVVAULTUserId } = require('../../vvaultConnector/writeTranscript.js');
      
      // Resolve VVAULT user ID
      const vvaultUserId = await resolveVVAULTUserId(req.user.sub, req.user?.email);
      if (!vvaultUserId) {
        console.warn(`⚠️ [gpts.js] Could not resolve VVAULT user ID for GPT creation, skipping canonical file`);
      } else {
        // Create constructId from GPT name (e.g., "Katana" -> "katana-001")
        // Similar to how Synth uses "synth-001"
        const gptName = gpt.name || 'gpt';
        const sanitizedName = gptName.toLowerCase()
          .replace(/[^a-z0-9]/g, '-')  // Replace non-alphanumeric with hyphens
          .replace(/-+/g, '-')          // Collapse multiple hyphens
          .replace(/^-|-$/g, '');       // Remove leading/trailing hyphens
        const constructId = `${sanitizedName}-001`;
        
        // Create canonical conversation file
        // Structure: instances/{constructId}/chatty/chat_with_{constructId}.md
        // Example: instances/katana-001/chatty/chat_with_katana-001.md
        const canonicalPath = await createPrimaryConversationFile(
          constructId,
          vvaultUserId,
          req.user?.email || req.user.sub,
          'chatty', // Provider is Chatty for user-created GPTs
          VVAULT_ROOT,
          'shard_0000',
          constructId.replace(/-001$/, '') // Runtime ID without suffix (e.g., "katana")
        );
        
        console.log(`✅ [gpts.js] Created canonical conversation file for GPT: ${canonicalPath}`);
      }
    } catch (canonicalError) {
      // Don't fail GPT creation if canonical file creation fails
      console.warn(`⚠️ [gpts.js] Failed to create canonical conversation file for GPT ${gpt.id}:`, canonicalError.message);
    }
    
    res.json({ success: true, gpt });
  } catch (error) {
    console.error(`❌ Error creating GPT for user ${req.user.email}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a GPT (with ownership verification)
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    const gpt = await gptManager.updateGPT(req.params.id, req.body);
    res.json({ success: true, gpt });
  } catch (error) {
    if (error.message === 'User authentication required') {
      return res.status(401).json({ success: false, error: error.message });
    }
    if (error.message === 'GPT not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error updating GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a GPT (with ownership verification)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    const success = await gptManager.deleteGPT(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'GPT not found' });
    }
    res.json({ success: true });
  } catch (error) {
    if (error.message === 'User authentication required') {
      return res.status(401).json({ success: false, error: error.message });
    }
    if (error.message === 'GPT not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error deleting GPT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload file to GPT (Knowledge Files - separate from memory/transcripts)
router.post('/:id/files', upload.single('file'), async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Pass the multer file object directly to uploadFile
    // It has buffer, originalname, mimetype, size which ServerFileParser needs
    const fileData = {
      buffer: req.file.buffer, // ✅ Required by ServerFileParser
      originalname: req.file.originalname,
      name: req.file.originalname, // Alias for compatibility
      mimetype: req.file.mimetype,
      mimeType: req.file.mimetype, // Alias for compatibility
      type: req.file.mimetype, // Alias for compatibility
      size: req.file.size
    };

    const file = await gptManager.uploadFile(req.params.id, fileData);
    res.json({ success: true, file });
  } catch (error) {
    if (error.message === 'User authentication required') {
      return res.status(401).json({ success: false, error: error.message });
    }
    if (error.message === 'GPT not found' || error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error uploading file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload memory/transcript files to VVAULT (separate from knowledge files)
router.post('/:id/memories', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const gptId = req.params.id;
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    const email = req.user?.email;

    if (!userId || !email) {
      return res.status(401).json({ success: false, error: 'User authentication required' });
    }

    // Verify ownership and get GPT to determine runtime and provider
    const gpt = await verifyGPTOwnership(gptId, userId);

    // Determine service provider from GPT metadata or default to "chatty"
    let serviceProvider = 'chatty'; // Default
    let runtimeId = gptId; // Use GPT ID as runtimeId if no runtime linked

    // Try to extract provider from GPT instructions or metadata
    if (gpt.instructions) {
      const providerMatch = gpt.instructions.match(/provider[:\s]+(\w+)/i) ||
                           gpt.instructions.match(/imported\s+(\w+)/i);
      if (providerMatch) {
        serviceProvider = providerMatch[1].toLowerCase();
      }
    }

    // Check if GPT has files with import metadata
    const gptFiles = await gptManager.getGPTFiles(gptId);
    for (const file of gptFiles) {
      if (file.metadata) {
        try {
          const metadata = typeof file.metadata === 'string' ? JSON.parse(file.metadata) : file.metadata;
          if (metadata.importMetadata?.source) {
            serviceProvider = metadata.importMetadata.source.toLowerCase();
          }
          if (metadata.importMetadata?.constructId) {
            runtimeId = metadata.importMetadata.constructId;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    // Convert file to markdown and store in VVAULT
    const { convertFileToMarkdown } = await import('../services/fileToMarkdownConverter.js');
    
    const result = await convertFileToMarkdown({
      file: req.file,
      runtimeId,
      serviceProvider,
      userId,
      email
    });

    console.log(`✅ [gpts.js] Memory/transcript saved to VVAULT: ${result.filePath}`);

    res.json({ 
      success: true, 
      filePath: result.filePath,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Error uploading memory/transcript:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get files for a GPT (with ownership verification)
router.get('/:id/files', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    const files = await gptManager.getGPTFiles(req.params.id);
    res.json({ success: true, files });
  } catch (error) {
    if (error.message === 'User authentication required' || error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error fetching files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a file
router.delete('/files/:fileId', async (req, res) => {
  try {
    const success = await gptManager.deleteFile(req.params.fileId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update file's GPT ID (for reassociating temp files)
router.put('/files/:fileId/gpt', async (req, res) => {
  try {
    const { gptId } = req.body;
    const success = await gptManager.updateFileGPTId(req.params.fileId, gptId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating file GPT ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create an action for a GPT (with ownership verification)
router.post('/:id/actions', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    const action = await gptManager.createAction(req.params.id, req.body);
    res.json({ success: true, action });
  } catch (error) {
    if (error.message === 'User authentication required' || error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error creating action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get actions for a GPT (with ownership verification)
router.get('/:id/actions', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    const actions = await gptManager.getGPTActions(req.params.id);
    res.json({ success: true, actions });
  } catch (error) {
    if (error.message === 'User authentication required' || error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error fetching actions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete an action
router.delete('/actions/:actionId', async (req, res) => {
  try {
    const success = await gptManager.deleteAction(req.params.actionId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute an action
router.post('/actions/:actionId/execute', async (req, res) => {
  try {
    const result = await gptManager.executeAction(req.params.actionId, req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error executing action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate avatar for GPT (with ownership verification)
router.post('/:id/avatar', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    const { name, description } = req.body;
    const avatar = gptManager.generateAvatar(name, description);
    res.json({ success: true, avatar });
  } catch (error) {
    if (error.message === 'User authentication required' || error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error generating avatar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get GPT context for runtime (with ownership verification)
router.get('/:id/context', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    const context = await gptManager.getGPTContext(req.params.id);
    res.json({ success: true, context });
  } catch (error) {
    if (error.message === 'User authentication required' || error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error fetching context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update GPT context (with ownership verification)
router.put('/:id/context', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    const { context } = req.body;
    await gptManager.updateGPTContext(req.params.id, context);
    res.json({ success: true });
  } catch (error) {
    if (error.message === 'User authentication required' || error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error updating context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Load GPT for runtime (with ownership verification)
router.post('/:id/load', async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    await verifyGPTOwnership(req.params.id, userId);
    
    const runtime = await gptManager.loadGPTForRuntime(req.params.id);
    if (!runtime) {
      return res.status(404).json({ success: false, error: 'GPT not found' });
    }
    res.json({ success: true, runtime });
  } catch (error) {
    if (error.message === 'User authentication required' || error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Error loading GPT for runtime:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
