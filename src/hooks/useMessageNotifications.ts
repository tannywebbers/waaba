// @ts-nocheck
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { getMessagePreview } from '@/lib/utils/messagePreview';

const SOUND_IN_CHAT = '/sounds/incoming-message-online-whatsapp.mp3';
const SOUND_APP = '/sounds/whatsapp-for-web.mp3';

function playSound(url: string, volume = 0.7) {
  try {
    const settingsJson = localStorage.getItem('notification_settings');
    const settings = settingsJson ? JSON.parse(settingsJson) : { sound: true };
    if (settings.sound === false) return;

    const audio = new Audio(url);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {}
}

function showBrowserNotification(contactName: string, body: string, contactId: string, showPreview: boolean) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') { Notification.requestPermission(); return; }
  if (Notification.permission !== 'granted') return;

  const finalBody = showPreview ? (body || 'New message') : 'You have a new message';
  // Build a deep link the SW (or onclick) can use to open the exact chat
  const url = `${window.location.origin}/?chat=${encodeURIComponent(contactId)}`;
  const options: NotificationOptions = {
    body: finalBody,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `message-${contactId}`,
    silent: true,
    requireInteraction: false,
    data: { contactId, url, type: 'chat-message' },
  };

  const fallbackOpen = () => {
    try {
      const n = new Notification(contactName, options);
      n.onclick = () => {
        window.focus();
        // Trigger in-app open via the same hash mechanism used by the SW message
        try { window.dispatchEvent(new CustomEvent('open-chat', { detail: { contactId } })); } catch {}
        n.close();
      };
      setTimeout(() => n.close(), 6000);
    } catch {}
  };

  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.ready
      .then(reg => reg.showNotification(contactName, options).catch(fallbackOpen))
      .catch(fallbackOpen);
  } else {
    fallbackOpen();
  }
}

export function useMessageNotifications() {
  const { user } = useAuth();
  const activeChatRef = useRef<string | null>(null);
  const permissionRequested = useRef(false);

  useEffect(() => {
    if (permissionRequested.current) return;
    permissionRequested.current = true;
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => {
        Notification.requestPermission().then((result) => {
          console.log('🔔 Notification permission:', result);
        });
      }, 3000);
    }
  }, []);

  useEffect(() => {
    activeChatRef.current = useAppStore.getState().activeChat?.id || null;
    const unsub = useAppStore.subscribe((state) => {
      activeChatRef.current = state.activeChat?.id || null;
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notification-messages')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const message = payload.new as any;
        if (message.is_outgoing) return;

        const isViewingChat = activeChatRef.current === message.contact_id;

        try {
          const settingsJson = localStorage.getItem('notification_settings');
          const settings = settingsJson ? JSON.parse(settingsJson) : {};
          if (settings.vibrate !== false && navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
          }
        } catch {}

        if (isViewingChat) {
          playSound(SOUND_IN_CHAT, 0.55);
          return;
        }

        playSound(SOUND_APP, 0.75);

        const settingsJson = localStorage.getItem('notification_settings');
        let showPreview = true;
        let enabled = false;
        if (settingsJson) {
          try {
            const s = JSON.parse(settingsJson);
            enabled = s.enabled !== false && Notification.permission === 'granted';
            showPreview = s.preview !== false;
          } catch { enabled = Notification.permission === 'granted'; }
        } else {
          enabled = Notification.permission === 'granted';
        }
        if (!enabled) return;

        const contacts = useAppStore.getState().contacts;
        const contact = contacts.find((c) => c.id === message.contact_id);
        const contactName = contact?.name || 'New message';

        // Use shared preview formatter so notification matches the chat-list look
        const previewBody = getMessagePreview({ type: message.type, content: message.content });
        showBrowserNotification(contactName, previewBody, message.contact_id, showPreview);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);
}
