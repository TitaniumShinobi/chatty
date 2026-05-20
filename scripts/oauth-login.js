#!/usr/bin/env node
// automated Google OAuth login for Chatty development
// usage: GOOGLE_EMAIL=... GOOGLE_PASSWORD=... node scripts/oauth-login.js

const puppeteer = require('puppeteer');

(async () => {
  const email = process.env.GOOGLE_EMAIL;
  const password = process.env.GOOGLE_PASSWORD;
  if (!email || !password) {
    console.error('Set GOOGLE_EMAIL and GOOGLE_PASSWORD in the environment');
    process.exit(1);
  }

  const authUrl = 'http://localhost:5000/api/auth/google';
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to auth endpoint');
  await page.goto(authUrl);

  // Google login page
  await page.waitForSelector('input[type=email]', { timeout: 10000 });
  await page.type('input[type=email]', email);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  await page.waitForSelector('input[type=password]', { timeout: 10000 });
  await page.type('input[type=password]', password);
  await page.keyboard.press('Enter');

  // wait for redirect back to Chatty
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });

  console.log('Login flow completed, current URL:', page.url());
  await browser.close();
})();
