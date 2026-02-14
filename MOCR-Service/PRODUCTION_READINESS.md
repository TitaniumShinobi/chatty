# MOCR Production Readiness / Merge Gates

## Merge/Ship Gates (Must Pass)

| Gate | Expected | Verified |
|------|----------|----------|
| **Text-heavy clip** | `status=completed`, `result.success=true`, `mocrAnalysis.textContent.length > 0`, summary non-empty | ⬜ |
| **Invalid MIME upload** | `400` with clear error message | ⬜ |
| **Forced pipeline error** | `status=failed`, `job.error` populated | ⬜ |
| **Two concurrent uploads** | No temp-file collision, both jobs complete independently | ⬜ |
| **Chatty integration** | Only inject context when `result.success===true` (ignore failed envelopes) | ⬜ |

---

## Chatty Integration Rule

> **Only inject context when `result.success === true`**  
> Ignore failed envelopes. Do not surface `job.result` when `result.success === false`.

---

## Canonical Payload Shapes (for sign-off verification)

### POST /jobs — 201 Created (text-heavy clip)

```json
{
  "success": true,
  "job": {
    "id": "mocr_<timestamp>_<random>",
    "status": "pending",
    "createdAt": "<ISO8601>",
    "fileInfo": {
      "name": "video.mp4",
      "size": <bytes>,
      "type": "video/mp4"
    },
    "config": {},
    "progress": {
      "current": 0,
      "total": 100,
      "stage": "Initializing"
    }
  }
}
```

### GET /jobs/:id — 200 (final, completed, text-heavy clip)

```json
{
  "success": true,
  "job": {
    "id": "mocr_<timestamp>_<random>",
    "status": "completed",
    "createdAt": "<ISO8601>",
    "startedAt": "<ISO8601>",
    "completedAt": "<ISO8601>",
    "fileInfo": {
      "name": "video.mp4",
      "size": <bytes>,
      "type": "video/mp4"
    },
    "config": {},
    "progress": {
      "current": 100,
      "total": 100,
      "stage": "Completed"
    },
    "error": null,
    "result": {
      "success": true,
      "jobId": "<same as id>",
      "videoMetadata": {
        "duration": <seconds>,
        "width": <int>,
        "height": <int>,
        "fps": <number>,
        "bitrate": <int>,
        "codec": "<string>",
        "format": "<string>",
        "size": <bytes>
      },
      "mocrAnalysis": {
        "framesProcessed": <int>,
        "textExtracted": <int>,
        "averageConfidence": <number>,
        "processingTime": <ms>,
        "textContent": [
          {
            "timestamp": <seconds>,
            "frameNumber": <int>,
            "text": "<extracted string>",
            "confidence": <number>,
            "sceneType": "<string>"
          }
        ],
        "temporalAnalysis": {
          "textSegments": [],
          "sceneTransitions": [],
          "textConsistency": []
        }
      },
      "asrAnalysis": {
        "wordsTranscribed": <int>,
        "averageConfidence": <number>,
        "processingTime": <ms>,
        "language": "en",
        "segments": []
      },
      "synchronizedContent": [],
      "contentSummary": {
        "title": "<string or undefined>",
        "description": "<non-empty string>",
        "keyTopics": [],
        "visualElements": [],
        "audioElements": [],
        "sceneBreakdown": []
      },
      "processingTime": <ms>
    }
  }
}
```

**Sign-off criteria for text-heavy clip:**
- `job.status === "completed"`
- `job.result.success === true`
- `job.result.mocrAnalysis.textContent.length > 0`
- `job.result.contentSummary.description` non-empty

---

### Invalid MIME — 400 Bad Request

```json
{
  "error": "Invalid file",
  "message": "Only video files are allowed"
}
```

---

### Forced Pipeline Error — GET /jobs/:id (failed)

```json
{
  "success": true,
  "job": {
    "id": "mocr_...",
    "status": "failed",
    "error": "<error message>",
    "result": {
      "success": false,
      "error": "<error message>"
    }
  }
}
```

---

## Known Risks (Accepted)

- **ASR mocked**: Label as non-authoritative in UI
- **Native deps**: `canvas`/Tesseract stack can break install portability
- **Empty OCR on no-text clips**: Treated as success; low/empty `textContent` is acceptable
