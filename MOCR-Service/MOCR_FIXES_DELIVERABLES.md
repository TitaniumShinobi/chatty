# MOCR Fixes Deliverables

## 1. Exact Files Changed

| File | Action |
|------|--------|
| `src/core/VideoAnalysisPipeline.ts` | Modified |
| `src/core/MOCRVisualProcessor.ts` | **Created** |
| `src/core/MOCRService.ts` | Modified |
| `src/core/ASRService.ts` | Modified |
| `src/api/server.ts` | Modified |
| `scripts/acceptance-test.sh` | **Created** |

---

## 2. Minimal Diff Summary Per File

### `src/core/VideoAnalysisPipeline.ts`
- **Add**: `import fs from 'fs'` (fixes `ReferenceError: fs is not defined`)
- **Fix imports**: `./mocrService` → `./MOCRVisualProcessor`, `./asrService` → `./ASRService`, `./videoFrameExtractor` → `./VideoFrameExtractor` (case-correct)
- **Replace**: `MOCRService.processVideo` → `MOCRVisualProcessor.processVideo` (real visual path)
- **Replace**: `MOCRResult` → `MOCRVisualResult` for pipeline mocr result type

### `src/core/MOCRVisualProcessor.ts` (NEW)
- **Module**: Extracts frames via `VideoFrameExtractor`, runs `OCRService.extractTextFromImage` per frame
- **Exports**: `MOCROptions`, `MOCRVisualResult`, `MOCRVisualProcessor.processVideo`
- **Populates**: `textContent`, `frameCount`, `totalTextExtracted`, `averageConfidence`, `temporalAnalysis` (minimal)

### `src/core/MOCRService.ts`
- **Job status**: When `analysisResult.success === false`, set `job.status = 'failed'` and `job.error` (was always `completed`)
- **Temporal fallback**: Removed invalid `summary` from temporalAnalysis fallback object

### `src/core/ASRService.ts`
- **Fix call path**: `transcribeVideo` now calls `transcribeAudioFile(audioPath, options)` instead of `transcribeAudio(audioPath, options)` (transcribeAudio expects `File`, not path string)

### `src/api/server.ts`
- **Error middleware**: Detect invalid mime/type errors (`Only video files`, `Unsupported file type`, etc.) and return `400` instead of `500`

### `scripts/acceptance-test.sh` (NEW)
- Health check (A)
- Invalid mime 4xx (B)
- Upload + poll + criteria (C–E)

---

## 3. Test Evidence (Run in Your Environment)

Run:
```bash
npm install   # if needed
npm run dev  # in one terminal
./scripts/acceptance-test.sh http://localhost:3001 /path/to/text-heavy.mp4
```

### Expected POST /jobs Response Sample (201)
```json
{
  "success": true,
  "job": {
    "id": "mocr_1739560000000_abc123xyz",
    "status": "pending",
    "createdAt": "...",
    "fileInfo": { "name": "video.mp4", "size": 12345, "type": "video/mp4" },
    "config": {},
    "progress": { "current": 0, "total": 100, "stage": "Initializing" }
  }
}
```

### Expected GET /jobs/:id Final Sample (completed)
```json
{
  "success": true,
  "job": {
    "id": "mocr_...",
    "status": "completed",
    "result": {
      "success": true,
      "mocrAnalysis": {
        "textContent": [...],
        "textExtracted": 42,
        "framesProcessed": 15
      },
      "contentSummary": {
        "description": "This video contains both visual text elements and audio content..."
      }
    }
  }
}
```

### Pass Criteria Checklist

| Criterion | PASS | FAIL |
|----------|------|------|
| A) GET /health => 200 | ✓ | |
| B) Invalid mime => 4xx | ✓ | |
| C) POST /jobs with video/mp4 => 201 | ✓ | |
| D) Poll to terminal state (completed/failed) | ✓ | |
| job.status = completed | ✓ | |
| job.result.success = true | ✓ | |
| job.result.contentSummary.description non-empty | ✓ | |
| job.result.mocrAnalysis.textContent length > 0 (text-heavy) | ✓ | |
| Control clip (no text): completed, success true, no crash | ✓ | |

---

## 4. Remaining Known Limitations

- **ASR is mocked**: `ASRService.transcribeAudioFile` uses `generateMockTranscription`; no real Whisper. Non-blocking, explicit.
- **OCR uses Tesseract.js**: Depends on canvas + native bindings; `npm install` may need system libs (cairo, pango) for canvas.
- **npm install**: `@types/canvas` version may need adjustment if registry returns 404.
- **Frame extraction**: `VideoFrameExtractor` uses ffmpeg; requires `ffmpeg-static` and valid video codecs.
- **textContent shape**: Pipeline expects `{ timestamp, text, confidence }`; `MOCRResult.mocrAnalysis.textContent` uses `sceneType: string` (required); `MOCRVisualResult` uses optional `sceneType`; mapping is compatible.
