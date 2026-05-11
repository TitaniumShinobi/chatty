// Client-side TTS helper (browser + premium fallback)
import { resolveSystemVoicePreset } from './systemVoicePresets';

export type VoiceProvider = 'browser' | 'premium';

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

export function isBrowserTtsAvailable(): boolean {
  return isBrowser();
}

let voicesCache: SpeechSynthesisVoice[] = [];
let voicesLoaded = false;

export function listBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isBrowser()) return resolve([]);
    const synth = window.speechSynthesis;
    const done = () => {
      voicesCache = synth.getVoices() || [];
      voicesLoaded = true;
      resolve(voicesCache);
    };
    const vs = synth.getVoices();
    if (vs.length) return done();
    synth.onvoiceschanged = () => done();
    // Fallback timeout
    setTimeout(() => resolve(voicesCache), 1000);
  });
}

export function speakBrowser(text: string, opts?: { voiceName?: string; rate?: number; pitch?: number; volume?: number; lang?: string; }): Promise<void> {
  if (!isBrowser()) return Promise.reject(new Error('Browser TTS not available'));
  return (async () => {
    const synth = window.speechSynthesis;
    if (!voicesLoaded) await listBrowserVoices();
    const utter = new SpeechSynthesisUtterance(text);
    if (opts?.lang) utter.lang = opts.lang;
    if (opts?.rate) utter.rate = opts.rate;
    if (opts?.pitch) utter.pitch = opts.pitch;
    if (opts?.volume) utter.volume = opts.volume;
    if (opts?.voiceName) {
      const voice = voicesCache.find(v => v.name === opts.voiceName);
      if (voice) utter.voice = voice;
    }
    return new Promise<void>((resolve, reject) => {
      utter.onend = () => resolve();
      utter.onerror = (e: SpeechSynthesisErrorEvent) =>
        reject(new Error(e.error || 'speech error'));
      // stop any prior speech
      try {
        synth.cancel();
      } catch (err) {
        void err;
      }
      synth.speak(utter);
    });
  })();
}

const TTS_LAST_PREMIUM_ERROR_KEY = 'ttsLastPremiumError';

export function getTtsLastPremiumError(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TTS_LAST_PREMIUM_ERROR_KEY);
  } catch {
    return null;
  }
}

export function setTtsLastPremiumError(msg: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (msg == null) window.localStorage.removeItem(TTS_LAST_PREMIUM_ERROR_KEY);
    else window.localStorage.setItem(TTS_LAST_PREMIUM_ERROR_KEY, msg);
  } catch {
    void 0;
  }
}

export function saveTtsConfig(config: { enabled: boolean; provider: VoiceProvider; voiceName?: string }): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('voiceModeEnabled', String(config.enabled));
    window.localStorage.setItem('ttsProvider', config.provider);
    if (config.voiceName != null) window.localStorage.setItem('ttsVoiceName', config.voiceName);
    else window.localStorage.removeItem('ttsVoiceName');
  } catch {
    void 0;
  }
}

// Premium reply TTS: OpenVoice-backed synthesis. Construct identity (Zen/Lin/Nova) is chosen by server from threadId; voice/style drive synthesis; speechProfile is metadata only.
export async function speakPremium(
  text: string,
  opts?: {
    voice?: string;
    threadId?: string;
    style?: string;
    speechProfile?: string;
    onAudioElement?: (el: HTMLAudioElement | null) => void;
  },
): Promise<void> {
  const payload: {
    text: string;
    voice?: string;
    provider?: string;
    threadId?: string;
    style?: string;
    speechProfile?: string;
  } = { text, provider: 'openvoice' };
  if (opts?.voice) payload.voice = opts.voice;
  if (opts?.threadId) payload.threadId = opts.threadId;
  if (opts?.style) payload.style = opts.style;
  if (opts?.speechProfile) payload.speechProfile = opts.speechProfile;
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('TTS request failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    opts?.onAudioElement?.(audio);
    await audio.play().catch((e) => {
      opts?.onAudioElement?.(null);
      throw e;
    });
    audio.onended = () => {
      opts?.onAudioElement?.(null);
      URL.revokeObjectURL(url);
    };
    setTtsLastPremiumError(null);
  } catch (err) {
    setTtsLastPremiumError(err instanceof Error ? err.message : 'TTS request failed');
    throw err;
  }
}

export function getSavedTtsConfig() {
  if (typeof window === 'undefined') return { enabled: false, provider: 'browser' as VoiceProvider, voiceName: undefined };
  try {
    const enabled = window.localStorage.getItem('voiceModeEnabled') === 'true';
    const provider = (window.localStorage.getItem('ttsProvider') as VoiceProvider) || 'browser';
    const voiceName = window.localStorage.getItem('ttsVoiceName') || undefined;
    return { enabled, provider, voiceName };
  } catch { return { enabled: false, provider: 'browser' as VoiceProvider, voiceName: undefined }; }
}

/** Voice ids supported for premium/server TTS. Shown in settings when provider is premium; playback uses these as-is. */
export const PREMIUM_VOICE_OPTIONS: { value: string; label: string }[] = [
  { value: 'alloy', label: 'Alloy' },
  { value: 'ash', label: 'Ash' },
  { value: 'ballad', label: 'Ballad' },
  { value: 'coral', label: 'Coral' },
  { value: 'echo', label: 'Echo' },
  { value: 'fable', label: 'Fable' },
  { value: 'nova', label: 'Nova' },
  { value: 'onyx', label: 'Onyx' },
  { value: 'sage', label: 'Sage' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'verse', label: 'Verse' },
];

/** Resolved TTS config for playback: voice name plus optional preset style/speechProfile. */
export type ResolvedTtsForPlayback = {
  enabled: boolean;
  provider: VoiceProvider;
  voiceName?: string;
  style?: string;
  speechProfile?: string;
};

/** Single place for TTS voice resolution. Zen/Lin use preset resolution (openvoiceVoice, style, speechProfile); server picks reference by construct (threadId). */
export function getResolvedTtsForPlayback(
  threadId: string | null | undefined,
  generalSettings: { zenVoice: string; linVoice: string },
  genericConfig: { enabled: boolean; provider: VoiceProvider; voiceName?: string },
): ResolvedTtsForPlayback {
  if (threadId != null && threadId.startsWith('zen-001_chat_with_')) {
    const resolved = resolveSystemVoicePreset('zen', generalSettings.zenVoice);
    return {
      enabled: genericConfig.enabled,
      provider: 'premium',
      voiceName: resolved.openvoiceVoice ?? undefined,
      style: resolved.style ?? undefined,
      speechProfile: resolved.speechProfile ?? undefined,
    };
  }
  if (threadId != null && threadId.startsWith('lin-001_chat_with_')) {
    const resolved = resolveSystemVoicePreset('lin', generalSettings.linVoice);
    return {
      enabled: genericConfig.enabled,
      provider: 'premium',
      voiceName: resolved.openvoiceVoice ?? undefined,
      style: resolved.style ?? undefined,
      speechProfile: resolved.speechProfile ?? undefined,
    };
  }
  if (threadId != null && threadId.startsWith('nova-001_chat_with_')) {
    return {
      enabled: genericConfig.enabled,
      provider: genericConfig.provider,
      voiceName: genericConfig.voiceName ?? 'nova',
    };
  }
  return {
    enabled: genericConfig.enabled,
    provider: genericConfig.provider,
    voiceName: genericConfig.voiceName ?? undefined,
  };
}

/** Voice-mode reply loop: thread-scoped pending so we play only the assistant reply to the voice-submitted turn. */
export type PendingVoiceReply = { threadId: string; lastAssistantMessageId?: string | null };

let pendingVoiceReply: PendingVoiceReply | null = null;

export function setPendingVoiceReplyPlay(threadId: string, lastAssistantMessageId?: string | null): void {
  pendingVoiceReply = { threadId, lastAssistantMessageId: lastAssistantMessageId ?? undefined };
}

export function getPendingVoiceReplyPlay(): PendingVoiceReply | null {
  return pendingVoiceReply;
}

export function clearPendingVoiceReplyPlay(clearThreadId?: string): void {
  if (clearThreadId != null) {
    if (pendingVoiceReply?.threadId === clearThreadId) pendingVoiceReply = null;
    return;
  }
  pendingVoiceReply = null;
}

export default {
  isBrowserTtsAvailable,
  listBrowserVoices,
  speakBrowser,
  speakPremium,
  getSavedTtsConfig,
  saveTtsConfig,
  getTtsLastPremiumError,
  setTtsLastPremiumError,
};
