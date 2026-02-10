// CLI Authentication Module
// Handles authentication for Chatty CLI using the same auth system as web interface

import { open } from 'open';
import http from 'http';
import { URL } from 'url';
import { homedir } from 'os';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const COOKIE_STORAGE_PATH = join(homedir(), '.chatty', 'cli-session.json');
const DEFAULT_API_URL = process.env.CHATTY_API_URL || 'http://localhost:5000';
const DEFAULT_WEB_URL = process.env.CHATTY_WEB_URL || 'http://localhost:5173';

interface StoredSession {
  cookie: string;
  user: {
    sub: string;
    email: string;
    name: string;
  };
  expiresAt: number;
}

export class CLIAuth {
  private apiUrl: string;
  private webUrl: string;
  private session: StoredSession | null = null;

  constructor(apiUrl = DEFAULT_API_URL, webUrl = DEFAULT_WEB_URL) {
    this.apiUrl = apiUrl;
    this.webUrl = webUrl;
  }

  /**
   * Load stored session from disk
   */
  async loadSession(): Promise<StoredSession | null> {
    try {
      if (!existsSync(COOKIE_STORAGE_PATH)) {
        return null;
      }

      const content = await readFile(COOKIE_STORAGE_PATH, 'utf-8');
      const session: StoredSession = JSON.parse(content);

      // Check if session is expired
      if (session.expiresAt && Date.now() > session.expiresAt) {
        return null;
      }

      this.session = session;
      return session;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save session to disk
   */
  private async saveSession(session: StoredSession): Promise<void> {
    try {
      const dir = join(homedir(), '.chatty');
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      await writeFile(COOKIE_STORAGE_PATH, JSON.stringify(session, null, 2));
      this.session = session;
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  /**
   * Clear stored session
   */
  async clearSession(): Promise<void> {
    try {
      if (existsSync(COOKIE_STORAGE_PATH)) {
        await import('fs/promises').then(fs => fs.unlink(COOKIE_STORAGE_PATH));
      }
      this.session = null;
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Check if user is authenticated (either via stored CLI session or web session)
   */
  async isAuthenticated(): Promise<boolean> {
    // First, check if we have a stored CLI session
    const session = await this.loadSession();
    if (session) {
      // Verify stored session is still valid
      try {
        const response = await fetch(`${this.apiUrl}/api/me`, {
          headers: {
            'Cookie': session.cookie,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.user) {
            return true;
          }
        }
      } catch (error) {
        // Session invalid, will try web session below
      }
    }

    // No valid CLI session - try to detect if user is logged into web
    // We can't directly read browser cookies, but we can check if there's a way
    // to share the session. For now, return false and let authenticate() handle it.
    return false;
  }

  /**
   * Get current authenticated user
   * Automatically checks stored session and validates it
   */
  async getCurrentUser(): Promise<{ sub: string; email: string; name: string } | null> {
    // Load stored session
    const session = await this.loadSession();
    if (!session) {
      return null;
    }

    try {
      // Verify session is still valid
      const response = await fetch(`${this.apiUrl}/api/me`, {
        headers: {
          'Cookie': session.cookie,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.user) {
          // Update stored session with latest user info
          await this.saveSession({
            ...session,
            user: {
              sub: data.user.sub || data.user.id || data.user.email,
              email: data.user.email,
              name: data.user.name,
            },
          });

          return {
            sub: data.user.sub || data.user.id || data.user.email,
            email: data.user.email,
            name: data.user.name,
          };
        }
      }
    } catch (error) {
      // Session invalid - clear it
      await this.clearSession();
    }

    return null;
  }

  /**
   * Auto-authenticate: Check for existing session, if not found, prompt for login
   * This is the main entry point that provides seamless authentication
   */
  async autoAuthenticate(): Promise<{ sub: string; email: string; name: string } | null> {
    // First, check if we already have a valid session
    const existingUser = await this.getCurrentUser();
    if (existingUser) {
      return existingUser;
    }

    // No valid session - need to authenticate
    // This will open browser and handle OAuth flow
    return await this.authenticate();
  }

  /**
   * Authenticate via browser login
   * Opens browser for OAuth/login, then captures session cookie via callback
   */
  async authenticate(): Promise<{ sub: string; email: string; name: string }> {
    return new Promise((resolve, reject) => {
      // Start temporary HTTP server to catch OAuth callback
      const callbackPort = 5174;
      const callbackUrl = `http://localhost:${callbackPort}/cli-auth-callback`;

      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url || '/', `http://localhost:${callbackPort}`);

          if (url.pathname === '/cli-auth-callback') {
            // Extract session token from query parameter
            const sessionToken = url.searchParams.get('session_token');
            const cookieName = process.env.COOKIE_NAME || 'sid';

            if (sessionToken) {
              // Token is the JWT - format it as a cookie
              const sessionCookie = `${cookieName}=${sessionToken}`;
              // Verify session by calling /api/me
              try {
                const userResponse = await fetch(`${this.apiUrl}/api/me`, {
                  headers: {
                    'Cookie': sessionCookie,
                  },
                });

                if (userResponse.ok) {
                  const userData = await userResponse.json();
                  if (userData.ok && userData.user) {
                    // Save session
                    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
                    await this.saveSession({
                      cookie: sessionCookie,
                      user: {
                        sub: userData.user.sub || userData.user.id || userData.user.email,
                        email: userData.user.email,
                        name: userData.user.name,
                      },
                      expiresAt,
                    });

                    // Send success page
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <title>Chatty CLI - Authentication Successful</title>
                          <meta http-equiv="refresh" content="2;url=${this.webUrl}">
                        </head>
                        <body style="font-family: system-ui; padding: 40px; text-align: center; background: #f5f5f5;">
                          <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h1 style="color: #4CAF50;">✅ Authentication Successful!</h1>
                            <p style="color: #666; margin-top: 20px;">You can close this window and return to the CLI.</p>
                            <p style="color: #888; margin-top: 10px; font-size: 14px;">Logged in as: <strong>${userData.user.email}</strong></p>
                            <p style="color: #888; margin-top: 20px; font-size: 12px;">Redirecting to Chatty...</p>
                          </div>
                        </body>
                      </html>
                    `);

                    server.close();
                    resolve({
                      sub: userData.user.sub || userData.user.id || userData.user.email,
                      email: userData.user.email,
                      name: userData.user.name,
                    });
                    return;
                  }
                }
              } catch (error) {
                // Verification failed - show error
                res.writeHead(401, { 'Content-Type': 'text/html' });
                res.end(`
                  <!DOCTYPE html>
                  <html>
                    <head><title>Chatty CLI - Verification Failed</title></head>
                    <body style="font-family: system-ui; padding: 40px; text-align: center;">
                      <h1 style="color: #f44336;">❌ Session Verification Failed</h1>
                      <p>Please try again.</p>
                    </body>
                  </html>
                `);
                server.close();
                reject(new Error('Session verification failed'));
                return;
              }
            } else {
              // No session token in URL
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(`
                <!DOCTYPE html>
                <html>
                  <head><title>Chatty CLI - Authentication Failed</title></head>
                  <body style="font-family: system-ui; padding: 40px; text-align: center;">
                    <h1 style="color: #f44336;">❌ Authentication Failed</h1>
                    <p>No session token received. Please try logging in again.</p>
                  </body>
                </html>
              `);
              server.close();
              reject(new Error('Authentication failed - no session token received'));
              return;
            }
          } else {
            // Not the callback endpoint
            res.writeHead(404);
            res.end('Not Found');
          }
        } catch (error) {
          server.close();
          reject(error);
        }
      });

      server.listen(callbackPort, async () => {
        try {
          // Open browser to login page with CLI callback parameter
          // The login page should redirect OAuth callbacks to include our callback URL
          const loginUrl = `${this.webUrl}/login?cli_callback=${encodeURIComponent(callbackUrl)}`;
          console.log(`\n🔐 Opening browser for authentication...`);
          console.log(`   If browser doesn't open, visit: ${loginUrl}\n`);
          console.log(`   After logging in, you'll be automatically authenticated in the CLI.\n`);
          
          await open(loginUrl);
        } catch (error) {
          server.close();
          reject(new Error(`Failed to open browser: ${error}`));
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout - please try again'));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Get authentication cookie for API requests
   */
  getCookie(): string | null {
    return this.session?.cookie || null;
  }
}

export const cliAuth = new CLIAuth();

