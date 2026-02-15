import { useEffect, useRef, useCallback } from 'react';

interface UseIdleTimeoutOptions {
  timeoutMinutes: number;
  onTimeout: () => void;
  enabled?: boolean;
}

export function useIdleTimeout({ timeoutMinutes, onTimeout, enabled = true }: UseIdleTimeoutOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  onTimeoutRef.current = onTimeout;

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (!enabled || timeoutMinutes <= 0) return;

    timerRef.current = setTimeout(() => {
      onTimeoutRef.current();
    }, timeoutMinutes * 60 * 1000);
  }, [timeoutMinutes, enabled]);

  useEffect(() => {
    if (!enabled || timeoutMinutes <= 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    resetTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [resetTimer, enabled, timeoutMinutes]);
}
