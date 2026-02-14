# MOCR Service

**Motion Optical Character Recognition Service** - Professional video text extraction and analysis

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.2-blue)](https://www.typescriptlang.org/)

## 🎬 Overview

MOCR Service is a standalone microservice that provides **Motion Optical Character Recognition** capabilities for video content analysis. It combines advanced OCR (Optical Character Recognition) and ASR (Automatic Speech Recognition) technologies to extract and analyze both visual text and audio content from videos.

### Key Features

- **🎥 Video Frame Extraction**: Extracts frames from videos using FFmpeg
- **👁️ Motion OCR**: Performs OCR on video frames with temporal analysis
- **🎤 Audio Transcription**: Converts spoken content to text using Whisper
- **🔄 Content Synchronization**: Time-aligns visual and audio content
- **📊 Scene Analysis**: Detects different types of content and transitions
- **⚡ High Performance**: Configurable processing parameters for optimal performance
- **🔌 RESTful API**: Easy integration with any application
- **📦 Docker Support**: Ready for containerized deployment

## 🚀 Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- FFmpeg installed on your system
- Tesseract OCR installed

### Installation

```bash
# Clone the repository
git clone https://github.com/devonwoodson/MOCR-Service.git
cd MOCR-Service

# Install dependencies
npm install

# Copy environment configuration
cp env.example .env

# Start the service
npm run dev
```

The service will be available at `http://localhost:3001`

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t mocr-service .
docker run -p 3001:3001 mocr-service
```

## 📖 API Documentation

### Base URL
```
http://localhost:3001
```

### Endpoints

#### Health Check
```http
GET /health
```

#### Service Information
```http
GET /info
```

#### Create MOCR Job
```http
POST /jobs
Content-Type: multipart/form-data

Form Data:
- video: Video file (required)
- config: JSON configuration (optional)
```

#### Get Job Status
```http
GET /jobs/{jobId}
```

#### Get All Jobs
```http
GET /jobs?status=completed&limit=10
```

#### Cancel Job
```http
POST /jobs/{jobId}/cancel
```

#### Delete Job
```http
DELETE /jobs/{jobId}
```

#### Get Service Statistics
```http
GET /stats
```

### Configuration Options

```json
{
  "maxFrames": 50,
  "frameInterval": 2,
  "frameQuality": 5,
  "ocrLanguage": "eng",
  "ocrMinConfidence": 30,
  "ocrTimeout": 30000,
  "asrLanguage": "en",
  "asrModel": "base",
  "asrTimeout": 60000,
  "enableTemporalAnalysis": true,
  "enableSceneDetection": true,
  "enableTextTracking": true,
  "enableSynchronization": true,
  "enableContentSummarization": true
}
```

## 💻 Client SDK

### JavaScript/TypeScript

```typescript
import { MOCRClient } from 'mocr-service';

const client = new MOCRClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'your-api-key' // optional
});

// Analyze a video file
const result = await client.analyzeVideo(videoFile, {
  maxFrames: 30,
  frameInterval: 2,
  ocrLanguage: 'eng',
  asrLanguage: 'en'
});

console.log('Analysis result:', result);
```

### cURL Example

```bash
# Create a job
curl -X POST http://localhost:3001/jobs \
  -F "video=@sample.mp4" \
  -F 'config={"maxFrames": 30, "frameInterval": 2}'

# Get job status
curl http://localhost:3001/jobs/{jobId}

# Get service stats
curl http://localhost:3001/stats
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `MOCR_MAX_FRAMES` | `50` | Maximum frames to process |
| `MOCR_FRAME_INTERVAL` | `2` | Seconds between frames |
| `MOCR_OCR_LANGUAGE` | `eng` | OCR language |
| `MOCR_ASR_LANGUAGE` | `en` | ASR language |
| `MOCR_MAX_FILE_SIZE` | `104857600` | Max file size (100MB) |
| `MOCR_PROCESSING_TIMEOUT` | `300000` | Processing timeout (5min) |

### Supported Video Formats

- **MP4** (H.264, H.265)
- **AVI** (various codecs)
- **MOV** (QuickTime)
- **MKV** (Matroska)
- **WebM** (VP8, VP9)
- **FLV** (Flash Video)
- **WMV** (Windows Media)
- **M4V** (iTunes)
- **3GP** (Mobile)
- **OGV** (Ogg Video)

### Supported Languages

#### OCR Languages
- English (`eng`)
- Spanish (`spa`)
- French (`fra`)
- German (`deu`)
- And many more...

#### ASR Languages
- English (`en`)
- Spanish (`es`)
- French (`fr`)
- German (`de`)
- And many more...

## 📊 Response Format

### Job Response
```json
{
  "success": true,
  "job": {
    "id": "mocr_1234567890_abc123",
    "status": "completed",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "startedAt": "2024-01-01T00:00:01.000Z",
    "completedAt": "2024-01-01T00:02:30.000Z",
    "fileInfo": {
      "name": "sample.mp4",
      "size": 10485760,
      "type": "video/mp4"
    },
    "progress": {
      "current": 100,
      "total": 100,
      "stage": "Completed"
    },
    "result": {
      "success": true,
      "videoMetadata": {
        "width": 1920,
        "height": 1080,
        "duration": 120.5,
        "fps": 30,
        "codec": "h264",
        "format": "mp4",
        "size": 10485760
      },
      "mocrAnalysis": {
        "framesProcessed": 30,
        "textExtracted": 1250,
        "averageConfidence": 92.5,
        "processingTime": 45000,
        "textContent": [...],
        "temporalAnalysis": {...}
      },
      "asrAnalysis": {
        "wordsTranscribed": 180,
        "averageConfidence": 88.3,
        "processingTime": 30000,
        "language": "en",
        "segments": [...]
      },
      "synchronizedContent": [...],
      "contentSummary": {...},
      "processingTime": 150000
    }
  }
}
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │    │   MOCR Service  │    │   FFmpeg        │
│                 │    │                 │    │                 │
│  ┌───────────┐  │    │  ┌───────────┐  │    │  ┌───────────┐  │
│  │ MOCR SDK  │──┼────┼──│ API Server │  │    │  │ Frame     │  │
│  └───────────┘  │    │  └───────────┘  │    │  │ Extraction│  │
│                 │    │        │        │    │  └───────────┘  │
└─────────────────┘    │        │        │    └─────────────────┘
                       │        ▼        │
                       │  ┌───────────┐  │    ┌─────────────────┐
                       │  │ MOCR Core │  │    │   Tesseract     │
                       │  │ Service   │──┼────│   OCR Engine    │
                       │  └───────────┘  │    │                 │
                       │        │        │    └─────────────────┘
                       │        ▼        │
                       │  ┌───────────┐  │    ┌─────────────────┐
                       │  │ Video     │  │    │   Whisper       │
                       │  │ Analysis  │──┼────│   ASR Engine    │
                       │  │ Pipeline  │  │    │                 │
                       │  └───────────┘  │    └─────────────────┘
                       └─────────────────┘
```

## 🔒 Security

- **API Key Authentication**: Optional API key protection
- **Rate Limiting**: Configurable request rate limits
- **CORS Protection**: Configurable cross-origin policies
- **File Validation**: Strict file type and size validation
- **Input Sanitization**: All inputs are validated and sanitized

## 📈 Performance

### Benchmarks

| Video Duration | Resolution | Processing Time | Frames Processed |
|----------------|------------|-----------------|------------------|
| 1 minute       | 720p       | ~30 seconds     | 30 frames        |
| 5 minutes      | 1080p      | ~2 minutes      | 150 frames       |
| 10 minutes     | 4K         | ~5 minutes      | 300 frames       |

### Optimization Tips

1. **Adjust frame intervals** based on content type
2. **Limit maximum frames** for faster processing
3. **Use appropriate OCR language** for better accuracy
4. **Enable caching** for repeated analysis
5. **Scale horizontally** for high-volume processing

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 📝 Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Generate documentation
npm run docs
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **FFmpeg** - Video processing
- **Tesseract.js** - OCR engine
- **Whisper** - Speech recognition
- **Express.js** - Web framework
- **TypeScript** - Type safety

## 📞 Support

- **Documentation**: [GitHub Wiki](https://github.com/devonwoodson/MOCR-Service/wiki)
- **Issues**: [GitHub Issues](https://github.com/devonwoodson/MOCR-Service/issues)
- **Discussions**: [GitHub Discussions](https://github.com/devonwoodson/MOCR-Service/discussions)

---

**MOCR Service** - Making video content searchable and accessible through advanced text extraction and analysis.
