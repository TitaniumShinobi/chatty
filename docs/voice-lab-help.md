# Voice Lab

Voice Lab sets the **reference audio** for this construct’s voice (OpenVoice/TTS). You provide one short clip; we check it and save it. No .env, no manual ffmpeg required.

---

## Limits

- **Upload:** WAV, MP3, M4A, OGG, or WebM. Max **100 MB** (long files are supported; use “Pick 25 s slice” to choose a segment).
- **URL:** HTTPS only (e.g. LibriVox, Common Voice). Max **50 MB**, 2‑minute fetch timeout.

---

## Flow

1. **Step 1 — Choose source**  
   Drag and drop a file, paste a URL and click **Fetch**, or pick a **Starter voice** (no upload).

2. **Step 2 — Quality check**  
   We show duration, channels, sample rate, and loudness. Clip must **Pass** (20–30 s, mono or converted, loudness in range) before Save is enabled.  
   If the file is **longer than 30 s**, use **Pick 25 s slice** to choose a start time (seconds); we extract 25 s from that point and re-run the check.

3. **Step 3 — Save and preview**  
   Click **Save as [construct name]**. Then use **Play sample** to hear the saved voice.

---

## Long files (e.g. 30 minutes)

Upload or paste the URL as usual. When the check reports “Clip too long,” the **Pick 25 s slice** button appears (or a modal opens). Enter the start time in **seconds** (e.g. **60** for 1:00). We extract 25 s from that point, run the quality check again, and you can then Save.

---

## Picking a good slice

- **One speaker, steady narration** — Avoid dialogue or multiple voices.
- **Low background noise** — No breaths, page turns, or room noise.
- **Clear and engaged** — A moment where the reader sounds natural and consistent.

Example: for a smooth, intimate tone, try a slice around 1:55–2:20 in a chapter.

---

## Troubleshooting

- **Upload failed / Fetch failed** — Check file size (upload ≤100 MB, URL ≤50 MB) and that the URL is HTTPS.
- **Audit failed / Temp file not found** — Try uploading again; temp files expire after 24 hours.
- **Trim failed** — Start time may be beyond the file end; use a lower value (seconds).
- **Save failed** — Ensure you’re signed in and the construct is saved (has a name/ID).
