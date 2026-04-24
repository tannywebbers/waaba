// @ts-nocheck
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';

// Two distinct sounds:
// - In-chat (user is viewing the conversation): subtle "incoming online" tone
// - App-level (user is elsewhere in the app): louder WhatsApp web notification
const SOUND_IN_CHAT = '/sounds/incoming-message-online-whatsapp.mp3';
const SOUND_APP = '/sounds/whatsapp-for-web.mp3';

function playSound(url: string, volume = 0.7) {
  try {
    const settingsJson = localStorage.getItem('notification_settings');
    const settings = settingsJson ? JSON.parse(settingsJson) : { sound: true };
    if (settings.sound === false) return;

    const audio = new Audio(url);
    audio.volume = volume;
    audio.play().catch(() => {/* autoplay blocked */});
  } catch {/* no-op */}
}

function showBrowserNotification(contactName: string, messageContent: string, contactId: string, showPreview: boolean) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') { Notification.requestPermission(); return; }
  if (Notification.permission !== 'granted') return;

  const body = showPreview ? (messageContent || 'New message') : 'You have a new message';
  const options: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `message-${contactId}`,
    silent: true, // we play our own sound
    requireInteraction: false,
    data: { contactId, url: `/?chat=${contactId}` },
  };

  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(contactName, options).catch(() => {
        try {
          const n = new Notification(contactName, options);
          n.onclick = () => { window.focus(); n.close(); };
          setTimeout(() => n.close(), 5000);
        } catch {/* no-op */}
      });
    }).catch(() => {
      try {
        const n = new Notification(contactName, options);
        n.onclick = () => { window.focus(); n.close(); };
        setTimeout(() => n.close(), 5000);
      } catch {/* no-op */}
    });
  } else {
    try {
      const n = new Notification(contactName, options);
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 5000);
    } catch {/* no-op */}
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

        // Vibrate on mobile
        try {
          const settingsJson = localStorage.getItem('notification_settings');
          const settings = settingsJson ? JSON.parse(settingsJson) : {};
          if (settings.vibrate !== false && navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
          }
        } catch {}

        if (isViewingChat) {
          // Subtle in-chat ping — don't show OS notification when chat is open
          playSound(SOUND_IN_CHAT, 0.55);
          return;
        }

        // App-level notification sound
        playSound(SOUND_APP, 0.75);

        // OS notification
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

        showBrowserNotification(contactName, message.content, message.contact_id, showPreview);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);
}
