// @ts-nocheck
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';

// Short WAV beep as base64
const NOTIFICATION_SOUND_URL = 'data:audio/wav;base64,UklGRl4FAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToFAACAgICAgICAgICAgICAgICAgICA/3+AgP9/gID/f4CAgICAgICAgICAgH+AgIB/gICAf4CAgH+AgIB/gICAgICAgICAgICAgICAgICAgP9/gID/f4CA/3+AgP9/gIB/gICAgICAgICAgICAgICAgICAgICA/3+AgP9/gID/f4CA/3+AgICAgICAgICAgICAgICAgICAgICAgICA/3+AgP9/gIB/gICAf4CAgH+AgIB/gICAgICAgICAgICAgICAgICA';

let audioCtx: AudioContext | null = null;

function playNotificationSound() {
  try {
    const settingsJson = localStorage.getItem('notification_settings');
    const settings = settingsJson ? JSON.parse(settingsJson) : { sound: true };
    if (settings.sound === false) return;

    // Try HTML5 Audio first
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.65;
    audio.play().catch(() => {
      // Fallback: Web Audio API oscillator (works on Samsung/Chrome)
      try {
        if (!audioCtx) {
          const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!Ctx) return;
          audioCtx = new Ctx();
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 840;
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } catch {
        // no-op
      }
    });
  } catch {
    // no-op
  }
}

function showBrowserNotification(contactName: string, messageContent: string, contactId: string, showPreview: boolean) {
  if (!('Notification' in window)) return;

  // Request permission if not decided yet
  if (Notification.permission === 'default') {
    Notification.requestPermission();
    return;
  }

  if (Notification.permission !== 'granted') return;

  const body = showPreview ? (messageContent || 'New message') : 'You have a new message';
  const options: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    tag: `message-${contactId}`,
    silent: true,
    requireInteraction: false,
  };

  // Try ServiceWorker notification first (better mobile support)
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(contactName, options).catch(() => {
        // Fallback to regular Notification
        try {
          const n = new Notification(contactName, options);
          n.onclick = () => { window.focus(); n.close(); };
          setTimeout(() => n.close(), 5000);
        } catch { /* no-op */ }
      });
    }).catch(() => {
      try {
        const n = new Notification(contactName, options);
        n.onclick = () => { window.focus(); n.close(); };
        setTimeout(() => n.close(), 5000);
      } catch { /* no-op */ }
    });
  } else {
    try {
      const n = new Notification(contactName, options);
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 5000);
    } catch { /* no-op */ }
  }
}

export function useMessageNotifications() {
  const { user } = useAuth();
  const activeChatRef = useRef<string | null>(null);
  const permissionRequested = useRef(false);

  // Request notification permission on first render
  useEffect(() => {
    if (permissionRequested.current) return;
    permissionRequested.current = true;

    if ('Notification' in window && Notification.permission === 'default') {
      // Delay slightly to avoid blocking page load
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
        
        // If user is viewing this chat, don't notify
        const isViewingChat = activeChatRef.current === message.contact_id;
        if (isViewingChat) return;

        // Play sound
        playNotificationSound();

        // Vibrate on mobile
        try {
          const settingsJson = localStorage.getItem('notification_settings');
          const settings = settingsJson ? JSON.parse(settingsJson) : {};
          if (settings.vibrate !== false && navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
          }
        } catch {}

        // Show browser notification
        const settingsJson = localStorage.getItem('notification_settings');
        let showPreview = true;
        let enabled = false;
        if (settingsJson) {
          try {
            const s = JSON.parse(settingsJson);
            enabled = s.enabled !== false && Notification.permission === 'granted';
            showPreview = s.preview !== false;
          } catch {
            enabled = Notification.permission === 'granted';
          }
        } else {
          enabled = Notification.permission === 'granted';
        }

        if (!enabled) return;

        const contacts = useAppStore.getState().contacts;
        const contact = contacts.find((c) => c.id === message.contact_id);
        const contactName = contact?.name || 'Unknown Contact';

        showBrowserNotification(contactName, message.content, message.contact_id, showPreview);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);
}
