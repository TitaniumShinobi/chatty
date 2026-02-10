/**
 * Development Interaction Logger
 * Logs all user interactions (clicks, submits, etc.) to terminal via backend
 * Only active in development mode
 */

interface InteractionInfo {
  type: string;
  tag: string;
  id: string;
  classes: string;
  text?: string;
  href?: string;
  timestamp: string;
  pathname?: string;
  component?: string;
}

/**
 * Log interaction to backend (which logs to terminal)
 */
async function sendToBackend(info: InteractionInfo): Promise<void> {
  // Only log in development
  const isDev = import.meta.env.MODE === 'development' || 
                import.meta.env.DEV === true || 
                import.meta.env.PROD === false ||
                !import.meta.env.PROD;
  if (!isDev) {
    return;
  }


  try {
    const response = await fetch('/api/dev-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
      // Don't wait for response - fire and forget
    }).catch((err) => {
      // Log fetch errors for debugging (only in dev)
      console.warn('⚠️ [Dev Logger] Failed to send log:', err.message, err);
      return null;
    });
    
    // Silently handle errors - don't spam console
    if (response && !response.ok) {
      // Only log errors, not successes
    }
  } catch (error) {
    // Log unexpected errors
    console.warn('⚠️ [Dev Logger] Unexpected error:', error);
  }
}

/**
 * Extract component name from React element if available
 */
function getComponentName(element: HTMLElement): string | undefined {
  // Try to find React fiber node
  const key = Object.keys(element).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  if (key) {
    const fiber = (element as any)[key];
    if (fiber) {
      let current = fiber;
      // Walk up the fiber tree to find component name
      for (let i = 0; i < 5 && current; i++) {
        if (current.type) {
          const type = current.type;
          if (typeof type === 'function') {
            return type.name || type.displayName || 'Anonymous';
          } else if (typeof type === 'string') {
            return type;
          }
        }
        current = current.return;
      }
    }
  }
  return undefined;
}

/**
 * Log interaction event
 */
export function logInteraction(event: Event): void {

  // Only log in development
  const isDev = import.meta.env.MODE === 'development' || 
                import.meta.env.DEV === true || 
                import.meta.env.PROD === false ||
                !import.meta.env.PROD;
  if (!isDev) {
    return;
  }

  const target = event.target as HTMLElement;
  if (!target) return;

  // Skip if it's a log event itself (prevent infinite loop)
  if (target.closest('[data-no-log]')) {
    return;
  }

  const info: InteractionInfo = {
    type: event.type,
    tag: target.tagName,
    id: target.id || '',
    classes: target.className?.toString() || '',
    timestamp: new Date().toISOString(),
    pathname: window.location.pathname,
    component: getComponentName(target),
  };

  // Extract text content (truncated)
  const textContent = target.textContent?.trim();
  if (textContent && textContent.length > 0) {
    info.text = textContent.length > 50 ? textContent.slice(0, 50) + '...' : textContent;
  }

  // Extract href if it's a link
  if (target instanceof HTMLAnchorElement) {
    info.href = target.href;
  }

  // Send to backend for terminal logging
  sendToBackend(info);
}

/**
 * Initialize interaction logging
 * Call this in your app root (main.tsx or App.tsx)
 */
export function initInteractionLogging(): void {
  // Check environment - Vite uses MODE, but also check DEV
  const isDev = import.meta.env.MODE === 'development' || 
                import.meta.env.DEV === true || 
                import.meta.env.PROD === false ||
                !import.meta.env.PROD;

  // Only log in development
  if (!isDev) {
    return;
  }

  // Log clicks
  window.addEventListener('click', logInteraction, true); // Use capture phase

  // Log form submissions
  window.addEventListener('submit', logInteraction, true);

  // Log input changes (debounced)
  let changeTimeout: NodeJS.Timeout | null = null;
  window.addEventListener('change', (event) => {
    if (changeTimeout) clearTimeout(changeTimeout);
    changeTimeout = setTimeout(() => logInteraction(event), 100);
  }, true);

  // Log keydown for important keys (Enter, Escape, etc.)
  window.addEventListener('keydown', (event) => {
    // Only log important keys
    if (['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      logInteraction(event);
    }
  }, true);

  // Send a quiet page load test log (no console spam)
  setTimeout(() => {
    const testInfo: InteractionInfo = {
      type: 'page_load',
      tag: 'BODY',
      id: '',
      classes: '',
      text: 'Page loaded',
      timestamp: new Date().toISOString(),
      pathname: window.location.pathname,
      component: 'DevLogger',
    };
    sendToBackend(testInfo);
  }, 500);
}

/**
 * Dev Logger Debugger - Run this from browser console to test logger
 * Usage: devLoggerDebugger()
 */
export function devLoggerDebugger(): void {
  console.group("🧪 Dev Logger Debugger");
  
  const env = import.meta.env;
  console.log("🌱 Frontend ENV:", {
    MODE: env.MODE,
    DEV: env.DEV,
    PROD: env.PROD,
    allKeys: Object.keys(env),
  });
  
  if (
    env.MODE !== "development" &&
    env.DEV !== true &&
    env.PROD === true
  ) {
    console.warn("⚠️ Logger inactive: not in development mode.");
  } else {
    console.log("✅ Logger environment active.");
  }
  
  console.log("🔍 Testing fetch to /api/dev-log...");
  fetch("/api/dev-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "manual_debug",
      tag: "TEST",
      id: "debug-btn",
      classes: "debug logger",
      text: "This is a debug-triggered test log",
      timestamp: new Date().toISOString(),
      pathname: window.location.pathname,
      component: "DevLoggerDebugger",
    }),
  })
    .then((res) => {
      console.log("📬 Response:", res.status, res.statusText);
      return res.text();
    })
    .then((text) => {
      console.log("📦 Response body:", text);
    })
    .catch((err) => {
      console.error("❌ Fetch to /api/dev-log failed:", err);
    });
  
  console.groupEnd();
}

// Expose to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).devLoggerDebugger = devLoggerDebugger;
}

