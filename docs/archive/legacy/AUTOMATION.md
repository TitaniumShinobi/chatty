# Automation helpers for Chatty

This directory collects small tools and scripts that automate common
operations against the development environment.

## Google OAuth login script

`./scripts/oauth-login.js` is a headless Puppeteer script that drives the
Google authentication flow on your behalf and returns to the Chatty server.
It is intended for local development when you want to obtain a session cookie
without manually clicking the sign-in button.

### Requirements

- Node.js (v16+)
- puppeteer installed in the project (`npm install --save-dev puppeteer`)
- environment variables set:

```bash
export GOOGLE_EMAIL="you@gmail.com"
export GOOGLE_PASSWORD="secret"
```

### Usage

1. Start Chatty (`npm run dev` + `npm run server`).
2. Run the script:

   ```bash
   node scripts/oauth-login.js
   ```

3. The script will print the final URL after redirection; if the login
   succeeded you should now be authenticated in a browser session at
   `http://localhost:5173` (the server set a `sid` cookie during the redirect).

> **Security note:** this script stores credentials in environment variables
> and executes a real browser, so treat the values like sensitive secrets.

You can add other automation helpers to this document as needed.
