#!/usr/bin/env bash
# Trim LibriVox Dorian Gray Ch3 (Isabella Garcia) to 25s @ mono 16kHz for Nova.
# Note: Canonical Nova voice in use is Annie Coleman, Pride and Prejudice Ch6 (see docs/voice-options-nova.md).
# This script produces an alternative ref from Dorian Gray if you prefer that tone.
# Run from repo root: ./scripts/make-nova-voice-ref.sh
# Requires: ffmpeg (brew install ffmpeg)

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/resources/voices/dorian_gray_ch03.mp3"
OUT="${ROOT}/resources/voices/nova_ref.wav"

if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC — run: curl -sL -o $SRC 'https://www.archive.org/download/picture_of_dorian_gray_2107_librivox/pictureofdoriangray_03_wilde_128kb.mp3'"
  exit 1
fi

command -v ffmpeg >/dev/null 2>&1 || { echo "Need ffmpeg: brew install ffmpeg"; exit 1; }

# Steady narrative slice 1:55 → 2:20 (25s), mono 16kHz — meets Voice Lab audit
ffmpeg -y -i "$SRC" -ss 00:01:55 -t 25 -ac 1 -ar 16000 "$OUT"
echo "Wrote $OUT — open Voice Lab, select Nova, upload this file (or drag onto the zone), run audit, then Save as Nova."
ls -la "$OUT"
