// Frontend CLI Bridge
// Handles communication between web UI and CLI backend

export interface CommandResult {
  type: 'response' | 'command' | 'error';
  content: string;
  metadata?: {
    model?: string;
    timestamp?: string;
    command?: string;
  };
}

export class CLIBridge {
  private baseUrl: string;

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  async sendMessage(message: string): Promise<CommandResult> {
    try {
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      return {
        type: 'error',
        content: `Connection error: ${error.message}`,
        metadata: { timestamp: new Date().toISOString() }
      };
    }
  }

  async sendCommand(command: string): Promise<CommandResult> {
    try {
      const response = await fetch(`${this.baseUrl}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      return {
        type: 'error',
        content: `Command error: ${error.message}`,
        metadata: { timestamp: new Date().toISOString() }
      };
    }
  }

  async getStatus(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/status`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error: any) {
      console.error('Status check failed:', error);
      return null;
    }
  }

  // Legacy compatibility for existing frontend
  async sendMessageLegacy(prompt: string, seat = 'synth'): Promise<any> {
    try {
      const response = await fetch('/chatty-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, seat }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      throw new Error(`Legacy API error: ${error.message}`);
    }
  }
}

// Singleton instance
export const cliBridge = new CLIBridge();
