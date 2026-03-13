// @ts-nocheck
/**
 * Firebase Cloud Messaging initialization
 * Handles push token generation, refresh, and storage
 * 
 * Firebase config is loaded from environment variables (VITE_FIREBASE_*)
 * or falls back to hardcoded defaults. Set these in your .env or Lovable Cloud secrets:
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
 *   VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
 *   VITE_FIREBASE_VAPID_KEY
 */

import { supabase } from '@/integrations/supabase/client';

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBbM4_1d7wcKy7fRDTWJAmNLSFHSYw3Df8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "waba4all.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "waba4all",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "waba4all.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "155860257722",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:155860257722:web",
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "BN76YKCyiWRL9qGFqWnwq4muGnpVsiDEW5Zat8Uyca0ljGYavlL0FUyRti9JZX-sKl6RLSWgzAlWrZsB-Cwy2iw";

let messagingInstance: any = null;

let firebaseApp: any = null;

async function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  const { initializeApp, getApps } = await import('firebase/app');
  const apps = getApps();
  firebaseApp = apps.length > 0 ? apps[0] : initializeApp(FIREBASE_CONFIG);
  return firebaseApp;
}

async function getFirebaseMessaging() {
  if (messagingInstance) return messagingInstance;
  
  try {
    const app = await getFirebaseApp();
    const { getMessaging, isSupported } = await import('firebase/messaging');
    
    const supported = await isSupported();
    if (!supported) {
      console.log('Firebase Messaging not supported in this browser');
      return null;
    }
    
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (err) {
    console.error('Failed to initialize Firebase:', err);
    return null;
  }
}

export async function requestPushPermission(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Push permission denied');
      return null;
    }

    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    const { getToken } = await import('firebase/messaging');
    
    // Register service worker for FCM
    let sw: ServiceWorkerRegistration;
    try {
      sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      // Wait for the service worker to be ready
      await navigator.serviceWorker.ready;
    } catch (swErr) {
      console.error('Service worker registration failed:', swErr);
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: sw,
    });

    if (!token) {
      console.warn('FCM getToken returned empty');
      return null;
    }

    console.log('✅ FCM token obtained:', token?.substring(0, 20) + '...');
    return token;
  } catch (err) {
    console.error('Failed to get push token:', err);
    return null;
  }
}

export async function storePushToken(userId: string, token: string) {
  try {
    const deviceInfo = `${navigator.userAgent.substring(0, 100)}`;
    const platform = /android/i.test(navigator.userAgent) ? 'android' : /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'web';
    
    // First try to find existing token for this user+token combo
    const { data: existing } = await supabase
      .from('push_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('token', token)
      .maybeSingle();
    
    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('push_tokens')
        .update({ device_info: deviceInfo, platform } as any)
        .eq('id', existing.id);
      if (error) console.error('Error updating push token:', error);
      else console.log('✅ Push token updated');
    } else {
      // Insert new
      const { error } = await supabase
        .from('push_tokens')
        .insert({ user_id: userId, token, device_info: deviceInfo, platform } as any);
      if (error) console.error('Error inserting push token:', error);
      else console.log('✅ Push token stored');
    }
  } catch (err) {
    console.error('Failed to store push token:', err);
  }
}

export async function setupForegroundMessages(onMessage: (payload: any) => void) {
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return;

    const { onMessage: onFCMMessage } = await import('firebase/messaging');
    onFCMMessage(messaging, (payload) => {
      console.log('📨 Foreground message:', payload);
      onMessage(payload);
    });
  } catch (err) {
    console.error('Failed to setup foreground messages:', err);
  }
}

export async function initializePushNotifications(userId: string) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('Push not supported');
      return { success: false, error: 'Push not supported' };
    }

    const token = await requestPushPermission();
    if (!token) return { success: false, error: 'Permission denied or token failed' };

    await storePushToken(userId, token);

    return { success: true, token };
  } catch (err: any) {
    console.error('Push init failed:', err);
    return { success: false, error: err.message };
  }
}
