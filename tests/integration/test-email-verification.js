#!/usr/bin/env node

/**
 * Test script for Chatty email verification flow
 * Run with: node test-email-verification.js
 */

import { sendVerificationEmail } from './server/services/emailService.js';
import jwt from 'jsonwebtoken';

// Test configuration
const TEST_EMAIL = 'your-test-email@example.com'; // Replace with your email
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

async function testEmailVerification() {
  console.log('🧪 Testing Chatty Email Verification Flow\n');

  try {
    // 1. Generate a test verification token
    const testUserId = 'test-user-123';
    const verificationToken = jwt.sign(
      { userId: testUserId, type: 'verify' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Generated test verification token');
    console.log(`🔗 Token: ${verificationToken.substring(0, 50)}...`);

    // 2. Test email sending
    console.log('\n📧 Sending test verification email...');
    await sendVerificationEmail(TEST_EMAIL, verificationToken);
    
    console.log('✅ Test email sent successfully!');
    console.log(`📬 Check your inbox at: ${TEST_EMAIL}`);
    
    // 3. Show verification URL
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify/${verificationToken}`;
    console.log(`\n🔗 Verification URL: ${verificationUrl}`);
    
    // 4. Test token decoding
    console.log('\n🔍 Testing token decoding...');
    const decoded = jwt.verify(verificationToken, JWT_SECRET);
    console.log('✅ Token decoded successfully:');
    console.log(`   - User ID: ${decoded.userId}`);
    console.log(`   - Type: ${decoded.type}`);
    console.log(`   - Expires: ${new Date(decoded.exp * 1000).toISOString()}`);

    console.log('\n🎉 Email verification test completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Check your email inbox');
    console.log('2. Click the verification link');
    console.log('3. Verify the redirect works correctly');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('- Check your email service configuration');
    console.log('- Verify RESEND_API_KEY or SMTP settings');
    console.log('- Ensure JWT_SECRET is set');
  }
}

// Run the test
testEmailVerification();
