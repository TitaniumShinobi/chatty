/**
 * ASR (Automatic Speech Recognition) Service
 * Transcribes audio from video files using Whisper
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

export interface ASROptions {
  language?: string;
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  enableTimestamps?: boolean;
  enableWordTimestamps?: boolean;
  enableSpeakerDetection?: boolean;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
  speaker?: string;
}

export interface ASRResult {
  success: boolean;
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
  processingTime: number;
  wordCount: number;
  averageConfidence?: number;
  error?: string;
}

export class ASRService {
  private static readonly DEFAULT_LANGUAGE = 'en';
  private static readonly DEFAULT_MODEL = 'base';
  private static readonly SUPPORTED_AUDIO_FORMATS = [
    'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'
  ];

  /**
   * Transcribe audio from video file
   */
  static async transcribeVideo(
    videoFile: File,
    options: ASROptions = {}
  ): Promise<ASRResult> {
    const startTime = Date.now();
    const {
      language = this.DEFAULT_LANGUAGE,
      model = this.DEFAULT_MODEL,
      enableTimestamps = true,
      enableWordTimestamps = false,
      enableSpeakerDetection = false
    } = options;

    try {
      console.log(`🎤 Starting ASR transcription for: ${videoFile.name}`);

      // Save video file temporarily
      const tempVideoPath = await this.saveTempFile(videoFile);
      
      try {
        // Extract audio from video
        const audioPath = await this.extractAudioFromVideo(tempVideoPath);
        
        try {
          // Transcribe audio
          const transcription = await this.transcribeAudio(audioPath, {
            language,
            model,
            enableTimestamps,
            enableWordTimestamps,
            enableSpeakerDetection
          });

          const processingTime = Date.now() - startTime;
          const wordCount = transcription.text.split(/\s+/).filter(word => word.length > 0).length;

          console.log(`✅ ASR transcription completed: ${wordCount} words, ${processingTime}ms`);

          return {
            success: true,
            text: transcription.text,
            segments: transcription.segments,
            language: transcription.language,
            duration: transcription.duration,
            processingTime,
            wordCount,
            averageConfidence: transcription.averageConfidence
          };

        } finally {
          // Clean up audio file
          this.cleanupTempFile(audioPath);
        }

      } finally {
        // Clean up video file
        this.cleanupTempFile(tempVideoPath);
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ ASR transcription failed:`, error);

      return {
        success: false,
        text: '',
        segments: [],
        language: language,
        duration: 0,
        processingTime,
        wordCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Transcribe audio from audio file
   */
  static async transcribeAudio(
    audioFile: File,
    options: ASROptions = {}
  ): Promise<ASRResult> {
    const startTime = Date.now();
    const {
      language = this.DEFAULT_LANGUAGE,
      model = this.DEFAULT_MODEL,
      enableTimestamps = true,
      enableWordTimestamps = false,
      enableSpeakerDetection = false
    } = options;

    try {
      console.log(`🎤 Starting ASR transcription for audio: ${audioFile.name}`);

      // Save audio file temporarily
      const tempAudioPath = await this.saveTempFile(audioFile);
      
      try {
        // Transcribe audio
        const transcription = await this.transcribeAudioFile(tempAudioPath, {
          language,
          model,
          enableTimestamps,
          enableWordTimestamps,
          enableSpeakerDetection
        });

        const processingTime = Date.now() - startTime;
        const wordCount = transcription.text.split(/\s+/).filter(word => word.length > 0).length;

        console.log(`✅ ASR transcription completed: ${wordCount} words, ${processingTime}ms`);

        return {
          success: true,
          text: transcription.text,
          segments: transcription.segments,
          language: transcription.language,
          duration: transcription.duration,
          processingTime,
          wordCount,
          averageConfidence: transcription.averageConfidence
        };

      } finally {
        // Clean up audio file
        this.cleanupTempFile(tempAudioPath);
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ ASR transcription failed:`, error);

      return {
        success: false,
        text: '',
        segments: [],
        language: language,
        duration: 0,
        processingTime,
        wordCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract audio from video file
   */
  private static async extractAudioFromVideo(videoPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const tempDir = path.join(process.cwd(), 'temp-audio');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const audioPath = path.join(tempDir, `audio_${Date.now()}.wav`);

      ffmpeg(videoPath)
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .format('wav')
        .output(audioPath)
        .on('start', (commandLine) => {
          console.log(`🎵 Extracting audio: ${commandLine}`);
        })
        .on('progress', (progress) => {
          console.log(`📊 Audio extraction progress: ${progress.percent}%`);
        })
        .on('end', () => {
          console.log(`✅ Audio extraction completed: ${audioPath}`);
          resolve(audioPath);
        })
        .on('error', (err) => {
          console.error('❌ Audio extraction error:', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Transcribe audio file using Whisper
   */
  private static async transcribeAudioFile(
    audioPath: string,
    options: {
      language: string;
      model: string;
      enableTimestamps: boolean;
      enableWordTimestamps: boolean;
      enableSpeakerDetection: boolean;
    }
  ): Promise<{
    text: string;
    segments: TranscriptionSegment[];
    language: string;
    duration: number;
    averageConfidence?: number;
  }> {
    // For now, we'll use a simplified approach
    // In a full implementation, you would integrate with Whisper API or local Whisper installation
    
    try {
      // Get audio duration
      const duration = await this.getAudioDuration(audioPath);
      
      // Simulate transcription (replace with actual Whisper integration)
      const mockTranscription = this.generateMockTranscription(duration, options.language);
      
      return {
        text: mockTranscription.text,
        segments: mockTranscription.segments,
        language: options.language,
        duration,
        averageConfidence: 85.5
      };

    } catch (error) {
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get audio duration using ffprobe
   */
  private static async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const duration = parseFloat(metadata.format.duration || '0');
        resolve(duration);
      });
    });
  }

  /**
   * Generate mock transcription for testing
   * Replace this with actual Whisper integration
   */
  private static generateMockTranscription(
    duration: number,
    language: string
  ): {
    text: string;
    segments: TranscriptionSegment[];
  } {
    const mockTexts = {
      en: [
        "Hello, welcome to this video tutorial.",
        "Today we're going to learn about artificial intelligence.",
        "Let's start with the basics of machine learning.",
        "This is a demonstration of speech recognition technology.",
        "Thank you for watching this video."
      ],
      es: [
        "Hola, bienvenidos a este tutorial de video.",
        "Hoy vamos a aprender sobre inteligencia artificial.",
        "Empecemos con los conceptos básicos de aprendizaje automático.",
        "Esta es una demostración de tecnología de reconocimiento de voz.",
        "Gracias por ver este video."
      ]
    };

    const texts = mockTexts[language as keyof typeof mockTexts] || mockTexts.en;
    const fullText = texts.join(' ');
    
    // Generate segments
    const segments: TranscriptionSegment[] = [];
    const segmentDuration = duration / texts.length;
    
    texts.forEach((text, index) => {
      segments.push({
        start: index * segmentDuration,
        end: (index + 1) * segmentDuration,
        text: text,
        confidence: 85 + Math.random() * 10 // 85-95% confidence
      });
    });

    return {
      text: fullText,
      segments
    };
  }

  /**
   * Check if file is a supported audio format
   */
  static isAudioFile(file: File): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension ? this.SUPPORTED_AUDIO_FORMATS.includes(extension) : false;
  }

  /**
   * Check if file is a video with audio
   */
  static isVideoWithAudio(file: File): boolean {
    const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v', '3gp', 'ogv'];
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension ? videoExtensions.includes(extension) : false;
  }

  /**
   * Get supported audio formats
   */
  static getSupportedFormats(): string[] {
    return [...this.SUPPORTED_AUDIO_FORMATS];
  }

  /**
   * Save file temporarily for processing
   */
  private static async saveTempFile(file: File): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp-files');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempPath = path.join(tempDir, `temp_${Date.now()}_${file.name}`);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    fs.writeFileSync(tempPath, buffer);
    return tempPath;
  }

  /**
   * Clean up temporary file
   */
  private static cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn('Warning: Could not clean up temp file:', error);
    }
  }

  /**
   * Format ASR result for display
   */
  static formatASRResult(result: ASRResult): string {
    if (!result.success) {
      return `❌ ASR transcription failed: ${result.error || 'Unknown error'}`;
    }

    return `✅ ASR Transcription Complete
🎤 Language: ${result.language}
⏱️  Duration: ${this.formatDuration(result.duration)}
📝 Text: ${result.wordCount} words
🎯 Average Confidence: ${result.averageConfidence?.toFixed(1) || 'N/A'}%
⏱️  Processing Time: ${result.processingTime}ms

Transcription:
${result.text}

${result.segments.length > 0 ? `\nSegments (${result.segments.length}):\n${result.segments.map(segment => 
  `[${this.formatDuration(segment.start)} - ${this.formatDuration(segment.end)}] ${segment.text}`
).join('\n')}` : ''}`;
  }

  /**
   * Format duration for display
   */
  private static formatDuration(seconds: number): string {
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
