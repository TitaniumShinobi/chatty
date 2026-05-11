#!/usr/bin/env python3
"""
Local transcription via faster-whisper. Reads an audio file path from argv,
transcribes with the configured model, prints the combined transcript to stdout.
Exit 0 on success; non-zero and stderr on failure.
"""
import sys
import os

def main():
    if len(sys.argv) < 2:
        print("Usage: transcribe_faster_whisper.py <path_to_audio.wav> [language]", file=sys.stderr)
        sys.exit(1)
    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2].strip() else None  # e.g. "en" for English
    if not os.path.isfile(audio_path):
        print(f"Not a file: {audio_path}", file=sys.stderr)
        sys.exit(1)

    model_name = os.environ.get("FASTER_WHISPER_MODEL", "small")
    device = os.environ.get("FASTER_WHISPER_DEVICE", "cpu")
    compute_type = os.environ.get("FASTER_WHISPER_COMPUTE_TYPE", "int8")

    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        print(
            "faster-whisper not installed. Install with: pip install faster-whisper",
            file=sys.stderr,
        )
        print(str(e), file=sys.stderr)
        sys.exit(1)

    try:
        model = WhisperModel(model_name, device=device, compute_type=compute_type)
        kwargs = {"language": language} if language else {}
        segments, _ = model.transcribe(audio_path, **kwargs)
        text = " ".join(s.text.strip() for s in segments if s.text).strip()
        if os.environ.get("DEBUG_VOICE"):
            print(f"[faster-whisper] model={model_name} device={device} compute_type={compute_type}", file=sys.stderr)
        print(text)
    except Exception as e:
        print(f"Transcription failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
