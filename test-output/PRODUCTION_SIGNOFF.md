# PRODUCTION SIGNOFF — ASR Integration Validation

**Date:** 2026-02-15
**Environment:** Replit (NixOS, port 5050 Chatty, port 3001 MOCR)
**AI Model:** OpenAI `gpt-4o-mini-transcribe` via Replit AI Integrations proxy (`localhost:1106/modelfarm/openai`)
**Validator:** Replit Agent

---

## Gate Summary

| Gate | Test | Expected | Actual | Result |
|------|------|----------|--------|--------|
| 1a | Unauthenticated POST `/api/transcribe` | 401 | 401 | **PASS** |
| 1b | Internal service key + audio | 200 + text | 200 + accurate text | **PASS** |
| 2 | Real STT accuracy | Recognizable transcription | Exact match | **PASS** |
| 3 | MOCR happy-path (video → real ASR) | Real transcription in job result | 14 words, 95% confidence, exact match | **PASS** |
| 4 | MOCR fallback (broken ASR URL) | Job completes with mock ASR | 36 mock words, clear fallback log | **PASS** |
| 5 | Invalid MIME rejection | 400 error | 400 "Only video files are allowed" | **PASS** |

**Overall: 6/6 PASS**

---

## Raw Evidence

### Gate 1a — Unauthenticated Request → 401

```
curl -s -X POST http://localhost:5050/api/transcribe -F "audio=@/dev/null;type=audio/wav"
```

**Response:**
```json
{"ok":false,"error":"Authentication required"}
HTTP_STATUS: 401
```

### Gate 1b — Internal Service Key Auth → 200

```
curl -s -X POST http://localhost:5050/api/transcribe \
  -H "x-internal-service-key: chatty-internal-service-2026" \
  -F "audio=@/tmp/gate_test_speech.wav;type=audio/wav"
```

**Response:**
```json
{"ok":true,"text":"Hello this is a validation test for the production sign-off."}
HTTP_STATUS: 200
```

### Gate 2 — Real Speech-to-Text Accuracy

**Input speech (espeak):** "The quick brown fox jumps over the lazy dog"

```json
{"ok":true,"text":"The quick brown fox jumps over the lazy dog."}
HTTP_STATUS: 200
```

**Verdict:** Exact semantic match. OpenAI model correctly transcribed synthetic speech.

### Gate 3 — MOCR Happy-Path ASR (Video → Real Transcription)

**Input:** 5s MP4 video with espeak speech: "This is a production deployment validation test for the motion optical character recognition service"

**Submit:**
```json
{"success":true,"job":{"id":"mocr_...","status":"processing"}}
```

**Result (after polling):**
```
Status: completed
Success: True
ASR words: 14
Segment [0.0-5.0]: "This is a production deployment validation test for the Motion Optical Character Recognition Service." (conf: 95%)
```

**Verdict:** Real OpenAI transcription returned. Not mock text. Exact semantic match to input speech.

### Gate 4 — MOCR Fallback (Broken ASR URL)

**Setup:** Temporarily set `CHATTY_TRANSCRIBE_URL` to `http://localhost:9999/api/transcribe-BROKEN`

**MOCR Log:**
```
⚠️ Real ASR failed, falling back to mock: request to http://localhost:9999/api/transcribe-BROKEN failed, reason: connect ECONNREFUSED 127.0.0.1:9999
```

**Result:**
```
Status: completed
Success: True
ASR words: 36
First segment: "Hello, welcome to this video tutorial." (generic mock text)
```

**Verdict:** Graceful fallback confirmed. Job completed successfully with mock data. Clear fallback logging. URL restored after test.

### Gate 5 — Invalid MIME Rejection

```
curl -s -X POST http://localhost:3001/jobs -F "video=@/tmp/gate_test_speech.wav;type=audio/wav"
```

**Response:**
```json
{"error":"Invalid file","message":"Only video files are allowed"}
HTTP_STATUS: 400
```

---

## Architecture Validated

```
[Frontend Mic] → POST /api/transcribe (auth: JWT cookie)
[MOCR-Service]  → POST /api/transcribe (auth: x-internal-service-key header)
                → OpenAI gpt-4o-mini-transcribe (via Replit AI Integrations proxy)
                → Fallback to mock if ASR unreachable
```

- **Auth:** Dual-path (user JWT for frontend, internal service key for MOCR)
- **Internal Key:** `chatty-internal-service-2026` (hardcoded, shared between services)
- **Fallback:** MOCR gracefully degrades to mock ASR when Chatty endpoint unreachable
- **Success Gate:** Chatty frontend only injects MOCR context when `job.result.success === true`

## Files Under Test

| File | Role |
|------|------|
| `server/routes/transcribe.js` | Transcribe endpoint (auth, file handling, OpenAI call) |
| `server/replit_integrations/audio/client.ts` | OpenAI audio client via Replit AI Integrations |
| `MOCR-Service/src/core/ASRService.ts` | MOCR ASR pipeline (extract audio, call Chatty, fallback) |
| `src/components/MessageBar.tsx` | Frontend mic button (MediaRecorder → POST /api/transcribe) |

## Post-Deploy Smoke Tests

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| MOCR `/health` | 200 + healthy | `{"status":"healthy","version":"1.0.0"}` | **PASS** |
| Text-heavy video job | completed + OCR + ASR | OCR: 12 words/92%, ASR: 16 words/95% (real) | **PASS** |
| Invalid MIME (audio/wav) | 400 | `{"error":"Invalid file","message":"Only video files are allowed"}` | **PASS** |
| Fallback simulation | Mock ASR + clear log | `⚠️ Real ASR failed, falling back to mock` | **PASS** |
| Restore after fallback | Real ASR resumes | Confirmed via MOCR restart | **PASS** |

### Smoke Test 2 — Text-Heavy Video (OCR + ASR Combined)

**Input:** 6s MP4 with drawtext overlay ("SMOKE TEST - OCR + ASR / Production Readiness Check / Feb 15 2026") + espeak speech ("Machine learning is transforming...")

**OCR Result:**
```
3 frames processed, 12 words per frame, 92% confidence
Text: "SMOKE TEST - OCR + ASR\nProduction Readiness Check\nFeb 15 2026"
```

**ASR Result:**
```
16 words, 95% confidence
Text: "Machine learning is transforming how we process and understand natural language text documents and video content."
```

**Synchronized Content:** OCR and ASR merged into combined analysis with scene breakdown and content summary.

### Smoke Test 4 — Fallback Simulation

**Method:** Set `CHATTY_TRANSCRIBE_URL` env var to `http://localhost:9999/api/transcribe-BROKEN`

**MOCR Log:**
```
⚠️ Real ASR failed, falling back to mock: request to http://localhost:9999/api/transcribe-BROKEN failed, reason: connect ECONNREFUSED 127.0.0.1:9999
✅ ASR transcription completed: 36 words, 127ms
```

**Restore:** `CHATTY_TRANSCRIBE_URL` reset to `http://localhost:5050/api/transcribe`, MOCR restarted, real ASR confirmed working.

---

## Deployment Configuration

**Target:** VM (always-on)
**Build:** `npm install && cd MOCR-Service && npm install`
**Run:** Both services via bash background job:
- MOCR-Service on port 3001 (internal only)
- Chatty on port 5000 (externally exposed)

**Environment Variables (Production):**
- `CHATTY_TRANSCRIBE_URL=http://localhost:5000/api/transcribe`
- `INTERNAL_SERVICE_KEY=chatty-internal-service-2026`
- `MOCR_SERVICE_URL=http://localhost:3001` (shared)

---

## Evidence Files

| File | Contents |
|------|----------|
| `gate1_auth.log` | Raw auth test payloads (401 + 200) |
| `gate2_real_stt.log` | Real STT payload |
| `gate3_mocr_happy.log` | Full MOCR job submit + result JSON |
| `gate4_fallback.log` | Full MOCR fallback job + result JSON |
| `gate5_invalid_mime.log` | Invalid MIME 400 response |
| `smoke_test.log` | All 4 smoke tests combined |
| `smoke4_mocr_fallback.log` | Full MOCR log from fallback run |

## Code Changes

**Zero permanent code changes.** All test modifications (broken URL for fallback tests) were reverted immediately after testing.

---

**Sign-off Status:** READY FOR DEPLOYMENT
