import { Resend } from 'resend';

// Initialize Resend lazily to ensure environment variables are loaded
let resend = null;
const getResend = () => {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

// SMTP fallback removed - using Resend only
// import nodemailer from 'nodemailer';

// Email service configuration (Resend only)
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@chatty.com';

export const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify/${token}`;
  
  const html = `
    <h2>Welcome to Chatty!</h2>
    <p>Please verify your email address by clicking the link below:</p>
    <a href="${verificationUrl}">Verify Email</a>
    <p>If you didn't create an account, you can safely ignore this email.</p>
  `;

  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('Resend API key not configured – check RESEND_API_KEY environment variable');
    }
    
    const resendClient = getResend();
    if (!resendClient) {
      throw new Error('Resend client not initialized – check RESEND_API_KEY');
    }
    
    await resendClient.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Verify your Chatty account',
      html
    });
    console.log('✅ Verification email sent via Resend to:', email);
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
};

export const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  
  const html = `
    <h2>Password Reset Request</h2>
    <p>You requested a password reset. Click the link below to reset your password:</p>
    <a href="${resetUrl}">Reset Password</a>
    <p>This link will expire in 1 hour.</p>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `;

  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('Resend API key not configured – check RESEND_API_KEY environment variable');
    }
    
    const resendClient = getResend();
    if (!resendClient) {
      throw new Error('Resend client not initialized – check RESEND_API_KEY');
    }
    
    await resendClient.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reset your Chatty password',
      html
    });
    console.log('✅ Password reset email sent via Resend to:', email);
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
};

export const sendExportEmail = async (email, verificationUrl) => {
  if (!email || !verificationUrl) {
    throw new Error('Email and verification URL are required');
  }
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Your Chatty Data Export is Ready</h2>
      <p>Your data export has been prepared and is ready for download. For security, you'll need to complete a two-factor authentication step.</p>
      
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Next Steps:</h3>
        <ol>
          <li>Click the verification link below</li>
          <li>Enter your phone number for SMS verification</li>
          <li>Enter the 6-digit code sent to your phone</li>
          <li>Download your data export</li>
        </ol>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" 
           style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Verify & Download Export
        </a>
      </div>
      
      <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <strong>Security Notice:</strong>
        <ul style="margin: 10px 0;">
          <li>This link expires in 24 hours</li>
          <li>You can only download the file once</li>
          <li>Two-factor authentication is required</li>
          <li>If you didn't request this export, you can safely ignore this email</li>
        </ul>
      </div>
      
      <p style="color: #666; font-size: 14px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${verificationUrl}">${verificationUrl}</a>
      </p>
    </div>
  `;

      try {
        // Use Resend for transactional emails
        if (!process.env.RESEND_API_KEY) {
          throw new Error('Resend API key not configured – check RESEND_API_KEY environment variable');
        }
        
        const resendClient = getResend();
        if (!resendClient) {
          throw new Error('Resend client not initialized – check RESEND_API_KEY');
        }
        
        const result = await resendClient.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: 'Your Chatty Data Export is Ready',
          html
        });
        
        console.log('✅ Export email sent via Resend:', result.data?.id);
        console.log('📧 Email sent to:', email);
        console.log('🔗 Verification URL:', verificationUrl);
        console.log('📬 From:', FROM_EMAIL);
      } catch (error) {
        console.error('❌ Export email sending failed:', error);
        throw new Error(`Email service failed: ${error.message}`);
      }
};
