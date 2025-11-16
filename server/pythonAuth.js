/**
 * Python Authentication Wrapper for Node.js
 * Provides secure password hashing using PBKDF2 + Passlib via Python subprocess
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PythonAuth {
  constructor() {
    // Path to Python executable in virtual environment
    this.pythonPath = path.join(__dirname, 'auth_env', 'bin', 'python');
    this.authScriptPath = path.join(__dirname, 'auth.py');
  }

  /**
   * Execute Python authentication command
   */
  async executePythonCommand(command, args) {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(this.pythonPath, [this.authScriptPath, command, ...args], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse Python output: ${stdout}`));
          }
        } else {
          reject(new Error(`Python process failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }

  /**
   * Validate password strength
   */
  async validatePasswordStrength(password) {
    try {
      const result = await this.executePythonCommand('validate', [password]);
      return {
        isValid: result.is_valid,
        errors: result.errors
      };
    } catch (error) {
      console.error('❌ Password strength validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate email format
   */
  async validateEmail(email) {
    try {
      const result = await this.executePythonCommand('email', [email]);
      return result.is_valid;
    } catch (error) {
      console.error('❌ Email validation failed:', error);
      throw error;
    }
  }

  /**
   * Hash password using PBKDF2
   */
  async hashPassword(password) {
    try {
      const result = await this.executePythonCommand('hash', [password]);
      return result.hashed;
    } catch (error) {
      console.error('❌ Password hashing failed:', error);
      throw error;
    }
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password, hashed) {
    try {
      const result = await this.executePythonCommand('verify', [password, hashed]);
      return {
        isValid: result.is_valid,
        needsUpdate: result.needs_update
      };
    } catch (error) {
      console.error('❌ Password verification failed:', error);
      throw error;
    }
  }

  /**
   * Get hash information
   */
  async getHashInfo(hashed) {
    try {
      const result = await this.executePythonCommand('info', [hashed]);
      return {
        scheme: result.scheme,
        needsUpdate: result.needs_update,
        isValidFormat: result.is_valid_format,
        error: result.error
      };
    } catch (error) {
      console.error('❌ Hash info retrieval failed:', error);
      throw error;
    }
  }

  /**
   * Upgrade password hash
   */
  async upgradePasswordHash(password, oldHash) {
    try {
      // First verify the password
      const verifyResult = await this.verifyPassword(password, oldHash);
      if (!verifyResult.isValid) {
        throw new Error('Invalid password for hash upgrade');
      }

      // Generate new hash
      const newHash = await this.hashPassword(password);
      console.log('🔄 Password hash upgraded using PBKDF2');
      return newHash;
    } catch (error) {
      console.error('❌ Password hash upgrade failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const pythonAuth = new PythonAuth();
export default pythonAuth;