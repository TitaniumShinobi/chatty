export type AssistantNotificationKind = 'assistant' | 'selfprompt';

export interface AssistantNotificationOptions {
  enabled?: boolean;
  title?: string | null;
  body?: string | null;
  tag?: string;
  kind?: AssistantNotificationKind;
}

export function getResponsesPushEnabledFromStorage(): boolean {
  if (typeof window === 'undefined') return true;

  try {
    const raw = window.localStorage?.getItem('chatty_settings_v2');
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    return parsed?.notifications?.responsesPush !== false;
  } catch {
    return true;
  }
}

export function notifyAssistantResponse(options: AssistantNotificationOptions): boolean {
  if (options.enabled === false) return false;
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (typeof document === 'undefined' || !document.hidden) return false;

  const NotificationCtor = window.Notification;
  if (NotificationCtor.permission === 'default') {
    NotificationCtor.requestPermission?.().catch(() => {});
    return false;
  }

  if (NotificationCtor.permission !== 'granted') return false;

  const notification = new NotificationCtor(options.title || 'Chatty', {
    body: (options.body || '').trim() || 'New assistant response',
    tag: options.tag,
  });

  notification.onclick = () => {
    try {
      window.focus();
    } catch {}
    try {
      notification.close();
    } catch {}
  };

  return true;
}
