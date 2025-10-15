/**
 * Video Frame Extraction Service
 * Extracts frames from video files for OCR processing
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

export interface VideoFrame {
  timestamp: number;
  frameNumber: number;
  imageData: Buffer;
  width: number;
  height: number;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
  format: string;
  size: number;
}

export interface FrameExtractionOptions {
  maxFrames?: number;
  interval?: number; // seconds between frames
  quality?: number; // 1-31, lower = better quality
  startTime?: number; // start time in seconds
  endTime?: number; // end time in seconds
  thumbnailOnly?: boolean; // extract only a single thumbnail
}

export class VideoFrameExtractor {
  private static readonly DEFAULT_MAX_FRAMES = 50;
  private static readonly DEFAULT_INTERVAL = 2; // 2 seconds
  private static readonly DEFAULT_QUALITY = 5;
  private static readonly SUPPORTED_FORMATS = [
    'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v', '3gp', 'ogv'
  ];

  /**
   * Extract frames from a video file
   */
  static async extractFrames(
    videoPath: string,
    options: FrameExtractionOptions = {}
  ): Promise<VideoFrame[]> {
    const {
      maxFrames = this.DEFAULT_MAX_FRAMES,
      interval = this.DEFAULT_INTERVAL,
      quality = this.DEFAULT_QUALITY,
      startTime = 0,
      endTime,
      thumbnailOnly = false
    } = options;

    return new Promise((resolve, reject) => {
      const frames: VideoFrame[] = [];
      let frameCount = 0;
      const tempDir = path.join(process.cwd(), 'temp-frames');
      
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const command = ffmpeg(videoPath)
        .on('start', (commandLine) => {
          console.log(`🎬 Starting frame extraction: ${commandLine}`);
        })
        .on('progress', (progress) => {
          console.log(`📊 Frame extraction progress: ${progress.percent}%`);
        })
        .on('error', (err) => {
          console.error('❌ Frame extraction error:', err);
          reject(err);
        })
        .on('end', async () => {
          try {
            // Process extracted frames
            const frameFiles = fs.readdirSync(tempDir)
              .filter(file => file.endsWith('.jpg'))
              .sort((a, b) => {
                const aNum = parseInt(a.match(/\d+/)?.[0] || '0');
                const bNum = parseInt(b.match(/\d+/)?.[0] || '0');
                return aNum - bNum;
              });

            for (const frameFile of frameFiles) {
              if (frameCount >= maxFrames) break;

              const framePath = path.join(tempDir, frameFile);
              const imageData = fs.readFileSync(framePath);
              
              // Get frame metadata
              const frameNumber = parseInt(frameFile.match(/\d+/)?.[0] || '0');
              const timestamp = startTime + (frameNumber * interval);

              // Load image to get dimensions
              const image = await loadImage(imageData);
              
              frames.push({
                timestamp,
                frameNumber,
                imageData,
                width: image.width,
                height: image.height
              });

              frameCount++;
            }

            // Clean up temp files
            this.cleanupTempFiles(tempDir);

            console.log(`✅ Extracted ${frames.length} frames from video`);
            resolve(frames);
          } catch (error) {
            reject(error);
          }
        });

      // Configure frame extraction
      if (thumbnailOnly) {
        // Extract single thumbnail at 50% of video duration
        command
          .seekInput('50%')
          .frames(1)
          .output(path.join(tempDir, 'thumbnail_%d.jpg'))
          .run();
      } else {
        // Extract frames at intervals
        command
          .seekInput(startTime)
          .inputOptions([`-vf`, `fps=1/${interval}`])
          .outputOptions([`-q:v`, quality.toString()])
          .output(path.join(tempDir, 'frame_%d.jpg'))
          .run();
      }

      // Set end time if specified
      if (endTime) {
        command.duration(endTime - startTime);
      }
    });
  }

  /**
   * Extract a single thumbnail from video
   */
  static async extractThumbnail(
    videoPath: string,
    timestamp: number = 0
  ): Promise<VideoFrame> {
    const frames = await this.extractFrames(videoPath, {
      thumbnailOnly: true,
      startTime: timestamp,
      maxFrames: 1
    });

    if (frames.length === 0) {
      throw new Error('Failed to extract thumbnail from video');
    }

    return frames[0];
  }

  /**
   * Get video metadata
   */
  static async getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        const fileStats = fs.statSync(videoPath);

        resolve({
          duration: parseFloat(metadata.format.duration || '0'),
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps: this.parseFPS(videoStream.r_frame_rate || '0/1'),
          bitrate: parseInt(metadata.format.bit_rate || '0'),
          codec: videoStream.codec_name || 'unknown',
          format: metadata.format.format_name || 'unknown',
          size: fileStats.size
        });
      });
    });
  }

  /**
   * Check if file is a supported video format
   */
  static isVideoFile(file: File): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension ? this.SUPPORTED_FORMATS.includes(extension) : false;
  }

  /**
   * Get supported video formats
   */
  static getSupportedFormats(): string[] {
    return [...this.SUPPORTED_FORMATS];
  }

  /**
   * Convert video to base64 for browser processing
   */
  static async videoToBase64(videoPath: string): Promise<string> {
    const videoData = fs.readFileSync(videoPath);
    return `data:video/mp4;base64,${videoData.toString('base64')}`;
  }

  /**
   * Create a video preview from frames
   */
  static async createVideoPreview(
    frames: VideoFrame[],
    outputPath: string,
    fps: number = 1
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tempDir = path.join(process.cwd(), 'temp-preview');
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Save frames as images
      const framePaths: string[] = [];
      frames.forEach((frame, index) => {
        const framePath = path.join(tempDir, `preview_${index.toString().padStart(4, '0')}.jpg`);
        fs.writeFileSync(framePath, frame.imageData);
        framePaths.push(framePath);
      });

      // Create video from frames
      const command = ffmpeg()
        .input(path.join(tempDir, 'preview_%04d.jpg'))
        .inputFPS(fps)
        .outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p'])
        .output(outputPath)
        .on('end', () => {
          this.cleanupTempFiles(tempDir);
          resolve();
        })
        .on('error', (err) => {
          this.cleanupTempFiles(tempDir);
          reject(err);
        });

      command.run();
    });
  }

  /**
   * Parse FPS from ffmpeg format (e.g., "30/1" -> 30)
   */
  private static parseFPS(fpsString: string): number {
    const [numerator, denominator] = fpsString.split('/').map(Number);
    return denominator ? numerator / denominator : 0;
  }

  /**
   * Clean up temporary files
   */
  private static cleanupTempFiles(dir: string): void {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          fs.unlinkSync(path.join(dir, file));
        });
        fs.rmdirSync(dir);
      }
    } catch (error) {
      console.warn('Warning: Could not clean up temp files:', error);
    }
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Format duration for display
   */
  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }
}
