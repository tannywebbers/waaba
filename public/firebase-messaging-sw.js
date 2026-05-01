/* eslint-disable no-undef */
// Firebase Messaging Service Worker — handles background push and notification clicks
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBbM4_1d7wcKy7fRDTWJAmNLSFHSYw3Df8",
  authDomain: "waba4all.firebaseapp.com",
  projectId: "waba4all",
  storageBucket: "waba4all.firebasestorage.app",
  messagingSenderId: "155860257722",
  appId: "1:155860257722:web:ad45d28788226c1ec12b83"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ── Background message handler (FCM payloads) ───────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('📨 Background message:', payload);

  const data = payload.data || {};
  const contactId = data.contactId || data.conversationId;
  const title = payload.notification?.title || data.title || 'WABA';
  const body = payload.notification?.body || data.body || 'You have a new message';

  const url = contactId
    ? `${self.location.origin}/?chat=${encodeURIComponent(contactId)}`
    : `${self.location.origin}/`;

  const options = {
    body,
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: contactId ? `chat-${contactId}` : 'lotus-message',
    data: { ...data, contactId, url },
    vibrate: [200, 100, 200],
    renotify: true,
    requireInteraction: false,
  };

  self.registration.showNotification(title, options);
});

// ── Click → focus app & open exact chat (works for PWA installs) ────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const contactId = data.contactId || data.conversationId;
  const targetUrl = data.url
    || (contactId ? `${self.location.origin}/?chat=${encodeURIComponent(contactId)}` : `${self.location.origin}/`);

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Prefer focusing an open tab/PWA window and tell it to switch chat
    for (const client of allClients) {
      try {
        // Same origin — reuse it
        if (new URL(client.url).origin === self.location.origin) {
          client.postMessage({ type: 'OPEN_CHAT', contactId, url: targetUrl });
          if ('focus' in client) return client.focus();
        }
      } catch { /* ignore */ }
    }

    // No window open — launch a new one (PWA standalone or browser tab)
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
