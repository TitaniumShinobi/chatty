/**
 * MOCR Service API Server
 * RESTful API for Motion Optical Character Recognition
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { MOCRService, MOCRConfig } from '../core/MOCRService';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Initialize MOCR service
const mocrService = new MOCRService({
  maxFrames: parseInt(process.env.MOCR_MAX_FRAMES || '1000'),
  frameInterval: parseInt(process.env.MOCR_FRAME_INTERVAL || '10'),
  ocrLanguage: process.env.MOCR_OCR_LANGUAGE || 'eng',
  asrLanguage: process.env.MOCR_ASR_LANGUAGE || 'en',
  maxFileSize: parseInt(process.env.MOCR_MAX_FILE_SIZE || '4294967296'), // 4GB (feature-length)
  processingTimeout: parseInt(process.env.MOCR_PROCESSING_TIMEOUT || '7200000'), // 2 hours
  enableCaching: process.env.MOCR_ENABLE_CACHING === 'true'
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Use disk storage for large movies (avoids OOM - 4GB in RAM would crash)
const uploadDir = path.join(process.cwd(), 'temp-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      cb(null, `mocr_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
    }
  }),
  limits: {
    fileSize: parseInt(process.env.MOCR_MAX_FILE_SIZE || '4294967296') // 4GB (feature-length)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      (cb as (err: Error, accept: boolean) => void)(new Error('Only video files are allowed'), false);
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const stats = mocrService.getStats();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    stats
  });
});

// Get service information
app.get('/info', (req, res) => {
  res.json({
    name: 'MOCR Service',
    description: 'Motion Optical Character Recognition Service',
    version: '1.0.0',
    capabilities: [
      'Video frame extraction',
      'Optical character recognition',
      'Automatic speech recognition',
      'Temporal analysis',
      'Content synchronization',
      'Scene detection',
      'Text tracking'
    ],
    supportedFormats: [
      'MP4', 'AVI', 'MOV', 'MKV', 'WebM', 'FLV', 'WMV', 'M4V', '3GP', 'OGV'
    ],
    config: mocrService.getConfig()
  });
});

// Create a new MOCR job
app.post('/jobs', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No video file provided',
        message: 'Please upload a video file using the "video" field'
      });
    }

    // Parse configuration from request body
    const config: MOCRConfig = {};
    if (req.body.config) {
      try {
        Object.assign(config, JSON.parse(req.body.config));
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid configuration',
          message: 'Configuration must be valid JSON'
        });
      }
    }

    // Path-based flow (disk storage) - supports feature-length movies without OOM
    const filePath = (req.file as Express.Multer.File & { path: string }).path;
    const job = await mocrService.createJobFromPath(
      filePath,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      config
    );

    res.status(201).json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        fileInfo: job.fileInfo,
        config: job.config,
        progress: job.progress
      }
    });

  } catch (error) {
    console.error('Error creating MOCR job:', error);
    res.status(400).json({
      error: 'Failed to create job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get job status
app.get('/jobs/:jobId', (req, res) => {
  try {
    const job = mocrService.getJob(req.params.jobId);
    
    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        message: `Job with ID ${req.params.jobId} does not exist`
      });
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        fileInfo: job.fileInfo,
        config: job.config,
        progress: job.progress,
        error: job.error,
        result: job.result
      }
    });

  } catch (error) {
    console.error('Error getting job:', error);
    res.status(500).json({
      error: 'Failed to get job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all jobs
app.get('/jobs', (req, res) => {
  try {
    const jobs = mocrService.getAllJobs();
    
    // Filter jobs based on query parameters
    let filteredJobs = jobs;
    
    if (req.query.status) {
      filteredJobs = filteredJobs.filter(job => job.status === req.query.status);
    }
    
    if (req.query.limit) {
      const limit = parseInt(req.query.limit as string);
      filteredJobs = filteredJobs.slice(0, limit);
    }

    res.json({
      success: true,
      jobs: filteredJobs.map(job => ({
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        fileInfo: job.fileInfo,
        progress: job.progress,
        error: job.error
      })),
      total: jobs.length,
      filtered: filteredJobs.length
    });

  } catch (error) {
    console.error('Error getting jobs:', error);
    res.status(500).json({
      error: 'Failed to get jobs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Cancel a job
app.post('/jobs/:jobId/cancel', (req, res) => {
  try {
    const success = mocrService.cancelJob(req.params.jobId);
    
    if (!success) {
      return res.status(400).json({
        error: 'Cannot cancel job',
        message: 'Job is not in a cancellable state'
      });
    }

    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({
      error: 'Failed to cancel job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete a job
app.delete('/jobs/:jobId', (req, res) => {
  try {
    const success = mocrService.deleteJob(req.params.jobId);
    
    if (!success) {
      return res.status(404).json({
        error: 'Job not found',
        message: `Job with ID ${req.params.jobId} does not exist`
      });
    }

    res.json({
      success: true,
      message: 'Job deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({
      error: 'Failed to delete job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get service statistics
app.get('/stats', (req, res) => {
  try {
    const stats = mocrService.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update service configuration
app.put('/config', (req, res) => {
  try {
    const newConfig = req.body;
    mocrService.updateConfig(newConfig);
    
    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: mocrService.getConfig()
    });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(400).json({
      error: 'Failed to update configuration',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get current configuration
app.get('/config', (req, res) => {
  try {
    const config = mocrService.getConfig();
    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({
      error: 'Failed to get configuration',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Cleanup old jobs
app.post('/cleanup', (req, res) => {
  try {
    const maxAge = req.body.maxAge || 24 * 60 * 60 * 1000; // 24 hours
    const cleaned = mocrService.cleanupOldJobs(maxAge);
    
    res.json({
      success: true,
      message: `Cleaned up ${cleaned} old jobs`,
      cleaned
    });
  } catch (error) {
    console.error('Error cleaning up jobs:', error);
    res.status(500).json({
      error: 'Failed to cleanup jobs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size exceeds the maximum allowed limit'
      });
    }
  }

  // Invalid mime/type from multer fileFilter or validation
  const msg = error?.message || '';
  if (
    msg.includes('Only video files') ||
    msg.includes('Unsupported file type') ||
    msg.includes('Unsupported video format') ||
    msg.includes('File too large')
  ) {
    return res.status(400).json({
      error: 'Invalid file',
      message: msg
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Start server
app.listen(port, () => {
  console.log(`🎬 MOCR Service running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`📋 API docs: http://localhost:${port}/info`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;
