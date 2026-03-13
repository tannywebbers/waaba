/**
 * PUSH NOTIFICATION MANAGER
 * 
 * Handles:
 * - Service Worker registration
 * - Push subscription
 * - FCM token management
 * - Background notifications
 * - Works on mobile browsers and PWA
 */

import { supabase } from '@/integrations/supabase/client';

// Firebase Cloud Messaging configuration
// Add your Firebase config here from Firebase Console
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// VAPID public key for push subscriptions
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

interface PushSubscriptionManager {
  isSupported: boolean;
  isSubscribed: boolean;
  token: string | null;
}

class PushNotificationManager {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private pushSubscription: PushSubscription | null = null;
  private fcmToken: string | null = null;

  // Check if push notifications are supported
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 
           'PushManager' in window && 
           'Notification' in window;
  }

  // Check if already subscribed
  async isSubscribed(): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await (registration as any).pushManager.getSubscription();
      return !!subscription;
    } catch (error) {
      console.error('Error checking subscription:', error);
      return false;
    }
  }

  // Request notification permission
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      throw new Error('Notifications not supported');
    }

    const permission = await Notification.requestPermission();
    return permission;
  }

  // Initialize push notifications
  async initialize(userId: string): Promise<{ success: boolean; token?: string; error?: string }> {
    if (!this.isSupported()) {
      return { success: false, error: 'Push notifications not supported on this device' };
    }

    try {
      // Request permission
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        return { success: false, error: 'Notification permission denied' };
      }

      // Get service worker registration
      this.swRegistration = await navigator.serviceWorker.ready;

      // Subscribe to push
      await this.subscribeToPush();

      // Get FCM token (if using Firebase)
      if (FIREBASE_CONFIG.apiKey) {
        await this.getFCMToken();
      }

      // Save token to database
      if (this.pushSubscription || this.fcmToken) {
        await this.saveTokenToDatabase(userId);
      }

      return { 
        success: true, 
        token: this.fcmToken || this.pushSubscription?.endpoint || undefined 
      };

    } catch (error: any) {
      console.error('Failed to initialize push notifications:', error);
      return { success: false, error: error.message };
    }
  }

  // Subscribe to push notifications
  private async subscribeToPush(): Promise<void> {
    if (!this.swRegistration) {
      throw new Error('Service worker not registered');
    }

    try {
      // Check if already subscribed
      let subscription = await (this.swRegistration as any).pushManager.getSubscription();

      if (!subscription) {
        // Convert VAPID key to Uint8Array
        const convertedVapidKey = this.urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

        // Create new subscription
        subscription = await (this.swRegistration as any).pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
      }

      this.pushSubscription = subscription;
      console.log('✅ Push subscription created:', subscription.endpoint);
    } catch (error) {
      console.error('Failed to subscribe to push:', error);
      throw error;
    }
  }

  // Get FCM token (for Firebase Cloud Messaging)
  private async getFCMToken(): Promise<void> {
    // This is a placeholder for FCM implementation
    // In production, you would use Firebase SDK here:
    // 
    // import { getMessaging, getToken } from 'firebase/messaging';
    // const messaging = getMessaging();
    // this.fcmToken = await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY });
    
    console.log('FCM token generation placeholder');
  }

  // Save token to database
  private async saveTokenToDatabase(userId: string): Promise<void> {
    try {
      const endpoint = this.pushSubscription?.endpoint || null;
      const keys = this.pushSubscription ? {
        p256dh: arrayBufferToBase64(this.pushSubscription.getKey('p256dh')),
        auth: arrayBufferToBase64(this.pushSubscription.getKey('auth')),
      } : null;

      await (supabase as any).from('push_tokens').upsert({
        user_id: userId,
        endpoint,
        keys,
        fcm_token: this.fcmToken,
        device_type: this.getDeviceType(),
        updated_at: new Date().toISOString(),
      });

      console.log('✅ Push token saved to database');
    } catch (error) {
      console.error('Failed to save token:', error);
    }
  }

  // Unsubscribe from push
  async unsubscribe(userId: string): Promise<void> {
    if (this.pushSubscription) {
      await this.pushSubscription.unsubscribe();
      this.pushSubscription = null;
    }

    // Remove from database
    await (supabase as any).from('push_tokens').delete().eq('user_id', userId);

    console.log('✅ Unsubscribed from push notifications');
  }

  // Get device type
  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'android';
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    return 'web';
  }

  // Convert VAPID key
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Test notification
  async testNotification(): Promise<void> {
    if (this.swRegistration) {
      await this.swRegistration.showNotification('Test Notification', {
        body: 'Push notifications are working!',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
      } as NotificationOptions);
    }
  }
}

// Helper function
function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Global singleton
export const pushNotificationManager = new PushNotificationManager();

// Hook for React components
export function usePushNotifications(userId: string | undefined) {
  const [status, setStatus] = React.useState<'idle' | 'initializing' | 'subscribed' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!userId) return;

    const init = async () => {
      setStatus('initializing');
      const result = await pushNotificationManager.initialize(userId);
      
      if (result.success) {
        setStatus('subscribed');
      } else {
        setStatus('error');
        setError(result.error || 'Unknown error');
      }
    };

    // Check if already subscribed
    pushNotificationManager.isSubscribed().then(subscribed => {
      if (!subscribed) {
        init();
      } else {
        setStatus('subscribed');
      }
    });
  }, [userId]);

  return { status, error };
}

import React from 'react';
