/* eslint-disable no-undef */
/*
  Firebase Cloud Messaging handlers.
  This file is imported INTO the generated workbox service worker (/sw.js)
  via `workbox.importScripts` so that a single service worker controls the
  page, caches assets AND receives background push notifications.
*/
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: 'AIzaSyBbM4_1d7wcKy7fRDTWJAmNLSFHSYw3Df8',
  authDomain: 'waba4all.firebaseapp.com',
  projectId: 'waba4all',
  storageBucket: 'waba4all.firebasestorage.app',
  messagingSenderId: '155860257722',
  appId: '1:155860257722:web:ad45d28788226c1ec12b83',
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Background / closed-app push (data-only payloads land here too)
  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const contactId = data.contactId || data.conversationId;
    const title = payload.notification?.title || data.title || 'WABA';
    const body = payload.notification?.body || data.body || 'You have a new message';
    const url = contactId
      ? `${self.location.origin}/?chat=${encodeURIComponent(contactId)}`
      : `${self.location.origin}/`;

    self.registration.showNotification(title, {
      body,
      icon: data.icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: contactId ? `chat-${contactId}` : 'waba-message',
      data: { ...data, contactId, url },
      vibrate: [200, 100, 200],
      renotify: true,
    });
  });
} catch (err) {
  console.error('FCM service worker init failed', err);
}

// Raw web-push fallback (non-FCM payloads)
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  if (payload.from || payload['google.c.a.e']) return; // handled by FCM above

  const data = payload.data || payload;
  const contactId = data.contactId || data.conversationId;
  if (!data.title && !data.body) return;

  event.waitUntil(
    self.registration.showNotification(data.title || 'WABA', {
      body: data.body || 'You have a new message',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: contactId ? `chat-${contactId}` : 'waba-message',
      data: {
        ...data,
        contactId,
        url: contactId
          ? `${self.location.origin}/?chat=${encodeURIComponent(contactId)}`
          : `${self.location.origin}/`,
      },
      vibrate: [200, 100, 200],
    }),
  );
});

// Click → focus the app (or launch it) and open the exact chat
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const contactId = data.contactId || data.conversationId;
  const targetUrl = data.url
    || (contactId ? `${self.location.origin}/?chat=${encodeURIComponent(contactId)}` : `${self.location.origin}/`);

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      try {
        if (new URL(client.url).origin === self.location.origin) {
          client.postMessage({ type: 'OPEN_CHAT', contactId, url: targetUrl });
          if ('focus' in client) return client.focus();
        }
      } catch { /* ignore */ }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
