import { VoiceMode } from "./types";

export interface RecorderStartResult {
  stream: MediaStream;
  mediaRecorder: MediaRecorder;
}

export interface RecorderOptions {
  preferHeadset?: boolean;
}

/**
  * Initialize the microphone and MediaRecorder with sensible defaults.
  * Returns the stream and recorder; caller handles events and state.
  */
export async function startRecorder(
  mode: VoiceMode,
  options: RecorderOptions = {}
): Promise<RecorderStartResult> {
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  if (options.preferHeadset && typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      const headset = inputs.find((d) => d.label && /headset|earphone|airpod|bluetooth|external|usb mic/i.test(d.label));
      if (headset?.deviceId) {
        (audioConstraints as MediaTrackConstraints & { deviceId?: ConstrainDOMString }).deviceId = { ideal: headset.deviceId };
      }
    } catch {
      // Fall back to default device
    }
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
  const mediaRecorder = new MediaRecorder(stream, { mimeType });
  return { stream, mediaRecorder };
}
