import json
import os
import sys
import wave

import webrtcvad


def read_frames(path, frame_ms):
    with wave.open(path, "rb") as wf:
        sample_rate = wf.getframerate()
        channels = wf.getnchannels()
        width = wf.getsampwidth()
        if channels != 1:
            raise ValueError("VAD expects mono audio")
        if sample_rate not in (8000, 16000, 32000, 48000):
            raise ValueError(f"Unsupported sample rate for VAD: {sample_rate}")

        frame_bytes = int(sample_rate * (frame_ms / 1000.0) * width)
        frames = []
        while True:
            data = wf.readframes(frame_bytes // width)
            if not data:
                break
            if len(data) != frame_bytes:
                break
            frames.append(data)
        return frames, sample_rate


def main():
    if len(sys.argv) < 2:
        print("Usage: vad.py <wav_path>", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    if not os.path.isfile(path):
        print(json.dumps({"error": "missing_file"}))
        sys.exit(1)

    mode = int(os.environ.get("VAD_MODE", "3"))
    frame_ms = int(os.environ.get("VAD_FRAME_MS", "30"))
    min_voice_ms = int(os.environ.get("VAD_MIN_VOICE_MS", "400"))

    vad = webrtcvad.Vad(mode)
    try:
        frames, sample_rate = read_frames(path, frame_ms)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

    voiced_indices = []
    for idx, frame in enumerate(frames):
        try:
            if vad.is_speech(frame, sample_rate):
                voiced_indices.append(idx)
        except Exception:
            continue

    if not voiced_indices:
        print(json.dumps({"hasSpeech": False, "voicedMs": 0}))
        return

    first = min(voiced_indices)
    last = max(voiced_indices)
    voiced_ms = len(voiced_indices) * frame_ms
    start_ms = first * frame_ms
    end_ms = (last + 1) * frame_ms
    ok = voiced_ms >= min_voice_ms
    print(
        json.dumps(
            {
                "hasSpeech": ok,
                "voicedMs": voiced_ms,
                "startMs": start_ms,
                "endMs": end_ms,
                "frameMs": frame_ms,
                "sampleRate": sample_rate,
            }
        )
    )


if __name__ == "__main__":
    main()
