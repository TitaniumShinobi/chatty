import {
  getResponsesPushEnabledFromStorage,
  notifyAssistantResponse,
} from './assistantNotifications';

describe('assistant response notifications', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  function installBrowserMocks(permission: NotificationPermission, hidden = true) {
    const created: any[] = [];
    const focus = jest.fn();
    const requestPermission = jest.fn(() => Promise.resolve(permission));

    class MockNotification {
      static permission = permission;
      static requestPermission = requestPermission;
      title: string;
      options?: NotificationOptions;
      onclick: (() => void) | null = null;
      close = jest.fn();

      constructor(title: string, options?: NotificationOptions) {
        this.title = title;
        this.options = options;
        created.push(this);
      }
    }

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        Notification: MockNotification,
        focus,
        localStorage: {
          getItem: jest.fn(() => null),
        },
      },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { hidden },
    });

    return { created, focus, requestPermission };
  }

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    jest.clearAllMocks();
  });

  it('suppresses notifications when responsesPush is false', () => {
    const { created } = installBrowserMocks('granted');

    const sent = notifyAssistantResponse({
      enabled: false,
      title: 'Katana',
      body: 'Done.',
      tag: 'assistant-katana',
      kind: 'assistant',
    });

    expect(sent).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('suppresses notifications while the tab is visible', () => {
    const { created } = installBrowserMocks('granted', false);

    const sent = notifyAssistantResponse({
      enabled: true,
      title: 'Monday',
      body: 'Done.',
      tag: 'assistant-monday',
      kind: 'assistant',
    });

    expect(sent).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('requests permission once when permission is undecided', () => {
    const { created, requestPermission } = installBrowserMocks('default');

    const sent = notifyAssistantResponse({
      enabled: true,
      title: 'Monday',
      body: 'Done.',
      tag: 'assistant-monday',
      kind: 'assistant',
    });

    expect(sent).toBe(false);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(0);
  });

  it('sends hidden-tab assistant completion notifications when permission is granted', () => {
    const { created, focus } = installBrowserMocks('granted');

    const sent = notifyAssistantResponse({
      enabled: true,
      title: 'Katana',
      body: 'A clean response.',
      tag: 'assistant-katana',
      kind: 'assistant',
    });

    expect(sent).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].title).toBe('Katana');
    expect(created[0].options).toEqual({
      body: 'A clean response.',
      tag: 'assistant-katana',
    });

    created[0].onclick();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(created[0].close).toHaveBeenCalledTimes(1);
  });

  it('sends selfprompt notifications through the same responsesPush gate', () => {
    const { created } = installBrowserMocks('granted');

    const sent = notifyAssistantResponse({
      enabled: getResponsesPushEnabledFromStorage(),
      title: 'Monday',
      body: 'New proactive message',
      tag: 'selfprompt-monday',
      kind: 'selfprompt',
    });

    expect(sent).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].options?.tag).toBe('selfprompt-monday');
  });

  it('reads responsesPush=false from stored settings', () => {
    installBrowserMocks('granted');
    (window.localStorage.getItem as jest.Mock).mockReturnValue(
      JSON.stringify({ notifications: { responsesPush: false } }),
    );

    expect(getResponsesPushEnabledFromStorage()).toBe(false);
  });
});
