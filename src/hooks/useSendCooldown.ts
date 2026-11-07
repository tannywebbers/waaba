import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Locks an action while it runs and for a short cooldown afterwards so rapid
 * double-clicks (or a slow request) cannot trigger duplicate sends.
 */
export function useSendCooldown(cooldownMs = 4000) {
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearTimer();
    lockedRef.current = false;
  }, []);

  const run = useCallback(async (action: () => void | Promise<void>) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    try {
      await action();
    } finally {
      clearTimer();
      timerRef.current = setTimeout(() => {
        lockedRef.current = false;
        setLocked(false);
        timerRef.current = null;
      }, cooldownMs);
    }
  }, [cooldownMs]);

  return { locked, run };
}