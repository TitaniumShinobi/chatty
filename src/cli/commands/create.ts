/**
 * Create Command Handler
 * Handles the /create slash command for image generation
 */

import { generateImage } from '../../lib/image/imageGenerator.js';

export interface CreateCommandOptions {
  prompt: string;
  style?: string;
  size?: 'small' | 'medium' | 'large';
  quality?: 'draft' | 'standard' | 'high';
}

export class CreateCommand {
  /**
   * Handle the /create command
   */
  static async handle(args: string[]): Promise<string> {
    // Join all arguments to form the prompt
    const prompt = args.join(' ').trim();
    
    if (!prompt) {
      return this.showHelp();
    }

    // Validate arguments
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return `❌ ${validation.error}`;
    }

    try {
      // Show loading indicator
      process.stdout.write('🎨 Generating image... ');
      
      // Generate the image
      const imageUrl = await generateImage(prompt);
      
      // Clear the loading indicator and show result
      process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear line
      
      return `🖼️  Image generated successfully!\n\n📎 URL: ${imageUrl}\n\n💡 Prompt: "${prompt}"`;
    } catch (error: any) {
      return `❌ Error generating image: ${error.message}`;
    }
  }

  /**
   * Show help information for the /create command
   */
  static showHelp(): string {
    return `🎨 /create - Generate images from text prompts

Usage:
  /create <prompt>           Generate an image from a text description

Examples:
  /create a sunset over mountains
  /create a cute robot playing guitar
  /create abstract art with blue and green colors

Note: This is a prototype implementation that returns mock URLs for development.`;
  }

  /**
   * Validate command arguments
   */
  static validateArgs(args: string[]): { valid: boolean; error?: string } {
    if (args.length === 0) {
      return { valid: false, error: 'Prompt is required' };
    }
    
    const prompt = args.join(' ').trim();
    if (prompt.length < 3) {
      return { valid: false, error: 'Prompt must be at least 3 characters long' };
    }
    
    if (prompt.length > 500) {
      return { valid: false, error: 'Prompt must be less than 500 characters' };
    }
    
    return { valid: true };
  }
}
