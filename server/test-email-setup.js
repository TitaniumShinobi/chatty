#!/usr/bin/env node

// Test Email Setup Script
// This script tests both Resend and SMTP configurations

import dotenv from 'dotenv';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

// Load environment variables
dotenv.config();

console.log('🧪 TESTING EMAIL SETUP');
console.log('========================');

// Test Resend Configuration
console.log('\n📧 TESTING RESEND CONFIGURATION');
console.log('==================================');

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.FROM_EMAIL;
const emailService = process.env.EMAIL_SERVICE;

console.log(`Email Service: ${emailService}`);
console.log(`From Email: ${fromEmail}`);
console.log(`Resend API Key: ${resendApiKey ? resendApiKey.substring(0, 10) + '...' : 'NOT SET'}`);

if (emailService === 'resend' && resendApiKey) {
  try {
    const resend = new Resend(resendApiKey);
    
    // Test API key validity by checking domains
    console.log('\n🔍 Testing Resend API key...');
    
    // This will fail if API key is invalid
    const domains = await resend.domains.list();
    console.log('✅ Resend API key is valid!');
    console.log(`📋 Available domains: ${domains.data?.length || 0}`);
    
    if (domains.data && domains.data.length > 0) {
      domains.data.forEach(domain => {
        console.log(`   - ${domain.name} (${domain.status})`);
      });
    }
    
  } catch (error) {
    console.log('❌ Resend API key test failed:', error.message);
  }
} else {
  console.log('⚠️  Resend not configured or API key missing');
}

// Test SMTP Configuration
console.log('\n📧 TESTING SMTP CONFIGURATION');
console.log('================================');

const smtpHost = process.env.EMAIL_HOST;
const smtpPort = process.env.EMAIL_PORT;
const smtpUser = process.env.EMAIL_USER;
const smtpPass = process.env.EMAIL_PASS;

console.log(`SMTP Host: ${smtpHost}`);
console.log(`SMTP Port: ${smtpPort}`);
console.log(`SMTP User: ${smtpUser}`);
console.log(`SMTP Pass: ${smtpPass ? 'SET' : 'NOT SET'}`);

if (smtpHost && smtpUser && smtpPass) {
  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort || 587,
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
    
    console.log('\n🔍 Testing SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection successful!');
    
  } catch (error) {
    console.log('❌ SMTP connection failed:', error.message);
  }
} else {
  console.log('⚠️  SMTP not fully configured');
}

// Test Email Sending (if both are configured)
console.log('\n📧 TESTING EMAIL SENDING');
console.log('==========================');

const testEmail = process.argv[2] || 'test@example.com';

if (emailService === 'resend' && resendApiKey && fromEmail) {
  try {
    const resend = new Resend(resendApiKey);
    
    console.log(`\n📤 Sending test email to: ${testEmail}`);
    
    const result = await resend.emails.send({
      from: fromEmail,
      to: testEmail,
      subject: 'Chatty Email Test',
      html: `
        <h2>🧪 Chatty Email Test</h2>
        <p>This is a test email from your Chatty application.</p>
        <p><strong>Service:</strong> Resend</p>
        <p><strong>From:</strong> ${fromEmail}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p>If you received this email, your Resend configuration is working correctly! ✅</p>
      `
    });
    
    console.log('✅ Test email sent successfully!');
    console.log(`📧 Email ID: ${result.data?.id}`);
    
  } catch (error) {
    console.log('❌ Test email failed:', error.message);
  }
} else {
  console.log('⚠️  Cannot send test email - Resend not properly configured');
}

console.log('\n🎯 RECOMMENDATIONS');
console.log('==================');

if (emailService === 'resend') {
  console.log('✅ You\'re using Resend (recommended)');
  console.log('📋 Next steps:');
  console.log('   1. Verify your domain (example.com) in Resend dashboard');
  console.log('   2. Set up SPF/DKIM DNS records');
  console.log('   3. Test with a real email address');
} else {
  console.log('⚠️  Consider switching to Resend for better deliverability');
}

if (smtpPass === 'dev-password') {
  console.log('⚠️  Update EMAIL_PASS with real Gmail App Password');
  console.log('   1. Enable 2FA on support@example.com');
  console.log('   2. Generate App Password in Google Account');
  console.log('   3. Update EMAIL_PASS in .env file');
}

console.log('\n✨ Email setup test complete!');
