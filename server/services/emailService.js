import nodemailer from 'nodemailer';

// Create a mock transporter for development
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || 'dev@chatty.com',
    pass: process.env.EMAIL_PASS || 'dev-password'
  }
});

// Mock email sending for development
const sendMockEmail = async (to, subject, html) => {
  console.log('📧 Mock Email Sent:');
  console.log('   To:', to);
  console.log('   Subject:', subject);
  console.log('   Content:', html);
  console.log('   (In production, this would be sent via SMTP)');
  return true;
};

export const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify/${token}`;
  
  const html = `
    <h2>Welcome to Chatty!</h2>
    <p>Please verify your email address by clicking the link below:</p>
    <a href="${verificationUrl}">Verify Email</a>
    <p>If you didn't create an account, you can safely ignore this email.</p>
  `;

  try {
    if (process.env.NODE_ENV === 'production') {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Verify your Chatty account',
        html
      });
    } else {
      await sendMockEmail(email, 'Verify your Chatty account', html);
    }
  } catch (error) {
    console.error('Email sending failed:', error);
    // Don't throw error in development
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
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
    if (process.env.NODE_ENV === 'production') {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Reset your Chatty password',
        html
      });
    } else {
      await sendMockEmail(email, 'Reset your Chatty password', html);
    }
  } catch (error) {
    console.error('Email sending failed:', error);
    // Don't throw error in development
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
};
