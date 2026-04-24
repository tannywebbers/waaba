/* eslint-disable no-undef */
// Firebase Messaging Service Worker
// This file MUST be at the root of the public directory

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Firebase config — matches src/lib/firebase.ts defaults
// To override, rebuild with VITE_FIREBASE_* env vars (SW uses hardcoded values)
const firebaseConfig = {
  apiKey: "AIzaSyBbM4_1d7wcKy7fRDTWJAmNLSFHSYw3Df8",
  authDomain: "waba4all.firebaseapp.com",
  projectId: "waba4all",
  storageBucket: "waba4all.firebasestorage.app",
  messagingSenderId: "155860257722",
  appId: "1:155860257722:web:ad45d28788226c1ec12b83"
};

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  console.log('📨 Background message:', payload);

  const title = payload.notification?.title || payload.data?.title || 'Lotus CRM';
  const options = {
    body: payload.notification?.body || payload.data?.body || 'You have a new message',
    icon: payload.data?.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.data?.tag || 'lotus-message',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    renotify: true,
  };

  self.registration.showNotification(title, options);
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const conversationId = event.notification.data?.conversationId || event.notification.data?.contactId;
  const url = conversationId ? `/?chat=${conversationId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an already-open window and tell it to open the right chat
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'OPEN_CHAT', contactId: conversationId, url });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
