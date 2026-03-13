import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';

export function useTabBadge() {
  const lastUnreadRef = useRef<number>(-1);
  const blinkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitle = 'WABA - WhatsApp Cloud Messaging';

  useEffect(() => {
    const apply = () => {
      const state = useAppStore.getState();
      const unreadChats = state.chats.filter(c => c.unreadCount > 0 && !c.isArchived && !c.contact?.isArchived).length;

      if (unreadChats === lastUnreadRef.current) return;
      lastUnreadRef.current = unreadChats;

      // Clear any existing blink interval
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
        blinkIntervalRef.current = null;
      }

      // Set app badge
      const nav: any = navigator;
      if (typeof nav.setAppBadge === 'function') {
        if (unreadChats > 0) nav.setAppBadge(unreadChats).catch(() => {});
        else if (typeof nav.clearAppBadge === 'function') nav.clearAppBadge().catch(() => {});
      }

      if (unreadChats > 0) {
        // Blink browser tab title between count and blank
        let showCount = true;
        document.title = `(${unreadChats}) ${originalTitle}`;
        blinkIntervalRef.current = setInterval(() => {
          showCount = !showCount;
          document.title = showCount
            ? `(${unreadChats}) ${originalTitle}`
            : `💬 New Messages!`;
        }, 1000);
      } else {
        document.title = originalTitle;
      }
    };

    apply();
    const unsub = useAppStore.subscribe(() => apply());
    return () => {
      unsub();
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
        blinkIntervalRef.current = null;
      }
      document.title = originalTitle;
    };
  }, []);
}
