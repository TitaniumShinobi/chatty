import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { createWriteStream, createReadStream } from 'fs';
import { sendExportEmail } from '../services/emailService.js';
import { requestOTP, verifyOTP } from '../auth-phone.js';
import client from '../mongo.js';

const router = express.Router();

// In-memory store for export verification status
const exportVerifications = new Map();

// Test endpoint to check database connection and users
router.get('/test-db', async (req, res) => {
  try {
    const collections = getCollections();
    const users = await collections.users.find({}).limit(5).toArray();
    res.json({ 
      success: true, 
      userCount: users.length,
      users: users.map(u => ({ id: u._id, email: u.email, name: u.name }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Database connection failed'
    });
  }
});

// Request data export
router.post('/request', async (req, res) => {
  try {
    // For development testing, use a mock user ID if not authenticated
    const userId = req.user?.userId || 'dev-user-123';
    
    // Create exports directory if it doesn't exist
    const exportDir = path.join(process.cwd(), 'uploads', 'exports', userId);
    await fs.mkdir(exportDir, { recursive: true });
    
    // Generate secure token
    const token = jwt.sign(
      { userId, type: 'export', timestamp: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Create ZIP file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipPath = path.join(exportDir, `export-${timestamp}.zip`);
    
    // Get user data from MongoDB
    let user, conversations, messages;
    
    try {
      const db = client.db("chatty");
      
      // Get user data
      user = await db.collection("users").findOne({ _id: userId });
      if (!user) {
        throw new Error('User not found');
      }
      
      // Get conversations
      conversations = await db.collection("conversations").find({ owner: userId }).toArray();
      
      // Get messages
      messages = await db.collection("messages").find({ owner: userId }).toArray();
      
      console.log(`✅ Found user: ${user.email}, ${conversations.length} conversations, ${messages.length} messages`);
    } catch (error) {
      console.log('Database not available, using mock data for development:', error.message);
      // Create mock data for development
      user = {
        _id: userId,
        email: 'dev@chatty.com',
        name: 'Development User',
        createdAt: new Date()
      };
      conversations = [
        {
          _id: 'conv-1',
          title: 'Test Conversation',
          owner: userId,
          createdAt: new Date()
        }
      ];
      messages = [
        {
          _id: 'msg-1',
          content: 'Hello, this is a test message',
          owner: userId,
          conversationId: 'conv-1',
          createdAt: new Date()
        }
      ];
    }
    
    // Create export data structure
    const exportData = {
      user: user,
      conversations: conversations,
      messages: messages,
      exportInfo: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        totalConversations: conversations.length,
        totalMessages: messages.length
      }
    };
    
    // Create ZIP archive
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(output);
    archive.append(JSON.stringify(exportData, null, 2), { name: 'chatty-export.json' });
    await archive.finalize();
    
    // Send email with verification link
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/download/verify?token=${token}`;
    
    try {
      console.log(`📧 Sending export email to: ${user.email}`);
      await sendExportEmail(user.email, verificationUrl);
      console.log(`✅ Export email sent successfully to: ${user.email}`);
      
      // Store token info
      exportVerifications.set(token, {
        userId,
        zipPath,
        createdAt: Date.now(),
        verified: false,
        downloadCount: 0
      });
      
      res.json({ 
        success: true, 
        message: 'Export created and email sent successfully.',
        userEmail: user.email,
        verificationUrl: verificationUrl,
        exportDetails: {
          totalConversations: conversations.length,
          totalMessages: messages.length,
          exportSize: 'Calculating...',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }
      });
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);
      
      // Clean up the ZIP file if email failed
      try {
        await fs.unlink(zipPath);
        console.log('🗑️ Cleaned up ZIP file after email failure');
      } catch (unlinkError) {
        console.error('Failed to clean up ZIP file:', unlinkError);
      }
      
      res.status(500).json({ 
        error: 'Email service failed – check SMTP configuration',
        details: emailError.message,
        userEmail: user.email,
        troubleshooting: {
          checkSMTP: 'Verify EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS',
          checkNetwork: 'Ensure server can reach SMTP server',
          checkCredentials: 'Verify email credentials are correct'
        }
      });
    }
    
  } catch (error) {
    console.error('Export request error:', error);
    
    let errorMessage = 'Export failed. Please try again.';
    let statusCode = 500;
    
    if (error.message.includes('ZIP')) {
      errorMessage = 'Could not create export archive';
    } else if (error.message.includes('permission') || error.message.includes('access')) {
      errorMessage = 'Permission denied – check file system access';
    } else if (error.message.includes('database') || error.message.includes('MongoDB')) {
      errorMessage = 'Database connection failed';
    } else if (error.message.includes('JWT') || error.message.includes('token')) {
      errorMessage = 'Authentication failed';
      statusCode = 401;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Request OTP for export
router.post('/request-otp', async (req, res) => {
  try {
    const { token, phone } = z.object({
      token: z.string(),
      phone: z.string().regex(/^\+\d{8,15}$/)
    }).parse(req.body);
    
    // Verify token
    const tokenData = jwt.verify(token, process.env.JWT_SECRET);
    if (tokenData.type !== 'export') {
      return res.status(400).json({ error: 'Invalid token type' });
    }
    
    // Check if export exists
    const exportInfo = exportVerifications.get(token);
    if (!exportInfo) {
      return res.status(404).json({ error: 'Export not found or expired' });
    }
    
    // Send OTP via Twilio
    try {
      // Check if Twilio is properly configured
      if (!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN || !process.env.TWILIO_VERIFY_SID) {
        return res.status(503).json({ error: 'SMS verification not available. Twilio not configured.' });
      }
      
      const twilioClient = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      const serviceSid = process.env.TWILIO_VERIFY_SID;
      
      await twilioClient.verify.v2.services(serviceSid)
        .verifications.create({ to: phone, channel: 'sms' });
      
      res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
      console.error('OTP sending error:', error);
      return res.status(400).json({ error: 'Failed to send OTP' });
    }
    
  } catch (error) {
    console.error('OTP request error:', error);
    res.status(400).json({ error: 'OTP request failed' });
  }
});

// Verify OTP for export
router.post('/verify-otp', async (req, res) => {
  try {
    const { token, phone, code } = z.object({
      token: z.string(),
      phone: z.string().regex(/^\+\d{8,15}$/),
      code: z.string().length(6)
    }).parse(req.body);
    
    // Verify token
    const tokenData = jwt.verify(token, process.env.JWT_SECRET);
    if (tokenData.type !== 'export') {
      return res.status(400).json({ error: 'Invalid token type' });
    }
    
    // Check if export exists
    const exportInfo = exportVerifications.get(token);
    if (!exportInfo) {
      return res.status(404).json({ error: 'Export not found or expired' });
    }
    
    // Verify OTP with Twilio
    try {
      // Check if Twilio is properly configured
      if (!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN || !process.env.TWILIO_VERIFY_SID) {
        return res.status(503).json({ error: 'SMS verification not available. Twilio not configured.' });
      }

      const twilioClient = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      const serviceSid = process.env.TWILIO_VERIFY_SID;
      
      const verificationCheck = await twilioClient.verify.v2.services(serviceSid)
        .verificationChecks.create({ to: phone, code });
      
      if (verificationCheck.status !== 'approved') {
        return res.status(400).json({ error: 'Invalid OTP code' });
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      return res.status(400).json({ error: 'Failed to verify OTP' });
    }
    
    // Mark as verified
    exportInfo.verified = true;
    exportInfo.verifiedAt = Date.now();
    exportVerifications.set(token, exportInfo);
    
    res.json({ success: true, message: 'OTP verified successfully' });
    
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(400).json({ error: 'OTP verification failed' });
  }
});

// Download export file
router.get('/download', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }
    
    // Verify token
    const tokenData = jwt.verify(token, process.env.JWT_SECRET);
    if (tokenData.type !== 'export') {
      return res.status(400).json({ error: 'Invalid token type' });
    }
    
    // Check export status
    const exportInfo = exportVerifications.get(token);
    if (!exportInfo) {
      return res.status(404).json({ error: 'Export not found or expired' });
    }
    
    if (!exportInfo.verified) {
      return res.status(403).json({ error: 'Export not verified. Complete 2FA first.' });
    }
    
    if (exportInfo.downloadCount > 0) {
      return res.status(403).json({ error: 'Export already downloaded' });
    }
    
    // Check if file exists
    try {
      await fs.access(exportInfo.zipPath);
    } catch {
      return res.status(404).json({ error: 'Export file not found' });
    }
    
    // Log download
    const downloadLog = {
      userId: exportInfo.userId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
      token: token.substring(0, 8) + '...' // Partial token for logging
    };
    console.log('Export download:', downloadLog);
    
    // Increment download count
    exportInfo.downloadCount++;
    exportVerifications.set(token, exportInfo);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="chatty-export-${Date.now()}.zip"`);
    
    // Stream file to client
    const fileStream = createReadStream(exportInfo.zipPath);
    fileStream.pipe(res);
    
    // Clean up after download
    fileStream.on('end', async () => {
      try {
        await fs.unlink(exportInfo.zipPath);
        exportVerifications.delete(token);
        console.log('Export file cleaned up:', exportInfo.zipPath);
      } catch (error) {
        console.error('Error cleaning up export file:', error);
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Get export status
router.get('/status/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const exportInfo = exportVerifications.get(token);
    
    if (!exportInfo) {
      return res.status(404).json({ error: 'Export not found' });
    }
    
    res.json({
      verified: exportInfo.verified,
      downloadCount: exportInfo.downloadCount,
      createdAt: exportInfo.createdAt
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Status check failed' });
  }
});

export default router;
